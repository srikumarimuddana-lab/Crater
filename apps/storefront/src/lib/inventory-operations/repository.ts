import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { memoryStateOf } from '@/lib/commerce/memory-repository';
import { pgPoolOf } from '@/lib/commerce/postgres-repository';
import type { CommerceRepository } from '@/lib/commerce/records';
import { returnCostSnapshot, type CostUnits, assertRemaining, InventoryError, requestKey, sameRequest, textValue, units, validateRule, whole, type Supplier, type PurchaseOrder, type Receipt, type Shipment, type PhysicalReturn, type PricingRule } from './model';
export type OperationalState = {
    suppliers: Supplier[];
    purchases: PurchaseOrder[];
    receipts: Receipt[];
    shipments: Shipment[];
    returns: PhysicalReturn[];
    rules: PricingRule[];
};
const empty = (): OperationalState => ({ suppliers: [], purchases: [], receipts: [], shipments: [], returns: [], rules: [] });
const tail = (id: string) => Number(id.split('/').at(-1));
export function createInventoryRepository(commerce: CommerceRepository) {
    const memory = commerce.kind === 'memory' ? memoryStateOf(commerce) : null;
    const pool = commerce.kind === 'postgres' ? pgPoolOf(commerce) : null;
    function state() { let s = memory!.ext.get('inventory-operations') as OperationalState | undefined; if (!s) {
        s = empty();
        memory!.ext.set('inventory-operations', s);
    } return s; }
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
    async function audit(c: PoolClient, staffId: number, action: string, id: string) { await c.query('insert into admin.audit_log(actor_id,action,target_type,target_id) values($1,$2,$3,$4)', [staffId, action, 'inventory-operation', id]); }
    function memoryStock(lines: Receipt['lines'], reason: 'RECEIVED' | 'RETURN_RESTOCK', staffId: number, orderId: number | null) {
        const matched = lines.map(l => ({ l, v: memory!.products.flatMap(p => p.variants).find(v => v.id === l.variantId) }));
        for (const { v } of matched)
            if (!v || v.quantity === null)
                throw new InventoryError('Stock must be tracked for every variant.');
        for (const { l, v } of matched) {
            v!.quantity! += l.quantity;
            memory!.movements.push({ id: memory!.movements.length + 1, at: new Date().toISOString(), variantId: l.variantId, sku: v!.sku, delta: l.quantity, reason, note: null, staffId, orderId, availableAfter: v!.quantity! });
        }
    }
    async function stock(c: PoolClient, lines: Receipt['lines'], reason: 'RECEIVED' | 'RETURN_RESTOCK', staffId: number, orderId: number | null) {
        for (const l of lines) {
            const r = await c.query('update commerce.variants set inventory_quantity=inventory_quantity+$2 where id=$1 and inventory_quantity is not null returning sku,inventory_quantity', [tail(l.variantId), l.quantity]);
            if (!r.rows[0])
                throw new InventoryError('Stock must be tracked for every variant.');
            await c.query('insert into commerce.inventory_movements(variant_id,sku,delta,reason,staff_id,order_id,available_after) values($1,$2,$3,$4,$5,$6,$7)', [tail(l.variantId), r.rows[0].sku, l.quantity, reason, staffId, orderId, r.rows[0].inventory_quantity]);
        }
    }
    async function replay(c: PoolClient, table: 'stock_receipts' | 'shipments' | 'physical_returns', key: string) { return (await c.query(`select * from commerce.${table} where request_key=$1`, [key])).rows[0]; }
    const receiptOf = (r: Record<string, unknown>): Receipt => ({ mode: r.mode as Receipt['mode'], key: String(r.request_key), purchaseOrderId: String(r.purchase_order_id), lines: r.lines as Receipt['lines'] });
    const shipmentOf = (r: Record<string, unknown>): Shipment => ({ key: String(r.request_key), orderId: Number(r.order_id), lines: r.lines as Shipment['lines'], carrier: String(r.carrier), trackingNumber: String(r.tracking_number) });
    const returnOf = (r: Record<string, unknown>): PhysicalReturn => ({ key: String(r.request_key), orderId: Number(r.order_id), lines: r.lines as PhysicalReturn['lines'], restock: Boolean(r.restock), reason: String(r.reason) });
    return {
        async list(): Promise<OperationalState> {
            if (memory)
                return structuredClone(state());
            const [s, p, r, h, t, d] = await Promise.all(['suppliers', 'purchase_orders', 'stock_receipts', 'shipments', 'physical_returns', 'pricing_rules'].map(table => pool!.query(`select * from commerce.${table} order by ${table === 'pricing_rules' ? 'id' : table === 'suppliers' || table === 'purchase_orders' ? 'created_at' : table === 'shipments' ? 'created_at' : 'received_at'} desc limit 500`)));
            return { suppliers: s.rows.map(r => ({ id: r.id, name: r.name, email: r.email })), purchases: p.rows.map(r => ({ id: r.id, supplierId: r.supplier_id, reference: r.reference, lines: r.lines })), receipts: r.rows.map(receiptOf), shipments: h.rows.map(shipmentOf), returns: t.rows.map(returnOf), rules: d.rows.map(r => ({ ...r.data, id: r.id, version: r.version })) };
        },
        async createSupplier(input: {
            name: string;
            email: string;
        }, staffId: number) {
            const s = { id: randomUUID(), name: textValue(input.name, 'Supplier name'), email: textValue(input.email, 'Email', 254, true) };
            if (s.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email))
                throw new InventoryError('Enter a valid supplier email.');
            if (memory) {
                state().suppliers.push(s);
                return s;
            }
            await tx(async (c) => { await c.query('insert into commerce.suppliers(id,name,email) values($1,$2,$3)', [s.id, s.name, s.email]); await audit(c, staffId, 'supplier.created', s.id); });
            return s;
        },
        async createPurchase(input: Omit<PurchaseOrder, 'id'>, staffId: number) {
            const lines = units(input.lines).map(l => ({ ...l, unitCostMinor: whole(input.lines.find(x => x.variantId === l.variantId)!.unitCostMinor, 'Unit cost', 0, 10000000) }));
            const p = { id: randomUUID(), supplierId: textValue(input.supplierId, 'Supplier ID'), reference: textValue(input.reference, 'Reference', 120), lines };
            if (memory) {
                if (!state().suppliers.some(s => s.id === p.supplierId))
                    throw new InventoryError('Supplier not found.');
                if (lines.some(l => !memory.products.some(p => p.variants.some(v => v.id === l.variantId))))
                    throw new InventoryError('Variant not found.');
                state().purchases.push(p);
                return p;
            }
            await tx(async (c) => { const vs = await c.query('select id from commerce.variants where id=any($1::int[])', [lines.map(l => tail(l.variantId))]); if (vs.rowCount !== lines.length)
                throw new InventoryError('Variant not found.'); await c.query('insert into commerce.purchase_orders(id,supplier_id,reference,lines) values($1,$2,$3,$4)', [p.id, p.supplierId, p.reference, JSON.stringify(lines)]); await audit(c, staffId, 'purchase.created', p.id); });
            return p;
        },
        async receive(input: Receipt, staffId: number) {
            const r: Receipt = { mode: input.mode, key: requestKey(input.key), purchaseOrderId: textValue(input.purchaseOrderId, 'Purchase order'), lines: units(input.lines) };
            if (!['test','live'].includes(r.mode)) throw new InventoryError('Choose test or live accounting mode for this receipt.');
            if (memory) {
                const s = state(), old = s.receipts.find(x => x.key === r.key);
                if (old) {
                    sameRequest(old, r);
                    return old;
                }
                const p = s.purchases.find(x => x.id === r.purchaseOrderId);
                if (!p)
                    throw new InventoryError('Purchase order not found.');
                assertRemaining(r.lines, p.lines, s.receipts.filter(x => x.purchaseOrderId === p.id).flatMap(x => x.lines));
                memoryStock(r.lines, 'RECEIVED', staffId, null);
                s.receipts.push(r);
                memory.ext.set(`receipt-at:${r.key}`,new Date().toISOString());
                return r;
            }
            return tx(async (c) => { const p = (await c.query('select * from commerce.purchase_orders where id=$1 for update', [r.purchaseOrderId])).rows[0]; if (!p)
                throw new InventoryError('Purchase order not found.'); const old = await replay(c, 'stock_receipts', r.key); if (old) {
                sameRequest(receiptOf(old), r);
                return r;
            } const previous = await c.query('select lines from commerce.stock_receipts where purchase_order_id=$1', [p.id]); assertRemaining(r.lines, p.lines, previous.rows.flatMap(x => x.lines)); await stock(c, r.lines, 'RECEIVED', staffId, null); await c.query('insert into commerce.stock_receipts(request_key,purchase_order_id,lines,staff_id,mode) values($1,$2,$3,$4,$5)', [r.key, r.purchaseOrderId, JSON.stringify(r.lines), staffId, r.mode]); await audit(c, staffId, 'stock.received', r.key); return r; });
        },
        async ship(input: Shipment, staffId: number) {
            const r: Shipment = { key: requestKey(input.key), orderId: whole(input.orderId, 'Order ID'), lines: units(input.lines), carrier: textValue(input.carrier, 'Carrier', 60), trackingNumber: textValue(input.trackingNumber, 'Tracking number', 60) };
            if (memory) {
                const s = state(), old = s.shipments.find(x => x.key === r.key);
                if (old) {
                    sameRequest(old, r);
                    return old;
                }
                const o = memory.orders.find(o => o.id === r.orderId);
                if (!o || !['PAID', 'PARTIALLY_REFUNDED'].includes(o.financialStatus))
                    throw new InventoryError('Only paid orders can be shipped.');
                if (o.fulfilmentStatus === 'FULFILLED')
                    throw new InventoryError('Order is already fulfilled.');
                const prev = s.shipments.filter(x => x.orderId === o.id).flatMap(x => x.lines);
                assertRemaining(r.lines, o.lines, prev);
                s.shipments.push(r);
                memory.ext.set(`shipment-at:${r.key}`, new Date().toISOString());
                memory.ext.set(`shipment-cost:${r.key}`, r.lines.map(l => ({ variantId: l.variantId, quantity: l.quantity, unitCostMinor: memory.products.flatMap(p => p.variants).find(v => v.id === l.variantId)?.costMinor ?? null })));
                if (o.lines.every(l => [...prev, ...r.lines].filter(x => x.variantId === l.variantId).reduce((n, x) => n + x.quantity, 0) >= l.quantity)) {
                    o.fulfilmentStatus = 'FULFILLED';
                    memory.fulfilments.set(o.id, { orderId: o.id, carrier: r.carrier, trackingNumber: r.trackingNumber, fulfilledAt: new Date().toISOString(), staffId });
                }
                return r;
            }
            return tx(async (c) => { const o = (await c.query('select * from commerce.orders where id=$1 for update', [r.orderId])).rows[0]; const old = await replay(c, 'shipments', r.key); if (old) {
                sameRequest(shipmentOf(old), r);
                return r;
            } if (!o || !['PAID', 'PARTIALLY_REFUNDED'].includes(o.financial_status))
                throw new InventoryError('Only paid orders can be shipped.'); if (o.fulfilment_status === 'FULFILLED')
                throw new InventoryError('Order is already fulfilled.'); const ordered = (await c.query('select variant_id as "variantId",quantity from commerce.order_lines where order_id=$1', [o.id])).rows; const prev = (await c.query('select lines from commerce.shipments where order_id=$1', [o.id])).rows.flatMap(x => x.lines); assertRemaining(r.lines, ordered as Shipment['lines'], prev); const costs = (await c.query('select id,cost_minor from commerce.variants where id=any($1::int[]) order by id for share', [r.lines.map(l => tail(l.variantId))])).rows; const snapshot = r.lines.map(l => ({ ...l, unitCostMinor: costs.find(v => Number(v.id) === tail(l.variantId))?.cost_minor ?? null })); await c.query('insert into commerce.shipments(request_key,order_id,lines,carrier,tracking_number,staff_id,cost_snapshot) values($1,$2,$3,$4,$5,$6,$7)', [r.key, r.orderId, JSON.stringify(r.lines), r.carrier, r.trackingNumber, staffId, JSON.stringify(snapshot)]); if (ordered.every(l => [...prev, ...r.lines].filter(x => x.variantId === l.variantId).reduce((n, x) => n + x.quantity, 0) >= l.quantity)) {
                await c.query("update commerce.orders set fulfilment_status='FULFILLED' where id=$1", [o.id]);
                await c.query('insert into commerce.order_fulfilments(order_id,carrier,tracking_number,fulfilled_at,staff_id) values($1,$2,$3,now(),$4)', [o.id, r.carrier, r.trackingNumber, staffId]);
            } await audit(c, staffId, 'order.shipped', r.key); return r; });
        },
        async receiveReturn(input: PhysicalReturn, staffId: number) {
            const r: PhysicalReturn = { key: requestKey(input.key), orderId: whole(input.orderId, 'Order ID'), lines: units(input.lines), restock: input.restock, reason: textValue(input.reason, 'Return reason', 500) };
            if (typeof r.restock !== 'boolean')
                throw new InventoryError('Choose whether to restock.');
            if (memory) {
                const s = state(), old = s.returns.find(x => x.key === r.key);
                if (old) {
                    sameRequest(old, r);
                    return old;
                }
                const o = memory.orders.find(o => o.id === r.orderId);
                if (!o)
                    throw new InventoryError('Order not found.');
                const shipped = o.fulfilmentStatus === 'FULFILLED' ? o.lines : s.shipments.filter(x => x.orderId === o.id).flatMap(x => x.lines);
                const previous = s.returns.filter(x => x.orderId === o.id).flatMap(x => x.lines);
                assertRemaining(r.lines, shipped, previous);
                const lots = s.shipments.filter(x => x.orderId === o.id).sort((a,b)=>String(memory.ext.get(`shipment-at:${a.key}`)??'').localeCompare(String(memory.ext.get(`shipment-at:${b.key}`)??''))||a.key.localeCompare(b.key)).flatMap(x=>(memory.ext.get(`shipment-cost:${x.key}`) as CostUnits[] | undefined)??x.lines.map(l=>({...l,unitCostMinor:null})));
                const costSnapshot = returnCostSnapshot(r.lines,lots,previous);
                if (r.restock)
                    memoryStock(r.lines, 'RETURN_RESTOCK', staffId, r.orderId);
                s.returns.push(r);
                memory.ext.set(`return-cost:${r.key}`,costSnapshot);
                memory.ext.set(`return-at:${r.key}`,new Date().toISOString());
                return r;
            }
            return tx(async (c) => { const o = (await c.query('select * from commerce.orders where id=$1 for update', [r.orderId])).rows[0]; const old = await replay(c, 'physical_returns', r.key); if (old) {
                sameRequest(returnOf(old), r);
                return r;
            } if (!o)
                throw new InventoryError('Order not found.'); const shipped = o.fulfilment_status === 'FULFILLED' ? (await c.query('select variant_id as "variantId",quantity from commerce.order_lines where order_id=$1', [o.id])).rows : (await c.query('select lines from commerce.shipments where order_id=$1', [o.id])).rows.flatMap(x => x.lines); const prev = (await c.query('select lines from commerce.physical_returns where order_id=$1', [o.id])).rows.flatMap(x => x.lines); assertRemaining(r.lines, shipped as PhysicalReturn['lines'], prev); const lots=(await c.query('select cost_snapshot,lines from commerce.shipments where order_id=$1 order by created_at,request_key',[o.id])).rows.flatMap(x=>x.cost_snapshot.length?x.cost_snapshot:x.lines.map((l:PhysicalReturn['lines'][number])=>({...l,unitCostMinor:null}))); const costSnapshot=returnCostSnapshot(r.lines,lots,prev); if (r.restock)
                await stock(c, r.lines, 'RETURN_RESTOCK', staffId, r.orderId); await c.query('insert into commerce.physical_returns(request_key,order_id,lines,restock,reason,staff_id,cost_snapshot) values($1,$2,$3,$4,$5,$6,$7)', [r.key, r.orderId, JSON.stringify(r.lines), r.restock, r.reason, staffId,JSON.stringify(costSnapshot)]); await audit(c, staffId, 'return.received', r.key); return r; });
        },
        async saveRule(input: PricingRule, staffId: number) {
            const r = validateRule(input);
            if (memory) {
                const s = state(), old = s.rules.find(x => x.id === r.id);
                if ((old?.version ?? 0) !== r.version)
                    throw new InventoryError('Rule changed. Reload before saving.');
                if (r.kind === 'discount' && s.rules.some(x => x.kind === 'discount' && x.code === r.code && x.id !== r.id))
                    throw new InventoryError('Discount code already exists.');
                const next = { ...r, version: r.version + 1 };
                s.rules = s.rules.filter(x => x.id !== r.id);
                s.rules.push(next);
                return next;
            }
            return tx(async (c) => { await c.query("select value from commerce.counters where name='product_id' for update"); const old = (await c.query('select version from commerce.pricing_rules where id=$1 for update', [r.id])).rows[0]; if ((old?.version ?? 0) !== r.version)
                throw new InventoryError('Rule changed. Reload before saving.'); if (r.kind === 'discount' && (await c.query("select id from commerce.pricing_rules where kind='discount' and data->>'code'=$1 and id<>$2", [r.code, r.id])).rowCount)
                throw new InventoryError('Discount code already exists.'); const next = { ...r, version: r.version + 1 }; await c.query('insert into commerce.pricing_rules(id,kind,version,data) values($1,$2,$3,$4) on conflict(id) do update set version=excluded.version,data=excluded.data,updated_at=now()', [r.id, r.kind, next.version, JSON.stringify(next)]); await audit(c, staffId, 'pricing.updated', r.id); return next; });
        },
    };
}
