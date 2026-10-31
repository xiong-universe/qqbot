/**
 * 解析本次工具调用使用的模型路由。
 *
 * @param manager - 会话管理器（提供 agent → 会话 + 生效模型）
 * @param config  - 插件配置（会话未指定时的默认路由）
 * @param agent   - 发起工具调用的 agent（可能是 undefined，如直接单测/无会话）
 */
export function resolveSessionRoute(manager, config, agent) {
    if (agent !== undefined) {
        const record = manager.findByAgent(agent);
        if (record !== undefined) {
            const route = manager.getEffectiveModel(record.scope, record.peerId);
            if (route?.provider && route.model)
                return { provider: route.provider, model: route.model };
        }
    }
    if (config.provider && config.model) {
        return { provider: config.provider, model: config.model };
    }
    return undefined;
}
//# sourceMappingURL=model-route.js.map