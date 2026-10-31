import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TTS_SAMPLE_RATE,
  DEFAULT_TTS_REGION,
  DEFAULT_TTS_WS_URL,
  buildContinueTaskFrame,
  buildFinishTaskFrame,
  buildRunTaskFrame,
  isSpeechWebSocketAvailable,
  resolveSpeechEndpoint,
  synthesizeSpeech,
  type SpeechSynthesisOptions,
} from './tts.ts';

const baseOptions: SpeechSynthesisOptions = {
  apiKey: 'sk-test',
  model: 'cosyvoice-v2',
  voice: 'longanfengyue',
};

describe('resolveSpeechEndpoint', () => {
  it('缺省使用 DashScope 官方共享网关', () => {
    expect(resolveSpeechEndpoint()).toBe(DEFAULT_TTS_WS_URL);
    expect(resolveSpeechEndpoint('', '')).toBe(DEFAULT_TTS_WS_URL);
  });

  it('workspace 拼出 MaaS 网关地址', () => {
    expect(resolveSpeechEndpoint(undefined, 'ws-abc')).toBe(
      `wss://ws-abc.${DEFAULT_TTS_REGION}.maas.aliyuncs.com/api-ws/v1/inference`,
    );
  });

  it('显式 baseUrl 优先于 workspace；仅主机时自动补协议路径', () => {
    expect(resolveSpeechEndpoint('wss://ws.example.com/', 'ws-abc')).toBe(
      'wss://ws.example.com/api-ws/v1/inference',
    );
    expect(resolveSpeechEndpoint('wss://ws.example.com/api-ws/v1/inference', 'ws-abc')).toBe(
      'wss://ws.example.com/api-ws/v1/inference',
    );
  });
});

describe('TTS 帧构造', () => {
  it('run-task 帧包含 duplex 头、模型、音色与音频格式', () => {
    const frame = buildRunTaskFrame('task1', baseOptions);
    expect(frame.header).toEqual({ action: 'run-task', task_id: 'task1', streaming: 'duplex' });
    expect(frame.payload).toMatchObject({
      task_group: 'audio',
      task: 'tts',
      function: 'SpeechSynthesizer',
      model: 'cosyvoice-v2',
      parameters: {
        voice: 'longanfengyue',
        format: 'mp3',
        sample_rate: DEFAULT_TTS_SAMPLE_RATE,
        text_type: 'PlainText',
      },
    });
    expect(frame.payload.parameters).not.toHaveProperty('rate');
    expect(frame.payload.parameters).not.toHaveProperty('volume');
    expect(frame.payload.parameters).not.toHaveProperty('instruction');
  });

  it('rate/volume 仅在显式配置时透出', () => {
    const frame = buildRunTaskFrame('task1', { ...baseOptions, rate: 1.2, volume: 60 });
    expect(frame.payload.parameters).toMatchObject({ rate: 1.2, volume: 60 });
  });

  it('instruction 非空时下发，空白/空串不下发', () => {
    const frame = buildRunTaskFrame('task1', {
      ...baseOptions,
      instruction: '  请用清冷、克制的语气，语速稍慢  ',
    });
    expect(frame.payload.parameters).toMatchObject({
      instruction: '请用清冷、克制的语气，语速稍慢',
    });
    expect(buildRunTaskFrame('task1', { ...baseOptions, instruction: '   ' })
      .payload.parameters).not.toHaveProperty('instruction');
    expect(buildRunTaskFrame('task1', { ...baseOptions, instruction: '' })
      .payload.parameters).not.toHaveProperty('instruction');
  });

  it('continue-task 送文本、finish-task 结束输入', () => {
    expect(buildContinueTaskFrame('task1', '你好')).toEqual({
      header: { action: 'continue-task', task_id: 'task1', streaming: 'duplex' },
      payload: { input: { text: '你好' } },
    });
    expect(buildFinishTaskFrame('task1')).toEqual({
      header: { action: 'finish-task', task_id: 'task1', streaming: 'duplex' },
      payload: { input: {} },
    });
  });
});

describe('synthesizeSpeech 前置校验', () => {
  it('API Key 或文本为空时直接拒绝（不发起连接）', async () => {
    await expect(synthesizeSpeech('你好', { ...baseOptions, apiKey: '  ' }))
      .rejects.toThrow('未配置 API Key');
    await expect(synthesizeSpeech('   ', baseOptions))
      .rejects.toThrow('文本为空');
  });

  it('运行时能力探测返回布尔值', () => {
    expect(typeof isSpeechWebSocketAvailable()).toBe('boolean');
  });
});
