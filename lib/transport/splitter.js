/**
 * 回复拆分器 — 把 assistant 文本拆成多条 QQ 消息。
 *
 * 推荐模式是 delimiter：模型只在约定分隔符处拆条，普通换行仍留在同一条
 * 消息内，避免「每行都发一条」把一次回复炸成很多条。
 *
 * 兼容保留 line / paragraph 模式；无论哪种模式，代码块都保持完整。
 */
/** 多消息固定分隔符（不可配置：全局提示词里也约定这个值） */
export const SPLIT_DELIMITER = '|||';
const FENCE = /^```/;
const TABLE_ROW = /^\|/;
/** 完整或未闭合的围栏代码块：内部的分隔符不参与拆条 */
const FENCE_BLOCK = /```[\s\S]*?(?:```|$)/g;
/** 代码块占位符（用 NUL 包裹序号，正常文本不会出现） */
const MASK = /\u0000(\d+)\u0000/g;
/** 去掉首尾空行，保留行内缩进 */
function trimBlankEdges(lines) {
    let start = 0;
    let end = lines.length;
    while (start < end && lines[start].trim() === '')
        start++;
    while (end > start && lines[end - 1].trim() === '')
        end--;
    return lines.slice(start, end).join('\n');
}
/** 按行拆分：普通行各成一条；代码块/表格整体一条 */
function splitLines(text) {
    const parts = [];
    let current = [];
    let inCode = false;
    let inTable = false;
    const flush = () => {
        const part = trimBlankEdges(current);
        if (part !== '')
            parts.push(part);
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
function splitParagraphs(text) {
    const parts = [];
    let current = [];
    let inCode = false;
    const flush = () => {
        const part = trimBlankEdges(current);
        if (part !== '')
            parts.push(part);
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
 * 按固定分隔符 `|||` 拆分。
 *
 * - 只有出现分隔符才拆；一条回复可拆成多段，段内换行原样保留。
 * - 围栏代码块内的分隔符不拆（避免代码里的 `|||` 误伤）。
 * - 段首尾空白会被裁掉；空段丢弃。
 */
function splitByDelimiter(text) {
    const blocks = [];
    const masked = text.replace(FENCE_BLOCK, (block) => {
        blocks.push(block);
        return `\u0000${blocks.length - 1}\u0000`;
    });
    return masked
        .split(SPLIT_DELIMITER)
        .map((part) => part.replace(MASK, (_, index) => blocks[Number(index)] ?? ''))
        .map((part) => part.trim())
        .filter((part) => part !== '');
}
/**
 * 拆分回复文本。
 *
 * @param mode none=原样一条；delimiter=按固定分隔符 |||（推荐）；
 *             line=每个换行一条；paragraph=按空行分段
 */
export function splitReplyText(text, mode = 'none') {
    if (text.trim() === '')
        return [];
    if (mode === 'none')
        return [text];
    const normalized = text.replace(/\r\n?/g, '\n');
    if (mode === 'delimiter')
        return splitByDelimiter(normalized);
    return mode === 'line' ? splitLines(normalized) : splitParagraphs(normalized);
}
//# sourceMappingURL=splitter.js.map