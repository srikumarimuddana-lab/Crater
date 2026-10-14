import type { Pool } from 'pg';
import type { Content } from './schema';
export type ContentDocument = {
    key: string;
    version: number;
    draft: Content | null;
    published: Content | null;
};
export type Revision = {
    version: number;
    data: Content;
    action: 'save' | 'publish';
    actor: string;
    at: string;
};
export interface CmsRepository {
    read(key: string): Promise<ContentDocument>;
    save(key: string, expected: number, data: Content, actor: string): Promise<void>;
    publish(key: string, expected: number, actor: string): Promise<void>;
    history(key: string): Promise<Revision[]>;
}
const empty = (key: string): ContentDocument => ({ key, version: 0, draft: null, published: null });
export function createMemoryCmsRepository(publishMedia?: (data: Content) => Promise<void>): CmsRepository {
    const docs = new Map<string, ContentDocument>();
    const versions = new Map<string, Revision[]>();
    let pending: Promise<unknown> = Promise.resolve();
    const change = (key: string, expected: number, data: Content | null, actor: string, action: 'save' | 'publish') => {
        const operation = pending.then(async () => {
            const doc = docs.get(key) ?? empty(key);
            if (doc.version !== expected)
                throw new Error('This page changed. Reload before saving.');
            const next = data ?? doc.draft;
            if (!next)
                throw new Error('Save a draft first.');
            if (action === 'publish' && publishMedia)
                await publishMedia(next);
            const version = doc.version + 1;
            docs.set(key, { ...doc, version, draft: structuredClone(next), published: action === 'publish' ? structuredClone(next) : doc.published });
            versions.set(key, [{ version, data: structuredClone(next), actor, action, at: new Date().toISOString() }, ...(versions.get(key) ?? [])]);
        });
        pending = operation.catch(() => undefined);
        return operation;
    };
    return { async read(key) { return structuredClone(docs.get(key) ?? empty(key)); }, save(key, expected, data, actor) { return change(key, expected, data, actor, 'save'); }, publish(key, expected, actor) { return change(key, expected, null, actor, 'publish'); }, async history(key) { return structuredClone(versions.get(key) ?? []); } };
}
export function createPostgresCmsRepository(pool: Pool): CmsRepository {
    async function change(key: string, expected: number, input: Content | null, actor: string, action: 'save' | 'publish') {
        const client = await pool.connect();
        try {
            await client.query('begin');
            await client.query('insert into admin.content_documents (key) values ($1) on conflict do nothing', [key]);
            const row = (await client.query('select * from admin.content_documents where key=$1 for update', [key])).rows[0];
            if (row.version !== expected)
                throw new Error('This page changed. Reload before saving.');
            const data = input ?? row.draft;
            if (!data)
                throw new Error('Save a draft first.');
            const version = expected + 1;
            if (action === 'publish') {
                const ids = Object.values(data as Content).filter(v => v.startsWith('/api/media/')).map(v => v.split('/').pop());
                if (ids.length) {
                    const available = await client.query('select id from admin.media_assets where id=any($1::uuid[]) and archived=false for update', [ids]);
                    if (available.rows.length !== new Set(ids).size)
                        throw new Error('A selected image is unavailable. Choose another image.');
                    await client.query('update admin.media_assets set published=true where id=any($1::uuid[])', [ids]);
                }
            }
            await client.query('update admin.content_documents set version=$2,draft=$3::jsonb,published=case when $4 then $3::jsonb else published end where key=$1', [key, version, JSON.stringify(data), action === 'publish']);
            await client.query('insert into admin.content_revisions (key,version,data,action,actor) values ($1,$2,$3,$4,$5)', [key, version, JSON.stringify(data), action, actor]);
            await client.query('commit');
        }
        catch (e) {
            await client.query('rollback');
            throw e;
        }
        finally {
            client.release();
        }
    }
    return {
        async read(key) { const row = (await pool.query('select * from admin.content_documents where key=$1', [key])).rows[0]; return row ? { key, version: row.version, draft: row.draft, published: row.published } : empty(key); },
        save: (key, expected, data, actor) => change(key, expected, data, actor, 'save'), publish: (key, expected, actor) => change(key, expected, null, actor, 'publish'),
        async history(key) { return (await pool.query('select version,data,action,actor,created_at as at from admin.content_revisions where key=$1 order by version desc limit 50', [key])).rows.map(r => ({ ...r, at: new Date(r.at).toISOString() })) as Revision[]; },
    };
}
