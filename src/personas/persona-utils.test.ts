import { describe, it, expect } from 'vitest';
import {
  buildPersonaPromptSections,
  findPersona,
  PERSONA_OFF,
  resolvePersonaId,
} from './persona-utils.ts';
import type { PersonaPreset } from '../config.ts';

const personas: PersonaPreset[] = [
  { id: 'p1', name: '猫娘', prompt: '你是一只猫娘。' },
  { id: 'p2', name: '助手', prompt: '你是严谨的助手。' },
];

describe('findPersona', () => {
  it('按 id 命中', () => {
    expect(findPersona(personas, 'p2')?.name).toBe('助手');
  });

  it('空 id / 不存在 / 列表缺失返回 undefined', () => {
    expect(findPersona(personas, '')).toBeUndefined();
    expect(findPersona(personas, 'nope')).toBeUndefined();
    expect(findPersona(undefined, 'p1')).toBeUndefined();
  });
});

describe('resolvePersonaId', () => {
  it('per-chat 覆盖优先', () => {
    expect(resolvePersonaId(personas, 'p1', 'p2')).toBe('p2');
  });

  it('无覆盖时用默认人格', () => {
    expect(resolvePersonaId(personas, 'p1', undefined)).toBe('p1');
  });

  it('覆盖项失效（人格已删除）时回落到默认', () => {
    expect(resolvePersonaId(personas, 'p1', 'deleted')).toBe('p1');
  });

  it('都未配置/都已删除时返回 undefined', () => {
    expect(resolvePersonaId(personas, undefined, undefined)).toBeUndefined();
    expect(resolvePersonaId(personas, 'deleted', 'deleted2')).toBeUndefined();
    expect(resolvePersonaId([], 'p1', 'p2')).toBeUndefined();
  });

  it('off 哨兵显式关闭人格，即便配置了默认人格', () => {
    expect(resolvePersonaId(personas, 'p1', PERSONA_OFF)).toBeUndefined();
  });
});

describe('buildPersonaPromptSections', () => {
  it('全局提示词 + 人格叠加，顺序 80/85', () => {
    const sections = buildPersonaPromptSections(personas[0], '多条消息用 ||| 分隔');
    expect(sections).toEqual([
      { name: 'qqbot:global-prompt', order: 80, text: '多条消息用 ||| 分隔' },
      { name: 'qqbot:persona', order: 85, text: '你是一只猫娘。' },
    ]);
  });

  it('未启用人格时只保留全局提示词', () => {
    const sections = buildPersonaPromptSections(undefined, '全局规则');
    expect(sections).toEqual([{ name: 'qqbot:global-prompt', order: 80, text: '全局规则' }]);
  });

  it('未配置全局提示词时只保留人格', () => {
    const sections = buildPersonaPromptSections(personas[1], '');
    expect(sections).toEqual([{ name: 'qqbot:persona', order: 85, text: '你是严谨的助手。' }]);
  });

  it('空白 prompt 不产生 section', () => {
    expect(buildPersonaPromptSections({ id: 'x', name: 'x', prompt: '  ' }, '  ')).toEqual([]);
  });
});
