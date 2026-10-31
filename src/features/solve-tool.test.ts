import { describe, it, expect, vi } from 'vitest';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import {
  buildSolvePrompt,
  registerSolveTool,
  SOLVE_MAX_PROBLEM_CHARS,
  SOLVE_SYSTEM_PROMPT,
  SOLVE_TOOL_NAME,
  type SolveSessionLookup,
} from './solve-tool.ts';
import type { ImQQBotConfig } from '../config.ts';
import type { Logger } from '../types.ts';

function makeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

interface Collected {
  definitions: Array<Record<string, unknown>>;
}

/** 构造只解析指定服务的假 ctx（未命中的服务返回 undefined，不抛错） */
function makeCtx(services: { tools?: unknown; llm?: unknown; attachments?: unknown }): { get(name: string): unknown } {
  return { get: (name: string) => services[name as keyof typeof services] };
}

/** 构造记录注册定义的假 tools 服务 */
function makeTools(): { register(definition: unknown): void } & Collected {
  const definitions: Array<Record<string, unknown>> = [];
  return {
    definitions,
    register(definition: unknown) {
      definitions.push(definition as Record<string, unknown>);
    },
  };
}

/** 构造只吐出一段文本的假 llm 服务，并记录调用参数 */
function makeLlm(text = '【答案】4\n\n【过程】1. …'): {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
  calls: GenerateOptions[];
} {
  const calls: GenerateOptions[] = [];
  return {
    calls,
    async *stream(options: GenerateOptions) {
      calls.push(options);
      yield { type: 'block-start', index: 0, blockType: 'text' } as unknown as StreamChunk;
      yield { type: 'text-delta', index: 0, text } as unknown as StreamChunk;
      yield { type: 'block-end', index: 0, block: { type: 'text', text } } as unknown as StreamChunk;
      yield { type: 'finish', reason: { kind: 'stop' } } as unknown as StreamChunk;
    },
  };
}

function makeConfig(overrides: Partial<ImQQBotConfig> = {}): ImQQBotConfig {
  return {
    appId: 'app',
    appSecret: 'secret',
    provider: 'trae',
    model: 'deepseek-v4.1-flash',
    requireMention: true,
    globalPrompt: '',
    personas: [],
    defaultPersona: '',
    ...overrides,
  } as ImQQBotConfig;
}

/** 构造只提供 findByAgent/getEffectiveModel 的假 manager */
function makeManager(route?: { provider: string; model: string }): {
  lookup: SolveSessionLookup;
  agent: unknown;
} {
  const agent = { id: 'agent-1' };
  const lookup = {
    findByAgent: (candidate: unknown) => (candidate === agent
      ? { scope: 'c2c' as const, peerId: 'peer-1' }
      : undefined),
    getEffectiveModel: () => route,
  } as unknown as SolveSessionLookup;
  return { lookup, agent };
}

describe('buildSolvePrompt', () => {
  it('只给题干时不带科目/学段', () => {
    expect(buildSolvePrompt('求 1+1')).toBe('【题目】\n求 1+1');
  });

  it('科目与学段放在题目之前', () => {
    expect(buildSolvePrompt('求 1+1', '高中数学', '高三'))
      .toBe('科目：高中数学\n学段：高三\n\n【题目】\n求 1+1');
  });

  it('空白科目/学段视为未提供', () => {
    expect(buildSolvePrompt('求 1+1', '  ', '\n')).toBe('【题目】\n求 1+1');
  });

  it('只给图片时提示先读图', () => {
    expect(buildSolvePrompt('', undefined, undefined, true))
      .toBe('【题目】题目内容全部在附图中，请先读图再作答。');
  });

  it('图文同时给时追加合并理解提示', () => {
    const prompt = buildSolvePrompt('求阴影面积', undefined, undefined, true);
    expect(prompt).toContain('【题目】\n求阴影面积');
    expect(prompt).toContain('附图是本题的一部分');
  });
});

describe('registerSolveTool', () => {
  it('tools/llm 可用时注册工具，并声明题干与图片参数', () => {
    const tools = makeTools();
    const logger = makeLogger();
    registerSolveTool(makeCtx({ tools, llm: makeLlm() }) as never, makeManager().lookup, makeConfig(), logger);

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(SOLVE_TOOL_NAME));
    expect(tools.definitions).toHaveLength(1);
    const definition = tools.definitions[0];
    expect(definition.name).toBe(SOLVE_TOOL_NAME);
    const params = definition.parameters as { properties: Record<string, unknown>; required?: string[] };
    expect(Object.keys(params.properties)).toEqual(['problem', 'image', 'subject', 'level']);
    // 两个入口都不强制必填：只给图或只给题都能用，校验放在 execute 里
    expect(params.required).toBeUndefined();
  });

  it('tools 服务缺失时告警且不注册', () => {
    const logger = makeLogger();
    registerSolveTool(makeCtx({ llm: makeLlm() }) as never, makeManager().lookup, makeConfig(), logger);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('qqbot_solve 工具未注册'));
  });

  it('llm 服务缺失时告警且不注册', () => {
    const logger = makeLogger();
    registerSolveTool(makeCtx({ tools: makeTools() }) as never, makeManager().lookup, makeConfig(), logger);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('qqbot_solve 工具未注册'));
  });
});

describe('qqbot_solve execute', () => {
  /** 注册后取出 execute 便于直接调用 */
  function makeTool(options: { config?: ImQQBotConfig; route?: { provider: string; model: string }; text?: string; attachments?: unknown } = {}) {
    const tools = makeTools();
    const llm = makeLlm(options.text);
    const { lookup, agent } = makeManager(options.route);
    registerSolveTool(
      makeCtx({ tools, llm, attachments: options.attachments }) as never,
      lookup,
      options.config ?? makeConfig(),
      makeLogger(),
    );
    const definition = tools.definitions[0] as { execute(args: unknown, exec: unknown): Promise<Record<string, unknown>> };
    return { execute: definition.execute, llm, agent };
  }

  const signal = new AbortController().signal;

  it('题干为空且无图片时报错', async () => {
    const { execute, agent } = makeTool();
    await expect(execute({}, { signal, agent })).rejects.toThrow(/至少一个/);
    await expect(execute({ problem: '   ', image: ' ' }, { signal, agent })).rejects.toThrow(/至少一个/);
  });

  it('题干超长时报错而不是截断', async () => {
    const { execute, agent } = makeTool();
    const problem = 'x'.repeat(SOLVE_MAX_PROBLEM_CHARS + 1);
    await expect(execute({ problem }, { signal, agent })).rejects.toThrow(/题干过长/);
  });

  it('优先使用会话当前模型路由，并带上解题 system prompt', async () => {
    const route = { provider: 'trae', model: 'session-model' };
    const { execute, llm, agent } = makeTool({ route });
    const result = await execute({ problem: '求 1+1', subject: '数学' }, { signal, agent });

    expect(result.text).toBe('【答案】4\n\n【过程】1. …');
    expect(result.provider).toBe('trae');
    expect(result.model).toBe('session-model');
    expect(result.hasImage).toBe(false);

    const call = llm.calls[0];
    expect(call.provider).toBe('trae');
    expect(call.model).toBe('session-model');
    expect(call.system).toBe(SOLVE_SYSTEM_PROMPT);
    expect(call.signal).toBe(signal);
    const message = call.messages[0] as { content: Array<{ type: string; text?: string }> };
    expect(message.content.at(-1)).toEqual({ type: 'text', text: '科目：数学\n\n【题目】\n求 1+1' });
  });

  it('没有会话记录时回落到 config 的 provider/model', async () => {
    const { execute, llm } = makeTool();
    const result = await execute({ problem: '求 1+1' }, { signal });
    expect(result.provider).toBe('trae');
    expect(result.model).toBe('deepseek-v4.1-flash');
    expect(llm.calls[0].provider).toBe('trae');
    expect(llm.calls[0].model).toBe('deepseek-v4.1-flash');
  });

  it('既无会话路由又无 config 默认时报错', async () => {
    const { execute, agent } = makeTool({ config: makeConfig({ provider: undefined, model: undefined }) });
    await expect(execute({ problem: '求 1+1' }, { signal, agent })).rejects.toThrow(/无法确定解题模型/);
  });

  it('图片题需要 attachments 服务', async () => {
    const { execute, agent } = makeTool();
    await expect(execute({ image: 'https://example.com/q.png' }, { signal, agent }))
      .rejects.toThrow(/attachments 服务/);
  });

  it('有 attachments 时把图片放进消息内容', async () => {
    const saveImage = vi.fn(async () => ({ id: 'img-1', mediaType: 'image/png' }));
    const { execute, llm, agent } = makeTool({ attachments: { saveImage } });

    const file = await makeTempPng();
    const result = await execute({ image: file, problem: '求阴影面积' }, { signal, agent });

    expect(saveImage).toHaveBeenCalledTimes(1);
    expect(result.hasImage).toBe(true);
    const message = llm.calls[0].messages[0] as { content: Array<{ type: string; text?: string }> };
    expect(message.content[0]).toMatchObject({ type: 'image', attachment: { id: 'img-1' } });
    expect(message.content.at(-1)).toMatchObject({ type: 'text' });
  });
});

/** 写一张 1x1 PNG 到临时目录，返回路径 */
async function makeTempPng(): Promise<string> {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'qqbot-solve-'));
  const file = join(dir, 'q.png');
  // 最小 PNG：8 字节签名 + IHDR 片段（足够通过 magic bytes 嗅探）
  const bytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
  await writeFile(file, bytes);
  return file;
}
