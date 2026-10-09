import { describe, expect, it, vi } from 'vitest';
import { memoryStateOf } from '@/lib/commerce/memory-repository';
import { CART_TTL_MS } from '@/lib/commerce/cart-logic';
import { cartWith, deliver, paidSession, sessionEvent, V } from '../helpers/harness';
import { REPO_KINDS, closePoolsAfterAll, makeEnv, placePaidOrder, skipUnavailable } from './helpers';

closePoolsAfterAll();

describe.each(REPO_KINDS)('commerce additions for the admin (%s repository)', (kind) => {
  const t = skipUnavailable(kind) ? it.skip : it;

  t('a paid order stores the shipping address Stripe collected and an ORDER_PAID movement in one step', async () => {
    const env = await makeEnv(kind);
    const order = await placePaidOrder(env.h, [{ merchandiseId: V.hero30, quantity: 3 }, { merchandiseId: V.oil100 }]);
    expect(order).toMatchObject({
      fulfilmentStatus: 'UNFULFILLED', packingInstructions: null, internalNotes: null,
      shippingAddress: { name: 'Sam Buyer', line1: '100 Sample Street', line2: 'Unit 4', city: 'Toronto', province: 'ON', postalCode: 'M5V 2T6', country: 'CA' },
    });
    const moves = (await env.admin.listMovements({ first: 10, beforeId: null })).map((m) => [m.sku, m.delta, m.reason, m.availableAfter, m.orderId, m.staffId]);
    expect(moves.sort()).toEqual([['SAMPLE-CAB-100', -1, 'ORDER_PAID', 21, order.id, null], ['SAMPLE-LBO-30', -3, 'ORDER_PAID', 37, order.id, null]]);
  });

  t('a duplicate delivery adds no second movement; an order without an address is still created', async () => {
    const env = await makeEnv(kind);
    const order = await placePaidOrder(env.h, [{ merchandiseId: V.hero30 }], { collected_information: null });
    expect(order.shippingAddress).toBeNull();
    const body = sessionEvent('checkout.session.completed', paidSession(env.h, { id: order.stripeSessionId }), 'evt_other_id');
    await deliver(env.h, body);
    expect(await env.admin.listMovements({ first: 10, beforeId: null })).toHaveLength(1);
    expect(await env.h.repo.countOrders()).toBe(1);
  });

  t('an unusable address (missing street) is stored as null and control characters are stripped', async () => {
    const env = await makeEnv(kind);
    const bad = await placePaidOrder(env.h, [{ merchandiseId: V.hero30 }], { collected_information: { shipping_details: { name: 'X', address: { city: 'Toronto', country: 'CA' } } } });
    expect(bad.shippingAddress).toBeNull();
    const messy = await placePaidOrder(env.h, [{ merchandiseId: V.hero30 }], {
      collected_information: { shipping_details: { name: 'Sam\u0000\n', address: { line1: '1 Main\tSt', city: 'Ottawa', state: 'ON', postal_code: 'K1A 0B1', country: 'ca' } } },
    });
    expect(messy.shippingAddress).toMatchObject({ name: 'Sam', line1: '1 Main St', country: 'CA', line2: null });
  });

  t('stock never goes negative on a sale and the movement records the real decrement', async () => {
    const env = await makeEnv(kind);
    await env.h.repo.updateVariant(V.hawthorn30, { quantity: 1 });
    const order = await placePaidOrder(env.h, [{ merchandiseId: V.hawthorn30, quantity: 1 }]);
    expect(order.reviewFlags).toEqual([]);
    await env.h.repo.updateVariant(V.hawthorn30, { quantity: 0 });
    const m = await env.admin.listMovements({ first: 5, beforeId: null });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ delta: -1, availableAfter: 0 });
  });

  t('the storefront lists and sells ACTIVE products only', async () => {
    const env = await makeEnv(kind);
    const before = (await env.h.storefront.products({})).nodes.length;
    expect(before).toBe(9);
    const draftSku = 'gid://crater/Product/12';
    await setStatus(env, 12, 'DRAFT');
    expect((await env.h.storefront.products({})).nodes.map((p) => p.handle)).not.toContain('peppermint-ginger-extract');
    expect(await env.h.storefront.product({ handle: 'peppermint-ginger-extract' })).toBeNull();
    expect((await env.h.storefront.collections()).length).toBe(8);
    expect((await env.h.repo.listProducts()).map((p) => p.id)).not.toContain(draftSku);
    expect((await env.h.repo.listProducts({ includeInactive: true })).map((p) => p.id)).toContain(draftSku);
    expect((await env.h.repo.listCollections()).flatMap((c) => c.productHandles)).not.toContain('peppermint-ginger-extract');
    const added = await env.h.storefront.cartCreate({ input: { lines: [{ merchandiseId: V.peppermint30 }] } });
    expect(added.cart).toBeNull();
    expect(added.userErrors.length).toBeGreaterThan(0);
    // Checkout cannot sell a draft either: a bag that already held it can no longer check out.
    await setStatus(env, 12, 'ACTIVE');
    const cart = await cartWith(env.h, [{ merchandiseId: V.peppermint30 }]);
    await setStatus(env, 12, 'ARCHIVED');
    const res = await env.h.checkout.createCheckoutSession(cart.id);
    expect(res.ok).toBe(false);
    expect(env.h.stripe.create).not.toHaveBeenCalled();
  });

  t('open-cart counts per variant: live bags only, one per bag, completed and expired excluded', async () => {
    const env = await makeEnv(kind);
    const cutoff = () => new Date(env.clock.now.getTime() - CART_TTL_MS);
    await cartWith(env.h, [{ merchandiseId: V.hero30, quantity: 2 }, { merchandiseId: V.peppermint30 }]);
    await cartWith(env.h, [{ merchandiseId: V.hero30 }]);
    expect(Object.fromEntries(await env.h.repo.openCartCounts(cutoff()))).toEqual({ [V.hero30]: 2, [V.peppermint30]: 1 });
    await placePaidOrder(env.h, [{ merchandiseId: V.hero30 }]); // completes its own bag
    expect((await env.h.repo.openCartCounts(cutoff())).get(V.hero30)).toBe(2);
    env.clock.advance(CART_TTL_MS + 60_000); // everything is now older than the TTL
    expect((await env.h.repo.openCartCounts(cutoff())).size).toBe(0);
  });

  t('webhook outcomes are logged for processed, duplicate, rejected and failed events, without ever changing the answer', async () => {
    const env = await makeEnv(kind);
    const order = await placePaidOrder(env.h, [{ merchandiseId: V.hero30 }]);
    const dup = sessionEvent('checkout.session.completed', paidSession(env.h, { id: order.stripeSessionId }), 'evt_dup_x');
    expect((await deliver(env.h, dup)).status).toBe(200);
    const expiredBody = sessionEvent('checkout.session.expired', { id: 'cs_test_expiredxxxxxx1', metadata: { checkout_id: `chk_${'b'.repeat(32)}` } }, 'evt_exp_1');
    expect((await deliver(env.h, expiredBody)).status).toBe(200);
    const spy = vi.spyOn(env.h.repo, 'recordWebhookEvent').mockRejectedValueOnce(new Error('log table down'));
    expect((await deliver(env.h, sessionEvent('checkout.session.expired', { id: 'cs_test_expiredxxxxxx2', metadata: { checkout_id: `chk_${'c'.repeat(32)}` } }, 'evt_exp_2'))).status).toBe(200); // logging failure is swallowed
    spy.mockRestore();
    const boom = vi.spyOn(env.h.repo, 'recordCheckoutStatus').mockRejectedValueOnce(new Error('db down'));
    expect((await deliver(env.h, sessionEvent('checkout.session.expired', { id: 'cs_test_expiredxxxxxx3', metadata: { checkout_id: `chk_${'d'.repeat(32)}` } }, 'evt_exp_3'))).status).toBe(500);
    boom.mockRestore();
    const outcomes = (await env.admin.listWebhookEvents(10)).map((e) => [e.eventId, e.outcome]);
    expect(outcomes).toEqual([['evt_exp_3', 'FAILED'], ['evt_exp_1', 'PROCESSED'], ['evt_dup_x', 'DUPLICATE'], [expect.stringMatching(/^evt_admin_/), 'PROCESSED']]);
    expect((await env.admin.webhookHealth(new Date(env.clock.now.getTime() - 86_400_000))).failedSince).toBe(1);
  });
});

async function setStatus(env: Awaited<ReturnType<typeof makeEnv>>, productNumber: number, status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED') {
  if (env.kind === 'memory') {
    memoryStateOf(env.h.repo).products.find((p) => p.id === `gid://crater/Product/${productNumber}`)!.status = status;
    return;
  }
  const { pgPoolOf } = await import('@/lib/commerce/postgres-repository');
  await pgPoolOf(env.h.repo).query(
    "update commerce.products set status = $2, archived_at = case when $2 = 'ARCHIVED' then now() else null end where id = $1",
    [productNumber, status],
  );
}
