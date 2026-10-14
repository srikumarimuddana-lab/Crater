import 'server-only';
import { requireAdmin } from '@/lib/admin';
import { getRepository } from '@/lib/commerce/repository-factory';
import { pgPoolOf } from '@/lib/commerce/postgres-repository';
import { createMemoryMediaRepository, createPostgresMediaRepository, type MediaRepository } from './repository';
import { prepareImage, MAX_UPLOAD_BYTES } from './prepare';
const KEY = Symbol.for('crater.media');
export async function getMediaRepository(): Promise<MediaRepository> {
    const commerce = await getRepository();
    const g = globalThis as unknown as Record<symbol, {
        for: unknown;
        repo: MediaRepository;
    }>;
    if (!g[KEY] || g[KEY].for !== commerce)
        g[KEY] = { for: commerce, repo: commerce.kind === 'postgres' ? createPostgresMediaRepository(pgPoolOf(commerce)) : createMemoryMediaRepository() };
    return g[KEY].repo;
}
export async function uploadImage(file: File, alt: string) {
    await requireAdmin('products:write');
    if (!file || file.size > MAX_UPLOAD_BYTES || alt.length > 500)
        throw new Error('Choose an image under 10 MB and a short description.');
    const image = await prepareImage(Buffer.from(await file.arrayBuffer()));
    return (await getMediaRepository()).create({ ...image, name: file.name.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 160) || 'Image', alt: alt.trim() });
}
/** Used by product publication and CMS; publication makes an immutable derivative public. */
export async function publishImages(urls: string[]) {
    await requireAdmin('products:publish');
    const ids = urls.filter(u => /^\/api\/media\/[0-9a-f-]{36}$/.test(u)).map(u => u.split('/').pop()!);
    await (await getMediaRepository()).publish(ids);
}
