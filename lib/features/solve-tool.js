/**
 * 内置 qqbot_solve 工具 — 把「做题」从闲聊里分离出来。
 *
 * 与 qqbot_describe_image 的差别：describe 只描述图片内容，solve 要给出解答。
 * 解题走「当前会话自己的模型」（per-peer /model 切换、config 默认、宿主默认都在内），
 * 配一份固定解题 system prompt，输出固定为【答案】/【过程】两段，便于 QQ 端直接发。
 *
 * 输入：
 *   - problem：题干文本（可选）
 *   - image：题目截图（本地绝对路径 / http(s) URL，可选）
 *   两者至少给一个；纯文本题不需要 attachments 服务。
 */
import { basename } from 'node:path';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { collectStreamText } from "../shared/llm-text.js";
import { loadImageBytes, } from "../media/image-input.js";
/** 工具名（qqbot 前缀避免与其他通道的同名工具冲突） */
export const SOLVE_TOOL_NAME = 'qqbot_solve';
/** 题干文本上限：超过后截断会把题目做坏，直接报错让模型改用图片 */
export const SOLVE_MAX_PROBLEM_CHARS = 8000;
/** 图片字节上限（与 vision 的默认上限保持一致） */
export const SOLVE_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** 答案+过程需要的输出空间，明显小于正文对话 */
export const SOLVE_MAX_TOKENS = 2400;
export const SOLVE_SYSTEM_PROMPT = `你是一位严谨的解题老师，只负责把用户发来的题目做对、讲清楚。

【输出格式】
固定输出两段 Markdown，不要加任何开场白或结尾闲聊：
【答案】先给最终结论：选择题写选项 + 内容，填空题写结果，计算题写最终值或表达式，证明题写结论。
【过程】再写解题步骤，按 1. 2. 3. 分步展开，每一步说明依据（用到的公式、定理、条件）。

【规则】
1. 只做题，不聊题外话，不主动追问与解题无关的信息。
2. 条件不足时，先明确写出缺什么，再给出在合理假设下的解法；绝不编造题干里没有的数据。
3. 有多个小问时按 (1)(2)(3) 分别作答，每个小问都给出答案和过程。
4. 数学公式用纯文本写法（x^2、sqrt(x)、/、×、÷、≤、△），不要用 LaTeX 或 $...$，保证手机端直接可读。
5. 写清单位、取值范围与定义域；数值题保留合理有效数字，不要给无意义的超长小数。
6. 中小学及高中题目按现行教材的标准口径作答；大学及以上按该学科的通用定义作答。
7. 图片模糊、关键数字或图形看不清时，直接说明哪一部分看不清，只给出可读部分的结论，不要猜。
8. 你在这一步只需要作答，不调用任何工具，也不做与解题无关的操作。`;
const DESCRIPTION = 'Solve a school/college exam-style problem and return a final answer plus worked steps. '
    + 'Pass `problem` with the question text, `image` with the absolute path (or http(s) URL) of a '
    + 'question screenshot, or both. Use this for homework, exam questions, math/physics/chemistry '
    + 'problems, multiple-choice questions, and any task whose goal is "what is the answer". '
    + 'Do not use it for open-ended chatting or for merely describing an image.';
/** 空串/纯空白视为未提供 */
function textOrUndefined(value) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
/**
 * 组装解题 user prompt（纯函数，便于测试）。
 *
 * @param problem  - 题干文本（可为空：只发图时留空）
 * @param subject  - 科目（如「高中数学」）
 * @param level    - 学段（如「高三」）
 * @param hasImage - 是否附图
 */
export function buildSolvePrompt(problem, subject, level, hasImage = false) {
    const sections = [];
    const scope = [];
    const subjectText = textOrUndefined(subject);
    const levelText = textOrUndefined(level);
    if (subjectText !== undefined)
        scope.push(`科目：${subjectText}`);
    if (levelText !== undefined)
        scope.push(`学段：${levelText}`);
    if (scope.length > 0)
        sections.push(scope.join('\n'));
    const body = problem.trim();
    sections.push(body.length > 0 ? `【题目】\n${body}` : '【题目】题目内容全部在附图中，请先读图再作答。');
    if (hasImage && body.length > 0) {
        sections.push('（附图是本题的一部分：先把图里的文字、符号、图形看清楚，再和上面的题干合并理解。）');
    }
    return sections.join('\n\n');
}
/**
 * 解析本次解题使用的模型：会话当前路由（含 per-peer /model 覆盖）> 配置默认。
 * 都取不到时返回 undefined，由调用方报错。
 */
function resolveRoute(manager, config, agent) {
    if (agent !== undefined) {
        const record = manager.findByAgent(agent);
        if (record !== undefined) {
            const route = manager.getEffectiveModel(record.scope, record.peerId);
            if (route?.provider && route.model)
                return { provider: route.provider, model: route.model };
        }
    }
    if (config.provider && config.model) {
        return { provider: config.provider, model: config.model };
    }
    return undefined;
}
/** 注册 qqbot_solve 工具（服务缺失时优雅降级，不阻断插件启动） */
export function registerSolveTool(ctx, manager, config, logger) {
    const tools = ctx.get('tools');
    const llm = ctx.get('llm');
    if (!tools?.register || !llm?.stream) {
        logger.warn('im-qqbot: tools/llm 服务不可用，qqbot_solve 工具未注册');
        return;
    }
    const attachments = ctx.get('attachments');
    const definition = {
        name: SOLVE_TOOL_NAME,
        description: DESCRIPTION,
        parameters: {
            type: 'object',
            properties: {
                problem: {
                    type: 'string',
                    description: 'The full question text (stem + all sub-questions). Omit only when the question is entirely in `image`.',
                },
                image: {
                    type: 'string',
                    description: 'Absolute path of a local question screenshot, or an http(s) URL. Requires an image-capable model.',
                },
                subject: {
                    type: 'string',
                    description: 'Subject label when known, e.g. "高中数学", "物理", "英语阅读".',
                },
                level: {
                    type: 'string',
                    description: 'School level when known, e.g. "初二", "高三", "大学".',
                },
            },
            additionalProperties: false,
        },
        output: {
            schema: {
                type: 'object',
                properties: {
                    text: { type: 'string' },
                    provider: { type: 'string' },
                    model: { type: 'string' },
                    hasImage: { type: 'boolean' },
                },
                required: ['text', 'provider', 'model', 'hasImage'],
                additionalProperties: false,
            },
            render: (_args, value) => [
                { type: 'text', text: value.text },
            ],
        },
        async execute(args, exec) {
            const { problem, image, subject, level } = (args ?? {});
            const problemText = textOrUndefined(problem) ?? '';
            const imageSource = textOrUndefined(image);
            if (problemText.length === 0 && imageSource === undefined) {
                throw new Error(`${SOLVE_TOOL_NAME}: 需要 problem（题干文本）或 image（题目截图）至少一个`);
            }
            if (problemText.length > SOLVE_MAX_PROBLEM_CHARS) {
                throw new Error(`${SOLVE_TOOL_NAME}: 题干过长（${problemText.length} 字符，上限 ${SOLVE_MAX_PROBLEM_CHARS}），`
                    + '请精简后重试，或改用题目截图');
            }
            const route = resolveRoute(manager, config, exec.agent);
            if (route === undefined) {
                throw new Error(`${SOLVE_TOOL_NAME}: 无法确定解题模型，请在配置中设置 provider/model`);
            }
            // 1. 组装消息内容：图片（可选）+ 文本 prompt
            const content = [];
            let hasImage = false;
            if (imageSource !== undefined) {
                if (!attachments?.saveImage) {
                    throw new Error(`${SOLVE_TOOL_NAME}: 图片解题需要 attachments 服务，当前不可用`);
                }
                const loaded = await loadImageBytes(imageSource, SOLVE_MAX_IMAGE_BYTES, exec.signal, SOLVE_TOOL_NAME);
                const ref = await attachments.saveImage({
                    data: loaded.data,
                    mediaType: loaded.mediaType,
                    name: /^https?:\/\//i.test(imageSource) ? undefined : basename(imageSource),
                });
                content.push({ type: 'image', attachment: ref });
                hasImage = true;
            }
            content.push({ type: 'text', text: buildSolvePrompt(problemText, subject, level, hasImage) });
            // 2. 主模型 + 固定解题 system prompt 一次性调用（不走 agent loop，也不消耗会话上下文）
            const message = createUserMessage({
                content,
                // v4 producer-owned source kind；本地 dsh-llm 类型尚为 v3 联合，做类型桥接
                source: { kind: 'plugin:dsh-im-qqbot' },
            });
            const options = {
                provider: route.provider,
                model: route.model,
                system: SOLVE_SYSTEM_PROMPT,
                messages: [message],
                maxTokens: SOLVE_MAX_TOKENS,
                signal: exec.signal,
            };
            const text = await collectStreamText(llm.stream(options), SOLVE_TOOL_NAME);
            logger.info(`im-qqbot: qqbot_solve 完成 (provider=${route.provider} model=${route.model} image=${hasImage} chars=${text.length})`);
            return { text, provider: route.provider, model: route.model, hasImage };
        },
    };
    tools.register(definition);
    logger.info(`im-qqbot: ${SOLVE_TOOL_NAME} 工具已注册（使用会话当前模型）`);
}
//# sourceMappingURL=solve-tool.js.map