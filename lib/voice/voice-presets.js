/**
 * Qwen-Audio-TTS 系统音色预设
 *
 * 数据来源：阿里云百炼「Qwen-Audio-TTS 音色列表」；每个 id 都在真实账号上
 * 实测合成成功过（2026-10）。
 *
 * 音色 id 与模型强绑定：flash 支持全部系统音色；plus 只支持其中一部分
 * （当前实测：longanlingxi、longanhuan_v3.6）以及声音复刻/设计的专属 id。
 * 面板下拉会把当前模型不支持的音色标注成「需 xxx 模型」，避免选完才发现合成失败。
 */
/** 预设音色默认适用的模型 */
export const VOICE_PRESET_MODEL = 'qwen-audio-3.0-tts-flash';
/** 另一支持系统音色的模型（支持范围见每个 preset 的 models） */
export const VOICE_PRESET_MODEL_PLUS = 'qwen-audio-3.0-tts-plus';
export const VOICE_PRESETS = [
    { id: 'longanfengyue', name: '龙安风悦', trait: '自然亲切音', gender: '女', age: 30, models: [VOICE_PRESET_MODEL] },
    { id: 'longanyuanfei', name: '龙安元妃', trait: '高傲妃子音', gender: '女', age: 30, models: [VOICE_PRESET_MODEL] },
    { id: 'longanlingxi', name: '龙安灵希', trait: '可爱甜美音', gender: '女', age: 25, models: [VOICE_PRESET_MODEL, VOICE_PRESET_MODEL_PLUS] },
    { id: 'longanxiaoxin', name: '龙安小昕', trait: '亲切活泼音', gender: '女', age: 22, models: [VOICE_PRESET_MODEL] },
    { id: 'longanhuan_v3.6', name: '龙安欢', gender: '女', age: 25, models: [VOICE_PRESET_MODEL, VOICE_PRESET_MODEL_PLUS] },
    { id: 'longjielidou_v3.6', name: '龙杰力豆', trait: '天真男童', gender: '男', age: 5, models: [VOICE_PRESET_MODEL] },
    { id: 'longpaopao_v3.6', name: '龙泡泡', trait: '软糯可爱音', gender: '女', age: 5, models: [VOICE_PRESET_MODEL] },
    { id: 'longhuohuo_v3.6', name: '龙火火', trait: '顽皮少年音', gender: '男', age: 8, models: [VOICE_PRESET_MODEL] },
    { id: 'longchuanshu_v3.6', name: '龙川叔', trait: '川普大叔音', gender: '男', age: 40, models: [VOICE_PRESET_MODEL] },
    { id: 'loongmary', name: 'Loong Mary', trait: '温暖英音', gender: '女', age: 20, models: [VOICE_PRESET_MODEL] },
    { id: 'loongjohn', name: 'Loong John', trait: '沉稳亲切美音', gender: '男', age: 28, models: [VOICE_PRESET_MODEL] },
    { id: 'loongeva_v3.6', name: 'Loong Eva', trait: '高智美音', gender: '女', age: 28, models: [VOICE_PRESET_MODEL] },
];
/** 取某模型可用的预设（模型留空时按默认模型处理） */
export function voicePresetsForModel(model) {
    const target = model?.trim() || VOICE_PRESET_MODEL;
    return VOICE_PRESETS.filter((preset) => preset.models.includes(target));
}
/** 按音色 id 查预设（用于展示友好名称） */
export function findVoicePreset(id) {
    const target = id?.trim() ?? '';
    if (target === '')
        return undefined;
    return VOICE_PRESETS.find((preset) => preset.id === target);
}
/** 下拉提示文案：龙安风悦（自然亲切音 · 30岁女） */
export function formatVoicePresetLabel(preset) {
    const details = [preset.trait, preset.age === undefined ? undefined : `${preset.age}岁`, preset.gender]
        .filter((part) => part !== undefined)
        .join(' · ');
    return details === '' ? preset.name : `${preset.name}（${details}）`;
}
/**
 * 面板音色下拉：**用户自定义音色在最上，内置系统音色在其后**。
 *
 * 内置音色不再按模型直接过滤掉（否则 plus 模型下只剩自定义项，用户会以为
 * 没有系统音色）：当前模型不支持的项仍列出来，但带上 `requiresModel`，
 * 面板显示「需 xxx 模型」并提示把语音模型一起改掉。
 * 未知模型（如 cosyvoice-v2）没有可确认的兼容矩阵，返回空清单，只保留自定义音色。
 */
export function buildVoiceOptions(custom, model) {
    const options = [];
    const seen = new Set();
    for (const entry of custom ?? []) {
        const id = (entry?.voice ?? '').trim();
        if (id === '' || seen.has(id))
            continue;
        seen.add(id);
        const name = (entry?.name ?? '').trim() || id;
        options.push({ value: id, label: `${name}（自定义）` });
    }
    const target = model?.trim() || VOICE_PRESET_MODEL;
    const knownModel = VOICE_PRESETS.some((preset) => preset.models.includes(target));
    if (!knownModel)
        return options;
    for (const preset of VOICE_PRESETS) {
        if (seen.has(preset.id))
            continue;
        seen.add(preset.id);
        const supported = preset.models.includes(target);
        options.push({
            value: preset.id,
            label: formatVoicePresetLabel(preset),
            ...(supported ? {} : { requiresModel: preset.models[0] ?? VOICE_PRESET_MODEL }),
        });
    }
    return options;
}
/** 按 id 取下拉里的展示文案（找不到就用 id 本身，自定义与内置都覆盖） */
export function voiceOptionLabel(options, id) {
    const target = id?.trim() ?? '';
    if (target === '')
        return '';
    return options.find((option) => option.value === target)?.label ?? target;
}
/**
 * 说明文案里的音色短名：自定义项去掉「（自定义）」、内置项去掉特质/年龄。
 *
 * 下拉 label 为了区分来源写得很长（`御姐（自定义）`、`龙安风悦（自然亲切音 · 30岁女）`），
 * 塞进 system prompt / 工具回执里太啰嗦，这里只取括号前的名字。
 */
export function voiceShortLabel(options, id) {
    const label = options === undefined ? '' : voiceOptionLabel(options, id);
    if (label === '')
        return '';
    const cut = label.indexOf('（');
    return cut === -1 ? label : label.slice(0, cut);
}
//# sourceMappingURL=voice-presets.js.map