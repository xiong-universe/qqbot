/**
 * 实用小工具（翻译 / 总结 / 讲解 / 改写）单测
 *
 * 覆盖：prompt 组装、注册声明、模型路由回落与参数校验。
 */
import { describe, it, expect, vi } from 'vitest';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import {
  TEXT_TOOL_MAX_INPUT_CHARS,
  TEXT_TOOL_MAX_TOKENS,
  TEXT_TOOL_NAMES,
  TRANSLATE_TOOL_NAME,
  SUMMARIZE_TOOL_NAME,
  EXPLAIN_TOOL_NAME,
  REWRITE_TOOL_NAME,
  buildExplainPrompt,
  buildRewritePrompt,
  buildSummarizePrompt,
  buildTranslatePrompt,
  registerTextTools,
} from './text-tools.ts';
import type { ImQQBotConfig } from '../config.ts';
import type { SessionModelLookup } from './model-route.ts';
import type { Logger } from '../types.ts';

function makeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

/** 构造只解析指定服务的假 ctx（未命中的服务返回 undefined，不抛错） */
function makeCtx(services: { tools?: unknown; llm?: unknown }): { get(name: string): unknown } {
  return { get: (name: string) => services[name as keyof typeof services] };
}

/** 构造记录注册定义的假 tools 服务 */
function makeTools(): { register(definition: unknown): void } & { definitions: Array<Record<string, unknown>> } {
  const definitions: Array<Record<string, unknown>> = [];
  return {
    definitions,
    register(definition: unknown) {
      definitions.push(definition as Record<string, unknown>);
    },
  };
}

/** 构造只吐出一段文本的假 llm 服务，并记录调用参数 */
function makeLlm(text = '处理结果'): {
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
  lookup: SessionModelLookup;
  agent: unknown;
} {
  const agent = { id: 'agent-1' };
  const lookup = {
    findByAgent: (candidate: unknown) => (candidate === agent
      ? { scope: 'c2c' as const, peerId: 'peer-1' }
      : undefined),
    getEffectiveModel: () => route,
  } as unknown as SessionModelLookup;
  return { lookup, agent };
}

describe('buildTranslatePrompt', () => {
  it('给出目标语言与源语言', () => {
    expect(buildTranslatePrompt('hello', '简体中文', '英语'))
      .toBe('目标语言：简体中文\n源语言：英语\n\n【原文】\nhello');
  });

  it('缺省目标语言为简体中文、源语言自动判断', () => {
    expect(buildTranslatePrompt('hello'))
      .toBe('目标语言：简体中文\n源语言：自动判断\n\n【原文】\nhello');
  });

  it('空白目标语言回落到默认值', () => {
    expect(buildTranslatePrompt(' text ', '  '))
      .toBe('目标语言：简体中文\n源语言：自动判断\n\n【原文】\ntext');
  });
});

describe('buildSummarizePrompt', () => {
  it('缺省最多 6 条要点', () => {
    expect(buildSummarizePrompt('长文'))
      .toBe('要点条数：最多 6 条\n\n【原文】\n长文');
  });

  it('条数被夹到 1–10', () => {
    expect(buildSummarizePrompt('长文', 0)).toContain('最多 1 条');
    expect(buildSummarizePrompt('长文', 99)).toContain('最多 10 条');
    expect(buildSummarizePrompt('长文', 3.8)).toContain('最多 3 条');
  });
});

describe('buildExplainPrompt', () => {
  it('给出听众与重点', () => {
    expect(buildExplainPrompt('useEffect', '小白', '依赖数组'))
      .toBe('讲解对象：小白\n重点：依赖数组\n\n【内容】\nuseEffect');
  });

  it('缺省听众为「有一点基础的人」，无重点时不出现重点行', () => {
    const prompt = buildExplainPrompt('报错 TypeError');
    expect(prompt).toBe('讲解对象：有一点基础的人\n\n【内容】\n报错 TypeError');
    expect(prompt).not.toContain('重点');
  });
});

describe('buildRewritePrompt', () => {
  it('给出语气与篇幅', () => {
    expect(buildRewritePrompt('原文', '正式', '不超过 50 字'))
      .toBe('语气：正式\n篇幅：不超过 50 字\n\n【原文】\n原文');
  });

  it('缺省为自然口语、篇幅与原文相当', () => {
    expect(buildRewritePrompt('原文'))
      .toBe('语气：自然口语\n篇幅：与原文相当\n\n【原文】\n原文');
  });
});

describe('registerTextTools', () => {
  it('注册四个工具，每个都要求 text 参数', () => {
    const tools = makeTools();
    const logger = makeLogger();
    registerTextTools(makeCtx({ tools, llm: makeLlm() }) as never, makeManager().lookup, makeConfig(), logger);

    expect(tools.definitions).toHaveLength(4);
    expect(tools.definitions.map((definition) => definition.name)).toEqual([
      TRANSLATE_TOOL_NAME,
      SUMMARIZE_TOOL_NAME,
      EXPLAIN_TOOL_NAME,
      REWRITE_TOOL_NAME,
    ]);
    for (const definition of tools.definitions) {
      const params = definition.parameters as { required?: string[] };
      expect(params.required).toEqual(['text']);
    }
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('实用小工具已注册'));
  });

  it('tools 服务缺失时告警且不注册', () => {
    const logger = makeLogger();
    registerTextTools(makeCtx({ llm: makeLlm() }) as never, makeManager().lookup, makeConfig(), logger);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('未注册'));
  });

  it('llm 服务缺失时告警且不注册', () => {
    const logger = makeLogger();
    registerTextTools(makeCtx({ tools: makeTools() }) as never, makeManager().lookup, makeConfig(), logger);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('未注册'));
  });
});

describe('实用小工具 execute', () => {
  /** 注册后取出指定工具的 execute 便于直接调用 */
  function makeTool(name: string, options: {
    config?: ImQQBotConfig;
    route?: { provider: string; model: string };
    text?: string;
  } = {}) {
    const tools = makeTools();
    const llm = makeLlm(options.text);
    const { lookup, agent } = makeManager(options.route);
    registerTextTools(
      makeCtx({ tools, llm }) as never,
      lookup,
      options.config ?? makeConfig(),
      makeLogger(),
    );
    const definition = tools.definitions.find((item) => item.name === name) as {
      execute(args: unknown, exec: unknown): Promise<Record<string, unknown>>;
    };
    return { execute: definition.execute, llm, agent };
  }

  const signal = new AbortController().signal;

  it('text 为空或缺失时报错', async () => {
    const { execute, agent } = makeTool(TRANSLATE_TOOL_NAME);
    await expect(execute({}, { signal, agent })).rejects.toThrow(/需要 text/);
    await expect(execute({ text: '   ' }, { signal, agent })).rejects.toThrow(/需要 text/);
  });

  it('输入超长时报错而不是截断', async () => {
    const { execute, agent } = makeTool(SUMMARIZE_TOOL_NAME);
    await expect(execute({ text: 'x'.repeat(TEXT_TOOL_MAX_INPUT_CHARS + 1) }, { signal, agent }))
      .rejects.toThrow(/输入过长/);
  });

  it('优先使用会话当前模型，并带上对应的 system prompt', async () => {
    const route = { provider: 'trae', model: 'session-model' };
    const { execute, llm, agent } = makeTool(TRANSLATE_TOOL_NAME, { route });
    const result = await execute({ text: 'hello', to: '简体中文' }, { signal, agent });

    expect(result).toEqual({ text: '处理结果', provider: 'trae', model: 'session-model' });
    const call = llm.calls[0];
    expect(call.provider).toBe('trae');
    expect(call.model).toBe('session-model');
    expect(call.maxTokens).toBe(TEXT_TOOL_MAX_TOKENS);
    expect(call.system).toContain('专业翻译');
    const message = call.messages[0] as { content: Array<{ type: string; text?: string }> };
    expect(message.content.at(-1)).toEqual({
      type: 'text',
      text: '目标语言：简体中文\n源语言：自动判断\n\n【原文】\nhello',
    });
  });

  it('没有会话记录时回落到 config 的 provider/model', async () => {
    const { execute, llm } = makeTool(EXPLAIN_TOOL_NAME);
    const result = await execute({ text: '闭包是什么' }, { signal });
    expect(result.provider).toBe('trae');
    expect(result.model).toBe('deepseek-v4.1-flash');
    expect(llm.calls[0].provider).toBe('trae');
    expect(llm.calls[0].model).toBe('deepseek-v4.1-flash');
  });

  it('既无会话路由又无 config 默认时报错', async () => {
    const { execute, agent } = makeTool(REWRITE_TOOL_NAME, {
      config: makeConfig({ provider: undefined, model: undefined }),
    });
    await expect(execute({ text: '原文' }, { signal, agent })).rejects.toThrow(/无法确定使用的模型/);
  });

  it('TEXT_TOOL_NAMES 与注册顺序一致', () => {
    expect(TEXT_TOOL_NAMES).toEqual([
      TRANSLATE_TOOL_NAME,
      SUMMARIZE_TOOL_NAME,
      EXPLAIN_TOOL_NAME,
      REWRITE_TOOL_NAME,
    ]);
  });
});
