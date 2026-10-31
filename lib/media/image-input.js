/**
 * 图片输入公共逻辑（qqbot_describe_image / qqbot_solve 共用）。
 *
 * 只信任 magic bytes：按文件头嗅探 mediaType，避免把伪装扩展名的文件
 * 当成图片送进模型。
 */
import { readFile, stat } from 'node:fs/promises';
/** 图片 magic bytes 嗅探 → 标准 MIME */
export function sniffImageMediaType(bytes) {
    if (bytes.length < 12)
        return null;
    // PNG: 89 50 4E 47
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
        return 'image/png';
    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        return 'image/jpeg';
    // GIF: 47 49 46 38
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38)
        return 'image/gif';
    // WEBP: 52 49 46 46 .. 57 45 42 50
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
        return 'image/webp';
    return null;
}
/**
 * 加载图片字节（本地路径 / http URL），校验大小 + 嗅探 MIME。
 *
 * @param label - 报错前缀（工具名），让错误信息能指回调用方
 */
export async function loadImageBytes(image, maxBytes, signal, label) {
    let data;
    if (/^https?:\/\//i.test(image)) {
        const resp = await fetch(image, { signal, redirect: 'error' });
        if (!resp.ok)
            throw new Error(`${label}: download failed (HTTP ${resp.status})`);
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.length > maxBytes)
            throw new Error(`${label}: image too large (${buf.length} bytes)`);
        data = new Uint8Array(buf);
    }
    else {
        const info = await stat(image).catch(() => null);
        if (!info?.isFile())
            throw new Error(`${label}: image file not found: ${image}`);
        if (info.size > maxBytes)
            throw new Error(`${label}: image too large (${info.size} bytes)`);
        data = new Uint8Array(await readFile(image));
    }
    const mediaType = sniffImageMediaType(data);
    if (mediaType === null)
        throw new Error(`${label}: unrecognized image format (png/jpeg/gif/webp only)`);
    return { data, mediaType };
}
//# sourceMappingURL=image-input.js.map