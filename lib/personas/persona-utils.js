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
 * 人格 prompt（order=85）先于旧版群聊/私聊额外 prompt（order=90），
 * 两者可叠加：人格定义「是谁」，scope prompt 补充「在此场景下的约束」。
 */
export function buildPersonaPromptSections(persona, scope, groupPrompt, directPrompt) {
    const sections = [];
    const personaText = persona?.prompt.trim();
    if (personaText) {
        sections.push({ name: 'qqbot:persona', order: 85, text: personaText });
    }
    const scopeText = (scope === 'group' ? groupPrompt : directPrompt)?.trim();
    if (scopeText) {
        sections.push({ name: 'qqbot:scope-prompt', order: 90, text: scopeText });
    }
    return sections;
}
//# sourceMappingURL=persona-utils.js.map