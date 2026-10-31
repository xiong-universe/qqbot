/**
 * 记忆 → system prompt / 命令展示
 *
 * - 自动捕获：从用户自述里抽取「我叫… / 我喜欢… / 我住在…」这类事实，
 *   零额外 LLM 调用；只做轻量启发式，宁可少记也不乱记。
 * - 注入：order 87（人格之后），只给模型「记得什么」与关系阶段，
 *   要求自然提起、不复述清单、不编造。
 */
import type { MemoryConfig } from '../config.ts';
import type { PromptSection } from '../personas/persona-utils.ts';
import type { ChatMemory } from './memory-store.ts';

/** 记忆 section 的 order（人格 85 之后） */
export const MEMORY_SECTION_ORDER = 87;

/** 关系阶段：由累计互动次数推导（只影响亲近程度，不改变身份） */
export function relationshipStage(messageCount: number): string {
  if (messageCount < 5) return '初识';
  if (messageCount < 20) return '眼熟';
  if (messageCount < 60) return '熟悉';
  if (messageCount < 200) return '亲近';
  return '很亲近';
}

/**
 * 从一段用户消息里抽取可长期记住的自述。
 *
 * 规则：
 * - 按句切分，疑问句不记录（"我叫什么来着？" 不是事实）
 * - 只匹配明确的自述句式，不猜、不做语义推断
 * - 结果做去重与长度裁剪
 */
export function extractMemoryFacts(text: string): string[] {
  if (!text) return [];

  // 保留句末标点：疑问句判定依赖「？」（split 会把它吃掉）
  const sentences = (text.match(/[^。！？!?\n]+[。！？!?]?/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 80);

  const facts: string[] = [];
  for (const sentence of sentences) {
    if (isQuestion(sentence)) continue;
    if (mentionsSomeoneElse(sentence)) continue;
    for (const pattern of CAPTURE_PATTERNS) {
      const match = sentence.match(pattern);
      if (match === null) continue;
      const fact = normalizeFact(match[0]);
      if (fact !== '' && !facts.includes(fact)) facts.push(fact);
    }
  }
  return facts;
}

/** 自述句式（保守匹配：只收录主语明确的个人事实） */
const CAPTURE_PATTERNS: readonly RegExp[] = [
  /我叫(?:做)?[^，。！？!?\s]{1,20}/,
  /我的名字(?:叫|是)[^，。！？!?\s]{1,20}/,
  /我(?:很|超|特别|最)?喜欢[^，。！？!?]{1,25}/,
  /我(?:讨厌|不喜欢|害怕|最怕)[^，。！？!?]{1,25}/,
  /我的生日(?:是|在)?[^，。！？!?]{1,20}/,
  /我(?:住在|来自|家在)[^，。！？!?]{1,20}/,
  /我在[^，。！？!?]{2,20}(?:上学|上班|工作|读书)/,
  /我养了?[^，。！？!?]{1,20}/,
];

function isQuestion(sentence: string): boolean {
  if (/[?？]/.test(sentence)) return true;
  // 无问号的「…吗 / …呢 / …么」也算疑问（宁可不记，也不把提问当事实）
  return /(?:吗|呢|么)$/.test(sentence.replace(/\s+/g, ''));
}

/** 转述别人的信息不记成本人事实（避免张冠李戴） */
function mentionsSomeoneElse(sentence: string): boolean {
  return /(?:他说|她说|有人说|别人说|听说)/.test(sentence);
}

function normalizeFact(fact: string): string {
  return fact
    .replace(/\s+/g, ' ')
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '')
    .trim()
    .slice(0, 60);
}

/**
 * 构建记忆注入 section。
 *
 * 新会话、无历史记忆时返回 undefined，不给模型额外噪声；
 * 关闭 memory.enabled 后完全不注入。
 */
export function buildMemoryPromptSection(
  memory: ChatMemory | undefined,
  config: MemoryConfig | undefined,
  now = Date.now(),
): PromptSection | undefined {
  if (memory === undefined || !config?.enabled) return undefined;
  // 互动很少且没有要点时，不足以形成「记忆」
  if (memory.notes.length === 0 && memory.messageCount < 5) return undefined;

  const days = Math.max(1, Math.ceil((now - memory.firstSeenAt) / 86_400_000));
  const lines: string[] = ['【关于当前对话的记忆】'];
  lines.push(
    `- 认识约 ${days} 天，互动 ${memory.messageCount} 次，关系阶段：${relationshipStage(memory.messageCount)}（只影响亲近程度，不改变身份设定）。`,
  );
  if (memory.notes.length > 0) {
    lines.push('- 你记得这些事（只在相关话题时自然提起，不要复述清单，也不要编造未记录的内容）：');
    for (const note of memory.notes) {
      lines.push(`  - ${note.text}`);
    }
  }
  return { name: 'qqbot:memory', order: MEMORY_SECTION_ORDER, text: lines.join('\n') };
}
