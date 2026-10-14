'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import type { Capability } from '@/lib/admin/types';
import { getRepository } from '@/lib/commerce/repository-factory';
import { createInventoryRepository } from '@/lib/inventory-operations/repository';
import { createCatalogOperations, parseCatalogCsv } from '@/lib/inventory-operations/catalog';
import { InventoryError, type Units, type PricingRule } from '@/lib/inventory-operations/model';
import type { FormState } from '@/components/admin/form-state';
import { getMediaRepository, publishImages } from '@/lib/media';
const text = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const num = (fd: FormData, k: string) => Number(text(fd, k));
function lines(fd: FormData): Units[] { return text(fd, 'lines').split(/\r?\n/).filter(Boolean).map(row => { const [id, q] = row.split(',').map(v => v.trim()); return { variantId: id.startsWith('gid:') ? id : `gid://crater/ProductVariant/${id}`, quantity: Number(q) }; }); }
async function run(fd: FormData, cap: Capability, fn: (staff: number) => Promise<void>): Promise<FormState> { await requireAdmin(cap); try {
    const s = await requireAdmin(cap);
    await fn(Number(s.staff.id.split('/').at(-1)));
    for (const path of ['/admin/products', '/admin/collections', '/admin/suppliers', '/admin/purchasing', '/admin/shipments', '/admin/returns', '/admin/settings/shipping', '/admin/inventory', '/admin/orders', '/collections'])
        revalidatePath(path);
    return { status: 'success', errors: [], message: 'Saved.' };
}
catch (e) {
    return { status: 'error', errors: [], message: e instanceof InventoryError ? e.message : 'Could not save. Check for duplicate records or unavailable storage.', values: Object.fromEntries([...fd.entries()].filter((x): x is [
            string,
            string
        ] => typeof x[1] === 'string')) };
} }
export async function supplierAction(_: FormState, fd: FormData) { return run(fd, 'products:write', async (staff) => { await (createInventoryRepository(await getRepository())).createSupplier({ name: text(fd, 'name'), email: text(fd, 'email') }, staff); }); }
export async function purchaseAction(_: FormState, fd: FormData) { return run(fd, 'products:write', async (staff) => { await createInventoryRepository(await getRepository()).createPurchase({ supplierId: text(fd, 'supplierId'), reference: text(fd, 'reference'), lines: lines(fd).map(l => ({ ...l, unitCostMinor: num(fd, 'unitCostMinor') })) }, staff); }); }
export async function receiptAction(_: FormState, fd: FormData) { return run(fd, 'inventory:adjust', async (staff) => { await createInventoryRepository(await getRepository()).receive({ mode: text(fd, 'mode') as 'test' | 'live', key: text(fd, 'key'), purchaseOrderId: text(fd, 'purchaseOrderId'), lines: lines(fd) }, staff); }); }
export async function shipmentAction(_: FormState, fd: FormData) { return run(fd, 'orders:fulfil', async (staff) => { await createInventoryRepository(await getRepository()).ship({ key: text(fd, 'key'), orderId: num(fd, 'orderId'), lines: lines(fd), carrier: text(fd, 'carrier'), trackingNumber: text(fd, 'trackingNumber') }, staff); }); }
export async function returnAction(_: FormState, fd: FormData) { return run(fd, 'products:write', async (staff) => { await createInventoryRepository(await getRepository()).receiveReturn({ key: text(fd, 'key'), orderId: num(fd, 'orderId'), lines: lines(fd), reason: text(fd, 'reason'), restock: text(fd, 'restock') === 'yes' }, staff); }); }
export async function pricingAction(_: FormState, fd: FormData) { return run(fd, 'products:write', async (staff) => { const common = { id: text(fd, 'id'), version: num(fd, 'version'), active: text(fd, 'active') === 'yes' }; const r: PricingRule = text(fd, 'kind') === 'discount' ? { ...common, kind: 'discount', code: text(fd, 'code').toUpperCase(), percent: num(fd, 'percent'), minimumMinor: num(fd, 'minimumMinor'), startsAt: text(fd, 'startsAt') || null, endsAt: text(fd, 'endsAt') || null } : { ...common, kind: 'shipping', name: text(fd, 'name'), amountMinor: num(fd, 'amountMinor'), freeAboveMinor: text(fd, 'freeAboveMinor') ? num(fd, 'freeAboveMinor') : null, provinces: text(fd, 'provinces').split(',').map(p => p.trim()).filter(Boolean) }; await createInventoryRepository(await getRepository()).saveRule(r, staff); }); }
export async function createProductAction(_: FormState, fd: FormData) { return run(fd, 'products:write', async (staff) => { const ids = await createCatalogOperations(await getRepository()).create([{ handle: text(fd, 'handle'), title: text(fd, 'title'), description: text(fd, 'description'), productType: text(fd, 'productType'), sku: text(fd, 'sku'), variantTitle: text(fd, 'variantTitle'), priceMinor: num(fd, 'priceMinor'), costMinor: text(fd, 'costMinor') ? num(fd, 'costMinor') : null }], staff); revalidatePath(`/admin/products/${ids[0]}`); }); }
export async function importCatalogAction(_: FormState, fd: FormData) { return run(fd, 'products:write', async (staff) => { await createCatalogOperations(await getRepository()).create(parseCatalogCsv(text(fd, 'csv')), staff); }); }
export async function variantAction(_: FormState, fd: FormData) { return run(fd, 'products:write', async () => { await createCatalogOperations(await getRepository()).addVariant(num(fd, 'productId'), text(fd, 'expectedUpdatedAt'), { sku: text(fd, 'sku'), title: text(fd, 'title'), priceMinor: num(fd, 'priceMinor'), costMinor: text(fd, 'costMinor') ? num(fd, 'costMinor') : null }); revalidatePath(`/admin/products/${num(fd, 'productId')}`); }); }
export async function productImagesAction(_: FormState, fd: FormData) { return run(fd, 'products:write', async () => { const commerce = await getRepository(); const p = (await commerce.listProducts({ includeInactive: true })).find(p => p.id === `gid://crater/Product/${num(fd, 'productId')}`); if (!p)
    throw new InventoryError('Product not found.'); if (p.updatedAt !== text(fd, 'expectedUpdatedAt'))
    throw new InventoryError('Product changed. Reload before saving.'); const ids = text(fd, 'images').split(/\r?\n/).filter(Boolean); const repo = await getMediaRepository(); const images = []; for (const id of ids) {
    const m = await repo.get(id.replace('/api/media/', ''));
    if (!m || m.archived)
        throw new InventoryError('Choose a ready uploaded image.');
    images.push({ url: `/api/media/${m.id}`, altText: m.alt, width: m.width, height: m.height, placeholder: false });
} if (p.status === 'ACTIVE' && !images.length)
    throw new InventoryError('Active products need an image.'); if (p.status === 'ACTIVE') await requireAdmin('products:publish');
    await createCatalogOperations(commerce).images(num(fd, 'productId'), text(fd, 'expectedUpdatedAt'), images);
    if (p.status === 'ACTIVE' && commerce.kind === 'memory') await publishImages(images.map(i => i.url)); revalidatePath(`/admin/products/${num(fd, 'productId')}`); revalidatePath(`/products/${p.handle}`); }); }
export async function collectionAction(_: FormState, fd: FormData) { return run(fd, 'products:write', async () => { await createCatalogOperations(await getRepository()).saveCollection({ id: num(fd, 'id') || null, version: num(fd, 'version'), handle: text(fd, 'handle'), title: text(fd, 'title'), description: text(fd, 'description'), productHandles: text(fd, 'productHandles').split(/\r?\n/).map(x => x.trim()).filter(Boolean) }); }); }
