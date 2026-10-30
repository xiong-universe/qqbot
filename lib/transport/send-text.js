import { chunkMarkdownText } from "./chunker.js";
import { splitReplyText } from "./splitter.js";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * 发送文本：先按 splitMode 拆成消息段，再对每段做长度切分，顺序发送。
 * 单条失败只记录日志，不阻断后续消息。
 */
export async function sendTextParts(bot, target, text, options, logger, tag) {
    const splitMode = options.splitMode ?? 'none';
    const intervalMs = Math.max(0, options.intervalMs ?? 0);
    const parts = splitReplyText(text, splitMode);
    let sent = 0;
    for (const part of parts) {
        for (const chunk of chunkMarkdownText(part, options.limit)) {
            if (sent > 0 && intervalMs > 0)
                await sleep(intervalMs);
            try {
                await bot.sendMarkdown(target, chunk);
            }
            catch (err) {
                logger.error(`im-qqbot: ${tag} failed: ${err instanceof Error ? err.message : String(err)}`);
            }
            sent++;
        }
    }
}
//# sourceMappingURL=send-text.js.map