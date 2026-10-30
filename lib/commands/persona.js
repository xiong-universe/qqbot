import { getScopePeer, sendMarkdownChunked } from "../shared/index.js";
/** 把展示文本清洗成可安全放进 qqbot-cmd-input show 属性的字符串 */
function safeAttr(text) {
    return text.replace(/["<>\r\n]/g, ' ').trim();
}
export function personaCommand({ manager, config }) {
    return {
        name: ['persona', '人格'],
        category: 'qqbot',
        description: '查看或切换人格预设（用法: /persona [id|default|off]）',
        handler: async (cmdCtx) => {
            const { scope, peerId } = getScopePeer(cmdCtx);
            const args = (cmdCtx.command?.raw ?? '').trim();
            const personas = manager.listPersonas();
            // 无参数：列出可用人格 + 当前生效
            if (!args) {
                if (personas.length === 0) {
                    return '当前未配置人格预设，请在 dsh 设置面板的「人格预设」中添加后重试。';
                }
                const currentId = manager.getEffectivePersonaId(scope, peerId);
                const current = manager.getEffectivePersona(scope, peerId);
                const followsDefault = !manager.hasPersonaOverride(scope, peerId);
                const currentLabel = current
                    ? `${current.name} (${current.id})${followsDefault ? '（跟随默认）' : ''}`
                    : '未启用';
                const lines = ['### 🎭 人格预设', ''];
                lines.push(`**当前:** ${currentLabel}`);
                if (config.defaultPersona) {
                    const def = manager.findPersonaById(config.defaultPersona);
                    lines.push(`**默认人格:** ${def ? `${def.name} (${def.id})` : `${config.defaultPersona}（已不存在）`}`);
                }
                lines.push('', '**可用人格（点击切换）:**');
                for (const p of personas) {
                    const mark = p.id === currentId ? '✅ ' : '';
                    const show = safeAttr(`${mark}${p.name || p.id}`);
                    lines.push(`<qqbot-cmd-input text="/persona ${p.id}" show="/persona ${show}"/>`);
                }
                lines.push('', '手动指定: `/persona <id>`', '跟随默认: `/persona default`　关闭人格: `/persona off`', '', '> 切换后下一条消息立即生效，无需新建会话。');
                await sendMarkdownChunked(cmdCtx, lines.join('\n'), config.textChunkLimit);
                return { kind: 'noop' };
            }
            // default / reset：清除本会话覆盖，回到默认人格
            if (args === 'default' || args === 'reset') {
                manager.clearPersonaOverride(scope, peerId);
                const current = manager.getEffectivePersona(scope, peerId);
                return current
                    ? `✅ 已恢复默认人格: ${current.name} (${current.id})\n下一条消息生效。`
                    : '✅ 已恢复默认（当前未配置默认人格，人格已关闭）\n下一条消息生效。';
            }
            // off：仅关闭当前会话的人格
            if (args === 'off') {
                manager.disablePersona(scope, peerId);
                return '✅ 已关闭本会话人格（群聊/私聊各自独立）\n下一条消息生效，恢复默认用 `/persona default`。';
            }
            // 切换到指定人格
            const persona = manager.findPersonaById(args);
            if (!persona) {
                const ids = personas.map((p) => p.id).join(', ');
                return `未知人格: ${args}${ids ? `\n可用: ${ids}` : ''}`;
            }
            manager.setPersonaOverride(scope, peerId, persona.id);
            return `✅ 人格已切换: ${persona.name} (${persona.id})\n下一条消息生效。`;
        },
    };
}
//# sourceMappingURL=persona.js.map