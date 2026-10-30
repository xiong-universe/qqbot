/**
 * 回复拆分器 — 把 assistant 文本按换行/空行拆成多条 QQ 消息。
 *
 * 与 chunker 的区别：chunker 只在超过单条长度上限时切分；splitter 主动
 * 把多行内容拆成独立消息，避免 QQ 把一整段挤成一条长消息。
 *
 * 边界处理：代码块保持完整（不按行拆散）；GFM 表格连续行保持完整。
 */
const FENCE = /^```/;
const TABLE_ROW = /^\|/;
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
 * 拆分回复文本。
 *
 * @param mode none=原样一条；line=每个换行一条；paragraph=按空行分段
 */
export function splitReplyText(text, mode = 'none') {
    if (text.trim() === '')
        return [];
    if (mode === 'none')
        return [text];
    const normalized = text.replace(/\r\n?/g, '\n');
    return mode === 'line' ? splitLines(normalized) : splitParagraphs(normalized);
}
//# sourceMappingURL=splitter.js.map