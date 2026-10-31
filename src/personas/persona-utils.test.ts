import { describe, it, expect } from 'vitest';
import {
  buildPersonaPromptSections,
  findPersona,
  PERSONA_OFF,
  PERSONA_TOOLS_ORDER,
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

  it('配置了工具白名单时追加 order 86 权限说明', () => {
    const persona: PersonaPreset = {
      id: 'p3',
      name: '助手',
      prompt: '你是助手。',
      tools: ['qqbot_send_file', 'qqbot_send_file', ' qqbot_describe_image '],
    };
    const sections = buildPersonaPromptSections(persona, '全局规则');
    expect(sections).toEqual([
      { name: 'qqbot:global-prompt', order: 80, text: '全局规则' },
      { name: 'qqbot:persona', order: 85, text: '你是助手。' },
      {
        name: 'qqbot:persona-tools',
        order: PERSONA_TOOLS_ORDER,
        text: '本会话仅绑定了这些工具：qqbot_send_file、qqbot_describe_image。'
          + '其余工具不可用；超出范围的请求请直接说明做不到，不要假装执行。',
      },
    ]);
  });

  it('空工具数组成「没有工具」的说明', () => {
    const sections = buildPersonaPromptSections(
      { id: 'p4', name: '纯聊天', prompt: '你只聊天。', tools: [] },
      '',
    );
    expect(sections).toEqual([
      { name: 'qqbot:persona', order: 85, text: '你只聊天。' },
      {
        name: 'qqbot:persona-tools',
        order: PERSONA_TOOLS_ORDER,
        text: '本会话没有绑定任何工具：你无法读写文件、发送图片/文件、运行命令或联网。'
          + '遇到这类请求时直接说明做不到，不要声称已经完成。',
      },
    ]);
  });

  it('未配置 tools（undefined）不产生权限说明', () => {
    const sections = buildPersonaPromptSections({ id: 'p5', name: 'x', prompt: '你好。' }, '');
    expect(sections.map((s) => s.name)).toEqual(['qqbot:persona']);
  });
});
