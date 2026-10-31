import { sendMarkdownChunked, PLUGIN_VERSION } from "../shared/index.js";
import { canUseCommand } from "../identity/role.js";
/** /bot-help — 分组查看当前身份可用的指令 */
export function helpCommand({ config }, allCommands) {
    return {
        name: 'bot-help',
        category: 'qqbot',
        description: '查看可用指令',
        handler: async (cmdCtx) => {
            const agentCmds = [];
            const qqbotCmds = [];
            // 与 authorized 钩子用同一套规则：非管理员看不到管理类指令
            const senderId = cmdCtx.message.senderId;
            for (const cmd of allCommands()) {
                if (cmd.hidden)
                    continue;
                if (!canUseCommand(senderId, config.identity, cmd.minRole))
                    continue;
                (cmd.category === 'agent' ? agentCmds : qqbotCmds).push(cmd);
            }
            const render = (cmds) => {
                const out = [];
                for (const cmd of cmds) {
                    const name = Array.isArray(cmd.name) ? cmd.name[0] : cmd.name;
                    out.push(`<qqbot-cmd-input text="/${name}" show="/${name}"/> ${cmd.description ?? ''}`);
                }
                return out;
            };
            const lines = ['### 🤖 QQ 机器人指令', ''];
            if (agentCmds.length > 0) {
                lines.push('**通用能力**', '', ...render(agentCmds), '');
            }
            if (qqbotCmds.length > 0) {
                lines.push('**插件内置指令**', '', ...render(qqbotCmds), '');
            }
            lines.push('', `> dsh-qqbot v${PLUGIN_VERSION}`);
            await sendMarkdownChunked(cmdCtx, lines.join('\n'), config.textChunkLimit);
            return { kind: 'noop' };
        },
    };
}
//# sourceMappingURL=help.js.map