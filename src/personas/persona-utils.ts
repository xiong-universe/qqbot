/**
 * 人格预设解析工具
 *
 * 与 QQ 会话状态解耦的纯函数，便于单测：
 * - per-chat 覆盖优先，其次 config.defaultPersona
 * - 生成 system-prompt/assemble 需要的 section（全局提示词 + 人格本体）
 */
import type { PersonaPreset } from '../config.ts';

/** system-prompt section 最小结构 */
export interface PromptSection {
  name: string;
  order: number;
  text: string;
}

/** per-chat 「关闭人格」哨兵值（不会与任何预设 id 相同） */
export const PERSONA_OFF = '__off__';

/** 按 id 查找人格（id 为空或不存在返回 undefined） */
export function findPersona(
  personas: readonly PersonaPreset[] | undefined,
  id: string | undefined,
): PersonaPreset | undefined {
  if (!id) return undefined;
  return personas?.find((p) => p.id === id);
}

/**
 * 解析当前生效的人格 id。
 *
 * 优先级：per-chat 覆盖 > 默认人格 > 未启用。
 * 覆盖项为 PERSONA_OFF 时显式关闭；覆盖项或默认项指向已删除的人格时
 * 视为未启用，避免残留 id 持续生效。
 */
export function resolvePersonaId(
  personas: readonly PersonaPreset[] | undefined,
  defaultId: string | undefined,
  overrideId: string | undefined,
): string | undefined {
  if (overrideId === PERSONA_OFF) return undefined;
  const override = findPersona(personas, overrideId);
  if (override) return override.id;
  const fallback = findPersona(personas, defaultId);
  if (fallback) return fallback.id;
  return undefined;
}

/** 人格 prompt 之后、记忆之前的工具权限说明（order 86） */
export const PERSONA_TOOLS_ORDER = 86;

/**
 * 构造需要追加到 system prompt 的 section。
 *
 * 全局提示词（order=80）对所有会话生效，人格 prompt（order=85）在其后：
 * 全局部分写多条消息拆分规则等通用约束，人格只描述「是谁」。
 * 人格配置了工具白名单时追加一段权限说明（order=86），提醒模型不要在
 * 没有对应工具时假装完成文件/图片/联网等操作。
 */
export function buildPersonaPromptSections(
  persona: PersonaPreset | undefined,
  globalPrompt?: string,
): PromptSection[] {
  const sections: PromptSection[] = [];
  const globalText = globalPrompt?.trim();
  if (globalText) {
    sections.push({ name: 'qqbot:global-prompt', order: 80, text: globalText });
  }
  const personaText = persona?.prompt.trim();
  if (personaText) {
    sections.push({ name: 'qqbot:persona', order: 85, text: personaText });
  }
  if (persona?.tools !== undefined) {
    const tools = [...new Set(persona.tools.map((t) => t.trim()).filter(Boolean))];
    sections.push({
      name: 'qqbot:persona-tools',
      order: PERSONA_TOOLS_ORDER,
      text: tools.length === 0
        ? '本会话没有绑定任何工具：你无法读写文件、发送图片/文件、运行命令或联网。'
          + '遇到这类请求时直接说明做不到，不要声称已经完成。'
        : `本会话仅绑定了这些工具：${tools.join('、')}。`
          + '其余工具不可用；超出范围的请求请直接说明做不到，不要假装执行。',
    });
  }
  return sections;
}
