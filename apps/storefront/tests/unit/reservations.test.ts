import { describe, expect, it } from 'vitest';
import { CHECKOUT_RESERVATION_MS } from '@/lib/commerce/checkout';
import { cartWith, deliver, makeHarness, paidSession, sessionEvent, V, variantQuantity } from './helpers/harness';
import { closePoolsAfterAll, makeRepo, REPO_KINDS, skipUnavailable } from './helpers/repos';

closePoolsAfterAll();
describe.each(REPO_KINDS)('checkout stock reservations [%s]', kind => {
  const run = skipUnavailable(kind) ? it.skip : it;
  async function setup() {
    const h = await makeHarness({ repo: await makeRepo(kind) });
    await h.repo.updateVariant(V.hero30, { quantity: 1 });
    const sessions = new Map<string, string>();
    h.stripe.create.mockImplementation((async (_params: unknown, options: { idempotencyKey: string }) => {
      const id = sessions.get(options.idempotencyKey) ?? `cs_test_reserved${String(sessions.size + 1).padStart(10, '0')}`;
      sessions.set(options.idempotencyKey, id);
      return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
    }) as never);
    return h;
  }
  const stock = async (h: Awaited<ReturnType<typeof setup>>) => variantQuantity(await h.repo.listProducts(), V.hero30);
  const lastSession = (h: Awaited<ReturnType<typeof setup>>) => {
    const params = (h.stripe.create.mock.calls as unknown as unknown[][]).at(-1)?.[0] as { client_reference_id: string };
    return h.repo.getCheckout(params.client_reference_id);
  };
  run('two buyers racing for one unit create only one hosted checkout', async () => {
    const h = await setup();
    const a = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    const b = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    const results = await Promise.all([h.checkout.createCheckoutSession(a.id), h.checkout.createCheckoutSession(b.id)]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.filter(r => !r.ok)).toEqual([{ ok: false, code: 'CART_INVALID', message: expect.any(String) }]);
    expect(h.stripe.create).toHaveBeenCalledTimes(1);
    expect(await stock(h)).toBe(1); // reservation is not a physical stock movement
  });
  run('simultaneous repeat clicks reuse one reservation and provider idempotency key', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    const results = await Promise.all(Array.from({ length: 8 }, () => h.checkout.createCheckoutSession(cart.id)));
    expect(results.every(r => r.ok)).toBe(true);
    const calls = h.stripe.create.mock.calls as unknown as [unknown, { idempotencyKey: string }][];
    expect(new Set(calls.map(call => call[1].idempotencyKey)).size).toBe(1);
    const held = (await lastSession(h))!;
    expect(held.reservationExpiresAt).toBe(new Date(h.clock.now.getTime() + CHECKOUT_RESERVATION_MS).toISOString());
    expect((calls[0][0] as { expires_at: number }).expires_at).toBe(Math.floor(new Date(held.reservationExpiresAt!).getTime() / 1000));
  });
  run('expiry releases availability without needing a webhook or a worker', async () => {
    const h = await setup();
    const a = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    await h.checkout.createCheckoutSession(a.id);
    h.clock.now = new Date(h.clock.now.getTime() + CHECKOUT_RESERVATION_MS);
    const b = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    expect((await h.checkout.createCheckoutSession(b.id)).ok).toBe(true);
  });
  run('verified failure releases the hold; a late paid event preserves other buyers holds and the paid order', async () => {
    const h = await setup();
    const a = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    await h.checkout.createCheckoutSession(a.id);
    const first = (await lastSession(h))!;
    const paidA = paidSession(h, { id: first.stripeSessionId });
    await deliver(h, sessionEvent('checkout.session.expired', { ...paidA, payment_status: 'unpaid' }, 'evt_res_expire'));
    const b = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    expect((await h.checkout.createCheckoutSession(b.id)).ok).toBe(true);
    const second = (await lastSession(h))!;
    const paidB = paidSession(h, { id: second.stripeSessionId });
    await deliver(h, sessionEvent('checkout.session.completed', paidA, 'evt_late_paid'));
    const orderA = (await h.repo.getOrderBySessionId(first.stripeSessionId!))!;
    expect(orderA.financialStatus).toBe('PAID');
    expect(orderA.reviewFlags).toEqual(expect.arrayContaining(['RESERVATION_EXPIRED', 'INVENTORY_SHORT']));
    expect(await stock(h)).toBe(1);
    await deliver(h, sessionEvent('checkout.session.completed', paidB, 'evt_current_paid'));
    expect((await h.repo.getOrderBySessionId(second.stripeSessionId!))?.reviewFlags).toEqual([]);
    expect(await stock(h)).toBe(0);
    await deliver(h, sessionEvent('checkout.session.completed', paidA, 'evt_late_paid_replay'));
    expect(await h.repo.countOrders()).toBe(2);
    expect(await stock(h)).toBe(0);
  });
  run('ambiguous provider timeout keeps the hold and explicit retry reuses its key', async () => {
    const h = await setup();
    const a = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    const b = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    h.stripe.create.mockRejectedValueOnce(new Error('timeout'));
    expect((await h.checkout.createCheckoutSession(a.id)).ok).toBe(false);
    expect(await h.checkout.createCheckoutSession(b.id)).toMatchObject({ ok: false, code: 'CART_INVALID' });
    expect((await h.checkout.createCheckoutSession(a.id)).ok).toBe(true);
    const calls = h.stripe.create.mock.calls as unknown as [unknown, { idempotencyKey: string }][];
    expect(calls[0][1].idempotencyKey).toBe(calls[1][1].idempotencyKey);
  });
  run('a status callback for another session cannot release this checkout hold', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    await h.checkout.createCheckoutSession(cart.id);
    await deliver(h, sessionEvent('checkout.session.expired', paidSession(h, { id: 'cs_test_wrongsession00001', payment_status: 'unpaid' }), 'evt_wrong_expire'));
    expect((await h.repo.reservedQuantities(h.clock.now)).get(V.hero30)).toBe(1);
    expect((await lastSession(h))?.status).toBe('session_created');
  });
  run('a cart changed while prices were loading cannot reserve an old snapshot', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    const original = h.repo.reserveCheckout.bind(h.repo);
    h.repo.reserveCheckout = async (snapshot, revision, now) => {
      await h.repo.updateCart(cart.id, current => ({ cart: { ...current, lines: [] }, value: null }));
      return original(snapshot, revision, now);
    };
    expect(await h.checkout.createCheckoutSession(cart.id)).toMatchObject({ ok: false, code: 'CART_INVALID' });
    expect(h.stripe.create).not.toHaveBeenCalled();
    expect(await h.repo.reservedQuantities(h.clock.now)).toEqual(new Map());
  });
  run('reservation sums separate cart lines of the same variant before comparing stock', async () => {
    const h = await setup();
    await h.repo.updateVariant(V.hero30, { quantity: 2 });
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    await h.repo.updateCart(cart.id, current => ({ cart: { ...current, lineSeq: 2, lines: [...current.lines, { ...current.lines[0], n: 2, quantity: 2, attributes: [{ key: 'gift', value: 'yes' }] }] }, value: null }));
    expect(await h.checkout.createCheckoutSession(cart.id)).toMatchObject({ ok: false, code: 'CART_INVALID' });
    expect(h.stripe.create).not.toHaveBeenCalled();
    expect(await h.repo.reservedQuantities(h.clock.now)).toEqual(new Map());
  });
  run('untracked stock stays null and does not receive a fabricated finite balance', async () => {
    const h = await setup();
    await h.repo.updateVariant(V.hero30, { quantity: null });
    const a = await cartWith(h, [{ merchandiseId: V.hero30, quantity: 10 }]);
    const b = await cartWith(h, [{ merchandiseId: V.hero30, quantity: 10 }]);
    expect((await h.checkout.createCheckoutSession(a.id)).ok).toBe(true);
    expect((await h.checkout.createCheckoutSession(b.id)).ok).toBe(true);
    expect(await stock(h)).toBeNull();
  });
});
