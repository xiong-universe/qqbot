import { describe, it, expect, vi } from 'vitest';
import {
  applyPersonaToolBinding,
  listToolNames,
  resolveToolBinding,
  RESERVED_TOOL_NAME,
  type ToolsRestrictServiceLike,
} from './persona-tools.ts';
import type { Logger } from '../types.ts';

function makeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

/** 构造只记录 restrict 调用的假 tools 服务 */
function makeTools(options: {
  restrictable?: string[];
  restrict?: (filter: { allow?: readonly string[] }) => () => void;
} = {}): ToolsRestrictServiceLike & { calls: Array<unknown> } {
  const calls: unknown[] = [];
  const names = options.restrictable;
  return {
    calls,
    restrict(filter) {
      calls.push(filter);
      if (options.restrict !== undefined) return options.restrict(filter);
      return () => {};
    },
    view() {
      return names === undefined ? undefined : { restrictableNames: new Set(names) };
    },
  };
}

/** 构造只解析 tools 的假 agent 作用域 ctx */
function makeCtx(tools: unknown): { get(name: string): unknown } {
  return {
    get(name: string) {
      if (name === 'tools') return tools;
      throw new Error(`unknown service: ${name}`);
    },
  };
}

describe('resolveToolBinding', () => {
  it('去空白/去重/去空串', () => {
    expect(resolveToolBinding([' qqbot_send_file ', '', 'qqbot_send_file', '  '])).toEqual({
      allowed: ['qqbot_send_file'],
      unknown: [],
    });
  });

  it('排除保留名 run_code', () => {
    expect(resolveToolBinding([RESERVED_TOOL_NAME, 'read'])).toEqual({
      allowed: ['read'],
      unknown: [],
    });
  });

  it('未注册的工具进入 unknown，不参与 allow', () => {
    const result = resolveToolBinding(['read', 'not_registered'], new Set(['read', 'bash']));
    expect(result).toEqual({ allowed: ['read'], unknown: ['not_registered'] });
  });

  it('没有可限制集合时不做未知校验', () => {
    expect(resolveToolBinding(['read', 'not_registered'], undefined)).toEqual({
      allowed: ['read', 'not_registered'],
      unknown: [],
    });
  });

  it('空数组表示禁用全部工具', () => {
    expect(resolveToolBinding([], new Set(['read']))).toEqual({ allowed: [], unknown: [] });
  });

  it('全部未注册时 allow 为空（fail-closed）', () => {
    expect(resolveToolBinding(['a', 'b'], new Set(['c']))).toEqual({ allowed: [], unknown: ['a', 'b'] });
  });
});

describe('listToolNames', () => {
  it('优先取 knownNames，排除 run_code 并排序', () => {
    const tools: ToolsRestrictServiceLike = {
      restrict: () => () => {},
      view: () => ({ knownNames: new Set(['write', RESERVED_TOOL_NAME, 'read']) }),
    };
    expect(listToolNames(tools)).toEqual(['read', 'write']);
  });

  it('没有 knownNames 时回落到 visible', () => {
    const tools: ToolsRestrictServiceLike = {
      restrict: () => () => {},
      view: () => ({ visible: new Map([['b', {}], ['a', {}]]) }),
    };
    expect(listToolNames(tools)).toEqual(['a', 'b']);
  });

  it('把 agent 作用域透传给 view（preset 挂载的工具只在带作用域时才可见）', () => {
    const agent = { id: 'agent-1' };
    const seen: Array<unknown> = [];
    const tools: ToolsRestrictServiceLike = {
      restrict: () => () => {},
      view: (scope?: unknown) => {
        seen.push(scope);
        return scope === undefined
          ? { knownNames: new Set(['working_directory']) }
          : { knownNames: new Set(['working_directory', 'read', 'pwsh']) };
      },
    };
    expect(listToolNames(tools, agent)).toEqual(['pwsh', 'read', 'working_directory']);
    expect(seen).toEqual([agent]);
  });

  it('服务/视图不可用时返回空数组', () => {
    expect(listToolNames(undefined)).toEqual([]);
    expect(listToolNames({ restrict: () => () => {} })).toEqual([]);
    const broken: ToolsRestrictServiceLike = {
      restrict: () => () => {},
      view: () => {
        throw new Error('boom');
      },
    };
    expect(listToolNames(broken)).toEqual([]);
  });
});

describe('applyPersonaToolBinding', () => {
  it('按白名单限制并返回释放函数', () => {
    const dispose = vi.fn();
    const tools = makeTools({ restrictable: ['read', 'write'], restrict: () => dispose });
    const logger = makeLogger();
    const release = applyPersonaToolBinding(makeCtx(tools), {}, ['read', 'nope'], 'p1', logger);

    expect(release).toBe(dispose);
    expect(tools.calls).toEqual([{ allow: ['read'] }]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('nope'));
  });

  it('空白名单按无工具处理', () => {
    const tools = makeTools({ restrictable: ['read'] });
    const logger = makeLogger();
    applyPersonaToolBinding(makeCtx(tools), {}, [], 'p1', logger);
    expect(tools.calls).toEqual([{ allow: [] }]);
  });

  it('tools 服务不可用时告警且不限制', () => {
    const logger = makeLogger();
    const release = applyPersonaToolBinding(makeCtx(undefined), {}, ['read'], 'p1', logger);
    expect(release).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('tools 服务不可用'));
  });

  it('ctx.get 抛错时视为服务不可用', () => {
    const logger = makeLogger();
    const ctx = {
      get() {
        throw new Error('no service');
      },
    };
    expect(applyPersonaToolBinding(ctx, {}, ['read'], 'p1', logger)).toBeUndefined();
  });

  it('restrict 抛错时回退为禁用全部工具', () => {
    let calls = 0;
    const dispose = vi.fn();
    const tools = makeTools({
      restrictable: ['read'],
      restrict: () => {
        calls += 1;
        if (calls === 1) throw new Error('unknown tool');
        return dispose;
      },
    });
    const logger = makeLogger();
    const release = applyPersonaToolBinding(makeCtx(tools), {}, ['read'], 'p1', logger);

    expect(release).toBe(dispose);
    expect(tools.calls).toEqual([{ allow: ['read'] }, { allow: [] }]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('工具限制失败'));
  });

  it('回退也失败时返回 undefined', () => {
    const tools = makeTools({
      restrictable: ['read'],
      restrict: () => {
        throw new Error('always');
      },
    });
    const logger = makeLogger();
    expect(applyPersonaToolBinding(makeCtx(tools), {}, ['read'], 'p1', logger)).toBeUndefined();
  });
});
