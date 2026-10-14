import { createMemoryAdminRepository } from '@/lib/admin/memory-repository';
import { createAdminServices } from '@/lib/admin/services';
import { sessionFor } from './admin/helpers';
import { describe, expect, it } from 'vitest';
import { createMemoryRepository, memoryStateOf } from '@/lib/commerce/memory-repository';
import type { OrderRecord } from '@/lib/commerce/records';
import { createInventoryRepository } from '@/lib/inventory-operations/repository';
import { createCatalogOperations, parseCatalogCsv, exportCatalogCsv } from '@/lib/inventory-operations/catalog';
import { sameRequest, returnCostSnapshot, calculatePricing, type PricingRule } from '@/lib/inventory-operations/model';
const product = { handle: 'test-product', title: 'Test product', description: 'A product', productType: 'Oil', sku: 'TEST-1', variantTitle: '30 ml', priceMinor: 1000, costMinor: 200 };
async function setup() { const commerce = createMemoryRepository({ seed: { products: [], collections: [] } }), catalog = createCatalogOperations(commerce); await catalog.create([product], 1); const repo = createInventoryRepository(commerce), supplier = await repo.createSupplier({ name: 'Supplier', email: '' }, 1), purchase = await repo.createPurchase({ supplierId: supplier.id, reference: 'PO-1', lines: [{ variantId: 'gid://crater/ProductVariant/1', quantity: 10, unitCostMinor: 200 }] }, 1); return { commerce, catalog, repo, purchase, state: memoryStateOf(commerce) }; }
function order(id = 1): OrderRecord { return { id, number: 1000 + id, checkoutId: 'checkout', stripeSessionId: 'session', email: null, financialStatus: 'PAID', subtotalMinor: 3000, shippingMinor: 0, taxMinor: 0, totalMinor: 3000, reviewFlags: [], processedAt: new Date().toISOString(), lines: [{ variantId: 'gid://crater/ProductVariant/1', quantity: 3, title: 'Product', variantTitle: '30 ml', sku: 'TEST-1', unitMinor: 1000 }], taxLines: [], taxProvince: 'SK', shippingProvince: 'SK', fulfilmentStatus: 'UNFULFILLED', shippingAddress: null, packingInstructions: null, internalNotes: null }; }
describe('inventory operations', () => {
    it('receives once under concurrent replay with one stock ledger movement', async () => { const { repo, purchase, state } = await setup(); const receipt = { mode: 'test' as const, key: 'receipt-123', purchaseOrderId: purchase.id, lines: [{ variantId: 'gid://crater/ProductVariant/1', quantity: 4 }] }; await Promise.all(Array.from({ length: 5 }, () => repo.receive(receipt, 1))); expect(state.products[0].variants[0].quantity).toBe(4); expect(state.movements).toHaveLength(1); expect((await repo.list()).receipts).toHaveLength(1); await expect(repo.receive({ ...receipt, lines: [{ variantId: receipt.lines[0].variantId, quantity: 2 }] }, 1)).rejects.toThrow('different data'); });
    it('prevents over-receipt and leaves stock unchanged', async () => { const { repo, purchase, state } = await setup(); await expect(repo.receive({ mode: 'test', key: 'receipt-123', purchaseOrderId: purchase.id, lines: [{ variantId: 'gid://crater/ProductVariant/1', quantity: 11 }] }, 1)).rejects.toThrow('remaining'); expect(state.products[0].variants[0].quantity).toBe(0); expect(state.movements).toHaveLength(0); });
    it('partial shipment is replay safe and full shipment completes order without another stock decrement', async () => { const { repo, state } = await setup(); state.orders.push(order()); const first = { key: 'shipment-1', orderId: 1, lines: [{ variantId: 'gid://crater/ProductVariant/1', quantity: 1 }], carrier: 'Post', trackingNumber: 'TRACK1' }; await repo.ship(first, 1); await repo.ship(first, 1); expect(state.orders[0].fulfilmentStatus).toBe('UNFULFILLED'); await expect(repo.ship({ ...first, key: 'shipment-2', lines: [{ variantId: first.lines[0].variantId, quantity: 3 }] }, 1)).rejects.toThrow('remaining'); await repo.ship({ ...first, key: 'shipment-2', lines: [{ variantId: first.lines[0].variantId, quantity: 2 }] }, 1); expect(state.orders[0].fulfilmentStatus).toBe('FULFILLED'); expect(state.movements).toHaveLength(0); });
    it('physical returns require shipped goods and explicit restock, cannot duplicate', async () => { const { repo, state } = await setup(); state.orders.push(order()); const r = { key: 'return-123', orderId: 1, lines: [{ variantId: 'gid://crater/ProductVariant/1', quantity: 1 }], reason: 'Inspected', restock: true }; await expect(repo.receiveReturn(r, 1)).rejects.toThrow('remaining'); await repo.ship({ key: 'shipment-123', orderId: 1, lines: r.lines, carrier: 'Post', trackingNumber: 'TRACK' }, 1); await repo.receiveReturn(r, 1); await repo.receiveReturn(r, 1); expect(state.products[0].variants[0].quantity).toBe(1); expect(state.movements[0].reason).toBe('RETURN_RESTOCK'); await expect(repo.receiveReturn({ ...r, key: 'return-234' }, 1)).rejects.toThrow('remaining'); });
    it('new products are drafts and failed import is atomic', async () => { const { catalog, state } = await setup(); expect(state.products[0].status).toBe('DRAFT'); expect(state.products[0].variants[0].quantity).toBe(0); await expect(catalog.create([{ ...product, handle: 'new-product', sku: 'NEW' }, product], 1)).rejects.toThrow('already exists'); expect(state.products).toHaveLength(1); });
    it('stale variants and collection editors conflict', async () => { const { catalog, state } = await setup(); await expect(catalog.addVariant(1, '2000-01-01T00:00:00Z', { sku: 'T2', title: '60 ml', priceMinor: 2000, costMinor: null })).rejects.toThrow('changed'); await catalog.saveCollection({ id: null, version: 0, handle: 'oils', title: 'Oils', description: '', productHandles: [product.handle] }); await expect(catalog.saveCollection({ id: 1, version: 0, handle: 'oils', title: 'Oops', description: '', productHandles: [] })).rejects.toThrow('changed'); expect(state.collections[0].title).toBe('Oils'); });
    it('validates exact CSV columns and formula-leading cells', () => { const header = 'handle,title,description,productType,sku,variantTitle,priceMinor,costMinor\n'; expect(parseCatalogCsv(header + 'test,"Title, here",Description,Oil,SKU,30 ml,1234,200')[0].title).toBe('Title, here'); expect(() => parseCatalogCsv(header + 'test,=BAD,Description,Oil,SKU,30 ml,1234,200')).toThrow('Formula'); expect(() => parseCatalogCsv(header + 'test,"bad')).toThrow('Unclosed'); });
    it('escapes formula-leading export text', async () => { const { state } = await setup(); state.products[0].title = '=malicious'; expect(exportCatalogCsv(state.products)).toContain('"\'=malicious"'); });
    it('shipping and discounts use integer cents, thresholds and expiry', () => { const rules: PricingRule[] = [{ id: 'ship', kind: 'shipping', version: 1, active: true, name: 'Post', amountMinor: 800, freeAboveMinor: 2000, provinces: ['SK'] }, { id: 'sale', kind: 'discount', version: 1, active: true, code: 'SAVE10', percent: 10, minimumMinor: 1000, startsAt: null, endsAt: '2026-10-20T00:00:00Z' }]; expect(calculatePricing(rules, 2200, 'SK', 'SAVE10', new Date('2026-10-14'))).toMatchObject({ discountMinor: 220, merchandiseMinor: 1980, shipping: { amountMinor: 800 } }); expect(() => calculatePricing(rules, 2200, 'SK', 'SAVE10', new Date('2026-10-21'))).toThrow('unavailable'); });
    it('pricing updates use version checks and unique codes', async () => { const { repo } = await setup(); const r: PricingRule = { id: 'sale', kind: 'discount', version: 0, active: true, code: 'SAVE10', percent: 10, minimumMinor: 0, startsAt: null, endsAt: null }; await repo.saveRule(r, 1); await expect(repo.saveRule(r, 1)).rejects.toThrow('changed'); await expect(repo.saveRule({ ...r, id: 'sale2' }, 1)).rejects.toThrow('already exists'); });
    it('duplicate variant options and non-Size catalogs are rejected before mutation', async () => {
        const { catalog, state } = await setup();
        const p = state.products[0], at = p.updatedAt;
        await expect(catalog.addVariant(1, at, {sku:'NEW-SKU',title:'30 ml',priceMinor:2000,costMinor:300})).rejects.toThrow('already exists');
        expect(p.variants).toHaveLength(1);
        p.options = [{id:'scent',name:'Scent',optionValues:[{id:'rose',name:'Rose'}]}];
        await expect(catalog.addVariant(1, at, {sku:'NEW-SKU',title:'60 ml',priceMinor:2000,costMinor:300})).rejects.toThrow('one Size');
        expect(p.options[0].name).toBe('Scent');
    });
    it('active checkout holds reduce available stock and block destructive adjustments', async () => {
        const { commerce, state } = await setup();
        const now = new Date('2026-10-14T12:00:00Z'), variant = state.products[0].variants[0];
        variant.quantity = 5;
        state.reservations.push({checkoutId:'hold',variantId:variant.id,quantity:3,expiresAt:'2026-10-14T12:30:00Z',status:'active'});
        state.orders.push(order());
        const admin = createMemoryAdminRepository(commerce);
        const services = createAdminServices({admin,commerce,config:{timezone:'UTC'},now:()=>now,getSession:async()=>sessionFor({id:1,email:'owner@test.invalid',role:'OWNER'})});
        expect((await services.inventory.levels())[0]).toMatchObject({available:2,reserved:3,committed:3,onHand:8});
        expect((await services.products.get(state.products[0].id))?.variants[0]).toMatchObject({available:2,reserved:3,committed:3,onHand:8});
        const rejected=await services.inventory.adjust({variantId:variant.id,delta:-3,reason:'DAMAGED'});
        expect(rejected.userErrors[0].message).toContain('checkout holds');
        expect(variant.quantity).toBe(5);
        expect((await services.inventory.adjust({variantId:variant.id,delta:-2,reason:'DAMAGED'})).userErrors).toEqual([]);
        expect(variant.quantity).toBe(3);
    });
    it('receipt accounting mode must be explicit and replay cannot change it', async () => {
        const {repo,purchase} = await setup();
        const r = {key:'receipt-mode',purchaseOrderId:purchase.id,lines:[{variantId:'gid://crater/ProductVariant/1',quantity:1}],mode:'test' as const};
        await expect(repo.receive({...r,mode:'' as 'test'},1)).rejects.toThrow('Choose test or live');
        await repo.receive(r,1);
        await expect(repo.receive({...r,mode:'live'},1)).rejects.toThrow('different data');
    });
    it('physical return cost uses original FIFO shipment lots, preserving unknown historic cost', () => {
        const variantId='gid://crater/ProductVariant/1';
        const lots=[{variantId,quantity:2,unitCostMinor:100},{variantId,quantity:2,unitCostMinor:200}];
        expect(returnCostSnapshot([{variantId,quantity:2}],lots,[{variantId,quantity:1}])).toEqual([{variantId,quantity:1,unitCostMinor:100},{variantId,quantity:1,unitCostMinor:200}]);
        expect(returnCostSnapshot([{variantId,quantity:1}],[],[])).toEqual([{variantId,quantity:1,unitCostMinor:null}]);
    });
    it('compares replay data semantically after JSONB reorders object keys', () => { expect(() => sameRequest({lines:[{quantity:1,variantId:'v'}],key:'receipt'}, {key:'receipt',lines:[{variantId:'v',quantity:1}]})).not.toThrow(); });
});
