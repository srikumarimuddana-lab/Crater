import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
export type Media = {
    id: string;
    name: string;
    alt: string;
    mime: 'image/webp';
    width: number;
    height: number;
    published: boolean;
    archived: boolean;
    createdAt: string;
};
export type MediaInput = Pick<Media, 'name' | 'alt' | 'mime' | 'width' | 'height'> & {
    content: Buffer;
};
export interface MediaRepository {
    create(input: MediaInput): Promise<Media>;
    list(): Promise<Media[]>;
    get(id: string): Promise<(Media & {
        content: Buffer;
    }) | null>;
    publish(ids: string[]): Promise<void>;
    archive(id: string): Promise<void>;
    updateDetails(id: string, data: Pick<Media, 'name' | 'alt'>, expected: Pick<Media, 'name' | 'alt'>): Promise<void>;
}
function metadataOf({ id, name, alt, mime, width, height, published, archived, createdAt }: Media): Media {
  return { id, name, alt, mime, width, height, published, archived, createdAt };
}
export function createMemoryMediaRepository(): MediaRepository {
    const assets = new Map<string, Media & {
        content: Buffer;
    }>();
    return {
        async create(input) { const asset = { ...input, id: randomUUID(), published: false, archived: false, createdAt: new Date().toISOString() }; assets.set(asset.id, asset); return metadataOf(asset); },
        async list() { return [...assets.values()].filter(a => !a.archived).map(metadataOf); },
        async get(id) { const a = assets.get(id); return a && !a.archived ? { ...a, content: Buffer.from(a.content) } : null; },
        async publish(ids) { if (ids.some(id => !assets.has(id) || assets.get(id)!.archived))
            throw new Error('A selected image is unavailable.'); for (const id of ids)
            assets.get(id)!.published = true; },
        async updateDetails(id, data, expected) {
            const asset=assets.get(id);
            if (!asset || asset.archived || asset.name!==expected.name || asset.alt!==expected.alt) throw new Error('This image changed or is unavailable. Reload before editing.');
            Object.assign(asset,data);
        },
        async archive(id) { const a = assets.get(id); if (!a)
            throw new Error('Image not found.'); if (a.published)
            throw new Error('Published images are retained so existing pages continue to work.'); a.archived = true; },
    };
}
const columns = 'id,name,alt,mime,width,height,published,archived,created_at as "createdAt"';
export function createPostgresMediaRepository(pool: Pool): MediaRepository {
    return {
        async create(input) { return (await pool.query(`insert into admin.media_assets (id,name,alt,mime,width,height,content) values ($1,$2,$3,$4,$5,$6,$7) returning ${columns}`, [randomUUID(), input.name, input.alt, input.mime, input.width, input.height, input.content])).rows[0]; },
        async list() { return (await pool.query(`select ${columns} from admin.media_assets where archived=false order by created_at desc limit 500`)).rows; },
        async get(id) { return (await pool.query(`select ${columns},content from admin.media_assets where id=$1 and archived=false`, [id])).rows[0] ?? null; },
        async publish(ids) { if (!ids.length)
            return; const c = await pool.connect(); try {
            await c.query('begin');
            const rows = await c.query('select id from admin.media_assets where id=any($1::uuid[]) and archived=false for update', [ids]);
            if (rows.rowCount !== new Set(ids).size)
                throw new Error('A selected image is unavailable.');
            await c.query('update admin.media_assets set published=true where id=any($1::uuid[])', [ids]);
            await c.query('commit');
        }
        catch (e) {
            await c.query('rollback');
            throw e;
        }
        finally {
            c.release();
        } },
        async updateDetails(id, data, expected) {
            const result=await pool.query('update admin.media_assets set name=$2,alt=$3 where id=$1 and archived=false and name=$4 and alt=$5 returning id', [id,data.name,data.alt,expected.name,expected.alt]);
            if (!result.rowCount) throw new Error('This image changed or is unavailable. Reload before editing.');
        },
        async archive(id) { const result = await pool.query('update admin.media_assets set archived=true where id=$1 and published=false returning id', [id]); if (!result.rowCount)
            throw new Error('Published images are retained; only unused uploads can be archived.'); },
    };
}
