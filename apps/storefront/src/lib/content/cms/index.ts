import 'server-only';
import { getRepository } from '@/lib/commerce/repository-factory';
import { pgPoolOf } from '@/lib/commerce/postgres-repository';
import { requireAdmin } from '@/lib/admin';
import { createMemoryCmsRepository, createPostgresCmsRepository, type CmsRepository } from './repository';
import { defaultsFor, validateContent, type Content } from './schema';
import { getMediaRepository } from '@/lib/media';
const KEY = Symbol.for('crater.cms');
export async function getCmsRepository(): Promise<CmsRepository> {
    const commerce = await getRepository();
    const g = globalThis as unknown as Record<symbol, {
        for: unknown;
        repo: CmsRepository;
    }>;
    if (!g[KEY] || g[KEY].for !== commerce) {
        const media = await getMediaRepository();
        g[KEY] = { for: commerce, repo: commerce.kind === 'postgres' ? createPostgresCmsRepository(pgPoolOf(commerce)) : createMemoryCmsRepository(data => media.publish(Object.values(data).filter(v => v.startsWith('/api/media/')).map(v => v.split('/').pop()!))) };
    }
    return g[KEY].repo;
}
export async function getPublishedContent(key: string): Promise<Content> {
    const doc = await (await getCmsRepository()).read(key);
    return { ...defaultsFor(key), ...doc.published };
}
export async function getPageContent(key: string, preview?: string | string[]): Promise<Content> {
    return preview === key ? getPreviewContent(key) : getPublishedContent(key);
}
export async function getPreviewContent(key: string): Promise<Content> {
    await requireAdmin('content:write');
    const doc = await (await getCmsRepository()).read(key);
    return { ...defaultsFor(key), ...(doc.draft ?? doc.published) };
}
export async function saveDraft(key: string, expected: number, input: unknown) {
    const session = await requireAdmin('content:write');
    const data = validateContent(key, input);
    await (await getCmsRepository()).save(key, expected, data, session.staff.id);
}
export async function publishContent(key: string, expected: number) {
    const session = await requireAdmin('content:publish');
    if (['privacy', 'terms', 'shipping-returns'].includes(key) && session.staff.role !== 'OWNER')
        throw new Error('Only the Owner can publish store policies.');
    const repo = await getCmsRepository();
    const doc = await repo.read(key);
    if (!doc.draft)
        throw new Error('Save a draft first.');
    validateContent(key, doc.draft);
    await repo.publish(key, expected, session.staff.id);
}
