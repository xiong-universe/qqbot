import { describe, it, expect } from 'vitest';
import {
  buildKaomojiPrompt,
  clampKaomojiPerReply,
  DEFAULT_KAOMOJI_STYLE,
  findKaomojiStyle,
  KAOMOJI_STYLES,
  MAX_KAOMOJI_CUSTOM,
  MAX_KAOMOJI_ITEM_CHARS,
  MAX_KAOMOJI_PER_REPLY,
  MAX_KAOMOJI_PROMPT_ITEMS,
  MIN_KAOMOJI_PER_REPLY,
  resolveKaomoji,
  sanitizeKaomojiCustom,
  styleItems,
} from './kaomoji.ts';
import type { PersonaPreset } from '../config.ts';

/** 构造只关心 expressions 的人格 */
function makePersona(expressions?: PersonaPreset['expressions']): PersonaPreset {
  return {
    id: 'p1',
    name: '测试',
    prompt: '',
    ...(expressions !== undefined ? { expressions } : {}),
  };
}

describe('KAOMOJI_STYLES', () => {
  it('风格 id 唯一且都有名称/描述/分组', () => {
    const ids = KAOMOJI_STYLES.map((style) => style.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const style of KAOMOJI_STYLES) {
      expect(style.name.trim()).not.toBe('');
      expect(style.description.trim()).not.toBe('');
      expect(style.groups.length).toBeGreaterThan(0);
    }
  });

  it('每套风格都有颜文字，且小组内不重复', () => {
    for (const style of KAOMOJI_STYLES) {
      const items = styleItems(style);
      expect(items.length).toBeGreaterThan(0);
      for (const group of style.groups) {
        const texts = group.items.map((item) => item.trim());
        expect(new Set(texts).size).toBe(texts.length);
        for (const text of texts) {
          expect(text).not.toBe('');
          expect(text.length).toBeLessThanOrEqual(MAX_KAOMOJI_ITEM_CHARS);
          // 多消息分隔符 / 反引号会把 QQ 文本或 Markdown 搞坏
          expect(text).not.toContain('|||');
          expect(text).not.toContain('`');
        }
      }
    }
  });

  it('包含缺省风格 daily', () => {
    expect(findKaomojiStyle(DEFAULT_KAOMOJI_STYLE)).toBeDefined();
  });
});

describe('findKaomojiStyle', () => {
  it('去空白命中，未知返回 undefined', () => {
    expect(findKaomojiStyle(' genki ')?.id).toBe('genki');
    expect(findKaomojiStyle('nope')).toBeUndefined();
    expect(findKaomojiStyle(undefined)).toBeUndefined();
    expect(findKaomojiStyle('')).toBeUndefined();
  });
});

describe('styleItems', () => {
  it('展开所有分组并去重', () => {
    const style = findKaomojiStyle('genki');
    expect(style).toBeDefined();
    const items = styleItems(style!);
    expect(items).toContain('(๑•̀ㅂ•́)و✧');
    expect(new Set(items).size).toBe(items.length);
  });
});

describe('sanitizeKaomojiCustom', () => {
  it('去空白、截断、去重、限量', () => {
    expect(sanitizeKaomojiCustom(['  (｡･ω･｡)  ', '', '(｡･ω･｡)', 'x'.repeat(40)])).toEqual([
      '(｡･ω･｡)',
      'x'.repeat(MAX_KAOMOJI_ITEM_CHARS),
    ]);
  });

  it('undefined / 非字符串项安全忽略', () => {
    expect(sanitizeKaomojiCustom(undefined)).toEqual([]);
    const list = makeCustom(MAX_KAOMOJI_CUSTOM + 5);
    expect(sanitizeKaomojiCustom(list)).toHaveLength(MAX_KAOMOJI_CUSTOM);
  });
});

/** 生成 n 条互不相同的自定义颜文字 */
function makeCustom(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `(k${i})`);
}

describe('clampKaomojiPerReply', () => {
  it('缺省 1，夹到 1–3，四舍五入', () => {
    expect(clampKaomojiPerReply(undefined)).toBe(1);
    expect(clampKaomojiPerReply(0)).toBe(MIN_KAOMOJI_PER_REPLY);
    expect(clampKaomojiPerReply(9)).toBe(MAX_KAOMOJI_PER_REPLY);
    expect(clampKaomojiPerReply(2.4)).toBe(2);
    expect(clampKaomojiPerReply(Number.NaN)).toBe(1);
  });
});

describe('resolveKaomoji', () => {
  it('未配置 expressions 时不启用', () => {
    expect(resolveKaomoji(makePersona())).toBeUndefined();
    expect(resolveKaomoji(undefined)).toBeUndefined();
  });

  it('必须显式 enabled:true 才启用（Schema 会物化默认子对象）', () => {
    expect(resolveKaomoji(makePersona({ kaomoji: {} }))).toBeUndefined();
    expect(resolveKaomoji(makePersona({ kaomoji: { enabled: false, style: 'genki' } }))).toBeUndefined();
    expect(resolveKaomoji(makePersona({ kaomoji: { enabled: true } }))?.style.id)
      .toBe(DEFAULT_KAOMOJI_STYLE);
  });

  it('未写 style 时回落 daily', () => {
    const resolved = resolveKaomoji(makePersona({ kaomoji: { enabled: true } }));
    expect(resolved?.style.id).toBe(DEFAULT_KAOMOJI_STYLE);
    expect(resolved?.maxPerReply).toBe(1);
  });

  it('未知 style 回落 daily', () => {
    expect(resolveKaomoji(makePersona({ kaomoji: { enabled: true, style: 'nope' } }))?.style.id)
      .toBe(DEFAULT_KAOMOJI_STYLE);
  });

  it('自定义颜文字追加在预设之后', () => {
    const resolved = resolveKaomoji(makePersona({
      kaomoji: { enabled: true, style: 'chuuni', custom: ['  (￣ω￣)  '] },
    }));
    expect(resolved?.custom).toEqual(['(￣ω￣)']);
    expect(resolved?.items.at(-1)).toBe('(￣ω￣)');
  });

  it('maxPerReply 夹值', () => {
    expect(resolveKaomoji(makePersona({ kaomoji: { enabled: true, maxPerReply: 5 } }))?.maxPerReply)
      .toBe(MAX_KAOMOJI_PER_REPLY);
  });
});

describe('buildKaomojiPrompt', () => {
  it('未启用时返回 undefined', () => {
    expect(buildKaomojiPrompt(makePersona())).toBeUndefined();
  });

  it('包含风格名、频率上限与实际颜文字', () => {
    const prompt = buildKaomojiPrompt(makePersona({ kaomoji: { enabled: true, style: 'genki' } }));
    expect(prompt).toBeDefined();
    expect(prompt).toContain('【颜文字使用】');
    expect(prompt).toContain('风格：元气');
    expect(prompt).toContain('最多 1 个');
    expect(prompt).toContain('(๑•̀ㅂ•́)و✧');
  });

  it('自定义颜文字单独列出', () => {
    const prompt = buildKaomojiPrompt(makePersona({
      kaomoji: { enabled: true, custom: ['(✿◕‿◕)'] },
    }));
    expect(prompt).toContain('自定义：(✿◕‿◕)');
  });

  it('预设颜文字展示数量有上限', () => {
    const prompt = buildKaomojiPrompt(makePersona({ kaomoji: { enabled: true, style: 'daily' } })) ?? '';
    const presetLines = prompt.split('\n').filter((line) => line.startsWith('  - '));
    const presetItems = presetLines
      .filter((line) => !line.startsWith('  - 自定义：'))
      .flatMap((line) => line.slice(line.indexOf('：') + 1).split('、'));
    expect(presetItems.length).toBeLessThanOrEqual(MAX_KAOMOJI_PROMPT_ITEMS);
  });

  it('尊重 maxPerReply', () => {
    const prompt = buildKaomojiPrompt(makePersona({ kaomoji: { enabled: true, maxPerReply: 3 } }));
    expect(prompt).toContain('最多 3 个');
  });
});
