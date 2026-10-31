/**
 * qqbot_voice 工具单测
 *
 * 工具只给会话打标记（voiceRequested + 可选单轮情感指令），
 * 真正的合成在轮末由 VoiceSpeaker 做——这里验证标记与回给模型的提示文案。
 */
import { describe, expect, it, vi } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import type { PersonaPreset, VoiceConfig } from '../config.ts';
import type { SessionRecord } from '../session/types.ts';
import { resolveVoiceSettings } from './voice-config.ts';
import { buildVoiceOptions } from './voice-presets.ts';
import {
  VOICE_TOOL_NAME,
  buildVoiceToolMessage,
  markVoiceRequested,
  registerVoiceTool,
  type VoiceRequestResult,
} from './voice-tool.ts';

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

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionKey: 'k',
    sessionId: 's1',
    scope: 'c2c',
    peerId: 'user1',
    agent: {},
    handle: {},
    createdAt: 0,
    lastActiveAt: 0,
    ...overrides,
  } as unknown as SessionRecord;
}

describe('markVoiceRequested', () => {
  it('打上语音标记并写入单轮情感指令', () => {
    const r = record();
    const result = markVoiceRequested(r, 'custom-voice', 200, '  带点笑意\n语速稍快 ');
    expect(r.voiceRequested).toBe(true);
    expect(r.voiceInstruction).toBe('带点笑意 语速稍快');
    expect(result).toEqual({
      ok: true,
      timbre: 'custom-voice',
      maxChars: 200,
      instruction: '带点笑意 语速稍快',
    });
  });

  it('未传指令时清掉上一轮的残留指令', () => {
    const r = record({ voiceInstruction: '上一轮的语气' });
    markVoiceRequested(r, 'longanfengyue', 300);
    expect(r.voiceRequested).toBe(true);
    expect(r.voiceInstruction).toBeUndefined();
  });

  it('纯空白指令按未提供处理', () => {
    const r = record();
    const result = markVoiceRequested(r, 'longanfengyue', 300, '   ');
    expect(result.instruction).toBe('');
    expect(r.voiceInstruction).toBeUndefined();
  });
});

describe('buildVoiceToolMessage', () => {
  const base: VoiceRequestResult = { ok: true, timbre: 'custom-voice', maxChars: 200, instruction: '' };

  it('音色 id 翻成可读名称，并提醒正文不要再发文字', () => {
    const text = buildVoiceToolMessage(
      base,
      buildVoiceOptions([{ name: '御姐', voice: 'custom-voice' }], 'qwen-audio-3.0-tts-flash'),
    );
    expect(text).toContain('御姐（custom-voice）');
    expect(text).toContain('不要再重复');
    expect(text).toContain('200');
    expect(text).toContain('不要用 ||| 或换行分条');
    expect(text).not.toContain('本轮语气');
  });

  it('有单轮情感指令时附在最后', () => {
    const text = buildVoiceToolMessage({ ...base, instruction: '压低声音' });
    expect(text).toContain('本轮语气：压低声音');
  });

  it('清单里没有该音色时直接显示 id', () => {
    expect(buildVoiceToolMessage(base, [])).toContain('custom-voice');
  });
});

describe('registerVoiceTool', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  function harness(options?: { persona?: PersonaPreset; noTools?: boolean }) {
    const registered: Array<Record<string, unknown>> = [];
    const tools = { register: vi.fn((definition: Record<string, unknown>) => { registered.push(definition); }) };
    const ctx = { get: vi.fn((name: string) => (name === 'tools' && !options?.noTools ? tools : undefined)) } as unknown as Context;
    const target = record();
    const manager = {
      findByAgent: vi.fn((agent: unknown) => (agent === 'a1' ? target : undefined)),
      getEffectivePersona: vi.fn(() => options?.persona),
    };
    const ok = registerVoiceTool(ctx, {
      manager,
      settings: resolveVoiceSettings(voiceConfig())!,
      voiceOptions: buildVoiceOptions([{ name: '女仆', voice: 'maid-voice' }], 'qwen-audio-3.0-tts-flash'),
      logger,
    });
    return { ok, registered, manager, target, tools };
  }

  it('注册成功：工具名与参数只保留可选的单轮语气', () => {
    const { ok, registered } = harness();
    expect(ok).toBe(true);
    expect(registered[0]?.name).toBe(VOICE_TOOL_NAME);
    const props = (registered[0]?.parameters as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props)).toEqual(['instruction']);
  });

  it('tools 服务缺失时优雅降级（不抛错）', () => {
    const { ok, registered } = harness({ noTools: true });
    expect(ok).toBe(false);
    expect(registered).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('执行：按人格音色打标记，非 QQ 会话报错', async () => {
    const { registered, manager, target } = harness({
      persona: { id: 'maid', name: '女仆', prompt: '', expressions: { voice: { voice: 'maid-voice' } } },
    });
    const execute = registered[0]?.execute as (args: unknown, exec: unknown) => Promise<Record<string, unknown>>;

    const result = await execute({ instruction: '撒娇' }, { signal: new AbortController().signal, agent: 'a1' });
    expect(result).toMatchObject({ ok: true, timbre: 'maid-voice', maxChars: 300, instruction: '撒娇' });
    expect(target.voiceRequested).toBe(true);
    expect(target.voiceInstruction).toBe('撒娇');
    expect(manager.getEffectivePersona).toHaveBeenCalledWith('c2c', 'user1');

    await expect(
      execute({}, { signal: new AbortController().signal, agent: 'not-qq' }),
    ).rejects.toThrow('只能在 QQ 会话里使用');
  });
});
