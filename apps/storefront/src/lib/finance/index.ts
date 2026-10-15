import 'server-only';
import { getRepository } from '@/lib/commerce/repository-factory';
import { memoryStateOf } from '@/lib/commerce/memory-repository';
import { pgPoolOf, toOrderRecord } from '@/lib/commerce/postgres-repository';
import type { CommerceRepository, OrderRecord } from '@/lib/commerce/records';
import { createMemoryFinanceRepository, createPostgresFinanceRepository } from './repository';
import { createFinance } from './service';
import { stripeRefundProvider, stripeForMode } from './provider';
import type { Mode, Payment, ProviderRefund } from './types';
export * from './types';
export { trialBalance, refundable, ledgerCsv } from './service';
const instances = new WeakMap<CommerceRepository, ReturnType<typeof createFinance>>();
export async function getFinance() {
    const commerce = await getRepository();
    let service = instances.get(commerce);
    if (service)
        return service;
    let memory;
    try {
        memory = memoryStateOf(commerce);
    }
    catch { }
    if (memory) {
        const key = 'finance:repository';
        let repo = memory.ext.get(key) as ReturnType<typeof createMemoryFinanceRepository> | undefined;
        if (!repo) {
            repo = createMemoryFinanceRepository();
            memory.ext.set(key, repo);
        }
        service = createFinance({ snapshot: m => repo!.snapshot(m), transaction: async (m, fn) => {
                const result = await repo!.transaction(m, fn);
                const state = await repo!.snapshot(m);
                for (const p of state.payments) {
                    const total = state.refunds.filter(r => r.paymentId === p.id && r.status === 'succeeded').reduce((n, r) => n + r.amountMinor, 0);
                    const order = memory.orders.find((o: OrderRecord) => o.id === p.orderId);
                    if (order && total > 0)
                        order.financialStatus = total >= p.totalMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
                }
                return result;
            } }, stripeRefundProvider);
    }
    else
        service = createFinance(createPostgresFinanceRepository(pgPoolOf(commerce)), stripeRefundProvider);
    instances.set(commerce, service);
    return service;
}
export function modeForSession(id: string): Mode | null { return id.startsWith('cs_test_') ? 'test' : id.startsWith('cs_live_') ? 'live' : null; }
export async function postOrder(order: OrderRecord, options?: {
    mode: Mode;
    currency?: string;
}) {
    const detected = modeForSession(order.stripeSessionId);
    const mode = options?.mode ?? detected;
    if (detected && mode !== detected)
        throw new Error('Order mode conflicts with Stripe session mode.');
    if (!mode)
        throw new Error('Order payment mode is unknown; reconcile Stripe before backfill.');
    if (!['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.financialStatus))
        return;
    const p: Payment = { id: `order:${order.id}`, orderId: order.id, orderNumber: order.number, sessionId: order.stripeSessionId, mode, currency: options?.currency ?? 'CAD', subtotalMinor: order.subtotalMinor, shippingMinor: order.shippingMinor, taxMinor: order.taxMinor, totalMinor: order.totalMinor, occurredAt: order.processedAt };
    return (await getFinance()).postOrder(p);
}
export async function postRefund(refund: ProviderRefund) { return (await getFinance()).postRefund(refund); }
/** Durable catch-up: deterministic event keys make every scan safe across restarts.
 * Unknown legacy mode is excluded; it is never inferred from today's environment key.
 */
export async function syncFinanceOrders(options: {
    dryRun?: boolean;
} = {}) {
    const repo = await getRepository();
    let orders: OrderRecord[];
    let memory;
    const currencies = new Map<number, string>();
    try {
        memory = memoryStateOf(repo);
    }
    catch { }
    if (memory)
        orders = memory.orders;
    else {
        const result = await pgPoolOf(repo).query("select * from commerce.orders where financial_status in ('PAID','PARTIALLY_REFUNDED','REFUNDED') order by id");
        orders = result.rows.map(row => { currencies.set(Number(row.id), String(row.currency)); return toOrderRecord(row, []); });
    }
    const f = await getFinance();
    const snapshots = { test: await f.snapshot('test'), live: await f.snapshot('live') };
    const result = { scanned: 0, posted: 0, existing: 0, unknownMode: 0, errors: [] as {
            orderId: number;
            message: string;
        }[] };
    for (const order of orders) {
        if (!['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.financialStatus))
            continue;
        result.scanned++;
        const mode = modeForSession(order.stripeSessionId);
        if (!mode) {
            result.unknownMode++;
            continue;
        }
        if (snapshots[mode].payments.some(p => p.orderId === order.id)) {
            result.existing++;
            continue;
        }
        if (options.dryRun) {
            result.posted++;
            continue;
        }
        try {
            await postOrder(order, { mode, currency: currencies.get(order.id) ?? 'CAD' });
            result.posted++;
        }
        catch (e) {
            result.errors.push({ orderId: order.id, message: e instanceof Error ? e.message : 'Posting failed' });
        }
    }
    return result;
}
/** Reconciles externally created refunds and real Stripe balance fees/payouts.
 * Unsupported balance transaction types are returned for investigation, never sales.
 */
export async function reconcileStripe(mode: Mode) {
    const f = await getFinance(), s = await f.snapshot(mode), stripe = stripeForMode(mode);
    // Resume only requests never submitted; submitted/unknown operations are read-only reconciled.
    for (const refund of s.refunds.filter(r => r.status === 'requested'))
        await f.submitRefund(mode, refund.id);
    let refunds = 0, movements = 0;
    const unresolved: {
        id: string;
        type: string;
        amount: number;
    }[] = [];
    for (const p of s.payments)
        refunds += await f.reconcilePayment(mode, p.id);
    for await (const b of stripe.balanceTransactions.list({ limit: 100 })) {
        if (b.currency.toUpperCase() !== 'CAD') {
            unresolved.push({ id: b.id, type: `${b.type}:${b.currency}`, amount: b.amount });
            await f.recordReconciliation(mode, { id: b.id, type: b.type, amountMinor: b.amount, feeMinor: b.fee, currency: b.currency.toUpperCase(), occurredAt: new Date(b.created * 1000).toISOString(), status: 'review', message: 'Currency is not configured.' });
            continue;
        }
        const base = { id: b.id, mode, currency: 'CAD', occurredAt: new Date(b.created * 1000).toISOString() };
        if (b.fee > 0) {
            await f.postMovement({ ...base, kind: 'fee', amountMinor: b.fee });
            movements++;
        }
        if (b.type === 'payout' && b.amount < 0) {
            await f.postMovement({ ...base, kind: 'payout', amountMinor: -b.amount });
            movements++;
        }
        else if (['payout_cancel', 'payout_failure'].includes(b.type) && b.amount > 0) {
            await f.postMovement({ ...base, kind: 'payout_reversal', amountMinor: b.amount });
            movements++;
        }
        else if (!['charge', 'payment', 'refund', 'payment_refund', 'payout', 'payout_cancel', 'payout_failure'].includes(b.type) || b.fee < 0)
            unresolved.push({ id: b.id, type: b.type, amount: b.amount });
        const review = unresolved.some(r => r.id === b.id);
        await f.recordReconciliation(mode, { id: b.id, type: b.type, amountMinor: b.amount, feeMinor: b.fee, currency: 'CAD', occurredAt: base.occurredAt, status: review ? 'review' : 'imported', message: review ? 'Requires investigation; no balancing revenue entry was invented.' : b.type === 'payout' ? 'Stripe payout imported. Bank receipt still requires statement verification.' : 'Provider balance transaction imported; compare clearing to provider statement.' });
    }
    return { refunds, movements, unresolved };
}
/** Catch up immutable receipt, fulfilment and physical-restock costs.
 * Receipt mode is an explicit receiving choice; order-associated costs inherit the payment mode.
 * Unknown historic costs remain review items, never inferred from today's catalog.
 */
export async function syncFinanceCosts() {
    const repo = await getRepository(), finance = await getFinance();
    type CostLine = {
        quantity: number;
        unitCostMinor: number | null;
    };
    type Source = {
        id: string;
        kind: 'receipt' | 'fulfilled' | 'return';
        mode: Mode | null;
        currency: string;
        occurredAt: string | null;
        lines: CostLine[];
    };
    const sources: Source[] = [];
    if (repo.kind === 'memory') {
        const memory = memoryStateOf(repo);
        const operations = memory.ext.get('inventory-operations') as import('@/lib/inventory-operations/repository').OperationalState | undefined;
        for (const shipment of operations?.shipments ?? []) {
            const order = memory.orders.find(o => o.id === shipment.orderId);
            if (order)
                sources.push({ id: shipment.key, kind: 'fulfilled', mode: modeForSession(order.stripeSessionId), currency: 'CAD', occurredAt: memory.ext.get(`shipment-at:${shipment.key}`) as string | undefined ?? null, lines: memory.ext.get(`shipment-cost:${shipment.key}`) as CostLine[] | undefined ?? [] });
        }
        for (const order of memory.orders.filter(o => o.fulfilmentStatus === 'FULFILLED' && !operations?.shipments?.some(s => s.orderId === o.id)))
            sources.push({ id: `legacy-order:${order.id}`, kind: 'fulfilled', mode: modeForSession(order.stripeSessionId), currency: 'CAD', occurredAt: null, lines: [] });
        for (const receipt of operations?.receipts ?? []) {
            const purchase = operations?.purchases?.find(p => p.id === receipt.purchaseOrderId);
            sources.push({ id: `receipt:${receipt.key}`, kind: 'receipt', mode: receipt.mode === 'test' || receipt.mode === 'live' ? receipt.mode : null, currency: 'CAD', occurredAt: memory.ext.get(`receipt-at:${receipt.key}`) as string | undefined ?? null, lines: receipt.lines.map(l => ({ quantity: l.quantity, unitCostMinor: purchase?.lines.find(p => p.variantId === l.variantId)?.unitCostMinor ?? null })) });
        }
        for (const returned of operations?.returns ?? []) {
            if (!returned.restock)
                continue;
            const order = memory.orders.find(o => o.id === returned.orderId);
            if (order)
                sources.push({ id: `return:${returned.key}`, kind: 'return', mode: modeForSession(order.stripeSessionId), currency: 'CAD', occurredAt: memory.ext.get(`return-at:${returned.key}`) as string | undefined ?? null, lines: memory.ext.get(`return-cost:${returned.key}`) as CostLine[] | undefined ?? [] });
        }
    }
    else {
        const pool = pgPoolOf(repo);
        const rows = await pool.query('select s.request_key,s.created_at,s.cost_snapshot,o.stripe_session_id,o.currency from commerce.shipments s join commerce.orders o on o.id=s.order_id order by s.created_at,s.request_key');
        for (const r of rows.rows)
            sources.push({ id: r.request_key, kind: 'fulfilled', mode: modeForSession(r.stripe_session_id), currency: r.currency, occurredAt: new Date(r.created_at).toISOString(), lines: r.cost_snapshot ?? [] });
        const legacy = await pool.query("select id,stripe_session_id,currency from commerce.orders o where fulfilment_status='FULFILLED' and not exists(select 1 from commerce.shipments s where s.order_id=o.id)");
        for (const r of legacy.rows)
            sources.push({ id: `legacy-order:${r.id}`, kind: 'fulfilled', mode: modeForSession(r.stripe_session_id), currency: r.currency, occurredAt: null, lines: [] });
        const receipts = await pool.query('select r.request_key,r.mode,r.lines,r.received_at,p.lines as purchase_lines from commerce.stock_receipts r join commerce.purchase_orders p on p.id=r.purchase_order_id order by r.received_at,r.request_key');
        for (const r of receipts.rows) {
            const costs = r.purchase_lines as {
                variantId: string;
                unitCostMinor: number;
            }[];
            sources.push({ id: `receipt:${r.request_key}`, kind: 'receipt', mode: r.mode === 'test' || r.mode === 'live' ? r.mode : null, currency: 'CAD', occurredAt: new Date(r.received_at).toISOString(), lines: (r.lines as {
                    variantId: string;
                    quantity: number;
                }[]).map(l => ({ quantity: l.quantity, unitCostMinor: costs.find(p => p.variantId === l.variantId)?.unitCostMinor ?? null })) });
        }
        const returns = await pool.query('select r.request_key,r.cost_snapshot,r.received_at,o.stripe_session_id,o.currency from commerce.physical_returns r join commerce.orders o on o.id=r.order_id where r.restock=true order by r.received_at,r.request_key');
        for (const r of returns.rows)
            sources.push({ id: `return:${r.request_key}`, kind: 'return', mode: modeForSession(r.stripe_session_id), currency: r.currency, occurredAt: new Date(r.received_at).toISOString(), lines: r.cost_snapshot ?? [] });
    }
    const result = { posted: 0, incomplete: 0, unknownMode: 0, errors: [] as {
            source: string;
            message: string;
        }[] };
    for (const source of sources) {
        const mode = source.mode;
        if (!mode) {
            result.unknownMode++;
            continue;
        }
        if (!source.occurredAt || !source.lines.length || source.lines.some(l => l.unitCostMinor === null || !Number.isSafeInteger(l.unitCostMinor) || l.unitCostMinor < 0 || !Number.isSafeInteger(l.quantity) || l.quantity <= 0)) {
            result.incomplete++;
            await finance.recordReconciliation(mode, { id: `cost:${source.id}`, type: 'missing_cost_snapshot', amountMinor: 0, feeMinor: 0, currency: source.currency, occurredAt: source.occurredAt ?? new Date().toISOString(), status: 'review', message: `${source.kind} cost is incomplete; no inventory, payable or cost-of-goods amount was inferred.` });
            continue;
        }
        const amountMinor = source.lines.reduce((n, l) => n + l.quantity * l.unitCostMinor!, 0);
        if (amountMinor === 0)
            continue; // Explicit zero-cost snapshots need no money entry.
        try {
            await finance.postInventoryCost({ id: source.id, mode, currency: source.currency, kind: source.kind, amountMinor, occurredAt: source.occurredAt });
            result.posted++;
        }
        catch (e) {
            result.errors.push({ source: source.id, message: e instanceof Error ? e.message : 'Cost posting failed' });
        }
    }
    return result;
}
/** Fast path after the commerce webhook has verified the raw Stripe signature.
 * Retrieve current provider state so delayed/reordered callbacks cannot regress refunds.
 * Resolve the order through its PaymentIntent/Checkout association, never customer metadata.
 */
export async function reconcileStripeRefund(refundId: string, mode: Mode) {
    if (!/^re_[A-Za-z0-9]+$/.test(refundId))
        throw new Error('Invalid Stripe refund identifier.');
    const stripe = stripeForMode(mode), refund = await stripe.refunds.retrieve(refundId);
    const intentId = typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id;
    if (!intentId)
        return { handled: false, reason: 'not_checkout' };
    const sessions = await stripe.checkout.sessions.list({ payment_intent: intentId, limit: 100 });
    const commerce = await getRepository();
    for (const session of sessions.data) {
        const sessionIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        if (sessionIntent !== intentId || session.livemode !== (mode === 'live') || session.payment_status !== 'paid')
            continue;
        const order = await commerce.getOrderBySessionId(session.id);
        if (!order)
            continue;
        if (session.amount_total !== order.totalMinor || session.currency?.toUpperCase() !== refund.currency.toUpperCase())
            throw new Error('Refund provider payment does not match the order.');
        if (!['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.financialStatus))
            return { handled: false, reason: 'order_requires_review' };
        await postOrder(order, { mode, currency: refund.currency.toUpperCase() });
        const result = await postRefund({ id: refund.id, paymentId: `order:${order.id}`, requestKey: refund.metadata?.crater_request, mode, currency: refund.currency.toUpperCase(), amountMinor: refund.amount, status: refund.status === 'succeeded' ? 'succeeded' : refund.status === 'failed' || refund.status === 'canceled' ? 'failed' : 'pending', occurredAt: new Date(refund.created * 1000).toISOString() });
        return { handled: true, status: result.status };
    }
    return { handled: false, reason: 'order_not_found' };
}
