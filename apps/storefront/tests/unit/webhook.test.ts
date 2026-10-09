import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliver, cartWith, makeHarness, paidSession, SESSION_ID, sessionEvent, sign, V, variantQuantity, type Harness } from './helpers/harness';
import { closePoolsAfterAll, makeRepo, REPO_KINDS, skipUnavailable } from './helpers/repos';

closePoolsAfterAll();
afterEach(() => vi.restoreAllMocks());

describe.each(REPO_KINDS)('Stripe webhook and fulfilment [%s repository]', (kind) => {
  const setup = async () => makeHarness({ repo: await makeRepo(kind) });
  const run = skipUnavailable(kind) ? it.skip : it;
  const quantity = async (h: Harness, id: string) => variantQuantity(await h.repo.listProducts(), id);

  /** Fills a cart, starts checkout, returns the pieces needed to simulate Stripe's callbacks. */
  async function started(
    h: Harness,
    lines: { merchandiseId: string; quantity?: number }[] = [{ merchandiseId: V.hero30, quantity: 2 }, { merchandiseId: V.peppermint30 }],
  ) {
    const cart = await cartWith(h, lines);
    const r = await h.checkout.createCheckoutSession(cart.id);
    expect(r.ok).toBe(true);
    return cart;
  }

  run('missing or invalid signatures -> 400 with no details; nothing is written', async () => {
    const h = await setup();
    const cart = await started(h);
    const body = sessionEvent('checkout.session.completed', paidSession(h));
    const results = [
      await h.checkout.handleStripeWebhook(body, null),
      await h.checkout.handleStripeWebhook(body, ''),
      await h.checkout.handleStripeWebhook(body, 'garbage'),
      await h.checkout.handleStripeWebhook(body, sign(body, 'whsec_wrong_secret')),
      await h.checkout.handleStripeWebhook(body + ' ', sign(body)), // body altered after signing (re-serialised JSON)
      await h.checkout.handleStripeWebhook(JSON.stringify(JSON.parse(body)), sign(body.replace(/^\{/, '{ '))),
    ];
    for (const r of results) {
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ error: 'invalid_request' });
    }
    expect(await h.repo.countOrders()).toBe(0);
    expect(await h.storefront.cart({ id: cart.id })).not.toBeNull();
  });

  run('an expired timestamp is rejected', async () => {
    const h = await setup();
    await started(h);
    const body = sessionEvent('checkout.session.completed', paidSession(h));
    const old = Math.floor(Date.now() / 1000) - 3600;
    const header = (await import('./helpers/harness')).realStripe.webhooks.generateTestHeaderString({ payload: body, secret: 'whsec_unit_test_secret', timestamp: old });
    expect((await h.checkout.handleStripeWebhook(body, header)).status).toBe(400);
  });

  run('refuses to process when the webhook secret is not configured', async () => {
    const h = await makeHarness({ repo: await makeRepo(kind), env: { STRIPE_WEBHOOK_SECRET: '' } });
    const body = '{}';
    expect((await h.checkout.handleStripeWebhook(body, sign(body, 'whsec_x'))).status).toBe(503);
    const fixture = await makeHarness({ repo: await makeRepo(kind), env: { COMMERCE_PROVIDER: 'fixture' } });
    expect((await fixture.checkout.handleStripeWebhook(body, sign(body))).status).toBe(503);
  });

  run('paid session creates order #1001 from the snapshot, decrements stock, completes the cart', async () => {
    const h = await setup();
    const cart = await started(h);
    const before = { serum: await quantity(h, V.hero30), cream: await quantity(h, V.peppermint30) };
    const r = await deliver(h, sessionEvent('checkout.session.completed', paidSession(h)));
    expect(r.status).toBe(200);
    expect(await h.repo.countOrders()).toBe(1);

    const result = await h.checkout.getCheckoutResult(SESSION_ID);
    expect(result.status).toBe('paid');
    expect(result.order).toMatchObject({
      name: '#1001',
      email: 'buyer@example.com',
      financialStatus: 'PAID',
      currencyCode: 'CAD',
      subtotalPrice: { amount: '70.00' },
      totalShippingPrice: { amount: '0.00' },
      totalTax: { amount: '9.10' },
      totalPrice: { amount: '79.10' },
      lineItems: [
        { title: 'Lemon Balm & Oat Extract', variantTitle: '30 mL', quantity: 2, originalUnitPrice: { amount: '24.00' }, originalTotalPrice: { amount: '48.00' }, variantId: V.hero30 },
        { title: 'Peppermint & Ginger Extract', quantity: 1, originalTotalPrice: { amount: '22.00' } },
      ],
    });
    expect(result.order!.id).toMatch(/^gid:\/\/crater\/Order\/\d+$/);
    expect(await quantity(h, V.hero30)).toBe(before.serum! - 2);
    expect(await quantity(h, V.peppermint30)).toBe(before.cream! - 1);
    // The completed cart is gone for the shopper.
    expect(await h.storefront.cart({ id: cart.id })).toBeNull();
    expect((await h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.hero30 }] })).userErrors[0].code).toBe('MISSING_CART');
  });

  run('duplicate deliveries (same event, or different event for the same session) create one order and decrement once', async () => {
    const h = await setup();
    await started(h);
    const before = await quantity(h, V.hero30);
    const body = sessionEvent('checkout.session.completed', paidSession(h), 'evt_dup_1');
    expect((await deliver(h, body)).status).toBe(200);
    expect((await deliver(h, body)).status).toBe(200);
    expect((await deliver(h, sessionEvent('checkout.session.async_payment_succeeded', paidSession(h), 'evt_dup_2'))).status).toBe(200);
    expect(await h.repo.countOrders()).toBe(1);
    expect(await quantity(h, V.hero30)).toBe(before! - 2);
  });

  run('simultaneous deliveries of one event are processed once', async () => {
    const h = await setup();
    await started(h);
    const before = await quantity(h, V.hero30);
    const body = sessionEvent('checkout.session.completed', paidSession(h), 'evt_race');
    const other = sessionEvent('checkout.session.async_payment_succeeded', paidSession(h), 'evt_race_b');
    const results = await Promise.all([deliver(h, body), deliver(h, body), deliver(h, other), deliver(h, body)]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(await h.repo.countOrders()).toBe(1);
    expect(await quantity(h, V.hero30)).toBe(before! - 2);
  });

  run('amount mismatch is flagged: order PENDING, redacted warning, nothing silently trusted', async () => {
    const h = await setup();
    await started(h);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const session = paidSession(h, { amount_subtotal: 100, amount_total: 100 });
    expect((await deliver(h, sessionEvent('checkout.session.completed', session))).status).toBe(200);
    const order = await h.repo.getOrderBySessionId(SESSION_ID);
    expect(order).toMatchObject({ financialStatus: 'PENDING', subtotalMinor: 7000, totalMinor: 100 });
    expect(order!.reviewFlags).toEqual(expect.arrayContaining(['AMOUNT_MISMATCH']));
    // The buyer-facing result never shows an order Crater has not confirmed.
    expect(await h.checkout.getCheckoutResult(SESSION_ID)).toEqual({ status: 'processing', order: null });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('AMOUNT_MISMATCH');
    expect(logged).not.toContain(SESSION_ID); // only a truncated form is logged
    expect(logged).not.toContain('buyer@example.com');
  });

  run('currency, reference, and total disagreements are flagged too', async () => {
    const h = await setup();
    await started(h);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const session = paidSession(h, { currency: 'usd', amount_total: 99999, metadata: { ...(paidSession(h).metadata as object), cart_id: 'someone-elses' } });
    await deliver(h, sessionEvent('checkout.session.completed', session));
    const order = await h.repo.getOrderBySessionId(SESSION_ID);
    expect(order!.financialStatus).toBe('PENDING');
    expect(order!.reviewFlags).toEqual(expect.arrayContaining(['CURRENCY_MISMATCH', 'REFERENCE_MISMATCH', 'TOTAL_MISMATCH']));
  });

  run('stock that vanished between checkout and payment floors at zero and flags INVENTORY_SHORT', async () => {
    const h = await setup();
    await started(h, [{ merchandiseId: V.hawthorn30, quantity: 2 }]);
    await h.repo.updateVariant(V.hawthorn30, { quantity: 1 });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await deliver(h, sessionEvent('checkout.session.completed', paidSession(h)));
    const order = await h.repo.getOrderBySessionId(SESSION_ID);
    expect(order!.financialStatus).toBe('PAID'); // the money is real
    expect(order!.reviewFlags).toContain('INVENTORY_SHORT');
    expect(await quantity(h, V.hawthorn30)).toBe(0);
  });

  run('order names are sequential from #1001', async () => {
    const h = await setup();
    for (const [i, sessionId] of ['cs_test_aaaaaaaaaaaa1', 'cs_test_bbbbbbbbbbbb2'].entries()) {
      h.stripe.create.mockResolvedValueOnce({ id: sessionId, url: `https://checkout.stripe.com/c/pay/${sessionId}` } as never);
      await started(h, [{ merchandiseId: V.oil100 }]);
      await deliver(h, sessionEvent('checkout.session.completed', paidSession(h, { id: sessionId }), `evt_seq_${i}`));
    }
    const names = [];
    for (const id of ['cs_test_aaaaaaaaaaaa1', 'cs_test_bbbbbbbbbbbb2']) names.push((await h.checkout.getCheckoutResult(id)).order!.name);
    expect(names).toEqual(['#1001', '#1002']);
  });

  run('delayed payment: completed+unpaid waits; async_payment_succeeded creates the order', async () => {
    const h = await setup();
    await started(h);
    await deliver(h, sessionEvent('checkout.session.completed', paidSession(h, { payment_status: 'unpaid' }), 'evt_a'));
    expect(await h.repo.countOrders()).toBe(0);
    expect(await h.checkout.getCheckoutResult(SESSION_ID)).toEqual({ status: 'processing', order: null });
    await deliver(h, sessionEvent('checkout.session.async_payment_succeeded', paidSession(h), 'evt_b'));
    expect(await h.repo.countOrders()).toBe(1);
    expect((await h.checkout.getCheckoutResult(SESSION_ID)).status).toBe('paid');
  });

  run('async_payment_failed and expired mark the checkout and keep the cart', async () => {
    const h = await setup();
    const cart = await started(h);
    await deliver(h, sessionEvent('checkout.session.async_payment_failed', paidSession(h, { payment_status: 'unpaid' }), 'evt_f'));
    expect(await h.repo.countOrders()).toBe(0);
    expect((await h.repo.getCheckoutBySessionId(SESSION_ID))!.status).toBe('payment_failed');
    expect(await h.checkout.getCheckoutResult(SESSION_ID)).toEqual({ status: 'unpaid', order: null });
    expect(await h.storefront.cart({ id: cart.id })).not.toBeNull();

    h.stripe.create.mockResolvedValueOnce({ id: 'cs_test_expired00001', url: 'https://checkout.stripe.com/c/pay/cs_test_expired00001' } as never);
    await h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.oil100 }] });
    await h.checkout.createCheckoutSession(cart.id);
    await deliver(h, sessionEvent('checkout.session.expired', paidSession(h, { id: 'cs_test_expired00001', payment_status: 'unpaid' }), 'evt_e'));
    expect((await h.repo.getCheckoutBySessionId('cs_test_expired00001'))!.status).toBe('expired');
  });

  run('a late failure event cannot undo a paid order', async () => {
    const h = await setup();
    await started(h);
    await deliver(h, sessionEvent('checkout.session.completed', paidSession(h), 'evt_p'));
    await deliver(h, sessionEvent('checkout.session.expired', paidSession(h), 'evt_late'));
    expect((await h.repo.getCheckoutBySessionId(SESSION_ID))!.status).toBe('completed');
    expect((await h.checkout.getCheckoutResult(SESSION_ID)).status).toBe('paid');
  });

  run('other event types and unknown checkouts are acknowledged without effect', async () => {
    const h = await setup();
    await started(h);
    expect((await deliver(h, sessionEvent('charge.refunded', {}, 'evt_x'))).status).toBe(200);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const stray = paidSession(h, { id: 'cs_test_stray0000001', metadata: { checkout_id: 'chk_' + '0'.repeat(32), cart_id: 'x' } });
    expect((await deliver(h, sessionEvent('checkout.session.completed', stray, 'evt_y'))).status).toBe(200);
    // A real checkout id paired with a session id that is not its own is rejected.
    const swapped = paidSession(h, { id: 'cs_test_swapped000001' });
    expect((await deliver(h, sessionEvent('checkout.session.completed', swapped, 'evt_z'))).status).toBe(200);
    expect(await h.repo.countOrders()).toBe(0);
  });
});

describe.each(REPO_KINDS)('getCheckoutResult [%s repository]', (kind) => {
  const run = skipUnavailable(kind) ? it.skip : it;

  run('validates the session id format and never returns another session\'s order', async () => {
    const h = await makeHarness({ repo: await makeRepo(kind) });
    for (const bad of ['', 'cs_test_', 'nope', "cs_test_abc'; drop table orders;--", 'cs_prod_aaaaaaaaaaaa', 'x'.repeat(500), 'cs_test_' + 'a'.repeat(300)]) {
      expect(await h.checkout.getCheckoutResult(bad)).toEqual({ status: 'not_found', order: null });
    }
    expect(await h.checkout.getCheckoutResult('cs_test_neverheardof1234')).toEqual({ status: 'not_found', order: null });

    // Two buyers; each session id yields only its own order.
    const ids = ['cs_test_buyerone00001', 'cs_test_buyertwo00002'];
    for (const [i, id] of ids.entries()) {
      h.stripe.create.mockResolvedValueOnce({ id, url: `https://checkout.stripe.com/c/pay/${id}` } as never);
      const cart = await cartWith(h, [{ merchandiseId: i === 0 ? V.hero30 : V.oil100 }]);
      await h.checkout.createCheckoutSession(cart.id);
      await deliver(h, sessionEvent('checkout.session.completed', paidSession(h, { id, customer_details: { email: `buyer${i}@example.com` } }), `evt_r${i}`));
    }
    const one = await h.checkout.getCheckoutResult(ids[0]);
    const two = await h.checkout.getCheckoutResult(ids[1]);
    expect(one.order!.email).toBe('buyer0@example.com');
    expect(two.order!.email).toBe('buyer1@example.com');
    expect(one.order!.lineItems[0].title).toBe('Lemon Balm & Oat Extract');
    expect(two.order!.lineItems[0].title).toBe('Calendula & Almond Body Oil');
  });

  run('asks Stripe when a session has no order yet, and degrades to "processing" if Stripe is unreachable', async () => {
    const h = await makeHarness({ repo: await makeRepo(kind) });
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    await h.checkout.createCheckoutSession(cart.id);
    expect(await h.checkout.getCheckoutResult(SESSION_ID)).toEqual({ status: 'unpaid', order: null });
    h.stripe.retrieve.mockResolvedValueOnce({ id: SESSION_ID, payment_status: 'paid', status: 'complete' });
    expect((await h.checkout.getCheckoutResult(SESSION_ID)).status).toBe('processing');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    h.stripe.retrieve.mockRejectedValueOnce(new Error('network down'));
    expect((await h.checkout.getCheckoutResult(SESSION_ID)).status).toBe('processing');
  });
});
