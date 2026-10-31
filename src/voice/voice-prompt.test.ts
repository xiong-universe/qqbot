/**
 * 语音说明 section 单测
 *
 * 只有语音启用（apiKey 非空）时才注入：未启用时模型完全感知不到这项能力。
 * 文案里要带上当前音色、情感指令与字数上限，模型才知道该怎么写正文。
 */
import { describe, expect, it } from 'vitest';
import type { VoiceConfig } from '../config.ts';
import { resolveVoiceSettings } from './voice-config.ts';
import { buildVoiceOptions } from './voice-presets.ts';
import { VOICE_PROMPT_ORDER, buildVoicePromptSection } from './voice-prompt.ts';

function voiceConfig(overrides: Partial<VoiceConfig> = {}): VoiceConfig {
  return {
    apiKey: 'sk-test',
    model: 'qwen-audio-3.0-tts-flash',
    voice: 'longanfengyue',
    instruction: '',
    presets: [],
    baseUrl: '',
    workspace: '',
    maxChars: 300,
    timeoutMs: 30000,
    ...overrides,
  };
}

describe('buildVoicePromptSection', () => {
  it('语音未启用（apiKey 为空）时不产生 section', () => {
    expect(buildVoicePromptSection({ settings: undefined })).toBeUndefined();
    expect(buildVoicePromptSection({})).toBeUndefined();
  });

  it('启用时注入 order 88 的 qqbot:voice section，并说明「只发语音不发文字」', () => {
    const section = buildVoicePromptSection({ settings: resolveVoiceSettings(voiceConfig()) });
    expect(section).toBeDefined();
    expect(section?.name).toBe('qqbot:voice');
    expect(section?.order).toBe(VOICE_PROMPT_ORDER);
    expect(section?.text).toContain('qqbot_voice');
    expect(section?.text).toContain('不会');
    expect(section?.text).toContain('300');
    expect(section?.text).toContain('longanfengyue');
  });

  it('正文按台词约束：不写旁白/情绪标记、不用 ||| 分条、情绪写进 instruction', () => {
    const text = buildVoicePromptSection({ settings: resolveVoiceSettings(voiceConfig()) })?.text ?? '';
    expect(text).toContain('台词');
    expect(text).toContain('不要用 ||| 分条');
    expect(text).toContain('情绪优先写在 instruction 里');
    expect(text).toContain('括号里的动作神态');
    expect(text).toContain('不写旁白');
    expect(text).toContain('[whispers]');
  });

  it('音色名称来自自定义清单；人格音色覆盖全局音色', () => {
    const section = buildVoicePromptSection({
      settings: resolveVoiceSettings(voiceConfig({
        presets: [{ name: '御姐', voice: 'custom-voice-id' }],
      })),
      personaVoice: { voice: 'custom-voice-id' },
      voiceOptions: buildVoiceOptions([{ name: '御姐', voice: 'custom-voice-id' }], 'qwen-audio-3.0-tts-flash'),
    });
    expect(section?.text).toContain('御姐（custom-voice-id）');
  });

  it('人格情感指令写进说明；没有指令时不出现「语气」', () => {
    const withInstruction = buildVoicePromptSection({
      settings: resolveVoiceSettings(voiceConfig()),
      personaVoice: { instruction: '带点笑意，语速稍快' },
    });
    expect(withInstruction?.text).toContain('语气：带点笑意，语速稍快');

    const without = buildVoicePromptSection({ settings: resolveVoiceSettings(voiceConfig()) });
    expect(without?.text).not.toContain('语气：');
  });

  it('全局情感指令在人格未配置时生效', () => {
    const section = buildVoicePromptSection({
      settings: resolveVoiceSettings(voiceConfig({ instruction: '请用清冷克制的语气' })),
    });
    expect(section?.text).toContain('语气：请用清冷克制的语气');
  });
});
