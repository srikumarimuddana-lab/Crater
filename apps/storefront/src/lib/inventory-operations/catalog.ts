import type { CommerceRepository, ProductRecord, VariantRecord } from '@/lib/commerce/records';
import { memoryStateOf } from '@/lib/commerce/memory-repository';
import { pgPoolOf } from '@/lib/commerce/postgres-repository';
import type { PoolClient } from 'pg';
import { InventoryError, textValue, whole } from './model';
export type CreateProduct = {
    handle: string;
    title: string;
    description: string;
    productType: string;
    sku: string;
    variantTitle: string;
    priceMinor: number;
    costMinor: number | null;
};
export function validateProduct(input: CreateProduct): CreateProduct {
    const p = { ...input, title: textValue(input.title, 'Title'), description: textValue(input.description, 'Description', 5000, true), productType: textValue(input.productType, 'Product type', 100, true), sku: textValue(input.sku, 'SKU', 80), variantTitle: textValue(input.variantTitle, 'Variant title', 120) };
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.handle) || p.handle.length > 120)
        throw new InventoryError('Handle must use lowercase letters, numbers and hyphens.');
    whole(p.priceMinor, 'Price', 1, 10000000);
    if (p.costMinor !== null)
        whole(p.costMinor, 'Cost', 0, 10000000);
    return p;
}
const tail = (id: string) => Number(id.split('/').at(-1));
export function createCatalogOperations(commerce: CommerceRepository) {
    const memory = commerce.kind === 'memory' ? memoryStateOf(commerce) : null, pool = commerce.kind === 'postgres' ? pgPoolOf(commerce) : null;
    async function tx<T>(fn: (c: PoolClient) => Promise<T>) { const c = await pool!.connect(); try {
        await c.query('begin');
        const r = await fn(c);
        await c.query('commit');
        return r;
    }
    catch (e) {
        await c.query('rollback');
        throw e;
    }
    finally {
        c.release();
    } }
    async function nextId(c: PoolClient, name: string) { const table = name === 'product_id' ? 'products' : name === 'variant_id' ? 'variants' : 'collections'; return Number((await c.query(`update commerce.counters set value=greatest(value,(select coalesce(max(id),0) from commerce.${table}))+1 where name=$1 returning value`, [name])).rows[0].value); }
    async function insert(c: PoolClient, p: CreateProduct) { const id = await nextId(c, 'product_id'), vid = await nextId(c, 'variant_id'); await c.query("insert into commerce.products(id,handle,title,description,vendor,product_type,options,details,sample,status,created_at,updated_at) values($1,$2,$3,$4,'Crater',$5,$6,$7,false,'DRAFT',date_trunc('milliseconds',now()),date_trunc('milliseconds',now()))", [id, p.handle, p.title, p.description, p.productType, JSON.stringify([{ id: 'size', name: 'Size', optionValues: [{ id: p.variantTitle, name: p.variantTitle }] }]), JSON.stringify({ benefits: [], ingredients: [], howToUse: '', precautions: '' })]); await c.query("insert into commerce.variants(id,product_id,position,sku,title,price_minor,cost_minor,selected_options,inventory_quantity) values($1,$2,0,$3,$4,$5,$6,$7,0)", [vid, id, p.sku, p.variantTitle, p.priceMinor, p.costMinor, JSON.stringify([{ name: 'Size', value: p.variantTitle }])]); return id; }
    function insertMemory(p: CreateProduct) { const id = Math.max(0, ...memory!.products.map(p => tail(p.id))) + 1, vid = Math.max(0, ...memory!.products.flatMap(p => p.variants.map(v => tail(v.id)))) + 1, at = new Date().toISOString(); const v: VariantRecord = { id: `gid://crater/ProductVariant/${vid}`, sku: p.sku, title: p.variantTitle, priceMinor: p.priceMinor, costMinor: p.costMinor, compareAtMinor: null, lowStockThreshold: 5, selectedOptions: [{ name: 'Size', value: p.variantTitle }], image: null, quantity: 0 }; memory!.products.push({ id: `gid://crater/Product/${id}`, handle: p.handle, title: p.title, description: p.description, productType: p.productType, vendor: 'Crater', tags: [], options: [{ id: 'size', name: 'Size', optionValues: [{ id: p.variantTitle, name: p.variantTitle }] }], featuredImage: null, images: [], details: { benefits: [], ingredients: [], howToUse: '', precautions: '' }, sample: false, status: 'DRAFT', createdAt: at, updatedAt: at, variants: [v] }); return id; }
    return {
        async create(inputs: CreateProduct[], staffId: number) {
            if (!inputs.length || inputs.length > 100)
                throw new InventoryError('Create between 1 and 100 products.');
            const ps = inputs.map(validateProduct);
            if (new Set(ps.map(p => p.handle)).size !== ps.length || new Set(ps.map(p => p.sku)).size !== ps.length)
                throw new InventoryError('Duplicate handle or SKU in import.');
            if (memory) {
                if (ps.some(p => memory.products.some(x => x.handle === p.handle || x.variants.some(v => v.sku === p.sku))))
                    throw new InventoryError('Handle or SKU already exists.');
                return ps.map(insertMemory);
            }
            return tx(async (c) => { const ids = []; for (const p of ps)
                ids.push(await insert(c, p)); await c.query("insert into admin.audit_log(actor_id,action,target_type,changes) values($1,'catalog.created','product',$2)", [staffId, JSON.stringify({ count: { from: 0, to: ids.length } })]); return ids; });
        },
        async addVariant(productId: number, expectedUpdatedAt: string, input: {
            sku: string;
            title: string;
            priceMinor: number;
            costMinor: number | null;
        }) {
            const p = validateProduct({ handle: 'variant', description: '', productType: '', variantTitle: input.title, ...input });
            if (memory) {
                const product = memory.products.find(p => tail(p.id) === productId);
                if (!product)
                    throw new InventoryError('Product not found.');
                if (product.status === 'ACTIVE' && p.costMinor === null)
                    throw new InventoryError('Active products require a cost for every variant.');
                if (product.updatedAt !== expectedUpdatedAt)
                    throw new InventoryError('Product changed. Reload before saving.');
                if (memory.products.some(p => p.variants.some(v => v.sku === input.sku)))
                    throw new InventoryError('SKU already exists.');
                if (product.options.length !== 1 || product.options[0].name !== 'Size' || product.variants.some(v => v.selectedOptions.length !== 1 || v.selectedOptions[0].name !== 'Size'))
                    throw new InventoryError('This editor supports products with one Size option. Preserve other option combinations in a dedicated catalog import.');
                if (product.variants.some(v => v.title.trim().toLowerCase() === p.variantTitle.toLowerCase() || v.selectedOptions[0].value.trim().toLowerCase() === p.variantTitle.toLowerCase()))
                    throw new InventoryError('A variant with this Size already exists.');
                const id = Math.max(0, ...memory.products.flatMap(p => p.variants.map(v => tail(v.id)))) + 1;
                product.variants.push({ id: `gid://crater/ProductVariant/${id}`, sku: p.sku, title: p.variantTitle, priceMinor: p.priceMinor, costMinor: p.costMinor, quantity: 0, compareAtMinor: null, lowStockThreshold: 5, image: null, selectedOptions: [{ name: 'Size', value: p.variantTitle }] });
                product.options = [{ id: 'size', name: 'Size', optionValues: product.variants.map(v => ({ id: v.id, name: v.title })) }];
                product.updatedAt = new Date(Math.max(Date.now(), Date.parse(product.updatedAt) + 1)).toISOString();
                return;
            }
            await tx(async c => {
                const product = (await c.query('select updated_at,status,options from commerce.products where id=$1 for update', [productId])).rows[0];
                if (!product || new Date(product.updated_at).toISOString() !== expectedUpdatedAt) throw new InventoryError('Product changed. Reload before saving.');
                if (product.status === 'ACTIVE' && p.costMinor === null) throw new InventoryError('Active products require a cost for every variant.');
                const existing = (await c.query('select title,selected_options from commerce.variants where product_id=$1 order by id for update', [productId])).rows;
                if (product.options.length !== 1 || product.options[0].name !== 'Size' || existing.some(v => v.selected_options.length !== 1 || v.selected_options[0].name !== 'Size')) throw new InventoryError('This editor supports products with one Size option. Preserve other option combinations in a dedicated catalog import.');
                if (existing.some(v => v.title.trim().toLowerCase() === p.variantTitle.toLowerCase() || v.selected_options[0].value.trim().toLowerCase() === p.variantTitle.toLowerCase())) throw new InventoryError('A variant with this Size already exists.');
                const id = await nextId(c, 'variant_id');
                await c.query('insert into commerce.variants(id,product_id,position,sku,title,price_minor,cost_minor,selected_options,inventory_quantity) select $1,$2,coalesce(max(position),-1)+1,$3,$4,$5,$6,$7,0 from commerce.variants where product_id=$2', [id,productId,p.sku,p.variantTitle,p.priceMinor,p.costMinor,JSON.stringify([{name:'Size',value:p.variantTitle}])]);
                const titles = [...existing.map(v => v.title), p.variantTitle];
                await c.query(`update commerce.products set options=$2,updated_at=greatest(date_trunc('milliseconds',clock_timestamp()),updated_at+interval '1 millisecond') where id=$1`, [productId,JSON.stringify([{id:'size',name:'Size',optionValues:titles.map(title=>({id:title,name:title}))}])]);
            });
        },
        async images(productId: number, expectedUpdatedAt: string, images: ProductRecord['images']) {
            if (images.length > 20 || images.some(i => !/^\/api\/media\/[a-f0-9-]{36}$/.test(i.url) || !i.altText?.trim()))
                throw new InventoryError('Choose up to 20 uploaded images and add alt text.');
            if (memory) {
                const p = memory.products.find(p => tail(p.id) === productId);
                if (!p || p.updatedAt !== expectedUpdatedAt)
                    throw new InventoryError('Product changed. Reload before saving.');
                if (p.status === 'ACTIVE' && !images.length) throw new InventoryError('Active products need an image.');
                p.images = structuredClone(images);
                p.featuredImage = images[0] ?? null;
                p.updatedAt = new Date(Math.max(Date.now(), Date.parse(p.updatedAt) + 1)).toISOString();
                return;
            }
            await tx(async c => {
                const product = (await c.query('select status,updated_at from commerce.products where id=$1 for update', [productId])).rows[0];
                if (!product || new Date(product.updated_at).toISOString() !== expectedUpdatedAt) throw new InventoryError('Product changed. Reload before saving.');
                if (product.status === 'ACTIVE' && !images.length) throw new InventoryError('Active products need an image.');
                const ids = images.map(i => i.url.split('/').at(-1));
                if (ids.length) {
                    const assets = await c.query('select id from admin.media_assets where id=any($1::uuid[]) and archived=false order by id for update', [ids]);
                    if (assets.rowCount !== new Set(ids).size) throw new InventoryError('A selected product image is unavailable.');
                    if (product.status === 'ACTIVE') await c.query('update admin.media_assets set published=true where id=any($1::uuid[])', [ids]);
                }
                await c.query(`update commerce.products set images=$2,featured_image=$3,updated_at=greatest(date_trunc('milliseconds',clock_timestamp()),updated_at+interval '1 millisecond') where id=$1`, [productId, JSON.stringify(images), JSON.stringify(images[0] ?? null)]);
            });
        },
        async collections() { if (memory)
            return memory.collections.map(c => ({ ...structuredClone(c), version: Number(memory.ext.get(`collection-version:${c.id}`) ?? 1) })); return (await pool!.query('select c.*,coalesce(array_agg(p.handle order by cp.position) filter(where p.id is not null),\'{}\') as handles from commerce.collections c left join commerce.collection_products cp on cp.collection_id=c.id left join commerce.products p on p.id=cp.product_id group by c.id order by c.title')).rows.map(c => ({ id: `gid://crater/Collection/${c.id}`, handle: c.handle, title: c.title, description: c.description, productHandles: c.handles as string[], version: c.version as number })); },
        async saveCollection(input: {
            id: number | null;
            version: number;
            handle: string;
            title: string;
            description: string;
            productHandles: string[];
        }) {
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.handle))
                throw new InventoryError('Invalid collection handle.');
            textValue(input.title, 'Title');
            textValue(input.description, 'Description', 5000, true);
            if (input.productHandles.length > 200 || new Set(input.productHandles).size !== input.productHandles.length)
                throw new InventoryError('Choose up to 200 unique products.');
            if (memory) {
                const old = memory.collections.find(c => tail(c.id) === input.id);
                if (input.id && (!old || Number(memory.ext.get(`collection-version:${old.id}`) ?? 1) !== input.version))
                    throw new InventoryError('Collection changed. Reload before saving.');
                if (input.productHandles.some(h => !memory.products.some(p => p.handle === h)))
                    throw new InventoryError('Product handle not found.');
                if (memory.collections.some(c => c.handle === input.handle && c !== old))
                    throw new InventoryError('Collection handle already exists.');
                const id = old?.id ?? `gid://crater/Collection/${Math.max(0, ...memory.collections.map(c => tail(c.id))) + 1}`;
                const next = { id, handle: input.handle, title: input.title, description: input.description, productHandles: input.productHandles };
                if (old)
                    Object.assign(old, next);
                else
                    memory.collections.push(next);
                memory.ext.set(`collection-version:${id}`, input.version + 1);
                return;
            }
            await tx(async (c) => { let id = input.id; if (id) {
                const old = (await c.query('select version from commerce.collections where id=$1 for update', [id])).rows[0];
                if (old?.version !== input.version)
                    throw new InventoryError('Collection changed. Reload before saving.');
                await c.query('update commerce.collections set handle=$2,title=$3,description=$4,version=version+1 where id=$1', [id, input.handle, input.title, input.description]);
            }
            else {
                id = await nextId(c, 'collection_id');
                await c.query('insert into commerce.collections(id,handle,title,description) values($1,$2,$3,$4)', [id, input.handle, input.title, input.description]);
            } const rows = (await c.query('select id,handle from commerce.products where handle=any($1::text[])', [input.productHandles])).rows; if (rows.length !== input.productHandles.length)
                throw new InventoryError('Product handle not found.'); await c.query('delete from commerce.collection_products where collection_id=$1', [id]); for (const [position, h] of input.productHandles.entries())
                await c.query('insert into commerce.collection_products(collection_id,product_id,position) values($1,$2,$3)', [id, rows.find(r => r.handle === h)!.id, position]); });
        },
    };
}
/** RFC4180 subset: quoted commas/newlines and doubled quotes; exact fixed columns. */
export function parseCatalogCsv(csv: string): CreateProduct[] {
    if (csv.length > 500000)
        throw new InventoryError('CSV is too large.');
    const rows: string[][] = [];
    let row: string[] = [], cell = '', quoted = false, closed = false;
    for (let i = 0; i < csv.length; i++) {
        const ch = csv[i];
        if (quoted) {
            if (ch === '"') {
                if (csv[i + 1] === '"') {
                    cell += '"';
                    i++;
                }
                else {
                    quoted = false;
                    closed = true;
                }
            }
            else
                cell += ch;
        }
        else if (ch === '"') {
            if (cell || closed)
                throw new InventoryError('Invalid CSV quotes.');
            quoted = true;
        }
        else if (ch === ',' || ch === '\n') {
            row.push(cell.replace(/\r$/, ''));
            cell = '';
            closed = false;
            if (ch === '\n') {
                rows.push(row);
                row = [];
            }
        }
        else {
            if (closed && ch !== '\r')
                throw new InventoryError('Unexpected text after quoted CSV field.');
            cell += ch;
        }
    }
    if (quoted)
        throw new InventoryError('Unclosed CSV quote.');
    if (cell || row.length) {
        row.push(cell.replace(/\r$/, ''));
        rows.push(row);
    }
    if (rows[0]?.join(',') !== 'handle,title,description,productType,sku,variantTitle,priceMinor,costMinor')
        throw new InventoryError('CSV header must match the export.');
    return rows.slice(1).filter(r => r.some(Boolean)).map(r => { if (r.length !== 8)
        throw new InventoryError('Every CSV row needs eight columns.'); if (r.some(v => /^[=+@\t\r]/.test(v)))
        throw new InventoryError('Formula-leading text is not accepted.'); return validateProduct({ handle: r[0], title: r[1], description: r[2], productType: r[3], sku: r[4], variantTitle: r[5], priceMinor: Number(r[6]), costMinor: r[7] === '' ? null : Number(r[7]) }); });
}
export function exportCatalogCsv(products: ProductRecord[]) { const cell = (v: unknown) => `"${String(v ?? '').replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""')}"`; return ['handle,title,description,productType,sku,variantTitle,priceMinor,costMinor', ...products.flatMap(p => p.variants.map(v => [p.handle, p.title, p.description, p.productType, v.sku, v.title, v.priceMinor, v.costMinor].map(cell).join(',')))].join('\r\n'); }
