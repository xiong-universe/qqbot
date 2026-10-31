/**
 * QQ 机器人配置面板 — 必要配置的 UI 编辑
 *
 * UI 复刻 DSW 通用设置（settings-form 原语）的视觉风格：
 * 配置按「服务 / 身份 / 记忆 / 对话 / 模型 / 人格」六个分区呈现，
 * 一次只渲染一个分区，避免单列过长；每个分区有未保存修改时 tab 显示小圆点。
 * 左对齐设置列、0.5px 行分隔、label 13px/500、控件右置；
 * Switch 为 36×20 aria-checked 结构（thumb translateX 动画）；
 * 三值选择用分段控件（滑动指示器按段数/索引的 CSS 变量定位）；
 * 保存按钮为 DSW 反色主按钮（label-primary 底 + bg-layer-3 字）。
 *
 * 数据流：GET /qqbot/im-qqbot/config 回显当前生效配置（appSecret
 * 已由宿主剔除）→ 表单编辑 → dirty diff → POST 仅提交变更键 →
 * 宿主白名单 + Schema 校验 → 最小写入 profile patch → HMR 重载生效。
 *
 * 字段策略：只开放用户必要的配置；cwd 只读展示；超时与性能调优
 * 类字段走 profile patch / 环境变量。
 */
import { createElement, useCallback, useEffect, useState, type CSSProperties, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { BIND_CONFIG_PATH } from '../shared/bind-protocol.ts';

/** 访问控制配置（与 src/config.ts 的 AccessControlConfig 对应的局部投影） */
interface AccessControlWire {
  c2cMode: 'open' | 'allowlist' | 'disabled';
  c2cAllow: string[];
  groupMode: 'open' | 'allowlist' | 'disabled';
  groupAllow: string[];
}

/** 身份识别配置（与 src/config.ts 的 IdentityConfig 对应的局部投影） */
interface IdentityWire {
  enabled: boolean;
  ownerOpenIds: string[];
  adminOpenIds: string[];
  friendOpenIds: string[];
}

/** 记忆与关系状态配置（与 src/config.ts 的 MemoryConfig 对应的局部投影） */
interface MemoryWire {
  enabled: boolean;
  autoCapture: boolean;
  maxNotes: number;
}

/** 人格预设（与 src/config.ts 的 PersonaPreset 对应的局部投影） */
interface PersonaWire {
  id: string;
  name: string;
  prompt: string;
  /** 工具白名单；undefined = 不限制（继承全部工具） */
  tools?: string[];
}

/** GET 回显的生效配置（appSecret 已剔除） */
type ReplySplitMode = 'none' | 'delimiter' | 'line' | 'paragraph';

type ConfigWire = {
  requireMention?: boolean;
  streaming?: boolean;
  replySplitMode?: ReplySplitMode;
  replySplitIntervalMs?: number;
  showToolResults?: boolean;
  debug?: boolean;
  provider?: string;
  model?: string;
  preset?: string;
  globalPrompt?: string;
  personas?: PersonaWire[];
  defaultPersona?: string;
  identity?: IdentityWire;
  memory?: MemoryWire;
  access?: AccessControlWire;
  cwd?: string;
};

/** 样式注入标记（幂等；版本变化时替换旧样式，避免客户端热更新后仍用旧样式） */
const STYLE_ID = 'im-qqbot-config-panel-styles';
const STYLE_VERSION = '2';

/** DSW 通用设置风格（settings-form / Switch / SegmentedControl 原语复刻） */
function useConfigPanelStyles(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById(STYLE_ID);
    if (existing !== null) {
      if (existing.getAttribute('data-version') === STYLE_VERSION) return;
      existing.remove();
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute('data-version', STYLE_VERSION);
    style.textContent = `
.imqb2-form { display: flex; flex-direction: column; width: 100%; }
.imqb2-group-title {
  padding: 14px 0 2px; font-size: 12px; font-weight: 600; line-height: 18px;
  color: var(--dsw-alias-label-tertiary); text-transform: uppercase; letter-spacing: .04em;
}
.imqb2-field { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; }
.imqb2-field + .imqb2-field { border-top: 0.5px solid var(--dsw-alias-border-l2); }
.imqb2-head { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.imqb2-label {
  flex: 1; min-width: 0; font-size: 13px; font-weight: 500; line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}
.imqb2-help { margin: 0; font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.imqb2-hint { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
/* Switch（aria-checked 驱动，视觉态与无障碍态同源） */
.imqb2-switch {
  box-sizing: border-box; position: relative; flex: 0 0 auto;
  width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px;
  background: var(--dsw-alias-border-l3); cursor: pointer; font: inherit;
}
.imqb2-switch[aria-checked='true'] { background: var(--dsw-alias-brand-primary); }
.imqb2-switch:disabled { cursor: default; opacity: 0.5; }
.imqb2-switch:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.imqb2-switch-thumb {
  display: block; width: 16px; height: 16px; border-radius: 50%;
  background: var(--dsw-alias-switch-thumb, #ffffff);
  transition: transform 120ms ease;
}
.imqb2-switch[aria-checked='true'] .imqb2-switch-thumb {
  background: var(--dsw-alias-label-primary-foreground, #ffffff);
  transform: translateX(16px);
}
/* 输入（官方 fields.input 复刻） */
.imqb2-input {
  box-sizing: border-box; width: 100%; height: 34px; padding: 0 12px;
  border: 0.5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-layer-3); font: inherit; font-size: 13px; line-height: 1.5;
  color: var(--dsw-alias-label-primary); outline: none;
}
.imqb2-input:focus { outline: none; border-color: var(--dsw-alias-state-business-primary); }
.imqb2-input:disabled { color: var(--dsw-alias-label-tertiary); cursor: default; }
.imqb2-textarea { height: auto; min-height: 68px; padding: 8px 12px; resize: vertical; line-height: 1.5; }
/* 分段控件（官方 SegmentedControl 复刻：指示器按段数/索引定位） */
.imqb2-seg {
  position: relative; display: inline-grid; grid-auto-flow: column; grid-auto-columns: 1fr;
  gap: 2px; padding: 4px; border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-interactive-bg-hover);
}
.imqb2-seg-indicator {
  position: absolute; top: 4px; left: 4px;
  width: calc((100% - 8px - 2px * (var(--imqb2-seg-count) - 1)) / var(--imqb2-seg-count));
  height: calc(100% - 8px);
  border: 0; border-radius: var(--dsw-radius-sm, 6px);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-soft, 0 1px 3px rgba(0,0,0,.08));
  transform: translateX(calc(var(--imqb2-seg-index) * (100% + 2px)));
  transition: transform 160ms ease;
  pointer-events: none;
}
.imqb2-seg-tab {
  box-sizing: border-box; position: relative; z-index: 1; height: 28px; padding: 0 16px;
  border: 0; border-radius: var(--dsw-radius-sm, 6px); background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; line-height: 20px;
  font-weight: 500; white-space: nowrap; cursor: pointer; transition: color 120ms ease;
}
.imqb2-seg-tab:hover, .imqb2-seg-tab[aria-selected='true'] { color: var(--dsw-alias-label-primary); }
.imqb2-seg-tab:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}
/* 人格预设卡片（折叠抽屉：默认只显示标题，点击标题展开编辑） */
.imqb2-persona {
  display: flex; flex-direction: column; gap: 8px; padding: 10px 0;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.imqb2-persona-head { display: flex; align-items: center; gap: 8px; }
.imqb2-persona-toggle {
  appearance: none; flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px;
  border: 0; background: transparent; padding: 2px 0; cursor: pointer; font: inherit;
  text-align: left; color: inherit;
}
.imqb2-persona-toggle:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px; border-radius: var(--dsw-radius-sm, 6px);
}
.imqb2-persona-arrow {
  flex: none; font-size: 11px; line-height: 1; color: var(--dsw-alias-label-tertiary);
  transition: transform 120ms ease;
}
.imqb2-persona-arrow[data-expanded='true'] { transform: rotate(90deg); }
.imqb2-persona-title {
  flex: 1; min-width: 0; font-size: 13px; font-weight: 500; line-height: 1.5;
  color: var(--dsw-alias-label-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.imqb2-persona-sub {
  flex: none; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.imqb2-persona-body { display: flex; flex-direction: column; gap: 8px; padding-left: 19px; }
.imqb2-persona-remove {
  appearance: none; border: 0; background: transparent; padding: 2px 6px;
  border-radius: var(--dsw-radius-sm, 6px); cursor: pointer; font: inherit;
  font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary);
}
.imqb2-persona-remove:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.imqb2-persona-add {
  appearance: none; align-self: flex-start; border: 0.5px solid var(--dsw-alias-border-l4);
  background: transparent; border-radius: var(--dsw-radius-md, 8px); padding: 5px 12px;
  font: inherit; font-size: 12px; line-height: 1.5; cursor: pointer;
  color: var(--dsw-alias-label-secondary);
}
.imqb2-persona-add:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
/* 分区 tab 栏（自动换行，选中态为浮起胶囊） */
.imqb2-tabs {
  display: flex; flex-wrap: wrap; gap: 2px; padding: 4px; margin: 2px 0 4px;
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-interactive-bg-hover);
}
.imqb2-tab {
  appearance: none; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 5px;
  height: 28px; padding: 0 10px; border: 0; border-radius: var(--dsw-radius-sm, 6px);
  background: transparent; font: inherit; font-size: 13px; line-height: 20px;
  font-weight: 500; color: var(--dsw-alias-label-secondary); white-space: nowrap; cursor: pointer;
  transition: color 120ms ease, background 120ms ease;
}
.imqb2-tab:hover, .imqb2-tab[aria-selected='true'] { color: var(--dsw-alias-label-primary); }
.imqb2-tab[aria-selected='true'] {
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-soft, 0 1px 3px rgba(0,0,0,.08));
}
.imqb2-tab:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}
.imqb2-tab-dot {
  flex: none; width: 5px; height: 5px; border-radius: 50%;
  background: var(--dsw-alias-state-business-primary);
}
.imqb2-tabpanel { display: flex; flex-direction: column; padding-top: 2px; }
/* 底栏（官方 SettingsForm.footer 复刻） */
.imqb2-footer { display: flex; align-items: center; gap: 8px; padding-top: 16px; }
.imqb2-note { flex: 1; min-width: 0; margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
.imqb2-note--error { color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-error)); }
.imqb2-note--ok { color: var(--dsw-alias-label-secondary); }
.imqb2-save {
  appearance: none; flex: none; border: 1px solid transparent;
  border-radius: var(--dsw-radius-md, 8px); padding: 5px 14px;
  font: inherit; font-size: 13px; line-height: 1.5; cursor: pointer;
  background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-layer-3);
}
.imqb2-save:disabled { opacity: 0.4; cursor: default; }
.imqb2-save:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
/* cwd 只读行 */
.imqb2-readonly { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--dsw-alias-label-secondary); word-break: break-all; margin: 0; }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);
}

/** 开关（官方 Switch 原语结构：aria-checked 驱动视觉态） */
function Switch({ checked, label, onChange }: {
  checked: boolean; label: string; onChange: (next: boolean) => void;
}): ReactNode {
  return createElement('button', {
    type: 'button', role: 'switch', 'aria-checked': checked, 'aria-label': label,
    className: 'imqb2-switch',
    onClick: () => { onChange(!checked); },
  }, createElement('span', { className: 'imqb2-switch-thumb' }));
}

/** 访问模式分段选择（官方 SegmentedControl 结构：CSS 变量定位滑动指示器） */
function Segmented({ value, options, onChange, label }: {
  value: string; options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (next: string) => void; label: string;
}): ReactNode {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const trackStyle = {
    '--imqb2-seg-count': options.length,
    '--imqb2-seg-index': index,
  } as CSSProperties;
  return createElement('div', { className: 'imqb2-seg', role: 'tablist', 'aria-label': label, style: trackStyle },
    createElement('span', { className: 'imqb2-seg-indicator' }),
    options.map((o) => createElement('button', {
      key: o.value, type: 'button', role: 'tab', 'aria-selected': o.value === value,
      className: 'imqb2-seg-tab', onClick: () => { onChange(o.value); },
    }, o.label)),
  );
}

/** 开关行（label 左 + Switch 右 + 可选 help） */
function SwitchRow({ label, help, checked, onChange }: {
  label: string; help?: string; checked: boolean; onChange: (next: boolean) => void;
}): ReactNode {
  return createElement('div', { className: 'imqb2-field' },
    createElement('div', { className: 'imqb2-head' },
      createElement('span', { className: 'imqb2-label' }, label),
      createElement(Switch, { checked, label, onChange }),
    ),
    help === undefined ? null : createElement('p', { className: 'imqb2-help' }, help),
  );
}

/** 文本行（label 上 + 输入下，与官方 fields 布局一致） */
function FieldRow({ label, help, value, placeholder, onChange }: {
  label: string; help?: string; value: string; placeholder?: string; onChange: (next: string) => void;
}): ReactNode {
  return createElement('div', { className: 'imqb2-field' },
    createElement('span', { className: 'imqb2-label' }, label),
    createElement('input', {
      className: 'imqb2-input', value, placeholder, spellCheck: false,
      onChange: (event: ChangeEvent<HTMLInputElement>) => { onChange(event.currentTarget.value); },
    }),
    help === undefined ? null : createElement('p', { className: 'imqb2-hint' }, help),
  );
}

/** 多行文本行 */
function AreaRow({ label, help, value, rows, onChange }: {
  label: string; help?: string; value: string; rows?: number; onChange: (next: string) => void;
}): ReactNode {
  return createElement('div', { className: 'imqb2-field' },
    createElement('span', { className: 'imqb2-label' }, label),
    createElement('textarea', {
      className: 'imqb2-input imqb2-textarea', value, rows: rows ?? 3,
      onChange: (event: ChangeEvent<HTMLTextAreaElement>) => { onChange(event.currentTarget.value); },
    }),
    help === undefined ? null : createElement('p', { className: 'imqb2-hint' }, help),
  );
}

/** 访问模式分段选择行 */
function SegmentedRow({ label, help, value, options, onChange }: {
  label: string; help?: string; value: string;
  options: ReadonlyArray<{ value: string; label: string }>; onChange: (next: string) => void;
}): ReactNode {
  return createElement('div', { className: 'imqb2-field' },
    createElement('div', { className: 'imqb2-head' },
      createElement('span', { className: 'imqb2-label' }, label),
      createElement(Segmented, { value, options, onChange, label }),
    ),
    help === undefined ? null : createElement('p', { className: 'imqb2-hint' }, help),
  );
}

/**
 * 单个人格预设编辑卡片（抽屉式：默认收起，点击标题展开 id / 名称 / prompt）
 *
 * 收起态只占一行，人格多时面板不会被撑得过长。
 */
function PersonaCard({ index, value, expanded, onChange, onToggle, onRemove }: {
  index: number; value: PersonaWire; expanded: boolean;
  onChange: (next: Partial<PersonaWire>) => void; onToggle: () => void; onRemove: () => void;
}): ReactNode {
  const title = value.name.trim() || value.id.trim() || `人格 ${index + 1}`;
  return createElement('div', { className: 'imqb2-persona' },
    createElement('div', { className: 'imqb2-persona-head' },
      createElement('button', {
        type: 'button', className: 'imqb2-persona-toggle',
        'aria-expanded': expanded,
        title: expanded ? '收起' : '展开编辑',
        onClick: onToggle,
      },
        createElement('span', {
          className: 'imqb2-persona-arrow', 'data-expanded': expanded,
        }, '▶'),
        createElement('span', { className: 'imqb2-persona-title' }, title),
        createElement('span', { className: 'imqb2-persona-sub' },
          value.tools === undefined
            ? value.id.trim()
            : `${value.id.trim()} · 工具 ${value.tools.filter((t) => t.trim()).length}`,
        ),
      ),
      createElement('button', {
        type: 'button', className: 'imqb2-persona-remove',
        onClick: onRemove,
      }, '删除'),
    ),
    expanded
      ? createElement('div', { className: 'imqb2-persona-body' },
          createElement('input', {
            className: 'imqb2-input', value: value.id, spellCheck: false,
            placeholder: 'id（字母/数字/-/_，QQ 端 /persona <id> 用）',
            onChange: (event: ChangeEvent<HTMLInputElement>) => { onChange({ id: event.currentTarget.value }); },
          }),
          createElement('input', {
            className: 'imqb2-input', value: value.name, spellCheck: false,
            placeholder: '展示名称（QQ 菜单里显示）',
            onChange: (event: ChangeEvent<HTMLInputElement>) => { onChange({ name: event.currentTarget.value }); },
          }),
          createElement('textarea', {
            className: 'imqb2-input imqb2-textarea', value: value.prompt, rows: 5,
            placeholder: '该人格的 system prompt（只写角色设定/说话风格）',
            onChange: (event: ChangeEvent<HTMLTextAreaElement>) => { onChange({ prompt: event.currentTarget.value }); },
          }),
          createElement('div', { className: 'imqb2-head' },
            createElement('span', { className: 'imqb2-label' }, '限制可用工具'),
            createElement(Switch, {
              checked: value.tools !== undefined,
              label: '限制可用工具',
              onChange: (checked) => { onChange({ tools: checked ? [] : undefined }); },
            }),
          ),
          value.tools === undefined
            ? createElement('p', { className: 'imqb2-hint' },
                '关闭时继承宿主全部工具；开启后模型只能看到下面列出的工具（硬约束，不是提示词）。')
            : createElement('textarea', {
                className: 'imqb2-input imqb2-textarea',
                value: value.tools.join('\n'), rows: 3,
                placeholder: '每行一个工具名，例如:\nqqbot_send_file\nqqbot_describe_image\n\n留空 = 禁用该人格的全部工具',
                onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
                  onChange({ tools: event.currentTarget.value.split('\n') });
                },
              }),
          createElement('p', { className: 'imqb2-hint' },
            '工具名可在 QQ 端用 `/tools` 查看（仅管理员）；未注册的名字会被忽略并在日志中告警。'),
        )
      : null,
  );
}

type AccessMode = AccessControlWire['c2cMode'];

const MODE_OPTIONS: ReadonlyArray<{ value: AccessMode; label: string }> = [
  { value: 'open', label: '所有人' },
  { value: 'allowlist', label: '白名单' },
  { value: 'disabled', label: '禁用' },
];

const SPLIT_OPTIONS: ReadonlyArray<{ value: ReplySplitMode; label: string }> = [
  { value: 'none', label: '按长度' },
  { value: 'delimiter', label: '约定分隔符' },
  { value: 'line', label: '每个换行' },
  { value: 'paragraph', label: '按空行' },
];

/** 配置分区：每页只展示一组相关配置，避免单列过长 */
type TabId = 'access' | 'identity' | 'memory' | 'conversation' | 'model' | 'personas';

interface TabDef {
  id: TabId;
  label: string;
  /** 该分区包含的配置键（用于在 tab 上显示「未保存」小圆点） */
  keys: ReadonlyArray<keyof ConfigWire>;
}

const TABS: ReadonlyArray<TabDef> = [
  { id: 'access', label: '服务范围', keys: ['access'] },
  { id: 'identity', label: '身份与权限', keys: ['identity'] },
  { id: 'memory', label: '记忆与关系', keys: ['memory'] },
  {
    id: 'conversation', label: '对话设置',
    keys: ['requireMention', 'streaming', 'replySplitMode', 'replySplitIntervalMs', 'showToolResults'],
  },
  { id: 'model', label: '模型与提示词', keys: ['provider', 'model', 'preset', 'globalPrompt'] },
  { id: 'personas', label: '人格预设', keys: ['personas', 'defaultPersona'] },
];

/** 深比较（表单值与初始回显值的 dirty 判断） */
function shallowEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 配置面板主体。
 *
 * 保存仅提交变更键（服务端按白名单合并），保存成功后提示
 * HMR 重载语义（进行中的机器人会话将重置）。
 */
export function ConfigPanel(props?: { bindPhase?: string }): ReactNode {
  useConfigPanelStyles();
  const [initial, setInitial] = useState<ConfigWire | null>(null);
  const [form, setForm] = useState<ConfigWire | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 人格抽屉展开状态（按索引记录；默认全部收起）
  const [expandedPersonas, setExpandedPersonas] = useState<Set<number>>(() => new Set());
  // 当前配置分区（默认落在最常用的「服务范围」）
  const [activeTab, setActiveTab] = useState<TabId>('access');
  // 绑定相位变化时重拉配置（扫码落库的白名单等新值）
  const bindPhase = props?.bindPhase;

  useEffect(() => {
    let stopped = false;
    void fetch(BIND_CONFIG_PATH, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { config: ConfigWire };
        if (stopped) return;
        setInitial(body.config);
        setForm(body.config);
      })
      .catch((err: unknown) => {
        if (!stopped) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => { stopped = true; };
  }, [bindPhase]);

  const patch = useCallback(<K extends keyof ConfigWire>(key: K, value: ConfigWire[K]): void => {
    setForm((current) => current === null ? current : { ...current, [key]: value });
    setResult(null);
  }, []);

  const submit = useCallback((event: FormEvent): void => {
    event.preventDefault();
    if (busy || initial === null || form === null) return;
    const changed: Record<string, unknown> = {};
    for (const key of Object.keys(form) as Array<keyof ConfigWire>) {
      if (!shallowEqual(form[key], initial[key])) {
        changed[key] = form[key];
      }
    }
    if (Object.keys(changed).length === 0) return;

    // 白名单编辑期间保留原始换行/空行（textarea 可正常回车），提交时才规范化
    if (changed.access !== undefined) {
      const a = changed.access as AccessControlWire;
      changed.access = {
        ...a,
        c2cAllow: a.c2cAllow.map((s) => s.trim()).filter(Boolean),
        groupAllow: a.groupAllow.map((s) => s.trim()).filter(Boolean),
      };
    }

    // 身份名单：提交时裁剪空白与空行，保留原始大小写
    if (changed.identity !== undefined) {
      const i = changed.identity as IdentityWire;
      const clean = (list: string[]): string[] => list.map((s) => s.trim()).filter(Boolean);
      changed.identity = {
        enabled: i.enabled !== false,
        ownerOpenIds: clean(i.ownerOpenIds),
        adminOpenIds: clean(i.adminOpenIds),
        friendOpenIds: clean(i.friendOpenIds),
      };
    }

    // 人格预设：提交时裁剪 id/名称，prompt 保留原文（换行有意义）
    if (changed.personas !== undefined) {
      changed.personas = (changed.personas as PersonaWire[]).map((p) => ({
        id: p.id.trim(),
        name: p.name.trim(),
        prompt: p.prompt,
        ...(p.tools !== undefined
          ? { tools: [...new Set(p.tools.map((t) => t.trim()).filter(Boolean))] }
          : {}),
      }));
    }
    if (changed.defaultPersona !== undefined) {
      changed.defaultPersona = String(changed.defaultPersona).trim();
    }

    // 记忆配置：maxNotes 收敛到 1–100 的整数
    if (changed.memory !== undefined) {
      const m = changed.memory as MemoryWire;
      const n = Math.round(Number(m.maxNotes));
      changed.memory = {
        enabled: m.enabled !== false,
        autoCapture: m.autoCapture !== false,
        maxNotes: Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 20,
      };
    }

    setBusy(true);
    void fetch(BIND_CONFIG_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(changed),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
        if (res.ok && body.ok === true) {
          setResult({ ok: true, message: body.message ?? '配置已保存，插件将自动重载' });
          setInitial(form);
          return;
        }
        setResult({ ok: false, message: body.error ?? `保存失败（HTTP ${res.status}）` });
      })
      .catch((err: unknown) => {
        setResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => { setBusy(false); });
  }, [busy, form, initial]);

  if (loadError !== null) {
    return createElement('p', { className: 'imqb2-hint', style: { padding: '12px 0' } },
      `配置加载失败：${loadError}`);
  }
  if (initial === null || form === null) {
    return createElement('p', { className: 'imqb2-hint', style: { padding: '12px 0' } }, '正在加载配置…');
  }

  const changedKeys = (Object.keys(form) as Array<keyof ConfigWire>)
    .filter((key) => !shallowEqual(form[key], initial[key]));
  const dirty = changedKeys.length > 0;
  const access: AccessControlWire = form.access ?? { c2cMode: 'allowlist', c2cAllow: [], groupMode: 'open', groupAllow: [] };
  const identity: IdentityWire = form.identity
    ?? { enabled: true, ownerOpenIds: [], adminOpenIds: [], friendOpenIds: [] };
  const memory: MemoryWire = form.memory
    ?? { enabled: true, autoCapture: true, maxNotes: 20 };
  const personas = form.personas ?? [];

  const updatePersona = (index: number, next: Partial<PersonaWire>): void => {
    const list = [...(form.personas ?? [])];
    const current = list[index];
    if (current === undefined) return;
    list[index] = { ...current, ...next };
    patch('personas', list);
    // 改 id 时同步默认人格引用，避免默认人格指向旧 id 而失效
    if (next.id !== undefined && current.id !== '' && form.defaultPersona === current.id) {
      patch('defaultPersona', next.id);
    }
  };

  const togglePersona = (index: number): void => {
    setExpandedPersonas((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const addPersona = (): void => {
    const list = form.personas ?? [];
    const used = new Set(list.map((p) => p.id));
    let n = list.length + 1;
    while (used.has(`persona-${n}`)) n += 1;
    patch('personas', [...list, { id: `persona-${n}`, name: `人格 ${n}`, prompt: '' }]);
    // 新增后自动展开，方便直接编辑
    setExpandedPersonas((current) => new Set(current).add(list.length));
  };

  const removePersona = (index: number): void => {
    const list = (form.personas ?? []).filter((_, i) => i !== index);
    const removedId = form.personas?.[index]?.id;
    patch('personas', list);
    // 删除后索引整体前移，展开状态需要同步重映射
    setExpandedPersonas((current) => {
      const next = new Set<number>();
      for (const i of current) {
        if (i === index) continue;
        next.add(i > index ? i - 1 : i);
      }
      return next;
    });
    // 默认人格指向被删除条目时一并清空，避免留下失效 id
    if (removedId !== undefined && removedId !== '' && form.defaultPersona === removedId) {
      patch('defaultPersona', '');
    }
  };

  const tabDirty = (tab: TabDef): boolean => tab.keys.some((key) => changedKeys.includes(key));

  // 各分区内容：只渲染当前 tab，表单值始终保存在 form 中，切换不会丢失编辑
  const accessPanel: ReactNode[] = [
    createElement(SegmentedRow, {
      label: '私聊', value: access.c2cMode, options: MODE_OPTIONS,
      onChange: (v) => { patch('access', { ...access, c2cMode: v as AccessMode }); },
    }),
    access.c2cMode === 'allowlist'
      ? createElement(AreaRow, {
          label: '私聊白名单', help: '请输入用户 openid，多个请换行输入', rows: 3,
          value: access.c2cAllow.join('\n'),
          onChange: (v) => { patch('access', { ...access, c2cAllow: v.split('\n').map((s) => s.trim()) }); },
        })
      : null,
    createElement(SegmentedRow, {
      label: '群聊', value: access.groupMode, options: MODE_OPTIONS,
      onChange: (v) => { patch('access', { ...access, groupMode: v as AccessMode }); },
    }),
    access.groupMode === 'allowlist'
      ? createElement(AreaRow, {
          label: '群聊白名单', help: '请输入群 openid，多个请换行输入', rows: 3,
          value: access.groupAllow.join('\n'),
          onChange: (v) => { patch('access', { ...access, groupAllow: v.split('\n').map((s) => s.trim()) }); },
        })
      : null,
    createElement('p', { className: 'imqb2-hint', style: { padding: '8px 0 0' } },
      'openid 可在 QQ 里对机器人发送 /whoami 查看；私聊与群聊是两套值。'),
  ];

  const identityPanel: ReactNode[] = [
    createElement(SwitchRow, {
      label: '身份识别', checked: identity.enabled,
      help: '按 openid 判定发送者身份，并在消息前注入 [身份: 主人 / 管理员 / 朋友 / 陌生人]；三份名单都为空时不注入，保持旧行为',
      onChange: (v) => { patch('identity', { ...identity, enabled: v }); },
    }),
    identity.enabled
      ? createElement('p', { className: 'imqb2-hint', style: { padding: '0 0 8px' } },
          '在 QQ 里对机器人发送 /whoami 可查看并复制自己的 openid。私聊（user_openid）与群聊（member_openid）是两套值，需要分别添加。')
      : null,
    identity.enabled
      ? createElement(AreaRow, {
          label: '主人 openid', rows: 2,
          help: '对应「身份: 主人」，人格里的专属称呼只对这些人生效；一行一个',
          value: identity.ownerOpenIds.join('\n'),
          onChange: (v) => { patch('identity', { ...identity, ownerOpenIds: v.split('\n').map((s) => s.trim()) }); },
        })
      : null,
    identity.enabled
      ? createElement(AreaRow, {
          label: '管理员 openid', rows: 2,
          help: '对应「身份: 管理员」，按熟人对待但不套用主人设定；一行一个',
          value: identity.adminOpenIds.join('\n'),
          onChange: (v) => { patch('identity', { ...identity, adminOpenIds: v.split('\n').map((s) => s.trim()) }); },
        })
      : null,
    identity.enabled
      ? createElement(AreaRow, {
          label: '朋友 openid', rows: 2,
          help: '对应「身份: 朋友」，其余未命中名单的人都是「陌生人」；一行一个',
          value: identity.friendOpenIds.join('\n'),
          onChange: (v) => { patch('identity', { ...identity, friendOpenIds: v.split('\n').map((s) => s.trim()) }); },
        })
      : null,
  ];

  const memoryPanel: ReactNode[] = [
    createElement(SwitchRow, {
      label: '长期记忆', checked: memory.enabled,
      help: '按会话保存互动次数、关系阶段与要点记忆（~/.dsh-qqbot/memory.json）；/new 只重置上下文，记忆与重启后都会保留',
      onChange: (v) => { patch('memory', { ...memory, enabled: v }); },
    }),
    memory.enabled
      ? createElement(SwitchRow, {
          label: '自动捕获要点', checked: memory.autoCapture,
          help: '从「我叫… / 我喜欢… / 我住在…」这类自述里自动提取要点，不额外调用模型；只说疑问句或转述他人时不会记录',
          onChange: (v) => { patch('memory', { ...memory, autoCapture: v }); },
        })
      : null,
    memory.enabled
      ? createElement(FieldRow, {
          label: '每个会话最多记忆条数', value: String(memory.maxNotes), placeholder: '20',
          help: '超出后淘汰最旧的要点（1–100）；QQ 端可用 /memory 查看、手动添加或删除',
          onChange: (v) => {
            const n = Math.round(Number(v));
            patch('memory', { ...memory, maxNotes: Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 20 });
          },
        })
      : null,
  ];

  const conversationPanel: ReactNode[] = [
    createElement(SwitchRow, {
      label: '群聊仅回复 @机器人的消息', checked: form.requireMention ?? true,
      help: '开启后，机器人仅可回复 @机器人的群聊消息',
      onChange: (v) => { patch('requireMention', v); },
    }),
    createElement(SwitchRow, {
      label: '流式输出', checked: form.streaming ?? true,
      help: '回复内容分段实时推送到聊天（开启回复拆分时自动失效）',
      onChange: (v) => { patch('streaming', v); },
    }),
    createElement(SegmentedRow, {
      label: '回复拆分', value: form.replySplitMode ?? 'none', options: SPLIT_OPTIONS,
      help: '推荐「约定分隔符」：模型输出固定分隔符 ||| 时才拆条，正文换行不会拆；开启后自动关闭流式输出',
      onChange: (v) => { patch('replySplitMode', v as ReplySplitMode); },
    }),
    form.replySplitMode === 'delimiter'
      ? createElement('p', {
          className: 'imqb2-hint', style: { padding: '0 0 8px' },
        }, '分隔符固定为 |||（不可配置）；拆条规则写在「模型与提示词」的「全局提示词」里即可对整个机器人生效')
      : null,
    form.replySplitMode !== undefined && form.replySplitMode !== 'none'
      ? createElement(FieldRow, {
          label: '拆分间隔(ms)', value: String(form.replySplitIntervalMs ?? 0),
          placeholder: '0',
          help: '相邻消息之间的等待时间，0 表示顺序立即发送；遇到平台限流可调大',
          onChange: (v) => {
            const n = Math.max(0, Math.round(Number(v)));
            patch('replySplitIntervalMs', Number.isFinite(n) ? n : 0);
          },
        })
      : null,
    createElement(SwitchRow, {
      label: '显示工具调用结果', checked: form.showToolResults ?? false,
      help: '在聊天中展示 agent 工具调用的结构化结果',
      onChange: (v) => { patch('showToolResults', v); },
    }),
  ];

  const modelPanel: ReactNode[] = [
    createElement('div', { className: 'imqb2-group-title' }, '模型'),
    createElement(FieldRow, {
      label: 'Provider', value: form.provider ?? '', placeholder: '留空继承宿主默认',
      onChange: (v) => { patch('provider', v); },
    }),
    createElement(FieldRow, {
      label: 'Model', value: form.model ?? '', placeholder: '留空继承宿主默认',
      onChange: (v) => { patch('model', v); },
    }),
    createElement(FieldRow, {
      label: 'Preset', value: form.preset ?? '', placeholder: 'Agent preset id',
      onChange: (v) => { patch('preset', v); },
    }),
    form.cwd !== undefined
      ? createElement('div', { className: 'imqb2-field' },
          createElement('div', { className: 'imqb2-head' },
            createElement('span', { className: 'imqb2-label' }, 'Agent 工作目录'),
            createElement('span', { className: 'imqb2-hint' }, '只读'),
          ),
          createElement('p', { className: 'imqb2-readonly' }, form.cwd),
        )
      : null,
    createElement('div', { className: 'imqb2-group-title' }, '全局提示词'),
    createElement(AreaRow, {
      label: '全局 system prompt', rows: 6,
      help: '对所有群聊/私聊生效。把「多条消息用固定分隔符 ||| 分隔」这类通用规则写在这里，人格里只写角色设定。',
      value: form.globalPrompt ?? '',
      onChange: (v) => { patch('globalPrompt', v); },
    }),
  ];

  const personasPanel: ReactNode[] = [
    createElement('p', { className: 'imqb2-hint', style: { padding: '4px 0 8px' } },
      '每个人格是一套角色 system prompt，叠加在全局提示词之上。点击标题展开编辑，配置后可在 QQ 聊天发送 /persona（或直接点击菜单）按会话切换；修改过但未保存的分区会在 tab 上显示小圆点。'),
    personas.length === 0
      ? createElement('p', { className: 'imqb2-hint', style: { padding: '4px 0 12px' } },
          '尚未添加人格。添加并保存后，QQ 端 /persona 即可看到切换菜单。')
      : null,
    personas.map((persona, index) => createElement(PersonaCard, {
      key: `persona-${index}`,
      index,
      value: persona,
      expanded: expandedPersonas.has(index),
      onChange: (next) => { updatePersona(index, next); },
      onToggle: () => { togglePersona(index); },
      onRemove: () => { removePersona(index); },
    })),
    createElement('button', {
      type: 'button', className: 'imqb2-persona-add',
      onClick: addPersona,
    }, '＋ 添加人格'),
    personas.length > 0
      ? createElement(FieldRow, {
          label: '默认人格 id', value: form.defaultPersona ?? '', placeholder: '留空表示不启用人格',
          help: `可用 id: ${personas.map((p) => p.id).filter(Boolean).join(', ') || '（尚未填写）'}；留空则不启用人格`,
          onChange: (v) => { patch('defaultPersona', v); },
        })
      : null,
  ];

  const panels: Record<TabId, ReactNode[]> = {
    access: accessPanel,
    identity: identityPanel,
    memory: memoryPanel,
    conversation: conversationPanel,
    model: modelPanel,
    personas: personasPanel,
  };
  const activeTabLabel = TABS.find((tab) => tab.id === activeTab)?.label ?? '';

  return createElement('form', { className: 'imqb2-form', onSubmit: submit },
    createElement('div', {
      className: 'imqb2-tabs', role: 'tablist', 'aria-label': '配置分区',
    },
      TABS.map((tab) => createElement('button', {
        key: tab.id, type: 'button', role: 'tab',
        'aria-selected': activeTab === tab.id,
        'aria-controls': 'imqb2-config-tabpanel',
        className: 'imqb2-tab',
        onClick: () => { setActiveTab(tab.id); },
      },
        tab.label,
        tabDirty(tab)
          ? createElement('span', { className: 'imqb2-tab-dot', title: '有未保存的修改' })
          : null,
      )),
    ),
    createElement('div', {
      id: 'imqb2-config-tabpanel',
      className: 'imqb2-tabpanel', role: 'tabpanel', 'aria-label': activeTabLabel,
    }, panels[activeTab]),

    createElement('div', { className: 'imqb2-footer' },
      result !== null
        ? createElement('p', { className: `imqb2-note${result.ok ? ' imqb2-note--ok' : ' imqb2-note--error'}` },
            (result.ok ? '' : '⚠️ ') + result.message)
        : dirty
          ? createElement('p', { className: 'imqb2-note' }, '保存后插件将重载，进行中的机器人会话将重置')
          : createElement('p', { className: 'imqb2-note' }),
      createElement('button', { className: 'imqb2-save', type: 'submit', disabled: busy || !dirty },
        busy ? '正在保存…' : '保存'),
    ),
  );
}
