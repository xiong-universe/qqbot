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

describe('splitReplyText: delimiter', () => {
  it('出现分隔符时，段内剩余换行也当分条边界（模型把 ||| 敲成换行）', () => {
    expect(splitReplyText('第一句\n第二句|||第三句', 'delimiter'))
      .toEqual(['第一句', '第二句', '第三句']);
  });

  it('没有分隔符时原样一条（哪怕有很多换行）', () => {
    expect(splitReplyText('a\nb\nc', 'delimiter')).toEqual(['a\nb\nc']);
  });

  it('代码块内的分隔符与换行都不拆', () => {
    const text = '看这段|||```js\nconst a = 1 ||| 2;\n```\n结束';
    expect(splitReplyText(text, 'delimiter')).toEqual([
      '看这段',
      '```js\nconst a = 1 ||| 2;\n```',
      '结束',
    ]);
  });

  it('真实案例：第一个 ||| 被敲成换行时，仍然分成三条气泡', () => {
    expect(
      splitReplyText(
        '这么爱听我说话啊，小坏蛋\n那我陪你说会儿，不急着做什么|||今天过得怎么样，累不累',
        'delimiter',
      ),
    ).toEqual([
      '这么爱听我说话啊，小坏蛋',
      '那我陪你说会儿，不急着做什么',
      '今天过得怎么样，累不累',
    ]);
  });

  it('连续表格行合并成一条（不会被按行拆散）', () => {
    const text = '看数据|||\n| 列 | 值 |\n| a | 1 |\n| b | 2 |\n|||就这些';
    expect(splitReplyText(text, 'delimiter')).toEqual([
      '看数据',
      '| 列 | 值 |\n| a | 1 |\n| b | 2 |',
      '就这些',
    ]);
  });

  it('分隔符固定为 |||，丢弃首尾空段并裁剪空白', () => {
    expect(splitReplyText('  a  |||  b |||  ', 'delimiter')).toEqual(['a', 'b']);
  });

  it('不是 ||| 的字符串不拆（如 %% 视为正文）', () => {
    expect(splitReplyText('a %% b', 'delimiter')).toEqual(['a %% b']);
  });

  it('CRLF 归一化后再拆', () => {
    expect(splitReplyText('a\r\nb|||c', 'delimiter')).toEqual(['a', 'b', 'c']);
  });
});
