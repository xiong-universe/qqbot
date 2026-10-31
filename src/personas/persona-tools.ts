/**
 * 人格工具绑定 — 把工具白名单转成 dsh tools 服务的运行时硬约束。
 *
 * dsh-tools 的 `restrict({ allow })` 只能通过 **agent 作用域**调用：
 * 它过滤的是全局层与**祖先层**（含 agent preset 挂载的工具）；只有该作用域
 * 自身注册的工具不受影响，因此宿主 preset 的文件/命令工具同样会被挡掉。
 *
 * 语义：
 * - 人格未配置 `tools` → 由调用方传入默认放行清单（插件内置工具 + 只读联网/提问）
 * - 配置了 `tools` → 与默认放行清单求交后只保留白名单中的工具；空数组 = 全部禁用
 * - 白名单里未注册的工具名会被忽略（日志告警），避免 restrict 整体失败
 */
import type { Logger } from '../types.ts';

/** 工具服务最小接口（只取限制与视图能力） */
export interface ToolsRestrictServiceLike {
  restrict(filter: { allow?: readonly string[]; deny?: readonly string[] }): () => void;
  view?(scope?: unknown): {
    visible?: ReadonlyMap<string, unknown>;
    knownNames?: ReadonlySet<string>;
    restrictableNames?: ReadonlySet<string>;
  } | undefined;
}

/** agent.ctx 最小接口（只取服务解析） */
export interface ScopedContextLike {
  get(name: string): unknown;
}

/** 白名单与当前已注册工具的求交结果 */
export interface ToolBinding {
  /** 实际交给 restrict 的工具名（已去重、去空、去未知） */
  allowed: string[];
  /** 配置了但当前未注册的工具名（仅告警，不参与限制） */
  unknown: string[];
}

/** 保留的 PTC 传输名：restrict 不允许点名，展示列表时也应排除 */
export const RESERVED_TOOL_NAME = 'run_code';

/**
 * 把人格配置的工具白名单收敛到「当前可限制的工具集合」。
 *
 * @param requested - 人格里写的工具名（可能含空格/重复/错误拼写）
 * @param restrictable - 当前可限制的工具名集合；undefined = 跳过未知校验
 */
export function resolveToolBinding(
  requested: readonly string[],
  restrictable?: ReadonlySet<string>,
): ToolBinding {
  const allowed: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const raw of requested) {
    const name = raw.trim();
    if (name === '' || name === RESERVED_TOOL_NAME) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    if (restrictable !== undefined && !restrictable.has(name)) {
      unknown.push(name);
      continue;
    }
    allowed.push(name);
  }
  return { allowed, unknown };
}

/**
 * 读取某个作用域可限制的工具名（`/tools` 展示与白名单校验用）。
 *
 * 必须传入 agent：`view(agent)` 的 knownNames 同时包含宿主全局层与
 * **祖先层**（agent preset 挂载的工具）。省略 agent 时只能拿到全局层，
 * 在 web/桌面端（工具全部移到 preset 里）会误报成"只有两三个工具"。
 *
 * 服务或视图不可用时返回空集合。
 */
export function listToolNames(tools: ToolsRestrictServiceLike | undefined, agent?: unknown): string[] {
  if (tools?.view === undefined) return [];
  try {
    const view = tools.view(agent);
    const names = view?.knownNames ?? new Set(view?.visible?.keys() ?? []);
    return [...names].filter((name) => name !== RESERVED_TOOL_NAME).sort();
  } catch {
    return [];
  }
}

/**
 * 对指定 agent 应用人格工具白名单（硬约束）。
 *
 * @returns 限制的释放函数；工具服务不可用或限制失败时返回 undefined。
 */
export function applyPersonaToolBinding(
  ctx: ScopedContextLike,
  agent: unknown,
  requested: readonly string[],
  personaId: string,
  logger: Logger,
): (() => void) | undefined {
  let tools: ToolsRestrictServiceLike | undefined;
  try {
    tools = ctx.get('tools') as ToolsRestrictServiceLike | undefined;
  } catch {
    tools = undefined;
  }
  if (tools === undefined || typeof tools.restrict !== 'function') {
    logger.warn(`im-qqbot: tools 服务不可用，人格 ${personaId} 的工具限制未生效`);
    return undefined;
  }

  let restrictable: ReadonlySet<string> | undefined;
  try {
    const view = tools.view?.(agent);
    restrictable = view?.restrictableNames ?? view?.knownNames;
  } catch {
    restrictable = undefined;
  }

  const { allowed, unknown } = resolveToolBinding(requested, restrictable);
  if (unknown.length > 0) {
    logger.warn(`im-qqbot: 人格 ${personaId} 配置了未注册的工具（已忽略）: ${unknown.join(', ')}`);
  }

  try {
    return tools.restrict({ allow: allowed });
  } catch (err) {
    // 旧版 tools 服务或工具在校验后被卸载：宁可不给工具，也不放宽权限
    logger.warn(
      `im-qqbot: 人格 ${personaId} 工具限制失败（按无工具处理）: ${err instanceof Error ? err.message : String(err)}`,
    );
    try {
      return tools.restrict({ allow: [] });
    } catch {
      return undefined;
    }
  }
}
