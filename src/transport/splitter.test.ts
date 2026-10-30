import { describe, it, expect } from 'vitest';
import { splitReplyText } from './splitter.ts';

describe('splitReplyText: none', () => {
  it('原样返回单条（含内部换行）', () => {
    expect(splitReplyText('a\nb\n\nc', 'none')).toEqual(['a\nb\n\nc']);
  });

  it('空白文本返回空数组', () => {
    expect(splitReplyText('   \n\n', 'none')).toEqual([]);
    expect(splitReplyText('', 'line')).toEqual([]);
  });
});

describe('splitReplyText: line', () => {
  it('每个换行拆成一条，忽略空行', () => {
    expect(splitReplyText('第一行\n第二行\n\n第三行', 'line'))
      .toEqual(['第一行', '第二行', '第三行']);
  });

  it('统一 CRLF / CR 换行', () => {
    expect(splitReplyText('a\r\nb\rc', 'line')).toEqual(['a', 'b', 'c']);
  });

  it('代码块整体一条，不按行拆散', () => {
    const text = '看代码：\n```js\nconst a = 1;\nconst b = 2;\n```\n结束';
    expect(splitReplyText(text, 'line')).toEqual([
      '看代码：',
      '```js\nconst a = 1;\nconst b = 2;\n```',
      '结束',
    ]);
  });

  it('GFM 表格连续行整体一条', () => {
    const text = '数据如下\n| a | b |\n| --- | --- |\n| 1 | 2 |\n说明';
    expect(splitReplyText(text, 'line')).toEqual([
      '数据如下',
      '| a | b |\n| --- | --- |\n| 1 | 2 |',
      '说明',
    ]);
  });

  it('未闭合代码块延续到文本末尾', () => {
    expect(splitReplyText('前\n```\n块内', 'line')).toEqual(['前', '```\n块内']);
  });
});

describe('splitReplyText: paragraph', () => {
  it('按空行分段，段内保留换行', () => {
    expect(splitReplyText('甲\n乙\n\n丙\n丁', 'paragraph')).toEqual(['甲\n乙', '丙\n丁']);
  });

  it('代码块内的空行不拆分', () => {
    const text = '说明\n```py\nx = 1\n\ny = 2\n```\n\n结尾';
    expect(splitReplyText(text, 'paragraph')).toEqual([
      '说明\n```py\nx = 1\n\ny = 2\n```',
      '结尾',
    ]);
  });
});
