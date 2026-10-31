/**
 * 回复拆分器 — 把 assistant 文本拆成多条 QQ 消息。
 *
 * 推荐模式是 delimiter：模型只在约定分隔符处拆条。模型偶尔会把某个分隔符
 * 敲成换行（例如 `第一句\n第二句|||第三句`），所以**只要出现过分隔符**，
 * 段内的单个换行也按分条边界处理；完全没出现分隔符时换行保留在同一条，
 * 避免把一次多行回复炸成很多条。无论哪种模式，代码块与表格都保持完整。
 */

export type ReplySplitMode = 'none' | 'line' | 'paragraph' | 'delimiter';

/** 多消息固定分隔符（不可配置：全局提示词里也约定这个值） */
export const SPLIT_DELIMITER = '|||';

const FENCE = /^```/;
const TABLE_ROW = /^\|/;
/** 完整或未闭合的围栏代码块：内部的分隔符不参与拆条 */
const FENCE_BLOCK = /```[\s\S]*?(?:```|$)/g;
/** 代码块占位符（用 NUL 包裹序号，正常文本不会出现） */
const MASK = /\u0000(\d+)\u0000/g;

/** 去掉首尾空行，保留行内缩进 */
function trimBlankEdges(lines: string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]!.trim() === '') start++;
  while (end > start && lines[end - 1]!.trim() === '') end--;
  return lines.slice(start, end).join('\n');
}

/** 按行拆分：普通行各成一条；代码块/表格整体一条 */
function splitLines(text: string): string[] {
  const parts: string[] = [];
  let current: string[] = [];
  let inCode = false;
  let inTable = false;

  const flush = (): void => {
    const part = trimBlankEdges(current);
    if (part !== '') parts.push(part);
    current = [];
  };

  for (const raw of text.split('\n')) {
    const line = raw.replace(/[ \t]+$/, '');
    const trimmed = line.trim();

    if (inCode) {
      current.push(line);
      if (FENCE.test(trimmed)) {
        inCode = false;
        flush();
      }
      continue;
    }

    if (FENCE.test(trimmed)) {
      flush();
      inCode = true;
      inTable = false;
      current.push(line);
      continue;
    }

    if (TABLE_ROW.test(trimmed)) {
      if (!inTable) {
        flush();
        inTable = true;
      }
      current.push(line);
      continue;
    }

    if (inTable) {
      flush();
      inTable = false;
    }

    if (trimmed === '') {
      flush();
      continue;
    }

    current.push(line);
    flush();
  }

  flush();
  return parts;
}

/** 按空行拆分：段落整体一条；代码块内的空行不拆 */
function splitParagraphs(text: string): string[] {
  const parts: string[] = [];
  let current: string[] = [];
  let inCode = false;

  const flush = (): void => {
    const part = trimBlankEdges(current);
    if (part !== '') parts.push(part);
    current = [];
  };

  for (const raw of text.split('\n')) {
    const line = raw.replace(/[ \t]+$/, '');
    const trimmed = line.trim();

    if (FENCE.test(trimmed)) {
      inCode = !inCode;
      current.push(line);
      continue;
    }

    if (!inCode && trimmed === '') {
      flush();
      continue;
    }

    current.push(line);
  }

  flush();
  return parts;
}

/**
 * 把「已按分隔符拆好的段」再按换行拆一层。
 *
 * 只在整条回复出现过 `|||` 时调用：模型本意是分条，某个分隔符敲成换行时，
 * 如果留着换行，用户会看到气泡里夹着断行。连续的表格行（以 `|` 开头）合并回
 * 一条，避免把表格拆成几十条消息；代码块已用占位符遮蔽，不受影响。
 */
function splitStrayNewlines(parts: readonly string[]): string[] {
  const out: string[] = [];
  let table: string[] = [];
  const flushTable = (): void => {
    if (table.length > 0) {
      out.push(table.join('\n'));
      table = [];
    }
  };
  for (const part of parts) {
    for (const line of part.split('\n')) {
      if (TABLE_ROW.test(line.trim())) {
        table.push(line);
        continue;
      }
      flushTable();
      out.push(line);
    }
    flushTable();
  }
  return out;
}

/**
 * 按固定分隔符 `|||` 拆分。
 *
 * - 只有出现分隔符才拆；一条回复可拆成多段。
 * - 出现过分隔符时，段内剩余换行也当分条边界（模型把 `|||` 敲成换行的情况）。
 * - 围栏代码块内的分隔符与换行都不拆；连续表格行合并成一条。
 * - 段首尾空白会被裁掉；空段丢弃。
 */
function splitByDelimiter(text: string): string[] {
  const blocks: string[] = [];
  const masked = text.replace(FENCE_BLOCK, (block) => {
    blocks.push(block);
    return `\u0000${blocks.length - 1}\u0000`;
  });

  const parts = masked.split(SPLIT_DELIMITER);
  const segments = parts.length > 1 ? splitStrayNewlines(parts) : parts;

  return segments
    .map((part) => part.replace(MASK, (_, index: string) => blocks[Number(index)] ?? ''))
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * 拆分回复文本。
 *
 * @param mode none=原样一条；delimiter=按固定分隔符 |||（推荐）；
 *             line=每个换行一条；paragraph=按空行分段
 */
export function splitReplyText(text: string, mode: ReplySplitMode = 'none'): string[] {
  if (text.trim() === '') return [];
  if (mode === 'none') return [text];

  const normalized = text.replace(/\r\n?/g, '\n');
  if (mode === 'delimiter') return splitByDelimiter(normalized);
  return mode === 'line' ? splitLines(normalized) : splitParagraphs(normalized);
}
