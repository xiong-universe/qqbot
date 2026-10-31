/**
 * 辅助 LLM 调用的文本收集（qqbot_describe_image / qqbot_solve 共用）。
 *
 * 插件的「一次性辅助调用」都不走 agent loop，而是直接 `llm.stream` 后把
 * 流式块拼成纯文本；这里统一收口终止原因判断与空结果报错。
 */
import { BlockAssembler } from '@deepseek-ai/dsh-llm';
import type { ContentBlock, FinishReason, StreamChunk } from '@deepseek-ai/dsh-llm';

/** 把终止原因转成失败（error / aborted），正常结束返回 undefined */
export function finishFailure(finish: FinishReason): Error | undefined {
  switch (finish.kind) {
    case 'error':
    case 'aborted':
      return new Error(finish.failure.message);
    default:
      return undefined;
  }
}

/**
 * 消费一次流式响应，返回拼接后的纯文本。
 *
 * @param stream - `llm.stream` 返回的异步块流
 * @param label - 报错前缀（工具名），让错误能指回调用方
 */
export async function collectStreamText(
  stream: AsyncIterable<StreamChunk>,
  label: string,
): Promise<string> {
  const assembler = new BlockAssembler();
  for await (const chunk of stream) assembler.push(chunk);

  const failure = finishFailure(assembler.finish);
  if (failure !== undefined) throw failure;

  const text = assembler.blocks()
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join(' ')
    .trim();
  if (text.length === 0) throw new Error(`${label}: model returned no text`);
  return text;
}
