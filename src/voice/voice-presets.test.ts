import { describe, expect, it } from 'vitest';
import {
  VOICE_PRESETS,
  VOICE_PRESET_MODEL,
  VOICE_PRESET_MODEL_PLUS,
  buildVoiceOptions,
  findVoicePreset,
  formatVoicePresetLabel,
  voiceOptionLabel,
  voicePresetsForModel,
} from './voice-presets.ts';

describe('voicePresets', () => {
  it('音色 id 唯一', () => {
    const ids = VOICE_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个预设都有名称与适用模型', () => {
    for (const preset of VOICE_PRESETS) {
      expect(preset.id.trim()).not.toBe('');
      expect(preset.name.trim()).not.toBe('');
      expect(preset.models.length).toBeGreaterThan(0);
    }
  });

  it('按模型过滤：默认模型返回全部预设', () => {
    expect(voicePresetsForModel(VOICE_PRESET_MODEL)).toHaveLength(VOICE_PRESETS.length);
    expect(voicePresetsForModel(undefined)).toHaveLength(VOICE_PRESETS.length);
  });

  it('按模型过滤：未知模型（如 cosyvoice-v2）不返回预设', () => {
    expect(voicePresetsForModel('cosyvoice-v2')).toHaveLength(0);
  });

  it('plus 模型只列出实测兼容的内置音色', () => {
    const plusOnly = voicePresetsForModel(VOICE_PRESET_MODEL_PLUS).map((preset) => preset.id);
    expect(plusOnly).toEqual(['longanlingxi', 'longanhuan_v3.6']);
  });

  it('findVoicePreset 命中与未命中', () => {
    expect(findVoicePreset('longanfengyue')?.name).toBe('龙安风悦');
    expect(findVoicePreset('  longanfengyue  ')?.name).toBe('龙安风悦');
    expect(findVoicePreset('')).toBeUndefined();
    expect(findVoicePreset('custom-voice-id')).toBeUndefined();
  });

  it('label 包含名称与特质', () => {
    const preset = findVoicePreset('longanyuanfei');
    expect(preset).toBeDefined();
    expect(formatVoicePresetLabel(preset!)).toContain('龙安元妃');
    expect(formatVoicePresetLabel(preset!)).toContain('高傲妃子音');
    expect(formatVoicePresetLabel(preset!)).toContain('30岁');
  });
});

describe('buildVoiceOptions（自定义音色置顶）', () => {
  const custom = [
    { name: '御姐', voice: 'vd-ee1c' },
    { name: '女仆', voice: 'vd-ab17' },
  ];

  it('自定义音色全部排在系统预设之前，且顺序原样保留', () => {
    const options = buildVoiceOptions(custom, VOICE_PRESET_MODEL);
    expect(options).toHaveLength(custom.length + VOICE_PRESETS.length);
    expect(options.slice(0, 2)).toEqual([
      { value: 'vd-ee1c', label: '御姐（自定义）' },
      { value: 'vd-ab17', label: '女仆（自定义）' },
    ]);
    expect(options[2]?.value).toBe(VOICE_PRESETS[0]?.id);
  });

  it('没有自定义音色时只剩系统预设；未知模型时清单为空', () => {
    expect(buildVoiceOptions(undefined, VOICE_PRESET_MODEL)).toHaveLength(VOICE_PRESETS.length);
    expect(buildVoiceOptions([], VOICE_PRESET_MODEL)).toHaveLength(VOICE_PRESETS.length);
    expect(buildVoiceOptions([], 'cosyvoice-v2')).toHaveLength(0);
  });

  it('plus 模型下仍列出全部内置音色：兼容项无标注，不兼容项标出需要 flash', () => {
    const options = buildVoiceOptions([{ name: '御姐', voice: 'vd-ee1c' }], VOICE_PRESET_MODEL_PLUS);
    expect(options).toHaveLength(1 + VOICE_PRESETS.length);
    expect(options[0]).toEqual({ value: 'vd-ee1c', label: '御姐（自定义）' });

    const lingxi = options.find((option) => option.value === 'longanlingxi');
    expect(lingxi?.requiresModel).toBeUndefined();
    const fengyue = options.find((option) => option.value === 'longanfengyue');
    expect(fengyue?.requiresModel).toBe(VOICE_PRESET_MODEL);
  });

  it('没有音色 id / 重复 id 的自定义项被跳过，名称留空时用 id 兜底', () => {
    const options = buildVoiceOptions([
      { name: '待填', voice: '' },
      { name: '', voice: 'vd-abc' },
      { name: '重复', voice: 'vd-abc' },
      { name: '自定义覆盖', voice: 'longanfengyue' },
    ], VOICE_PRESET_MODEL);
    expect(options[0]).toEqual({ value: 'vd-abc', label: 'vd-abc（自定义）' });
    expect(options[1]).toEqual({ value: 'longanfengyue', label: '自定义覆盖（自定义）' });
    // 与自定义 id 重复的内置预设被跳过，所以总数 = 2 + (内置数 - 1)
    expect(options).toHaveLength(2 + VOICE_PRESETS.length - 1);
  });
});

describe('voiceOptionLabel', () => {
  it('按 id 找到下拉文案，找不到时回退 id 本身', () => {
    const options = buildVoiceOptions([{ name: '元气少女', voice: 'vd-8521' }], VOICE_PRESET_MODEL);
    expect(voiceOptionLabel(options, 'vd-8521')).toBe('元气少女（自定义）');
    expect(voiceOptionLabel(options, ' longanyuanfei ')).toContain('龙安元妃');
    expect(voiceOptionLabel(options, 'unknown-id')).toBe('unknown-id');
    expect(voiceOptionLabel(options, '')).toBe('');
    expect(voiceOptionLabel(options, undefined)).toBe('');
  });
});
