import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { prepareImage } from '@/lib/media/prepare';
import { createMemoryMediaRepository } from '@/lib/media/repository';
describe('media safety and publication', () => {
  it('decodes real pixels, strips metadata and emits bounded WebP', async () => {
    const input = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#2f8751' } }).png().toBuffer();
    const image = await prepareImage(input);
    expect(image.mime).toBe('image/webp'); expect(image.width).toBe(20);
    expect((await sharp(image.content).metadata()).exif).toBeUndefined();
  });
  it('rejects scripts and forged file extensions', async () => {
    await expect(prepareImage(Buffer.from('<svg onload="alert(1)"></svg>'))).rejects.toThrow();
    await expect(prepareImage(Buffer.from('not an image'))).rejects.toThrow();
  });
  it('keeps private uploads private and preserves published assets', async () => {
    const repo = createMemoryMediaRepository();
    const asset = await repo.create({ name: 'Portrait', alt: 'Portrait', mime: 'image/webp', width: 1, height: 1, content: Buffer.from('pixels') });
    expect((await repo.get(asset.id))?.published).toBe(false);
    await repo.publish([asset.id]);
    await expect(repo.archive(asset.id)).rejects.toThrow(/published/i);
    expect((await repo.get(asset.id))?.published).toBe(true);
  });
});
