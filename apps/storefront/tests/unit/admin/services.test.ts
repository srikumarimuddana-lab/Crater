import { describe, expect, it } from 'vitest';
import { AdminAuthError } from '@/lib/admin/errors';
import { V } from '../helpers/harness';
import {
  REPO_KINDS, closePoolsAfterAll, makeEnv, makeProductPublishable, makeServices, placePaidOrder, skipUnavailable, type Env,
} from './helpers';

closePoolsAfterAll();
const SKU_HERO30 = 'SAMPLE-LBO-30';
const actions = async (env: Env) => (await env.admin.listAudit({ first: 100, beforeId: null })).map((r) => r.action);

describe.each(REPO_KINDS)('admin services (%s repository)', (kind) => {
  const t = skipUnavailable(kind) ? it.skip : it;

  async function setup() {
    const env = await makeEnv(kind);
    const svc = await makeServices(env);
    return { env, svc };
  }

  t('reads need a session and the right capability; mutations are denied, returned as FORBIDDEN and audited', async () => {
    const { env, svc } = await setup();
    svc.as(null);
    await expect(svc.orders.list()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(svc.inventory.adjust({ variantId: V.hero30, delta: 1, reason: 'RECEIVED' })).rejects.toBeInstanceOf(AdminAuthError);
    svc.as('FULFILMENT');
    await expect(svc.products.list()).rejects.toMatchObject({ code: 'FORBIDDEN', capability: 'products:read' });
    await expect(svc.overview.get('TODAY')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    svc.as('SUPPORT');
    const denied = await svc.inventory.adjust({ variantId: V.hero30, delta: 1, reason: 'RECEIVED' });
    expect(denied).toMatchObject({ data: null, userErrors: [{ code: 'FORBIDDEN' }] });
    expect(await svc.products.update({ id: 'gid://crater/Product/11', expectedUpdatedAt: new Date().toISOString(), title: 'x' })).toMatchObject({ userErrors: [{ code: 'FORBIDDEN' }] });
    expect(await actions(env)).toEqual(['access.denied', 'access.denied']);
    const row = (await env.admin.listAudit({ first: 5, beforeId: null }))[0];
    expect(row).toMatchObject({ actorEmail: 'support@example.test', targetType: 'capability', targetId: 'products:write' });
    svc.as('BOOKKEEPER');
    expect((await svc.staff.list().catch((e) => e)).code).toBe('FORBIDDEN');
  });

  t('orders: a paid order stores its address, is shaped by capability, and Fulfilment sees no prices or internal notes', async () => {
    const { env, svc } = await setup();
    const rec = await placePaidOrder(env.h, [{ merchandiseId: V.hero30, quantity: 2 }]);
    expect(rec.shippingAddress).toMatchObject({ name: 'Sam Buyer', line1: '100 Sample Street', province: 'ON', postalCode: 'M5V 2T6' });
    svc.as('ADMIN');
    const id = `gid://crater/Order/${rec.id}`;
    expect((await svc.orders.updateNotes({ orderId: id, packingInstructions: 'Gift wrap please', internalNotes: 'Call buyer re: allergy' })).userErrors).toEqual([]);
    const admin = (await svc.orders.get(id))!;
    expect(admin).toMatchObject({ name: '#1001', financialStatus: 'PAID', fulfilmentStatus: 'UNFULFILLED', email: 'buyer@example.com', packingInstructions: 'Gift wrap please', internalNotes: 'Call buyer re: allergy' });
    expect(admin.totals).toEqual({ subtotal: { amount: '48.00', currencyCode: 'CAD' }, shipping: expect.anything(), tax: { amount: '6.24', currencyCode: 'CAD' }, total: { amount: '54.24', currencyCode: 'CAD' } });
    // Tax as Stripe charged it (HST 13% on the Ontario bag), the bag's province and the collected address province.
    expect(admin).toMatchObject({ taxProvince: 'ON', shippingProvince: 'ON', taxLines: [{ key: 'CA_HST_ON', title: 'HST (Ontario)', ratePercent: '13', amount: { amount: '6.24' } }] });
    expect(admin.lines[0]).toMatchObject({ quantity: 2, unitPrice: { amount: '24.00' }, total: { amount: '48.00' } });
    expect(admin.timeline.map((e) => e.kind)).toEqual(['PLACED', 'PAID', 'NOTE']);

    svc.as('FULFILMENT');
    const pack = (await svc.orders.get(id))!;
    expect(pack.totals).toBeNull();
    expect(pack.taxLines).toBeNull();
    expect(pack).toMatchObject({ taxProvince: 'ON', shippingProvince: 'ON' });
    expect(pack.email).toBeNull();
    expect(pack.internalNotes).toBeNull();
    expect(pack.lines[0]).toMatchObject({ unitPrice: null, total: null, sku: SKU_HERO30 });
    expect(pack.packingInstructions).toBe('Gift wrap please');
    expect(pack.shippingAddress?.city).toBe('Toronto');
    expect(pack.timeline.map((e) => e.kind)).toEqual(['PLACED']);
    expect((await svc.orders.list()).nodes[0]).toMatchObject({ total: null, itemCount: 2 });
    expect(JSON.stringify(pack)).not.toMatch(/buyer@example|48\.00|allergy/);
    expect((await svc.orders.list({ query: 'buyer@example' })).nodes).toEqual([]); // no email search without email access
    const slip = (await svc.orders.packingSlip(id))!;
    expect(slip).toMatchObject({ orderName: '#1001', lines: [{ quantity: 2, sku: SKU_HERO30 }], packingInstructions: 'Gift wrap please' });
    expect(JSON.stringify(slip)).not.toMatch(/price|total|amount|buyer@example|allergy|unitMinor/i);

    svc.as('FULFILMENT');
    expect(await svc.orders.updateNotes({ orderId: id, internalNotes: 'x' })).toMatchObject({ userErrors: [{ code: 'FORBIDDEN' }] });
    svc.as('BOOKKEEPER');
    expect((await svc.orders.get(id))!.email).toBe('b***@example.com');
    svc.as('SUPPORT');
    expect((await svc.orders.get(id))!.internalNotes).toBeNull();
    // Notes content never reaches the audit log.
    const audit = JSON.stringify(await env.admin.listAudit({ first: 50, beforeId: null }));
    expect(audit).not.toMatch(/Gift wrap|allergy/);
    expect(audit).toContain('order.notes_updated');
  });

  t('orders: list filters, search and cursor pagination', async () => {
    const { env, svc } = await setup();
    for (let i = 0; i < 3; i++) await placePaidOrder(env.h, [{ merchandiseId: V.peppermint30 }]);
    svc.as('ADMIN');
    const first = await svc.orders.list({ first: 2 });
    expect(first.nodes.map((o) => o.name)).toEqual(['#1003', '#1002']);
    expect(first.pageInfo).toMatchObject({ hasNextPage: true, hasPreviousPage: false });
    const next = await svc.orders.list({ first: 2, after: first.pageInfo.endCursor });
    expect(next.nodes.map((o) => o.name)).toEqual(['#1001']);
    expect(next.pageInfo).toMatchObject({ hasNextPage: false, hasPreviousPage: true });
    expect((await svc.orders.list({ query: '#1002' })).nodes.map((o) => o.name)).toEqual(['#1002']);
    expect((await svc.orders.list({ query: 'buyer@example.com' })).nodes).toHaveLength(3);
    expect((await svc.orders.list({ fulfilmentStatus: 'FULFILLED' })).nodes).toEqual([]);
    expect((await svc.orders.list({ after: 'garbage!!' })).nodes).toHaveLength(3); // unreadable cursor = first page
    expect(await svc.orders.get('gid://crater/Order/9999')).toBeNull();
    expect(await svc.orders.get('nonsense')).toBeNull();
  });

  t('markFulfilled: validates, fulfils once, is idempotent for a replay and CONFLICTs on different details', async () => {
    const { env, svc } = await setup();
    const rec = await placePaidOrder(env.h, [{ merchandiseId: V.hero30 }]);
    const orderId = `gid://crater/Order/${rec.id}`;
    svc.as('FULFILMENT');
    expect(await svc.orders.markFulfilled({ orderId, carrier: '', trackingNumber: 'ABC123' })).toMatchObject({ userErrors: [{ code: 'INVALID', field: ['carrier'] }] });
    expect(await svc.orders.markFulfilled({ orderId, carrier: 'Canada Post', trackingNumber: '<script>' })).toMatchObject({ userErrors: [{ code: 'INVALID', field: ['trackingNumber'] }] });
    expect(await svc.orders.markFulfilled({ orderId: 'gid://crater/Order/777', carrier: 'Canada Post', trackingNumber: 'ABC123' })).toMatchObject({ userErrors: [{ code: 'NOT_FOUND' }] });
    const done = await svc.orders.markFulfilled({ orderId, carrier: 'Canada Post', trackingNumber: 'ABC123' });
    expect(done.userErrors).toEqual([]);
    expect(done.data).toMatchObject({ fulfilmentStatus: 'FULFILLED', fulfilment: { carrier: 'Canada Post', trackingNumber: 'ABC123', by: 'FULFILMENT Person' } });
    const before = (await actions(env)).filter((a) => a === 'order.fulfilled').length;
    expect((await svc.orders.markFulfilled({ orderId, carrier: 'Canada Post', trackingNumber: 'ABC123' })).userErrors).toEqual([]); // blind retry: no second effect
    expect((await actions(env)).filter((a) => a === 'order.fulfilled').length).toBe(before);
    expect(await svc.orders.markFulfilled({ orderId, carrier: 'UPS', trackingNumber: 'ZZZ' })).toMatchObject({ data: null, userErrors: [{ code: 'CONFLICT' }] });
    expect((await svc.orders.get(orderId))!.timeline.map((e) => e.kind)).toEqual(['PLACED', 'FULFILLED']);
    svc.as('ADMIN');
    expect((await svc.orders.list({ fulfilmentStatus: 'FULFILLED' })).nodes).toHaveLength(1);
    expect((await svc.orders.get(orderId))!.fulfilment?.carrier).toBe('Canada Post');
    expect(JSON.stringify(await env.admin.listAudit({ first: 50, beforeId: null }))).not.toContain('ABC123'); // tracking numbers are not audited
  });

  t('markFulfilled refuses an order that is not paid (flagged for review)', async () => {
    const { env, svc } = await setup();
    const rec = await placePaidOrder(env.h, [{ merchandiseId: V.hero30 }], { amount_subtotal: 1 });
    expect(rec.financialStatus).toBe('PENDING');
    svc.as('ADMIN');
    expect(await svc.orders.markFulfilled({ orderId: `gid://crater/Order/${rec.id}`, carrier: 'Canada Post', trackingNumber: 'ABC123' })).toMatchObject({ userErrors: [{ code: 'INVALID' }] });
  });

  t('products: optimistic concurrency, price audit, validation, and cost hidden from Support', async () => {
    const { env, svc } = await setup();
    svc.as('ADMIN');
    const product = (await svc.products.get('gid://crater/Product/11'))!;
    expect(product).toMatchObject({ handle: 'lemon-balm-oat-extract', status: 'ACTIVE', sample: true });
    const v0 = product.variants[0];
    expect(v0).toMatchObject({ sku: SKU_HERO30, available: 40, committed: 0, onHand: 40, lowStockThreshold: 5, openCartCount: 0, cost: { amount: '8.40' } });

    expect(await svc.products.update({ id: product.id, expectedUpdatedAt: product.updatedAt, title: ' ' })).toMatchObject({ userErrors: [{ code: 'INVALID', field: ['title'] }] });
    expect(await svc.products.update({ id: product.id, expectedUpdatedAt: product.updatedAt, variants: [{ id: v0.id, price: '24.001' }] })).toMatchObject({ userErrors: [{ code: 'INVALID', field: ['variants', '0', 'price'] }] });
    expect(await svc.products.update({ id: product.id, expectedUpdatedAt: product.updatedAt, variants: [{ id: v0.id, price: '0' }] })).toMatchObject({ userErrors: [{ code: 'INVALID' }] });
    expect(await svc.products.update({ id: product.id, expectedUpdatedAt: product.updatedAt, variants: [{ id: 'gid://crater/ProductVariant/23', price: '5.00' }] })).toMatchObject({ userErrors: [{ code: 'INVALID' }] });
    expect(await svc.products.update({ id: product.id, expectedUpdatedAt: product.updatedAt, variants: [{ id: v0.id, lowStockThreshold: -1 }] })).toMatchObject({ userErrors: [{ code: 'INVALID' }] });

    // An open bag holds the variant: it shows up in openCartCount, and the price edit is flagged on that bag.
    const cart = (await env.h.storefront.cartCreate({ input: { lines: [{ merchandiseId: v0.id }] } })).cart!;
    expect((await svc.products.get(product.id))!.variants[0].openCartCount).toBe(1);

    const updated = await svc.products.update({
      id: product.id, expectedUpdatedAt: product.updatedAt, title: 'Lemon Balm & Oat Extract (edited)', variants: [{ id: v0.id, price: '26.50', cost: '9.10', lowStockThreshold: 8 }],
    });
    expect(updated.userErrors).toEqual([]);
    expect(updated.data!.variants[0]).toMatchObject({ price: { amount: '26.50' }, cost: { amount: '9.10' }, lowStockThreshold: 8 });
    expect(updated.data!.updatedAt).not.toBe(product.updatedAt);
    expect((await env.h.storefront.cart({ id: cart.id }))!.hasPriceChanges).toBe(true); // server-authoritative price flows to bags
    const rows = await env.admin.listAudit({ first: 50, beforeId: null });
    expect(rows.find((r) => r.action === 'product.price_changed')).toMatchObject({
      targetId: product.id,
      changes: { [`${SKU_HERO30}.price`]: { from: '24.00', to: '26.50' }, [`${SKU_HERO30}.cost`]: { from: '8.40', to: '9.10' } },
    });
    expect(rows.map((r) => r.action)).toContain('product.updated');

    // Stale token: the second editor loses.
    const stale = await svc.products.update({ id: product.id, expectedUpdatedAt: product.updatedAt, title: 'Someone else' });
    expect(stale).toMatchObject({ data: null, userErrors: [{ code: 'CONFLICT' }] });
    expect((await svc.products.get(product.id))!.title).toBe('Lemon Balm & Oat Extract (edited)');

    // No-op saves write nothing.
    const n = (await env.admin.listAudit({ first: 100, beforeId: null })).length;
    expect((await svc.products.update({ id: product.id, expectedUpdatedAt: updated.data!.updatedAt, title: 'Lemon Balm & Oat Extract (edited)' })).userErrors).toEqual([]);
    expect((await env.admin.listAudit({ first: 100, beforeId: null })).length).toBe(n);

    svc.as('SUPPORT');
    expect((await svc.products.get(product.id))!.variants[0].cost).toBeNull();
    svc.as('BOOKKEEPER');
    expect((await svc.products.get(product.id))!.variants[0].cost).toMatchObject({ amount: '9.10' });
    expect(await svc.products.update({ id: product.id, expectedUpdatedAt: updated.data!.updatedAt, title: 'x' })).toMatchObject({ userErrors: [{ code: 'FORBIDDEN' }] });
  });

  t('two concurrent edits from the same version: exactly one wins', async () => {
    const { svc } = await setup();
    svc.as('ADMIN');
    const p = (await svc.products.get('gid://crater/Product/12'))!;
    const results = await Promise.all([
      svc.products.update({ id: p.id, expectedUpdatedAt: p.updatedAt, title: 'Edit A' }),
      svc.products.update({ id: p.id, expectedUpdatedAt: p.updatedAt, title: 'Edit B' }),
    ]);
    expect(results.filter((r) => r.data).length).toBe(1);
    expect(results.flatMap((r) => r.userErrors).map((e) => e.code)).toEqual(['CONFLICT']);
  });

  t('publish gate: sample products always fail NOT_SAMPLE; a complete non-sample draft can go live and back', async () => {
    const { env, svc } = await setup();
    svc.as('ADMIN');
    const sample = (await svc.products.get('gid://crater/Product/11'))!;
    expect(sample.publishChecks.find((c) => c.key === 'NOT_SAMPLE')?.passed).toBe(false);
    // Archive a sample (allowed), then try to re-activate it: blocked.
    expect((await svc.products.setStatus({ id: sample.id, status: 'ARCHIVED' })).data!.status).toBe('ARCHIVED');
    expect((await env.h.storefront.product({ handle: 'lemon-balm-oat-extract' }))).toBeNull(); // archived = not sold
    const blocked = await svc.products.setStatus({ id: sample.id, status: 'ACTIVE' });
    expect(blocked.userErrors).toMatchObject([{ code: 'PUBLISH_BLOCKED', field: ['status'] }]);
    expect(blocked.userErrors[0].message).toContain('NOT_SAMPLE');
    expect(blocked.data!.status).toBe('ARCHIVED');
    expect(blocked.data!.publishChecks.filter((c) => !c.passed).map((c) => c.key)).toEqual(expect.arrayContaining(['NOT_SAMPLE', 'HAS_PRECAUTIONS']));
    expect(await actions(env)).toContain('product.publish_blocked');

    const id = await makeProductPublishable(env, 'peppermint-ginger-extract');
    const draft = (await svc.products.get(id))!;
    expect(draft.status).toBe('DRAFT');
    expect(draft.publishChecks.every((c) => c.passed)).toBe(true);
    expect(await env.h.storefront.product({ handle: 'peppermint-ginger-extract' })).toBeNull(); // drafts are not listed or sold
    expect((await env.h.storefront.products({})).nodes.map((p) => p.handle)).not.toContain('peppermint-ginger-extract');
    const live = await svc.products.setStatus({ id, status: 'ACTIVE', expectedUpdatedAt: draft.updatedAt });
    expect(live.userErrors).toEqual([]);
    expect(live.data!.status).toBe('ACTIVE');
    expect(await env.h.storefront.product({ handle: 'peppermint-ginger-extract' })).not.toBeNull();
    // Stale token on a status change
    expect(await svc.products.setStatus({ id, status: 'DRAFT', expectedUpdatedAt: draft.updatedAt })).toMatchObject({ userErrors: [{ code: 'CONFLICT' }] });
    // Removing precautions blocks re-publishing.
    expect((await svc.products.setStatus({ id, status: 'DRAFT' })).data!.status).toBe('DRAFT');
    const cur = (await svc.products.get(id))!;
    await svc.products.update({ id, expectedUpdatedAt: cur.updatedAt, details: { precautions: 'Placeholder. Precautions will be added.' } });
    expect((await svc.products.setStatus({ id, status: 'ACTIVE' })).userErrors[0].message).toContain('HAS_PRECAUTIONS');
    // Unchanged status is a no-op success.
    expect((await svc.products.setStatus({ id: sample.id, status: 'ARCHIVED' })).userErrors).toEqual([]);
    svc.as('SUPPORT');
    expect(await svc.products.setStatus({ id, status: 'ACTIVE' })).toMatchObject({ userErrors: [{ code: 'FORBIDDEN' }] });
  });

  t('inventory: levels derive committed and on hand; adjust never goes below 0; movements and audit are recorded', async () => {
    const { env, svc } = await setup();
    await placePaidOrder(env.h, [{ merchandiseId: V.hawthorn30, quantity: 1 }]); // 2 -> 1, committed 1
    svc.as('ADMIN');
    const levels = await svc.inventory.levels();
    const haw = levels.find((l) => l.variantId === V.hawthorn30)!;
    expect(haw).toMatchObject({ available: 1, committed: 1, onHand: 2, low: true, tracked: true });
    expect(levels[0].low).toBe(true); // low stock first
    expect((await svc.inventory.levels({ onlyLow: true })).every((l) => l.low)).toBe(true);
    expect(levels.find((l) => l.variantId === V.chamomile60)).toMatchObject({ available: 0, low: true });

    const move = async (delta: number, reason: 'RECEIVED' | 'DAMAGED' | 'COUNT_CORRECTION' | 'OTHER' | 'RETURN_RESTOCK' = 'COUNT_CORRECTION', note?: string) =>
      svc.inventory.adjust({ variantId: V.hawthorn30, delta, reason, note });
    expect(await move(-2)).toMatchObject({ data: null, userErrors: [{ code: 'INVALID', field: ['delta'] }] });
    expect((await svc.inventory.levels()).find((l) => l.variantId === V.hawthorn30)!.available).toBe(1);
    expect(await move(0)).toMatchObject({ userErrors: [{ code: 'INVALID' }] });
    expect(await move(1.5)).toMatchObject({ userErrors: [{ code: 'INVALID' }] });
    expect(await move(-1, 'RECEIVED')).toMatchObject({ userErrors: [{ code: 'INVALID' }] });
    expect(await move(3, 'DAMAGED')).toMatchObject({ userErrors: [{ code: 'INVALID' }] });
    expect(await move(1, 'OTHER')).toMatchObject({ userErrors: [{ code: 'INVALID', field: ['note'] }] });
    expect(await svc.inventory.adjust({ variantId: 'gid://crater/ProductVariant/9999', delta: 1, reason: 'RECEIVED' })).toMatchObject({ userErrors: [{ code: 'NOT_FOUND' }] });
    const ok = await move(10, 'RECEIVED', 'Delivery from supplier, contact jane@example.com');
    expect(ok.data).toMatchObject({ delta: 10, reason: 'RECEIVED', availableAfter: 11, actor: 'admin@example.test', sku: 'SAMPLE-HRH-30' });
    expect(await move(-11, 'DAMAGED')).toMatchObject({ data: { availableAfter: 0 } }); // exactly to zero is allowed
    expect(await move(-1, 'DAMAGED')).toMatchObject({ userErrors: [{ code: 'INVALID' }] });

    const mv = await svc.inventory.movements({ variantId: V.hawthorn30 });
    expect(mv.nodes.map((m) => [m.reason, m.delta, m.availableAfter])).toEqual([['DAMAGED', -11, 0], ['RECEIVED', 10, 11], ['ORDER_PAID', -1, 1]]);
    expect(mv.nodes[2].actor).toBeNull();
    const page1 = await svc.inventory.movements({ first: 2 });
    expect(page1.nodes).toHaveLength(2);
    expect(page1.pageInfo.hasNextPage).toBe(true);
    expect((await svc.inventory.movements({ first: 2, after: page1.pageInfo.endCursor })).nodes.length).toBeGreaterThan(0);
    const audit = (await env.admin.listAudit({ first: 50, beforeId: null })).filter((r) => r.action === 'inventory.adjusted');
    expect(audit).toHaveLength(2);
    expect(JSON.stringify(audit)).not.toMatch(/jane@example|supplier/);
    expect(audit[1].changes).toMatchObject({ available: { from: 1, to: 11 }, reason: { to: 'RECEIVED' } });
  });

  t('inventory: concurrent removals cannot oversell the last units', async () => {
    const { svc } = await setup();
    svc.as('ADMIN');
    const results = await Promise.all(Array.from({ length: 4 }, () => svc.inventory.adjust({ variantId: V.hawthorn30, delta: -1, reason: 'DAMAGED' })));
    expect(results.filter((r) => r.data)).toHaveLength(2); // started with 2
    expect(results.filter((r) => r.userErrors.length)).toHaveLength(2);
    expect((await svc.inventory.levels()).find((l) => l.variantId === V.hawthorn30)!.available).toBe(0);
  });

  t('inventory: Fulfilment may only use received/count/damaged; Support cannot adjust', async () => {
    const { svc } = await setup();
    svc.as('FULFILMENT');
    expect(await svc.inventory.adjust({ variantId: V.hero30, delta: 1, reason: 'RETURN_RESTOCK' })).toMatchObject({ userErrors: [{ code: 'FORBIDDEN', field: ['reason'] }] });
    expect(await svc.inventory.adjust({ variantId: V.hero30, delta: 5, reason: 'RECEIVED' })).toMatchObject({ data: { availableAfter: 45 } });
    expect((await svc.inventory.levels())[0]).not.toHaveProperty('price');
    svc.as('SUPPORT');
    expect(await svc.inventory.adjust({ variantId: V.hero30, delta: 1, reason: 'RECEIVED' })).toMatchObject({ userErrors: [{ code: 'FORBIDDEN' }] });
    expect((await svc.inventory.levels()).length).toBeGreaterThan(0);
  });

  t('overview: definitions, store timezone buckets, AOV and webhook health', async () => {
    const { env, svc } = await setup();
    env.clock.now = new Date('2026-03-02T03:30:00.000Z'); // 21:30 on Mar 1 in Regina (CST, UTC-6 all year)
    await placePaidOrder(env.h, [{ merchandiseId: V.hero30, quantity: 1 }]); // $24
    env.clock.now = new Date('2026-03-02T06:30:00.000Z'); // 00:30 on Mar 2 in Regina
    await placePaidOrder(env.h, [{ merchandiseId: V.hero60, quantity: 1 }, { merchandiseId: V.peppermint30, quantity: 1 }]); // $60
    await placePaidOrder(env.h, [{ merchandiseId: V.hero30 }], { amount_subtotal: 7 }); // flagged PENDING: not a paid order
    env.clock.now = new Date('2026-03-02T15:00:00.000Z'); // 10:00 Mar 2
    svc.as('SUPPORT');
    const today = await svc.overview.get('TODAY');
    expect(today).toMatchObject({ timezone: 'America/Regina', orders: 1, grossSales: { amount: '60.00' }, netSales: { amount: '60.00' }, averageOrderValue: { amount: '60.00' } });
    expect(today.salesByDay).toEqual([{ date: '2026-03-02', orders: 1, grossSales: { amount: '60.00', currencyCode: 'CAD' } }]);
    const week = await svc.overview.get('LAST_7_DAYS');
    expect(week).toMatchObject({ orders: 2, grossSales: { amount: '84.00' }, averageOrderValue: { amount: '42.00' } });
    expect(week.salesByDay).toHaveLength(7);
    expect(week.salesByDay.at(-1)).toMatchObject({ date: '2026-03-02', orders: 1 });
    expect(week.salesByDay.at(-2)).toMatchObject({ date: '2026-03-01', orders: 1, grossSales: { amount: '24.00' } });
    expect(week.salesByDay.slice(0, 5).every((d) => d.orders === 0 && d.grossSales.amount === '0.00')).toBe(true);
    expect((await svc.overview.get('LAST_30_DAYS')).salesByDay).toHaveLength(30);
    expect(week.lowStockVariants).toBeGreaterThanOrEqual(2); // sold-out chamomile 60 and hawthorn 30
    expect(week.webhookHealth.lastEventAt).not.toBeNull();
    expect(week.webhookHealth.failedLast24h).toBe(0);
    // A quiet day has no AOV.
    env.clock.now = new Date('2026-04-20T15:00:00.000Z');
    expect(await svc.overview.get('TODAY')).toMatchObject({ orders: 0, averageOrderValue: null, grossSales: { amount: '0.00' } });
  });

  t('events: webhook outcomes are recorded (processed, duplicate, rejected) and audit is visible to Owner/Bookkeeper only', async () => {
    const { env, svc } = await setup();
    const rec = await placePaidOrder(env.h, [{ merchandiseId: V.hero30 }]);
    expect(rec.id).toBeGreaterThan(0);
    // Redelivery of the same event id => DUPLICATE.
    const { deliver, sessionEvent, paidSession } = await import('../helpers/harness');
    svc.as('ADMIN');
    const firstEventId = (await svc.events.webhooks())[0].id;
    const body = sessionEvent('checkout.session.completed', paidSession(env.h, { id: rec.stripeSessionId }), firstEventId);
    expect((await deliver(env.h, body)).status).toBe(200);
    // A paid session for an unknown checkout => REJECTED.
    const unknown = sessionEvent('checkout.session.completed', paidSession(env.h, { id: 'cs_test_unknown00000001', metadata: { checkout_id: `chk_${'a'.repeat(32)}`, cart_id: 'x' } }), 'evt_unknown_1');
    expect((await deliver(env.h, unknown)).status).toBe(200);
    const events = await svc.events.webhooks();
    expect(events.map((e) => [e.id, e.outcome])).toEqual([['evt_unknown_1', 'REJECTED'], [firstEventId, 'DUPLICATE'], [firstEventId, 'PROCESSED']]);
    expect(events[0]).toMatchObject({ type: 'checkout.session.completed' });
    svc.as('SUPPORT');
    await expect(svc.events.webhooks()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    svc.as('ADMIN');
    await expect(svc.events.audit()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    svc.as('OWNER');
    await svc.inventory.adjust({ variantId: V.hero30, delta: 2, reason: 'RECEIVED' });
    const owner = await svc.events.audit({ first: 10 });
    expect(owner.nodes[0]).toMatchObject({ action: 'inventory.adjusted', actor: { email: 'owner@example.test' }, target: { type: 'variant' } });
    expect(owner.nodes[0].id).toMatch(/^gid:\/\/crater\/AuditEntry\/\d+$/);
    svc.as('BOOKKEEPER'); // financial entries only
    expect((await svc.events.audit()).nodes).toEqual([]);
    svc.as('OWNER');
    const staff = await svc.staff.list();
    expect(staff.map((s) => s.role).sort()).toEqual(['ADMIN', 'BOOKKEEPER', 'FULFILMENT', 'OWNER', 'SUPPORT']);
    expect(JSON.stringify(staff)).not.toMatch(/passwordHash|totp/i);
  });

  t('audit() rejects personal-data keys and redacts email-looking values', async () => {
    const { env } = await setup();
    const { audit } = await import('@/lib/admin/audit');
    await expect(audit(env.admin, { actor: null, action: 'x', changes: { email: { from: null, to: 'a' } } })).rejects.toThrow(/personal data/);
    await expect(audit(env.admin, { actor: null, action: 'x', changes: { shippingAddress: { from: null, to: 'a' } } })).rejects.toThrow(/personal data/);
    await audit(env.admin, { actor: null, action: 'x.y', changes: { title: { from: 'mail bob@example.com now', to: 'z'.repeat(500) } } });
    const row = (await env.admin.listAudit({ first: 1, beforeId: null }))[0];
    expect(row.changes.title.from).toBe('mail [redacted] now');
    expect(String(row.changes.title.to)).toHaveLength(200);
  });
});
