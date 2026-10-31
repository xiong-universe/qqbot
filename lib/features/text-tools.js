import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { collectStreamText } from "../shared/llm-text.js";
import { resolveSessionRoute, } from "./model-route.js";
/** 单次输入的字符上限：再长就建议分段，避免把上下文烧光 */
export const TEXT_TOOL_MAX_INPUT_CHARS = 8000;
/** 文本加工类工具的输出上限 */
export const TEXT_TOOL_MAX_TOKENS = 2000;
export const TRANSLATE_TOOL_NAME = 'qqbot_translate';
export const SUMMARIZE_TOOL_NAME = 'qqbot_summarize';
export const EXPLAIN_TOOL_NAME = 'qqbot_explain';
export const REWRITE_TOOL_NAME = 'qqbot_rewrite';
/** 文本加工工具名（默认放行清单从这里取） */
export const TEXT_TOOL_NAMES = [
    TRANSLATE_TOOL_NAME,
    SUMMARIZE_TOOL_NAME,
    EXPLAIN_TOOL_NAME,
    REWRITE_TOOL_NAME,
];
/** 空串/纯空白视为未提供 */
function textOrUndefined(value) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
// ── prompt 组装（纯函数，便于测试） ──
/**
 * 组装翻译 prompt。
 *
 * @param text - 原文
 * @param to   - 目标语言（缺省简体中文）
 * @param from - 源语言（缺省自动判断）
 */
export function buildTranslatePrompt(text, to, from) {
    const target = textOrUndefined(to) ?? '简体中文';
    const source = textOrUndefined(from) ?? '自动判断';
    return `目标语言：${target}\n源语言：${source}\n\n【原文】\n${text.trim()}`;
}
/**
 * 组装总结 prompt。
 *
 * @param text      - 原文
 * @param maxPoints - 要点条数上限（缺省 6）
 */
export function buildSummarizePrompt(text, maxPoints) {
    const points = Number.isFinite(maxPoints) && maxPoints !== undefined
        ? Math.min(Math.max(Math.trunc(maxPoints), 1), 10)
        : 6;
    return `要点条数：最多 ${points} 条\n\n【原文】\n${text.trim()}`;
}
/**
 * 组装讲解 prompt。
 *
 * @param text     - 需要讲解的内容（概念 / 代码 / 报错 / 术语）
 * @param audience - 听众水平（缺省「有一点基础」）
 * @param focus    - 想重点讲清的部分（可选）
 */
export function buildExplainPrompt(text, audience, focus) {
    const target = textOrUndefined(audience) ?? '有一点基础的人';
    const focusText = textOrUndefined(focus);
    const lines = [`讲解对象：${target}`];
    if (focusText !== undefined)
        lines.push(`重点：${focusText}`);
    lines.push('', `【内容】\n${text.trim()}`);
    return lines.join('\n');
}
/**
 * 组装改写 prompt。
 *
 * @param text   - 原文
 * @param tone   - 期望语气（缺省「自然口语」）
 * @param length - 篇幅要求（缺省「与原文相当」）
 */
export function buildRewritePrompt(text, tone, length) {
    const toneText = textOrUndefined(tone) ?? '自然口语';
    const lengthText = textOrUndefined(length) ?? '与原文相当';
    return `语气：${toneText}\n篇幅：${lengthText}\n\n【原文】\n${text.trim()}`;
}
const TRANSLATE_SYSTEM_PROMPT = `你是一名专业翻译，只负责把用户给出的内容翻译成目标语言。

【规则】
1. 只输出译文，不要解释、不要加引号、不要写「翻译如下」之类的话。
2. 保留原文的段落、列表、代码块与 Markdown 结构；代码、链接、数字、专有名词（品牌、人名、API 名）不翻译。
3. 语气自然，符合目标语言的表达习惯，不要逐字硬译。
4. 原文已经是目标语言时原样返回，只修掉明显的错别字。
5. 遇到歧义或双关，按上下文给最可能的一种译法，不要加注、不要给多个版本。`;
const SUMMARIZE_SYSTEM_PROMPT = `你是一名摘要编辑，把长文本压缩成手机上能一眼看完的要点。

【规则】
1. 先给一句话结论，再用「- 」开头列出要点；用户指定条数上限时不要超过。
2. 只保留事实、数字、结论、待办和关键人名；删掉寒暄、重复、广告和铺垫。
3. 不编造原文没有的信息；原文本身很短（两三句）时只回一句话。
4. 用纯文本，公式写成 x^2、sqrt(x) 这类可读形式，不要用 LaTeX。`;
const EXPLAIN_SYSTEM_PROMPT = `你是一名耐心的讲解者，负责把用户给出的概念、代码、报错或术语讲明白。

【规则】
1. 先用一句大白话说清「这是什么 / 为什么会这样」。
2. 再分点讲关键点，必要时给一个最小例子，例子要短。
3. 按用户指定的听众水平调整深度；没指定时按「有一点基础」的口径讲。
4. 报错类问题先指出最可能的原因，再给一两条可操作的下一步。
5. 不确定的地方明确说不确定，不编造 API、出处或数据；不要大段抄原文，不调用工具。`;
const REWRITE_SYSTEM_PROMPT = `你是一名中文编辑，按用户要求改写给定文字。

【规则】
1. 只输出改写后的正文，不解释改动、不列修改点。
2. 保留原文的事实、数字、人名与结论，不增加原文没有的信息。
3. 按要求的语气与篇幅改写；没指定时保持原意，让表达更自然口语。
4. 保留原有 Markdown 结构；不擅自改掉方言、玩笑或有意为之的错别字。`;
/** 四个工具的声明表（顺序决定注册顺序） */
const TEXT_TOOL_SPECS = [
    {
        name: TRANSLATE_TOOL_NAME,
        description: 'Translate a piece of text into the target language and return only the translation. '
            + 'Use for "翻译一下"、"这句英文什么意思"、translating chat messages, docs, or captions. '
            + 'Pass `to` for the target language (default 简体中文) and `from` when the source language is known. '
            + 'Do not use it for explaining grammar — use qqbot_explain instead.',
        system: TRANSLATE_SYSTEM_PROMPT,
        parameters: {
            properties: {
                text: { type: 'string', description: 'The source text to translate.' },
                to: { type: 'string', description: 'Target language, e.g. "简体中文", "English", "日本語". Defaults to 简体中文.' },
                from: { type: 'string', description: 'Source language when known; omitted means auto-detect.' },
            },
            required: ['text'],
        },
        build: (args) => buildTranslatePrompt(String(args.text ?? ''), textOrUndefined(args.to), textOrUndefined(args.from)),
    },
    {
        name: SUMMARIZE_TOOL_NAME,
        description: 'Summarize a long text into a one-line takeaway plus a few bullet points, sized for mobile chat. '
            + 'Use for long messages, pasted articles, meeting notes, or chat logs the user wants condensed. '
            + 'Pass `maxPoints` (1-10) when the user asks for a specific number of points.',
        system: SUMMARIZE_SYSTEM_PROMPT,
        parameters: {
            properties: {
                text: { type: 'string', description: 'The text to summarize.' },
                maxPoints: {
                    type: 'integer',
                    description: 'Maximum number of bullet points (1-10). Defaults to 6.',
                    minimum: 1,
                    maximum: 10,
                },
            },
            required: ['text'],
        },
        build: (args) => buildSummarizePrompt(String(args.text ?? ''), typeof args.maxPoints === 'number' ? args.maxPoints : undefined),
    },
    {
        name: EXPLAIN_TOOL_NAME,
        description: 'Explain a concept, a snippet of code, an error message, or a jargon term in plain language, '
            + 'tailored to the audience level. Use for "这是什么意思"、"这段代码在干嘛"、"报错看不懂"、'
            + '"解释一下这个概念". Not for solving exam questions — use qqbot_solve for those.',
        system: EXPLAIN_SYSTEM_PROMPT,
        parameters: {
            properties: {
                text: { type: 'string', description: 'The concept, code, error text, or term to explain.' },
                audience: { type: 'string', description: 'Audience level, e.g. "小白", "中学生", "大学生", "专业开发者". Defaults to 有一点基础.' },
                focus: { type: 'string', description: 'The part the user cares about most, when stated.' },
            },
            required: ['text'],
        },
        build: (args) => buildExplainPrompt(String(args.text ?? ''), textOrUndefined(args.audience), textOrUndefined(args.focus)),
    },
    {
        name: REWRITE_TOOL_NAME,
        description: 'Rewrite or polish a piece of Chinese text with a requested tone and length while keeping the facts. '
            + 'Use for "帮我润色一下"、"改得更正式/更轻松"、"缩短一点"、rewriting a message before sending it. '
            + 'Returns only the rewritten text.',
        system: REWRITE_SYSTEM_PROMPT,
        parameters: {
            properties: {
                text: { type: 'string', description: 'The original text to rewrite.' },
                tone: { type: 'string', description: 'Desired tone, e.g. "自然口语", "正式", "轻松", "有礼貌", "可爱". Defaults to 自然口语.' },
                length: { type: 'string', description: 'Desired length, e.g. "精简到一半", "不超过 50 字", "与原文相当". Defaults to 与原文相当.' },
            },
            required: ['text'],
        },
        build: (args) => buildRewritePrompt(String(args.text ?? ''), textOrUndefined(args.tone), textOrUndefined(args.length)),
    },
];
const OUTPUT_SCHEMA = {
    type: 'object',
    properties: {
        text: { type: 'string' },
        provider: { type: 'string' },
        model: { type: 'string' },
    },
    required: ['text', 'provider', 'model'],
    additionalProperties: false,
};
/** 注册四个实用小工具（服务缺失时统一告警并跳过，不阻断插件启动） */
export function registerTextTools(ctx, manager, config, logger) {
    const tools = ctx.get('tools');
    const llm = ctx.get('llm');
    if (!tools?.register || !llm?.stream) {
        logger.warn('im-qqbot: tools/llm 服务不可用，实用小工具（翻译/总结/讲解/改写）未注册');
        return;
    }
    for (const spec of TEXT_TOOL_SPECS) {
        const definition = {
            name: spec.name,
            description: spec.description,
            parameters: {
                type: 'object',
                properties: spec.parameters.properties,
                ...(spec.parameters.required !== undefined ? { required: spec.parameters.required } : {}),
                additionalProperties: false,
            },
            output: {
                schema: OUTPUT_SCHEMA,
                render: (_args, value) => [
                    { type: 'text', text: value.text },
                ],
            },
            async execute(args, exec) {
                const fields = (args ?? {});
                const text = textOrUndefined(fields.text);
                if (text === undefined) {
                    throw new Error(`${spec.name}: 需要 text（要处理的文字内容）`);
                }
                if (text.length > TEXT_TOOL_MAX_INPUT_CHARS) {
                    throw new Error(`${spec.name}: 输入过长（${text.length} 字符，上限 ${TEXT_TOOL_MAX_INPUT_CHARS}），请分段后重试`);
                }
                const route = resolveSessionRoute(manager, config, exec.agent);
                if (route === undefined) {
                    throw new Error(`${spec.name}: 无法确定使用的模型，请在配置中设置 provider/model`);
                }
                // v4 producer-owned source kind；本地 dsh-llm 类型尚为 v3 联合，做类型桥接
                const message = createUserMessage({
                    content: [{ type: 'text', text: spec.build(fields) }],
                    source: { kind: 'plugin:dsh-im-qqbot' },
                });
                const options = {
                    provider: route.provider,
                    model: route.model,
                    system: spec.system,
                    messages: [message],
                    maxTokens: TEXT_TOOL_MAX_TOKENS,
                    signal: exec.signal,
                };
                const result = await collectStreamText(llm.stream(options), spec.name);
                logger.info(`im-qqbot: ${spec.name} 完成 (provider=${route.provider} model=${route.model} chars=${result.length})`);
                return { text: result, provider: route.provider, model: route.model };
            },
        };
        tools.register(definition);
    }
    logger.info(`im-qqbot: 实用小工具已注册（${TEXT_TOOL_NAMES.join(', ')}，使用会话当前模型）`);
}
//# sourceMappingURL=text-tools.js.map