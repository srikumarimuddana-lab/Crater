import { afterEach, describe, expect, it, vi } from 'vitest';
import { cartRefOf } from '@/lib/commerce/checkout';
import { isStripeCheckoutUrl } from '@/lib/commerce/stripe-client';
import { cartWith, makeHarness, SESSION_ID, STRIPE_URL, V } from './helpers/harness';
import { closePoolsAfterAll, makeRepo, REPO_KINDS, skipUnavailable } from './helpers/repos';

closePoolsAfterAll();
afterEach(() => vi.restoreAllMocks());

type CreateCall = [Record<string, unknown>, { idempotencyKey: string }];
const lastCall = (h: Awaited<ReturnType<typeof makeHarness>>) => (h.stripe.create.mock.calls as unknown as CreateCall[]).at(-1)!;

describe.each(REPO_KINDS)('createCheckoutSession [%s repository]', (kind) => {
  const setup = async (env?: Record<string, string | undefined>) => makeHarness({ repo: await makeRepo(kind), env });
  const run = skipUnavailable(kind) ? it.skip : it;

  run('fixture mode refuses and never touches Stripe', async () => {
    for (const env of [
      { COMMERCE_PROVIDER: undefined },
      { COMMERCE_PROVIDER: 'fixture' },
      { COMMERCE_PROVIDER: 'stripe', STRIPE_SECRET_KEY: undefined }, // misconfigured: still safe
      { COMMERCE_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'pk_test_notasecretkey' },
    ]) {
      const h = await setup(env);
      const cart = await cartWith(h, [{ merchandiseId: V.serum30 }]);
      const r = await h.checkout.createCheckoutSession(cart.id);
      expect(r).toMatchObject({ ok: false, code: 'FIXTURE_MODE' });
      expect(h.stripe.create).not.toHaveBeenCalled();
    }
  });

  run('refuses sk_live_ keys unless STRIPE_ALLOW_LIVE=true', async () => {
    const live = { STRIPE_SECRET_KEY: 'sk_live_abcDEF123456' };
    const h = await setup(live);
    const cart = await cartWith(h, [{ merchandiseId: V.serum30 }]);
    expect(await h.checkout.createCheckoutSession(cart.id)).toMatchObject({ ok: false, code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
    expect(h.stripe.create).not.toHaveBeenCalled();

    const typo = await setup({ ...live, STRIPE_ALLOW_LIVE: 'TRUE' }); // only the exact string "true" opts in
    const c2 = await cartWith(typo, [{ merchandiseId: V.serum30 }]);
    expect(await typo.checkout.createCheckoutSession(c2.id)).toMatchObject({ ok: false });

    const allowed = await setup({ ...live, STRIPE_ALLOW_LIVE: 'true' });
    const c3 = await cartWith(allowed, [{ merchandiseId: V.serum30 }]);
    expect(await allowed.checkout.createCheckoutSession(c3.id)).toMatchObject({ ok: true });

    const noHook = await setup({ ...live, STRIPE_ALLOW_LIVE: 'true', STRIPE_WEBHOOK_SECRET: '' });
    const c4 = await cartWith(noHook, [{ merchandiseId: V.serum30 }]);
    expect(await noHook.checkout.createCheckoutSession(c4.id)).toMatchObject({ ok: false, code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
  });

  run('empty, missing, expired, and malformed carts -> EMPTY_CART', async () => {
    const h = await setup();
    const empty = await cartWith(h, []);
    expect(await h.checkout.createCheckoutSession(empty.id)).toMatchObject({ ok: false, code: 'EMPTY_CART' });
    expect(await h.checkout.createCheckoutSession('gid://crater/Cart/' + 'A'.repeat(32))).toMatchObject({ code: 'EMPTY_CART' });
    expect(await h.checkout.createCheckoutSession('garbage')).toMatchObject({ code: 'EMPTY_CART' });
    const stale = await cartWith(h, [{ merchandiseId: V.serum30 }]);
    h.clock.now = new Date(h.clock.now.getTime() + 15 * 24 * 3600 * 1000);
    expect(await h.checkout.createCheckoutSession(stale.id)).toMatchObject({ code: 'EMPTY_CART' });
    expect(h.stripe.create).not.toHaveBeenCalled();
  });

  run('any invalid line -> CART_INVALID, with nothing sent to Stripe or persisted', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.serum30 }, { merchandiseId: V.creamRefill, quantity: 2 }]);
    await h.repo.updateVariant(V.creamRefill, { quantity: 1 }); // stock fell under the carted quantity
    expect(await h.checkout.createCheckoutSession(cart.id)).toMatchObject({ ok: false, code: 'CART_INVALID' });
    await h.repo.updateVariant(V.creamRefill, { quantity: 0 }); // now sold out
    expect(await h.checkout.createCheckoutSession(cart.id)).toMatchObject({ ok: false, code: 'CART_INVALID' });
    expect(h.stripe.create).not.toHaveBeenCalled();
    expect(await h.repo.findReusableCheckout(cart.id, 'x', new Date(0))).toBeNull();
  });

  run('sends our prices, metadata, and URLs; snapshot exists before the Stripe call', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.serum30, quantity: 2 }, { merchandiseId: V.cleanser }]);
    await h.repo.updateVariant(V.serum30, { priceMinor: 7000 }); // catalog changed after the cart was filled
    await h.storefront.cartPriceChangesAcknowledge({ cartId: cart.id }); // the shopper reviewed the new price
    let snapshotSeenBeforeCall: unknown = null;
    h.stripe.create.mockImplementationOnce((async (params: { client_reference_id: string }) => {
      snapshotSeenBeforeCall = await h.repo.getCheckout(params.client_reference_id);
      return { id: SESSION_ID, url: STRIPE_URL };
    }) as never);

    const r = await h.checkout.createCheckoutSession(cart.id);
    expect(r).toEqual({ ok: true, redirectUrl: STRIPE_URL });
    const [params, options] = lastCall(h);
    expect(params).toMatchObject({
      mode: 'payment',
      line_items: [
        { quantity: 2, price_data: { currency: 'cad', unit_amount: 7000, product_data: { name: 'Mineral Serum — 30 mL' } } },
        { quantity: 1, price_data: { currency: 'cad', unit_amount: 3400, product_data: { name: 'Gel Cleanser — 150 mL' } } },
      ],
      shipping_address_collection: { allowed_countries: ['CA'] },
      phone_number_collection: { enabled: false },
      success_url: 'https://shop.example/checkout/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://shop.example/cart?checkout=cancelled',
    });
    expect(params).not.toHaveProperty('automatic_tax'); // Stripe Tax is an owner decision
    expect(params).not.toHaveProperty('shipping_options');
    const meta = params.metadata as { cart_id: string; checkout_id: string };
    expect(meta.checkout_id).toMatch(/^chk_[a-f0-9]{32}$/);
    expect(params.client_reference_id).toBe(meta.checkout_id);
    // The bearer cart id never goes to Stripe; a one-way reference does.
    expect(meta.cart_id).toBe(cartRefOf(cart.id));
    expect(JSON.stringify(params)).not.toContain(cart.id);
    expect(options.idempotencyKey).toBe(`crater-${meta.checkout_id}`);

    expect(snapshotSeenBeforeCall).toMatchObject({ cartId: cart.id, subtotalMinor: 17400, status: 'created', stripeSessionId: null });
    const saved = await h.repo.getCheckout(meta.checkout_id);
    expect(saved).toMatchObject({ status: 'session_created', stripeSessionId: SESSION_ID });
    expect(saved!.lines.map((l) => l.unitMinor)).toEqual([7000, 3400]);
  });

  run('idempotency: repeat clicks on an unchanged cart reuse the key; a changed cart gets a new one', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.serum30 }]);
    await h.checkout.createCheckoutSession(cart.id);
    await h.checkout.createCheckoutSession(cart.id);
    const [, first] = (h.stripe.create.mock.calls as unknown as CreateCall[])[0];
    const [, second] = (h.stripe.create.mock.calls as unknown as CreateCall[])[1];
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    await h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.serum30 }] });
    h.stripe.create.mockResolvedValueOnce({ id: 'cs_test_secondsession01', url: 'https://checkout.stripe.com/c/pay/cs_test_secondsession01' } as never);
    await h.checkout.createCheckoutSession(cart.id);
    expect(lastCall(h)[1].idempotencyKey).not.toBe(first.idempotencyKey);
  });

  run('rejects any redirect host that is not exactly checkout.stripe.com', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const url of [
      'https://evil.example/pay',
      'https://checkout.stripe.com.evil.example/c/pay/x',
      'https://evilcheckout.stripe.com/x',
      'http://checkout.stripe.com/c/pay/x',
      'https://checkout.stripe.com@evil.example/x',
      'https://user:pw@checkout.stripe.com/x',
      'https://checkout.stripe.com:8443/x',
      'javascript:alert(1)',
      '//evil.example',
      '',
      null,
    ]) {
      const h = await setup();
      h.stripe.create.mockResolvedValueOnce({ id: SESSION_ID, url } as never);
      const cart = await cartWith(h, [{ merchandiseId: V.serum30 }]);
      const r = await h.checkout.createCheckoutSession(cart.id);
      expect(r, String(url)).toMatchObject({ ok: false, code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
      expect(isStripeCheckoutUrl(url)).toBe(false);
    }
    expect(isStripeCheckoutUrl(STRIPE_URL)).toBe(true);
  });

  run('Stripe failure returns a redacted error; the retry is explicit and reuses the idempotency key', async () => {
    const h = await setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    h.stripe.create.mockRejectedValueOnce(Object.assign(new Error('connect ETIMEDOUT with key sk_test_abc123DEF456'), { type: 'StripeConnectionError' }));
    const cart = await cartWith(h, [{ merchandiseId: V.serum30 }]);
    const r = await h.checkout.createCheckoutSession(cart.id);
    expect(r).toMatchObject({ ok: false, code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
    expect(JSON.stringify(r)).not.toMatch(/sk_test|ETIMEDOUT/);
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/sk_test_abc123DEF456/);
    expect(h.stripe.create).toHaveBeenCalledTimes(1); // no hidden retry
    const failedKey = lastCall(h)[1].idempotencyKey;
    const retry = await h.checkout.createCheckoutSession(cart.id); // the shopper clicks again
    expect(retry).toMatchObject({ ok: true });
    expect(lastCall(h)[1].idempotencyKey).toBe(failedKey);
  });

  run('refuses to run without a valid site origin', async () => {
    for (const NEXT_PUBLIC_SITE_URL of [undefined, 'not a url', 'http://shop.example', 'javascript:alert(1)', 'https://u:p@shop.example']) {
      const h = await setup({ NEXT_PUBLIC_SITE_URL });
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const cart = await cartWith(h, [{ merchandiseId: V.serum30 }]);
      expect(await h.checkout.createCheckoutSession(cart.id), String(NEXT_PUBLIC_SITE_URL)).toMatchObject({ ok: false });
      expect(h.stripe.create).not.toHaveBeenCalled();
    }
    const local = await setup({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3000/' });
    const cart = await cartWith(local, [{ merchandiseId: V.serum30 }]);
    expect(await local.checkout.createCheckoutSession(cart.id)).toMatchObject({ ok: true });
    expect(lastCall(local)[0].success_url).toBe('http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}');
  });
});
