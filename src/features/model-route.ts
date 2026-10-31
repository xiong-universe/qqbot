/**
 * 会话模型路由 — 插件内工具（qqbot_solve / qqbot_translate 等）共用的解析逻辑。
 *
 * 优先级：会话当前路由（含 per-peer `/model` 覆盖）> 配置默认 provider/model。
 * 都取不到时返回 undefined，由调用方报错。
 */
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ImQQBotConfig } from '../config.ts';
import type { DshAgent, SessionManager } from '../session/index.ts';

/** tools 服务最小接口 */
export interface ToolsRegistryLike {
  register(definition: unknown): unknown;
}

/** llm 服务最小接口 */
export interface LlmRuntimeLike {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}

/** SessionManager 中路由解析需要的部分（type-only：避免 features → session 的运行时循环依赖） */
export type SessionModelLookup = Pick<SessionManager, 'findByAgent' | 'getEffectiveModel'>;

/** 本次调用实际使用的模型路由 */
export interface ModelRoute {
  provider: string;
  model: string;
}

/**
 * 解析本次工具调用使用的模型路由。
 *
 * @param manager - 会话管理器（提供 agent → 会话 + 生效模型）
 * @param config  - 插件配置（会话未指定时的默认路由）
 * @param agent   - 发起工具调用的 agent（可能是 undefined，如直接单测/无会话）
 */
export function resolveSessionRoute(
  manager: SessionModelLookup,
  config: ImQQBotConfig,
  agent: unknown,
): ModelRoute | undefined {
  if (agent !== undefined) {
    const record = manager.findByAgent(agent as DshAgent);
    if (record !== undefined) {
      const route = manager.getEffectiveModel(record.scope, record.peerId);
      if (route?.provider && route.model) return { provider: route.provider, model: route.model };
    }
  }
  if (config.provider && config.model) {
    return { provider: config.provider, model: config.model };
  }
  return undefined;
}
