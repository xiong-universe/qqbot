/** 一条回复的颜文字上限范围（超出按边界夹值） */
export const MIN_KAOMOJI_PER_REPLY = 1;
export const MAX_KAOMOJI_PER_REPLY = 3;
/** 自定义颜文字条数上限 */
export const MAX_KAOMOJI_CUSTOM = 20;
/** 单条自定义颜文字长度上限 */
export const MAX_KAOMOJI_ITEM_CHARS = 32;
/** 注入 prompt 时最多展示多少条预设颜文字（避免 system prompt 过长） */
export const MAX_KAOMOJI_PROMPT_ITEMS = 14;
/** 缺省风格 id */
export const DEFAULT_KAOMOJI_STYLE = 'daily';
/**
 * 预置风格。id 会写进配置（profile patch / 设置面板下拉），
 * 改名会导致旧配置回落 daily，所以 id 保持稳定，只调整 name/内容。
 */
export const KAOMOJI_STYLES = [
    {
        id: 'daily',
        name: '日常',
        description: '通用情绪，轻微点缀，适合大多数人格',
        groups: [
            { mood: '开心', items: ['(￣▽￣)', '(＾▽＾)', '(≧▽≦)', '(・∀・)'] },
            { mood: '害羞', items: ['(⁄ ⁄•⁄ω⁄•⁄ ⁄)', '(๑´ㅂ๑)'] },
            { mood: '无语', items: ['(・_・;)', '(￣ω￣;)', '(°ー°〃)'] },
            { mood: '低落', items: ['(´・ω・)', '(´-ω-)'] },
            { mood: '生气', items: ['(￣ヘ￣)', '(＞︿＜)'] },
        ],
    },
    {
        id: 'genki',
        name: '元气',
        description: '高频、外放，适合元气/活泼人格',
        groups: [
            { mood: '开心', items: ['(๑•̀ㅂ•́)و✧', '٩(๑>◡<๑)۶', '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', '(≧∇≦)ﾉ'] },
            { mood: '加油', items: ['(ง •̀_•́)ง', '(๑˃̵ᴗ˂̵)و', 'o(*≧▽≦)ツ'] },
            { mood: '得意', items: ['✧*｡٩(ˊᗜˋ*)و✧*｡', '(๑•̀ㅁ•́๑)✧'] },
            { mood: '兴奋', items: ['ヽ(≧Д≦)ノ', '(☝︎ ՞ਊ ՞)☝︎', 'ヽ(•‿•)ノ'] },
        ],
    },
    {
        id: 'chuuni',
        name: '中二',
        description: '带设定感与戏剧性，适合中二人格',
        groups: [
            { mood: '得意', items: ['(￣▽￣)ゞ', '(￣^￣)ゞ', 'ヽ(•̀ω•́ )ゝ'] },
            { mood: '高冷', items: ['(￣ー￣)', '(¬_¬)', '┌(┌ ^o^)┐'] },
            { mood: '震惊', items: ['(╯°□°）╯︵ ┻━┻', '┬─┬ノ( º _ ºノ)', '(；￣Д￣)'] },
            { mood: '嘴硬', items: ['( ｀ー´)ノ', '(￣ω￣;)'] },
        ],
    },
    {
        id: 'cat',
        name: '猫系',
        description: '猫耳/猫爪感，适合猫娘及萌系人格',
        groups: [
            { mood: '开心', items: ['ฅ^•ﻌ•^ฅ', '(=^･ω･^=)', '(^・ω・^ )'] },
            { mood: '撒娇', items: ['ฅ( ̳• ·̫ • ̳ฅ)', '(=^ ◡ ^=)', '(ΦωΦ)'] },
            { mood: '生气', items: ['(=｀ω´=)', '(^=◕ᴥ◕=^)'] },
            { mood: '困倦', items: ['(^-ω-^=)', '(=①ω①=)', '(=ω=)'] },
        ],
    },
    {
        id: 'tsundere',
        name: '傲娇',
        description: '嘴硬、别扭，适合傲娇/小恶魔人格',
        groups: [
            { mood: '嘴硬', items: ['(￣^￣)', '(￣3￣)', '(｀Д´*)', '(¬_¬)'] },
            { mood: '害羞', items: ['(￣▽￣)', '(⁄ ⁄•⁄ω⁄•⁄ ⁄)', '(￣ω￣;)'] },
            { mood: '生气', items: ['(￣ヘ￣)', '(＞︿＜)', '(ー_ーゞ'] },
            { mood: '委屈', items: ['(｡•́︿•̀｡)', '(￣﹏￣)'] },
        ],
    },
    {
        id: 'soft',
        name: '温柔',
        description: '柔和、体贴，适合温柔/大姐姐人格',
        groups: [
            { mood: '开心', items: ['(´｡• ᵕ •｡)', '(◍•ᴗ•◍)', '( ˶ˆᗜˆ˵ )'] },
            { mood: '暖心', items: ['(｡･ω･｡)ﾉ♡', '(灬º‿º灬)♡', '(∩˃o˂∩)♡', '( ˘ ³˘)♥'] },
            { mood: '害羞', items: ['(⁄ ⁄•⁄ω⁄•⁄ ⁄)', '(๑•́ ₃ •̀๑)'] },
            { mood: '鼓励', items: ['(｡•̀ᴗ-)✧', '(๑˘︶˘๑)'] },
        ],
    },
    {
        id: 'cool',
        name: '清冷',
        description: '克制、少用，适合清冷/学姐人格',
        groups: [
            { mood: '冷淡', items: ['(￣ー￣)', '(￣.￣)', '(・_・)', '(¬‿¬)'] },
            { mood: '无奈', items: ['(￣Д￣)', '(ー_ー)', '(・＿・)'] },
            { mood: '轻微', items: ['(￣ω￣)'] },
        ],
    },
    {
        id: 'maid',
        name: '女仆',
        description: '恭敬、细腻，适合女仆/侍从人格',
        groups: [
            { mood: '恭敬', items: ['(๑• . •๑)', '(*^▽^*)', '(｡･ω･｡)ﾉ'] },
            { mood: '害羞', items: ['(,,>﹏<,,)', '(⁄ ⁄•⁄ω⁄•⁄ ⁄)', '(๑ˊ͈ ॢꇴ ˋ͈)'] },
            { mood: '开心', items: ['(◕‿◕✿)', '(ノ*°▽°*)', '(๑¯ω¯๑)'] },
        ],
    },
];
/** 按 id 查找风格（去空白、未知返回 undefined） */
export function findKaomojiStyle(id) {
    const trimmed = id?.trim();
    if (!trimmed)
        return undefined;
    return KAOMOJI_STYLES.find((style) => style.id === trimmed);
}
/** 展开一套风格的全部颜文字（去空白、去重，保持定义顺序） */
export function styleItems(style) {
    const seen = new Set();
    const result = [];
    for (const group of style.groups) {
        for (const raw of group.items) {
            const text = raw.trim();
            if (text === '' || seen.has(text))
                continue;
            seen.add(text);
            result.push(text);
        }
    }
    return result;
}
/** 清洗自定义颜文字：去空白、截断长度、去重、限量 */
export function sanitizeKaomojiCustom(list) {
    if (list === undefined)
        return [];
    const seen = new Set();
    const result = [];
    for (const raw of list) {
        if (typeof raw !== 'string')
            continue;
        const text = raw.trim().slice(0, MAX_KAOMOJI_ITEM_CHARS);
        if (text === '' || seen.has(text))
            continue;
        seen.add(text);
        result.push(text);
        if (result.length >= MAX_KAOMOJI_CUSTOM)
            break;
    }
    return result;
}
/** 夹取「一条回复最多几个颜文字」 */
export function clampKaomojiPerReply(value) {
    if (value === undefined || !Number.isFinite(value))
        return 1;
    return Math.min(MAX_KAOMOJI_PER_REPLY, Math.max(MIN_KAOMOJI_PER_REPLY, Math.round(value)));
}
export function resolveKaomoji(persona) {
    const config = persona?.expressions?.kaomoji;
    // 必须显式开启：Schema 会物化默认子对象（enabled 缺省 false）
    if (config === undefined || config.enabled !== true)
        return undefined;
    const style = findKaomojiStyle(config.style) ?? findKaomojiStyle(DEFAULT_KAOMOJI_STYLE);
    if (style === undefined)
        return undefined;
    const custom = sanitizeKaomojiCustom(config.custom);
    return {
        style,
        items: [...styleItems(style), ...custom],
        custom,
        maxPerReply: clampKaomojiPerReply(config.maxPerReply),
    };
}
/**
 * 生成注入 system prompt 的颜文字说明（人格未开启时返回 undefined）。
 *
 * 只列出风格里的一部分（最多 MAX_KAOMOJI_PROMPT_ITEMS 条），并明确频率上限，
 * 避免模型每句都挂颜文字或堆叠多个。
 */
export function buildKaomojiPrompt(persona) {
    const resolved = resolveKaomoji(persona);
    if (resolved === undefined)
        return undefined;
    const lines = [
        '【颜文字使用】',
        `- 情绪合适时可以在句尾加一个颜文字（风格：${resolved.style.name}），一条回复最多 ${resolved.maxPerReply} 个；不必每条都加。`,
        '- 直接写出颜文字即可，不要解释含义，也不要连续堆叠多个。',
        '- 颜文字是表情符号，写在句尾就行，不属于「括号写动作」的旁白，和人格里的动作用词规则不冲突。',
        '- 可选的颜文字：',
    ];
    let shownCount = 0;
    for (const group of resolved.style.groups) {
        const remaining = MAX_KAOMOJI_PROMPT_ITEMS - shownCount;
        if (remaining <= 0)
            break;
        const items = group.items.map((item) => item.trim()).filter(Boolean);
        if (items.length === 0)
            continue;
        const shown = items.slice(0, remaining);
        lines.push(`  - ${group.mood}：${shown.join('、')}`);
        shownCount += shown.length;
    }
    if (resolved.custom.length > 0) {
        lines.push(`  - 自定义：${resolved.custom.join('、')}`);
    }
    lines.push('- 挑合适的用，别每次都固定同一个；严肃或需要准确表达的内容里不要加。');
    return lines.join('\n');
}
//# sourceMappingURL=kaomoji.js.map