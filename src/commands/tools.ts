/**
 * Tools 命令：/tools — 查看工具清单与人格工具绑定
 *
 * 工具权限是运行时硬约束：人格配置了 `tools` 白名单后，dsh tools 服务
 * 会按 agent 作用域 restrict，模型根本看不到白名单外的工具。
 *
 * 用法：
 *   /tools              查看当前会话生效的人格绑定与本会话可限制工具清单
 *   /tools <人格id>      预览某个人格会获得哪些工具
 */
import type { CommandDeps, CategorizedCommand } from './types.ts';
import { getScopePeer, sendMarkdownChunked } from '../shared/index.ts';
import { resolveToolBinding } from '../personas/persona-tools.ts';

export function toolsCommand({ manager, config }: CommandDeps): CategorizedCommand {
  return {
    name: ['tools', '工具'],
    category: 'qqbot',
    description: '查看工具清单与人格工具绑定（用法: /tools [人格id]）',
    minRole: 'admin',
    handler: async (cmdCtx) => {
      const { scope, peerId } = getScopePeer(cmdCtx);
      const args = (cmdCtx.command?.raw ?? '').trim();
      const msg = cmdCtx.message;

      // 斜杠命令不经过入站流程、不会自动建会话；先确保会话存在，
      // 否则 tools.view() 只能看到宿主全局层，preset 挂载的工具会被漏掉。
      try {
        await manager.ensureSession(scope, peerId, msg.senderId, {
          scope,
          targetId: peerId,
          msgId: msg.messageId,
        });
      } catch {
        // 建会话失败时退化为全局层视图，不阻断诊断命令
      }

      // 可选的「预览某个已配置人格」
      if (args) {
        const persona = manager.findPersonaById(args);
        if (!persona) {
          const ids = manager.listPersonas().map((p) => p.id).join(', ');
          return `未知人格: ${args}${ids ? `\n可用: ${ids}` : ''}`;
        }
        const available = manager.listToolNamesFor(scope, peerId);
        const lines = [`### 🧰 人格工具绑定: ${persona.name} (${persona.id})`, ''];
        if (persona.tools === undefined) {
          lines.push('**权限:** 不限制（继承宿主全部工具）');
        } else {
          const { allowed, unknown } = resolveToolBinding(persona.tools, new Set(available));
          lines.push(
            `**权限:** 限制为 ${allowed.length} 个工具`,
            `**可用工具:** ${allowed.length === 0 ? '无（该人格没有任何工具能力）' : allowed.join('、')}`,
          );
          if (unknown.length > 0) {
            lines.push(`**未注册（已忽略）:** ${unknown.join('、')}`);
          }
        }
        lines.push('', '> 切换人格后立即生效，无需新建会话。');
        await sendMarkdownChunked(cmdCtx, lines.join('\n'), config.textChunkLimit);
        return { kind: 'noop' as const };
      }

      // 无参数：当前会话 + 本会话可限制工具清单
      const binding = manager.getPersonaToolBinding(scope, peerId);
      const lines: string[] = ['### 🧰 工具与人格绑定', ''];

      if (binding.persona === undefined) {
        lines.push('**当前人格:** 未启用（使用宿主默认提示词）');
      } else {
        lines.push(`**当前人格:** ${binding.persona.name} (${binding.persona.id})`);
      }

      if (!binding.restricted) {
        lines.push(`**工具权限:** 不限制（继承全部 ${binding.available.length} 个工具）`);
      } else {
        lines.push(
          `**工具权限:** 限制为 ${binding.allowed.length} 个`,
          `**可用工具:** ${binding.allowed.length === 0 ? '无（没有工具能力）' : binding.allowed.join('、')}`,
        );
        if (binding.unknown.length > 0) {
          lines.push(`**未注册（已忽略）:** ${binding.unknown.join('、')}`);
        }
      }

      lines.push('', `**本会话可限制工具（${binding.available.length} 个，含 preset 套餐）:**`);
      lines.push(binding.available.length === 0
        ? '（工具服务不可用或宿主未注册任何工具）'
        : binding.available.map((name) => `\`${name}\``).join('、'));

      lines.push(
        '',
        '**绑定方式:** 设置面板 →「人格预设」→ 展开人格 → 开启「限制可用工具」，一行一个工具名（留空 = 禁用全部）。',
        '预览某个人格: `/tools <人格id>`',
      );

      await sendMarkdownChunked(cmdCtx, lines.join('\n'), config.textChunkLimit);
      return { kind: 'noop' as const };
    },
  };
}
