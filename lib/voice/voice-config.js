/**
 * 语音回复的配置解析与文本清洗
 *
 * 门控语义：`voice.apiKey` 为空 = 语音功能整体关闭（不注册 qqbot_voice 工具、
 * 不合成、不发语音、不消耗额度），与没有这项配置时的行为完全一致。
 *
 * 是否发语音由**上层模型**判断（调用 qqbot_voice 工具），不再做字符匹配：
 * 关键词命中会把「唱歌」这类闲聊误判成指令，也挡不住「想听你的声音」这类变体。
 */
import { DEFAULT_VOICE_ID, DEFAULT_VOICE_MAX_CHARS, DEFAULT_VOICE_MODEL, DEFAULT_VOICE_TIMEOUT_MS, MAX_VOICE_INSTRUCTION_LEN, } from "../config.js";
import { isSpeechWebSocketAvailable } from "./tts.js";
/** 单次朗读的最大字数范围 */
export const MIN_VOICE_MAX_CHARS = 20;
export const MAX_VOICE_MAX_CHARS = 1000;
/** 合成超时范围(ms) */
export const MIN_VOICE_TIMEOUT_MS = 5000;
export const MAX_VOICE_TIMEOUT_MS = 120000;
/** 语速倍率范围 */
export const MIN_VOICE_RATE = 0.5;
export const MAX_VOICE_RATE = 2;
/** 音量范围 */
export const MIN_VOICE_VOLUME = 0;
export const MAX_VOICE_VOLUME = 100;
/** 取整并收敛到 [min, max]，非法值返回缺省 */
function clampInt(value, min, max, fallback) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return fallback;
    return Math.min(max, Math.max(min, Math.round(value)));
}
/**
 * 情感/语气指令规范化：折叠换行与多余空白、按上限截断。
 *
 * 空白归一很重要——instruction 会被原样塞进 `run-task` 的 `parameters`，
 * 多行描述在 wire 上没有必要，单行更利于模型理解。
 * 返回 undefined 表示未配置（调用方不下发该参数）。
 */
export function normalizeVoiceInstruction(value, maxLen = MAX_VOICE_INSTRUCTION_LEN) {
    if (typeof value !== 'string')
        return undefined;
    const text = value.replace(/\s+/g, ' ').trim();
    if (text === '')
        return undefined;
    return text.length > maxLen ? text.slice(0, maxLen).trimEnd() : text;
}
/**
 * 解析语音配置；`apiKey` 为空时返回 undefined（= 语音关闭）。
 *
 * 模型/音色为空时回落到缺省值，避免面板里清空后合成直接失败。
 */
export function resolveVoiceSettings(voice) {
    const apiKey = voice?.apiKey?.trim() ?? '';
    if (apiKey === '')
        return undefined;
    const model = voice?.model?.trim() || DEFAULT_VOICE_MODEL;
    const voiceId = voice?.voice?.trim() || DEFAULT_VOICE_ID;
    const baseUrl = voice?.baseUrl?.trim();
    const workspace = voice?.workspace?.trim();
    const instruction = normalizeVoiceInstruction(voice?.instruction);
    return {
        apiKey,
        model,
        voice: voiceId,
        ...(instruction !== undefined ? { instruction } : {}),
        ...(baseUrl !== undefined && baseUrl !== '' ? { baseUrl } : {}),
        ...(workspace !== undefined && workspace !== '' ? { workspace } : {}),
        maxChars: clampInt(voice?.maxChars, MIN_VOICE_MAX_CHARS, MAX_VOICE_MAX_CHARS, DEFAULT_VOICE_MAX_CHARS),
        timeoutMs: clampInt(voice?.timeoutMs, MIN_VOICE_TIMEOUT_MS, MAX_VOICE_TIMEOUT_MS, DEFAULT_VOICE_TIMEOUT_MS),
    };
}
/**
 * 语音是否真正可用：apiKey 非空**且**运行时支持内置 WebSocket（Node 22+）。
 *
 * 提示词注入与工具白名单都按它判断：Node 20 填了 Key 也合成不了，
 * 此时不能再告诉模型「你可以调 qqbot_voice」，否则模型只会调到一个不存在的工具。
 */
export function resolveActiveVoiceSettings(voice) {
    const settings = resolveVoiceSettings(voice);
    if (settings === undefined)
        return undefined;
    return isSpeechWebSocketAvailable() ? settings : undefined;
}
/**
 * 解析本轮语音参数：人格音色覆盖全局音色，语速/音量只在人格里显式配置时生效。
 * 非法数值一律忽略（交给服务端缺省值）；情感指令同理——人格没写就沿用全局。
 */
export function resolveVoiceTuning(settings, persona) {
    const personaVoice = persona?.voice?.trim();
    const rate = persona?.rate;
    const volume = persona?.volume;
    const instruction = normalizeVoiceInstruction(persona?.instruction) ?? settings.instruction;
    return {
        voice: personaVoice !== undefined && personaVoice !== '' ? personaVoice : settings.voice,
        ...(typeof rate === 'number' && Number.isFinite(rate)
            ? { rate: Math.min(MAX_VOICE_RATE, Math.max(MIN_VOICE_RATE, rate)) }
            : {}),
        ...(typeof volume === 'number' && Number.isFinite(volume)
            ? { volume: Math.min(MAX_VOICE_VOLUME, Math.max(MIN_VOICE_VOLUME, Math.round(volume))) }
            : {}),
        ...(instruction !== undefined ? { instruction } : {}),
    };
}
/**
 * 可用于朗读的字符集：中日韩汉字/假名/字母数字 + 常用中英标点。
 *
 * 颜文字、emoji、Markdown 符号（`#` `*` `_` `~` `|` 等）不在集合内，
 * 会被整体剔除，避免 TTS 把符号念出来。
 */
const SPEECH_CHARS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}A-Za-z0-9\s，。！？、；：…—,.!?;:'"“”‘’《》【】]/gu;
/** 至少包含一个可朗读的实义字符（纯符号/颜文字不算） */
const SPEECH_CONTENT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}A-Za-z0-9]/u;
/**
 * 服务端能识别的逐句情感标签（`qwen-audio-3.0-tts-plus / flash`）。
 *
 * 只有白名单里的标签会原样送进 TTS；其它方括号内容一律当注释丢掉，
 * 免得模型写的 `[pause:1s]`、`[突然]` 被一个字一个字念出来。
 */
export const SPEECH_EMOTION_TAGS = [
    'excited',
    'sad',
    'serious',
    'laughing',
    'sighing',
    'whispers',
    'very slowly',
    'very fast',
];
const SPEECH_TAG_BODY = SPEECH_EMOTION_TAGS.join('|');
const SPEECH_TAG_SPLIT = new RegExp(`(\\[(?:${SPEECH_TAG_BODY})\\])`, 'gi');
const SPEECH_TAG = new RegExp(`^\\[(?:${SPEECH_TAG_BODY})\\]$`, 'i');
/** 清洗一段不含白名单标签的正文（去掉不该念的东西） */
function cleanSpeechChunk(chunk) {
    const stripped = chunk
        // 代码块与行内代码（TTS 念代码没有意义）
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`\n]*`/g, ' ')
        // 图片语法整体去掉，链接语法保留可见文字
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        // 裸 URL
        .replace(/https?:\/\/\S+/gi, ' ')
        // 舞台指示：括号/方括号/星号包住的动作、神态、情绪标签，整段不念
        .replace(/（[^（）]*）/g, ' ')
        .replace(/\([^()]*\)/g, ' ')
        .replace(/【[^【】]*】/g, ' ')
        .replace(/\[[^[\]]*\]/g, ' ')
        .replace(/\*[^*\n]*\*/g, ' ')
        // 固定分隔符 ||| 与其它竖线：当成句间停顿
        .replace(/\|+/g, '，')
        // 换行：语音是一条完整的话，不按气泡念
        .replace(/\r?\n+/g, ' ')
        // Markdown 标题/列表/强调符号
        .replace(/[#*_~>]+/g, ' ');
    // 只保留可朗读字符（颜文字括号内的一堆符号会被清掉）
    const kept = (stripped.match(SPEECH_CHARS) ?? []).join('')
        .replace(/\s+/g, ' ')
        .replace(/，\s*，/g, '，')
        .trim();
    if (kept === '' || !SPEECH_CONTENT.test(kept))
        return '';
    return kept;
}
/**
 * 清洗回复文本用于语音合成：
 *
 * - 去掉代码块 / 行内代码 / 图片与链接语法 / URL（念出来没有意义）
 * - 去掉舞台指示：括号动作（`（小声）`、`(sighs)`）、`【突然】` 这类情绪标记、
 *   `*叹气*` 星号动作——TTS 会把里面的字念出来，而它们只是给读者看的注释
 * - 白名单内的服务端情感标签（`[whispers]` 等）保留，供 TTS 逐句表演
 * - `|||` 是 QQ 的分条分隔符：语音是一条完整的话，这里换成逗号当停顿
 * - 换行同样合并（语音不按气泡朗读），Markdown 符号与颜文字整体剔除
 * - 折叠空白，按 `maxChars` 截断（截断处不会切坏情感标签）
 *
 * 返回空字符串表示本轮没有可朗读内容（调用方应跳过语音）。
 */
export function cleanTextForSpeech(text, maxChars) {
    if (text === '')
        return '';
    const limit = clampInt(maxChars, MIN_VOICE_MAX_CHARS, MAX_VOICE_MAX_CHARS, DEFAULT_VOICE_MAX_CHARS);
    const assembled = text
        .split(SPEECH_TAG_SPLIT)
        .map((part) => (SPEECH_TAG.test(part) ? part.toLowerCase() : cleanSpeechChunk(part)))
        .join('')
        .trim();
    if (assembled === '' || !SPEECH_CONTENT.test(assembled.replace(/\[[^\]]*\]/g, '')))
        return '';
    if (assembled.length <= limit)
        return assembled;
    // 截断：若切在标签中间，回退到标签起点，避免下发半个 "[whisp"
    let cut = assembled.slice(0, limit);
    const open = cut.lastIndexOf('[');
    if (open !== -1 && cut.indexOf(']', open) === -1)
        cut = cut.slice(0, open);
    return cut.trimEnd();
}
//# sourceMappingURL=voice-config.js.map