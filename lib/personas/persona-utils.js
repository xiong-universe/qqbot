/** per-chat 「关闭人格」哨兵值（不会与任何预设 id 相同） */
export const PERSONA_OFF = '__off__';
/** 按 id 查找人格（id 为空或不存在返回 undefined） */
export function findPersona(personas, id) {
    if (!id)
        return undefined;
    return personas?.find((p) => p.id === id);
}
/**
 * 解析当前生效的人格 id。
 *
 * 优先级：per-chat 覆盖 > 默认人格 > 未启用。
 * 覆盖项为 PERSONA_OFF 时显式关闭；覆盖项或默认项指向已删除的人格时
 * 视为未启用，避免残留 id 持续生效。
 */
export function resolvePersonaId(personas, defaultId, overrideId) {
    if (overrideId === PERSONA_OFF)
        return undefined;
    const override = findPersona(personas, overrideId);
    if (override)
        return override.id;
    const fallback = findPersona(personas, defaultId);
    if (fallback)
        return fallback.id;
    return undefined;
}
/**
 * 构造需要追加到 system prompt 的 section。
 *
 * 全局提示词（order=80）对所有会话生效，人格 prompt（order=85）在其后：
 * 全局部分写多条消息拆分规则等通用约束，人格只描述「是谁」。
 */
export function buildPersonaPromptSections(persona, globalPrompt) {
    const sections = [];
    const globalText = globalPrompt?.trim();
    if (globalText) {
        sections.push({ name: 'qqbot:global-prompt', order: 80, text: globalText });
    }
    const personaText = persona?.prompt.trim();
    if (personaText) {
        sections.push({ name: 'qqbot:persona', order: 85, text: personaText });
    }
    return sections;
}
//# sourceMappingURL=persona-utils.js.map