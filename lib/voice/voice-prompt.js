import { resolveVoiceTuning, SPEECH_EMOTION_TAGS, } from "./voice-config.js";
import { voiceShortLabel } from "./voice-presets.js";
import { VOICE_TOOL_NAME } from "./voice-tool.js";
/** 语音说明 section 的 order：排在人格（85）、工具权限（86）、记忆（87）之后 */
export const VOICE_PROMPT_ORDER = 88;
/** 音色展示名：优先自定义名称，取不到时用音色 id */
function describeTimbre(tuning, options) {
    const name = voiceShortLabel(options, tuning.voice);
    return name === '' || name === tuning.voice ? tuning.voice : `${name}（${tuning.voice}）`;
}
/**
 * 组装语音说明 section。
 *
 * @returns undefined = 语音未启用（apiKey 为空），不注入任何说明
 */
export function buildVoicePromptSection(options) {
    const { settings, personaVoice, voiceOptions } = options;
    if (settings === undefined)
        return undefined;
    const tuning = resolveVoiceTuning(settings, personaVoice);
    const lines = [
        '【语音回复】',
        `本会话可以把回复发成 QQ 语音（当前音色：${describeTimbre(tuning, voiceOptions)}`
            + `${tuning.instruction === undefined ? '）。' : `；语气：${tuning.instruction}）。`}`,
        `需要语音时：先调用 ${VOICE_TOOL_NAME}（本轮的语气可以写进它的 instruction 参数），再把要说的话写成回复正文。`
            + '这段正文会合成为语音，**不会再发一条重复的文字**，所以正文就是嘴里要说的话。',
        `（${VOICE_TOOL_NAME} 已在本会话的工具列表里；即使人格的工具清单没写到它，也照样可以调用。）`,
        '每次调用都把 instruction 写具体：这句话是笑着说、困着说，还是有点委屈；只写「自然一点」等于没写，'
            + '只沿用默认语气会听起来像念稿。',
        '',
        '【正文 = 台词，不是文章】',
        '- 像发微信语音那样说话：1–2 个短句、30–60 字最好，一句一句能直接念出来；'
            + '可以用「嗯」「诶」「啊」这类起头的语气词，用逗号或省略号表示停顿，不要一口气念一大段。',
        '- 只写台词，不写旁白：不要括号里的动作神态（（小声）、(sighs)），不要【突然】【笑】、'
            + '[pause:1s] 这类标记，不要 *叹气* 星号动作——它们没有朗读意义。',
        '- 情绪优先写在 instruction 里：例如「带点笑意」「压低声音」「有点委屈」「语速慢一点」。',
        `- 需要一句话里逐句变情绪时，才在正文里用服务端标签，且只用这几个：${SPEECH_EMOTION_TAGS.map((tag) => `[${tag}]`).join('、')}；其它标签不要写。`,
        '- 不要用 ||| 分条、不要用换行分气泡：语音是一条完整的话，需要断开就用逗号、句号。',
        '- 语音轮的正文只用于合成、不发给用户看，断句按口语来（句号、问号都可以写），不受人格「不打句号」这类聊天格式限制。',
        '- 不要出现念不出来的东西：Markdown、代码块、URL、编号列表、颜文字、emoji。',
        '',
        '什么时候用语音：用户想听你的声音（「说句话」「发条语音」「想听你说话」「唱首歌」）、晚安安慰撒娇这类情绪化的短句、私聊里一两句话的回应。',
        '什么时候不用：代码、链接、列表或步骤、长篇解释、需要复制保存的内容，以及群聊里给多人看的信息——这些用文字更清楚。',
        `正文长度：控制在 ${settings.maxChars} 字以内，一次只发一条语音。`,
        '不要每轮都调用：没有需要用声音表达的场合，正常用文字回复即可。',
    ];
    return { name: 'qqbot:voice', order: VOICE_PROMPT_ORDER, text: lines.join('\n') };
}
//# sourceMappingURL=voice-prompt.js.map