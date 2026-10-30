/**
 * 文本发送 — 拆分 + 长度切分 + 顺序发送的统一入口。
 *
 * 正常回复、流式降级、工具结果都走这里，保证「换行拆分」行为一致。
 */
import type { Logger, ReplyTarget } from '../types.ts';
import type { QQBotSender } from './outbound-buffer.ts';
import { chunkMarkdownText } from './chunker.ts';
import { splitReplyText, type ReplySplitMode } from './splitter.ts';

export interface SendTextOptions {
  /** 单条消息字符上限 */
  limit: number;
  /** 多消息拆分方式 */
  splitMode?: ReplySplitMode;
  /** delimiter 模式使用的分隔符（默认 |||） */
  splitDelimiter?: string;
  /** 拆分后相邻消息之间的间隔(ms)，0=不等候 */
  intervalMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 发送文本：先按 splitMode 拆成消息段，再对每段做长度切分，顺序发送。
 * 单条失败只记录日志，不阻断后续消息。
 */
export async function sendTextParts(
  bot: QQBotSender,
  target: ReplyTarget,
  text: string,
  options: SendTextOptions,
  logger: Logger,
  tag: string,
): Promise<void> {
  const splitMode = options.splitMode ?? 'none';
  const intervalMs = Math.max(0, options.intervalMs ?? 0);
  const parts = splitReplyText(text, splitMode, options.splitDelimiter);
  let sent = 0;

  for (const part of parts) {
    for (const chunk of chunkMarkdownText(part, options.limit)) {
      if (sent > 0 && intervalMs > 0) await sleep(intervalMs);
      try {
        await bot.sendMarkdown(target, chunk);
      } catch (err) {
        logger.error(`im-qqbot: ${tag} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      sent++;
    }
  }
}
