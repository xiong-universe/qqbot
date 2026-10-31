import { normalizeVoiceInstruction, resolveVoiceTuning, } from "./voice-config.js";
import { voiceShortLabel } from "./voice-presets.js";
/** 工具名（qqbot 前缀避免与其他通道的同名工具冲突） */
export const VOICE_TOOL_NAME = 'qqbot_voice';
/** 工具描述（给模型看的英文说明） */
const DESCRIPTION = 'Deliver this turn\'s reply as a QQ voice message instead of text. '
    + 'Call it BEFORE writing the reply when the user wants to hear your voice ("说句话"、"发条语音"、"唱首歌"), '
    + 'or when a short emotional answer (goodnight, comforting, playful) feels better spoken. '
    + 'The reply text you write afterwards is synthesized into speech and is NOT also sent as text, '
    + 'so write it as a line to say out loud: short, colloquial, no stage directions in brackets or asterisks, '
    + 'no "|||" bubbles, no line breaks, no code, links, lists or Markdown. '
    + 'Always pass the optional `instruction` argument with one concrete delivery direction for THIS line '
    + '(emotion, pace, a smile); falling back to the persona default every time sounds like an announcer reading. '
    + 'Inline emotion tags are only allowed from the whitelist in the voice instructions. '
    + 'Do not call it for long or technical answers, or for content the user needs to copy — plain text is better there.';
/**
 * 给会话打上「本轮语音回复」标记（纯函数，便于单测）。
 *
 * @param record      - 目标会话
 * @param timbre      - 本轮音色 id（已在调用方按人格解析）
 * @param maxChars    - 本轮字数上限
 * @param instruction - 单轮情感指令（覆盖人格/全局设置，仅本轮生效）
 */
export function markVoiceRequested(record, timbre, maxChars, instruction) {
    record.voiceRequested = true;
    const normalized = normalizeVoiceInstruction(instruction);
    if (normalized === undefined)
        delete record.voiceInstruction;
    else
        record.voiceInstruction = normalized;
    return {
        ok: true,
        timbre,
        maxChars,
        instruction: normalized ?? '',
    };
}
/** 回给模型的提示文案（说明使用方式与限制） */
export function buildVoiceToolMessage(result, options) {
    const name = voiceShortLabel(options, result.timbre);
    const timbre = name === '' || name === result.timbre ? result.timbre : `${name}（${result.timbre}）`;
    return [
        `已切换为语音回复（音色：${timbre}）。`,
        '请把要说的话写成回复正文：它会合成为语音发送，不要再重复一遍同样的文字。',
        `正文就是台词：控制在 ${result.maxChars} 字以内，用口语短句；不要用 ||| 或换行分条，`
            + '不要写括号动作或情绪标注（情绪请写进 instruction），也不要 Markdown、代码块、链接或颜文字。',
        '建议在 instruction 里写清这句怎么说（如「带点笑意」「困了、慢一点」）；不写会沿用默认语气，'
            + '每一句都用同一种默认语气，听起来容易像念稿。',
        ...(result.instruction === '' ? [] : [`本轮语气：${result.instruction}`]),
    ].join('\n');
}
/**
 * 注册 qqbot_voice 工具（tools 服务缺失时优雅降级，不阻断插件启动）。
 *
 * @returns 是否注册成功
 */
export function registerVoiceTool(ctx, options) {
    const tools = ctx.get('tools');
    if (tools?.register === undefined) {
        options.logger.warn(`im-qqbot: tools 服务不可用，${VOICE_TOOL_NAME} 工具未注册`);
        return false;
    }
    const { manager, settings, logger } = options;
    const voiceOptions = options.voiceOptions;
    const definition = {
        name: VOICE_TOOL_NAME,
        description: DESCRIPTION,
        parameters: {
            type: 'object',
            properties: {
                instruction: {
                    type: 'string',
                    description: 'Optional delivery direction for THIS reply only, e.g. "带点笑意"、"压低声音"、"撒个娇". '
                        + 'Overrides the persona/global emotion instruction once.',
                },
            },
            additionalProperties: false,
        },
        output: {
            schema: {
                type: 'object',
                properties: {
                    ok: { type: 'boolean' },
                    timbre: { type: 'string' },
                    maxChars: { type: 'integer' },
                    instruction: { type: 'string' },
                },
                required: ['ok', 'timbre', 'maxChars', 'instruction'],
                additionalProperties: false,
            },
            render: (_args, value) => {
                const result = value;
                return [{ type: 'text', text: buildVoiceToolMessage(result, voiceOptions) }];
            },
        },
        async execute(args, exec) {
            const record = manager.findByAgent(exec.agent);
            if (record === undefined) {
                throw new Error(`${VOICE_TOOL_NAME}: 只能在 QQ 会话里使用`);
            }
            const persona = manager.getEffectivePersona(record.scope, record.peerId);
            const tuning = resolveVoiceTuning(settings, persona?.expressions?.voice);
            const instruction = args?.instruction;
            const result = markVoiceRequested(record, tuning.voice, settings.maxChars, instruction);
            logger.info(`im-qqbot: 本轮改为语音回复 key=${record.sessionKey} voice=${tuning.voice}`
                + ` instruction=${result.instruction === '' ? '无' : '有'}`);
            return { ...result };
        },
    };
    tools.register(definition);
    logger.info(`im-qqbot: ${VOICE_TOOL_NAME} 工具已注册（由模型判断本轮是否用语音回复）`);
    return true;
}
//# sourceMappingURL=voice-tool.js.map