import sharp from 'sharp';
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export async function prepareImage(input: Buffer) {
    if (!input.length || input.length > MAX_UPLOAD_BYTES)
        throw new Error('Choose an image smaller than 10 MB.');
    const source = sharp(input, { limitInputPixels: 40000000, animated: false, failOn: 'warning' });
    let metadata;
    try {
        metadata = await source.metadata();
    }
    catch {
        throw new Error('This file is not a readable image.');
    }
    if (!metadata.format || !['jpeg', 'png', 'webp', 'avif', 'heif'].includes(metadata.format))
        throw new Error('Choose a JPEG, PNG, WebP or AVIF image.');
    // Re-encoding removes executable payloads, EXIF/GPS and original file metadata.
    const { data, info } = await source.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer({ resolveWithObject: true });
    if (data.length > MAX_UPLOAD_BYTES)
        throw new Error('This image is too large.');
    return { content: data, mime: 'image/webp' as const, width: info.width, height: info.height };
}
