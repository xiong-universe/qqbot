/**
 * 身份查询命令：/whoami
 *
 * QQ openid 不能当 QQ 号用，而且私聊（user_openid）与群聊（member_openid）
 * 是两套值。命令直接回显当前场景的 openid 与判定结果，方便把本人加进
 * 「身份与权限」名单；插件本身不提供网页端之外的账号系统。
 */
import type { CommandDeps, CategorizedCommand } from './types.ts';
import { getScopePeer } from '../shared/index.ts';
import {
  hasIdentityConfig,
  resolveSenderRole,
  ROLE_LABELS,
} from '../identity/role.ts';

export function whoamiCommand({ config }: CommandDeps): CategorizedCommand {
  return {
    name: ['whoami', '我是谁'],
    category: 'qqbot',
    description: '查看我的身份与 openid（用于配置主人/管理员名单）',
    handler: (cmdCtx) => {
      const { scope, peerId } = getScopePeer(cmdCtx);
      const senderId = (cmdCtx.message.senderId ?? '').trim();
      const configured = hasIdentityConfig(config.identity);
      const enabled = config.identity?.enabled !== false;
      const role = resolveSenderRole(senderId, config.identity);

      const lines = [
        '🪪 身份信息',
        `判定结果: ${ROLE_LABELS[role]}${configured ? '' : '（身份名单未配置，默认按陌生人处理）'}`,
        `openid: ${senderId || '（当前消息没有 senderId）'}`,
        `场景: ${scope === 'group' ? `群聊（群 ${peerId}）` : '私聊'}`,
      ];

      if (senderId) {
        lines.push('', '把这个 openid 填到设置面板 →「身份与权限」对应名单即可生效。');
      }
      if (scope === 'group') {
        lines.push('注意：群聊用的是 member_openid，与私聊 user_openid 不同，两处需要分别添加。');
      } else {
        lines.push('注意：私聊用的是 user_openid；你在群聊里的 openid 是另一个值，需要到群里再发一次 /whoami 查看。');
      }
      if (!enabled) {
        lines.push('', '⚠️ 身份识别当前已关闭，可在设置面板「身份与权限」里重新开启。');
      }
      return lines.join('\n');
    },
  };
}
