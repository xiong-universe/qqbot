/**
 * 语音回复的 system prompt section（order 88）
 *
 * 「要不要发语音」交给上层模型判断：这里告诉模型有语音这条路、什么时候适合、
 * 以及怎么用（先调 qqbot_voice，再把要朗读的话写成正文）。语音未启用时
 * 不产生 section，模型完全感知不到这项能力。
 *
 * 关键在于把正文约束成「台词本」而不是文章：机器人只负责念，所以正文必须是
 * 嘴里说出来的话——短句、口语、无旁白、无标记符号；情绪走 TTS 的 instruction，
 * 不写在正文里（写进去只会被一个字一个字念出来）。
 */
import type { PersonaVoiceConfig } from '../config.ts';
import {
  resolveVoiceTuning,
  SPEECH_EMOTION_TAGS,
  type ResolvedVoiceSettings,
  type VoiceTuning,
} from './voice-config.ts';
import { voiceShortLabel, type VoiceOption } from './voice-presets.ts';
import { VOICE_TOOL_NAME } from './voice-tool.ts';

/** 语音说明 section 的 order：排在人格（85）、工具权限（86）、记忆（87）之后 */
export const VOICE_PROMPT_ORDER = 88;

/** system-prompt section 最小结构（与 personas/persona-utils 保持一致） */
export interface VoicePromptSection {
  name: string;
  order: number;
  text: string;
}

export interface VoicePromptOptions {
  /** 解析后的语音设置；undefined = 语音未启用（不产生 section） */
  settings?: ResolvedVoiceSettings;
  /** 当前人格的语音覆盖（音色/情感指令） */
  personaVoice?: PersonaVoiceConfig;
  /** 音色下拉清单（用于把音色 id 翻成用户可读的名字） */
  voiceOptions?: readonly VoiceOption[];
}

/** 音色展示名：优先自定义名称，取不到时用音色 id */
function describeTimbre(tuning: VoiceTuning, options?: readonly VoiceOption[]): string {
  const name = voiceShortLabel(options, tuning.voice);
  return name === '' || name === tuning.voice ? tuning.voice : `${name}（${tuning.voice}）`;
}

/**
 * 组装语音说明 section。
 *
 * @returns undefined = 语音未启用（apiKey 为空），不注入任何说明
 */
export function buildVoicePromptSection(options: VoicePromptOptions): VoicePromptSection | undefined {
  const { settings, personaVoice, voiceOptions } = options;
  if (settings === undefined) return undefined;

  const tuning = resolveVoiceTuning(settings, personaVoice);
  const lines = [
    '【语音回复】',
    `本会话可以把回复发成 QQ 语音（当前音色：${describeTimbre(tuning, voiceOptions)}`
    + `${tuning.instruction === undefined ? '）。' : `；语气：${tuning.instruction}）。`}`,
    `需要语音时：先调用 ${VOICE_TOOL_NAME}（本轮的语气可以写进它的 instruction 参数），再把要说的话写成回复正文。`
    + '这段正文会合成为语音，**不会再发一条重复的文字**，所以正文就是嘴里要说的话。',
    `（${VOICE_TOOL_NAME} 已在本会话的工具列表里；即使人格的工具清单没写到它，也照样可以调用。）`,
    '',
    '【正文 = 台词，不是文章】',
    '- 像真人开口说话：短句、口语、带停顿，一句一句能直接念出来；不要书面语长句。',
    '- 只写台词，不写旁白：不要括号里的动作神态（（小声）、(sighs)），不要【突然】【笑】、'
    + '[pause:1s] 这类标记，不要 *叹气* 星号动作——它们没有朗读意义。',
    '- 情绪优先写在 instruction 里：例如「带点笑意」「压低声音」「有点委屈」「语速慢一点」。',
    `- 需要一句话里逐句变情绪时，才在正文里用服务端标签，且只用这几个：${SPEECH_EMOTION_TAGS.map((tag) => `[${tag}]`).join('、')}；其它标签不要写。`,
    '- 不要用 ||| 分条、不要用换行分气泡：语音是一条完整的话，需要断开就用逗号、句号。',
    '- 不要出现念不出来的东西：Markdown、代码块、URL、编号列表、颜文字、emoji。',
    '',
    '什么时候用语音：用户想听你的声音（「说句话」「发条语音」「想听你说话」「唱首歌」）、晚安安慰撒娇这类情绪化的短句、私聊里一两句话的回应。',
    '什么时候不用：代码、链接、列表或步骤、长篇解释、需要复制保存的内容，以及群聊里给多人看的信息——这些用文字更清楚。',
    `正文长度：控制在 ${settings.maxChars} 字以内，一次只发一条语音。`,
    '不要每轮都调用：没有需要用声音表达的场合，正常用文字回复即可。',
  ];
  return { name: 'qqbot:voice', order: VOICE_PROMPT_ORDER, text: lines.join('\n') };
}
