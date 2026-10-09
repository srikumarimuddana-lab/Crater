import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkKey, run as runTaxRatesScript } from '../../scripts/stripe-tax-rates.mjs';
import { createCheckoutService } from '@/lib/commerce/checkout';
import { readConfig } from '@/lib/commerce/config';
import {
  PROVINCE_CODES, PROVINCE_TAX_KEYS, TAX_KEYS, TAX_RATES, TAX_REGISTRATIONS, isProvinceCode, normaliseProvince, sumTaxMinor, taxLinesFor,
  taxOnMinor, taxSettingsView,
} from '@/lib/commerce/tax';
import { ensureTaxRates, rateMatches, resolveTaxRateIds, type TaxRateApi } from '@/lib/commerce/tax-rates';
import type { ProvinceCode } from '@/lib/commerce/types';
import { cartWith, deliver, fakeTaxRates, makeHarness, mockStripe, paidSession, sessionEvent, SESSION_ID, TEST_ENV, V, type Harness } from './helpers/harness';
import { closePoolsAfterAll, makeRepo, REPO_KINDS, skipUnavailable } from './helpers/repos';

closePoolsAfterAll();
afterEach(() => vi.restoreAllMocks());

const amounts = (province: string | null, lines: number[]) => taxLinesFor(province, lines).map((l) => [l.key, l.amount.amount]);

describe('tax engine: rate table', () => {
  it('has exactly the documented keys and registrations', () => {
    expect([...TAX_KEYS].sort()).toEqual(['CA_GST', 'CA_HST_NB', 'CA_HST_NL', 'CA_HST_NS', 'CA_HST_ON', 'CA_HST_PE', 'SK_PST']);
    expect(TAX_REGISTRATIONS).toEqual(['CA_GST', 'SK_PST']);
    expect(PROVINCE_CODES).toHaveLength(13);
  });

  it.each([
    ['SK', [['CA_GST', '5.00'], ['SK_PST', '6.00']]],
    ['ON', [['CA_HST_ON', '13.00']]],
    ['NS', [['CA_HST_NS', '14.00']]],
    ['NB', [['CA_HST_NB', '15.00']]],
    ['NL', [['CA_HST_NL', '15.00']]],
    ['PE', [['CA_HST_PE', '15.00']]],
    ['AB', [['CA_GST', '5.00']]],
    ['BC', [['CA_GST', '5.00']]],
    ['MB', [['CA_GST', '5.00']]],
    ['QC', [['CA_GST', '5.00']]],
    ['NT', [['CA_GST', '5.00']]],
    ['NU', [['CA_GST', '5.00']]],
    ['YT', [['CA_GST', '5.00']]],
  ])('%s on a $100.00 line', (province, expected) => {
    expect(amounts(province, [10000])).toEqual(expected);
  });

  it('never charges BC PST, Manitoba RST or Quebec QST: only GST', () => {
    for (const p of ['BC', 'MB', 'QC']) expect(PROVINCE_TAX_KEYS[p as ProvinceCode]).toEqual(['CA_GST']);
  });

  it('titles and rates are shopper-ready', () => {
    const [gst, pst] = taxLinesFor('SK', [10000]);
    expect(gst).toMatchObject({ title: 'GST', ratePercent: '5' });
    expect(pst).toMatchObject({ title: 'PST (Saskatchewan)', ratePercent: '6' });
    expect(taxLinesFor('ON', [100])[0]).toMatchObject({ title: 'HST (Ontario)', ratePercent: '13' });
  });

  it('rounds half up in cents per line: $0.05 lines', () => {
    // 5c: 5% = 0.25 -> 0; 6% = 0.30 -> 0; 13% = 0.65 -> 1; 14% = 0.70 -> 1; 15% = 0.75 -> 1
    expect(amounts('AB', [5])).toEqual([['CA_GST', '0.00']]);
    expect(amounts('SK', [5])).toEqual([['CA_GST', '0.00'], ['SK_PST', '0.00']]);
    expect(amounts('ON', [5])).toEqual([['CA_HST_ON', '0.01']]);
    expect(amounts('NS', [5])).toEqual([['CA_HST_NS', '0.01']]);
    expect(amounts('NB', [5])).toEqual([['CA_HST_NB', '0.01']]);
    // exact halves round UP: 10c at 5% = 0.5 -> 1; 30c at 5% = 1.5 -> 2; 50c at 5% = 2.5 -> 3
    expect(taxOnMinor(10, '5')).toBe(1);
    expect(taxOnMinor(30, '5')).toBe(2);
    expect(taxOnMinor(50, '5')).toBe(3);
    expect(taxOnMinor(9, '5')).toBe(0); // 0.45
    // the classic floating-point trap: 1.005 style values must not be pushed down
    expect(taxOnMinor(1005, '10')).toBe(101); // 100.5 -> 101
    expect(taxOnMinor(2399, '5')).toBe(120); // 119.95 -> 120
    expect(taxOnMinor(2410, '5')).toBe(121); // 120.5 -> 121
  });

  it('rounds per line before summing (as Stripe does), not on the total', () => {
    // Two 5c lines at 13%: per line 1 + 1 = 2c; on the 10c total it would be 1.3 -> 1c.
    expect(amounts('ON', [5, 5])).toEqual([['CA_HST_ON', '0.02']]);
    // Mixed lines, SK: [2400, 2200, 5] -> GST 120+110+0 = 230, PST 144+132+0 = 276
    expect(amounts('SK', [2400, 2200, 5])).toEqual([['CA_GST', '2.30'], ['SK_PST', '2.76']]);
    expect(sumTaxMinor(taxLinesFor('SK', [2400, 2200, 5]))).toBe(506);
    // Each key is rounded independently
    expect(amounts('SK', [5, 5, 5])).toEqual([['CA_GST', '0.00'], ['SK_PST', '0.00']]);
  });

  it('empty cart, zero and negative lines produce zero tax; unknown or blank province produces no tax lines', () => {
    expect(amounts('SK', [])).toEqual([['CA_GST', '0.00'], ['SK_PST', '0.00']]);
    expect(amounts('SK', [0, -5])).toEqual([['CA_GST', '0.00'], ['SK_PST', '0.00']]);
    for (const bad of ['XX', '', ' ', 'sk', 'Saskatchewan', 'US', null, undefined]) expect(taxLinesFor(bad as never, [10000]), String(bad)).toEqual([]);
  });

  it('isProvinceCode / normaliseProvince', () => {
    expect(isProvinceCode('SK')).toBe(true);
    for (const bad of ['sk', 'XX', '', null, undefined, 5, '__proto__', 'toString']) expect(isProvinceCode(bad)).toBe(false);
    expect(normaliseProvince('on')).toBe('ON');
    expect(normaliseProvince(' Saskatchewan ')).toBe('SK');
    expect(normaliseProvince('newfoundland and labrador')).toBe('NL');
    expect(normaliseProvince('California')).toBeNull();
    expect(normaliseProvince('')).toBeNull();
    expect(normaliseProvince(undefined)).toBeNull();
  });

  it('exposes a read-only settings view for staff', () => {
    const v = taxSettingsView();
    expect(v.registrations).toEqual(['CA_GST', 'SK_PST']);
    expect(v.provinces).toHaveLength(13);
    expect(v.provinces.find((p) => p.code === 'SK')).toMatchObject({ name: 'Saskatchewan', lines: [{ key: 'CA_GST', ratePercent: '5' }, { key: 'SK_PST', title: 'PST (Saskatchewan)', ratePercent: '6' }] });
    expect(v.source).toMatch(/CRA/);
    expect(v.notice).toMatch(/Not tax advice/);
  });
});

describe('Stripe tax rates: ensure and resolve', () => {
  it('creates one exclusive rate per key with the documented attributes, and a second run changes nothing', async () => {
    const { api, rates } = fakeTaxRates(false);
    const first = await ensureTaxRates(api as unknown as TaxRateApi, TAX_RATES);
    expect(first.map((r) => r.action)).toEqual(TAX_KEYS.map(() => 'created'));
    expect(rates).toHaveLength(7);
    const sk = rates.find((r) => r.metadata?.crater_tax_key === 'SK_PST')!;
    expect(sk).toMatchObject({ display_name: 'PST (Saskatchewan)', percentage: 6, inclusive: false, country: 'CA', state: 'SK', jurisdiction: 'Saskatchewan', tax_type: 'pst', active: true });
    const gst = rates.find((r) => r.metadata?.crater_tax_key === 'CA_GST')!;
    expect(gst).toMatchObject({ display_name: 'GST', percentage: 5, country: 'CA', state: null });
    api.create.mockClear();
    api.update.mockClear();
    const second = await ensureTaxRates(api as unknown as TaxRateApi, TAX_RATES);
    expect(second.map((r) => r.action)).toEqual(TAX_KEYS.map(() => 'kept'));
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id));
  });

  it('archives a mismatched old rate (never mutates it) and creates the replacement; archives duplicates', async () => {
    const { api, rates } = fakeTaxRates(true);
    const stale = rates.find((r) => r.metadata?.crater_tax_key === 'SK_PST')!;
    stale.percentage = 5; // the province changed its rate: the old Stripe object is now wrong
    const dupe = { ...rates.find((r) => r.metadata?.crater_tax_key === 'CA_GST')!, id: 'txr_dupe' };
    rates.push(dupe);
    const report = await ensureTaxRates(api as unknown as TaxRateApi, TAX_RATES);
    expect(report.find((r) => r.key === 'SK_PST')).toMatchObject({ action: 'replaced', archived: [stale.id] });
    expect(report.find((r) => r.key === 'CA_GST')).toMatchObject({ action: 'kept', archived: ['txr_dupe'] });
    expect(stale.active).toBe(false);
    expect(stale.percentage).toBe(5); // untouched apart from archiving
    expect(api.update.mock.calls.every((c) => Object.keys(c[1]).join() === 'active')).toBe(true);
    const fresh = rates.find((r) => r.active && r.metadata?.crater_tax_key === 'SK_PST')!;
    expect(fresh.percentage).toBe(6);
    expect(rates.filter((r) => r.active)).toHaveLength(7);
  });

  it('pages through more than one list page and ignores rates it does not own', async () => {
    const { api, rates } = fakeTaxRates(true);
    for (let i = 0; i < 230; i++) rates.unshift({ ...rates[0], id: `txr_other_${i}`, metadata: { team: 'other' } });
    const ids = await resolveTaxRateIds(api as unknown as TaxRateApi, TAX_RATES, ['CA_GST', 'SK_PST']);
    expect([...ids]).toEqual([['CA_GST', 'txr_test_CA_GST'], ['SK_PST', 'txr_test_SK_PST']]);
    expect(api.list.mock.calls.length).toBeGreaterThan(2);
  });

  it('resolve fails for a missing, archived or outdated rate (and says how to fix it)', async () => {
    const { api, rates } = fakeTaxRates(true);
    rates.find((r) => r.metadata?.crater_tax_key === 'SK_PST')!.active = false;
    await expect(resolveTaxRateIds(api as unknown as TaxRateApi, TAX_RATES, ['SK_PST'])).rejects.toThrow(/npm run stripe:tax-rates/);
    rates.find((r) => r.metadata?.crater_tax_key === 'CA_GST')!.percentage = 7;
    await expect(resolveTaxRateIds(api as unknown as TaxRateApi, TAX_RATES, ['CA_GST'])).rejects.toThrow(/out of date/);
    expect(rateMatches(TAX_RATES, { ...rates[0], inclusive: true }, 'CA_GST')).toBe(false);
  });

  it('the script refuses live keys unless STRIPE_ALLOW_LIVE=true, rejects a missing key, and never prints the key', async () => {
    expect(() => checkKey({ STRIPE_SECRET_KEY: 'sk_live_abc123' })).toThrow(/live Stripe key/);
    expect(() => checkKey({ STRIPE_SECRET_KEY: 'rk_live_abc123', STRIPE_ALLOW_LIVE: 'yes' })).toThrow(/live Stripe key/);
    expect(checkKey({ STRIPE_SECRET_KEY: 'sk_live_abc123', STRIPE_ALLOW_LIVE: 'true' }).mode).toBe('live');
    expect(checkKey({ STRIPE_SECRET_KEY: 'sk_test_abc123' }).mode).toBe('test');
    for (const bad of [undefined, '', 'sk_test_', 'pk_test_abc', 'garbage']) expect(() => checkKey({ STRIPE_SECRET_KEY: bad })).toThrow(/STRIPE_SECRET_KEY/);
    const { api } = fakeTaxRates(false);
    const lines: string[] = [];
    const report = await runTaxRatesScript({ env: { STRIPE_SECRET_KEY: 'sk_test_SECRETVALUE123' }, api: api as unknown as TaxRateApi, log: (l) => lines.push(l) });
    expect(report).toHaveLength(7);
    expect(lines.join('\n')).not.toContain('SECRETVALUE');
    expect(lines.join('\n')).toContain('test mode');
    await expect(runTaxRatesScript({ env: { STRIPE_SECRET_KEY: 'sk_live_x1' }, api: api as unknown as TaxRateApi, log: () => {} })).rejects.toThrow(/live/);
  });
});

describe.each(REPO_KINDS)('tax in the cart and checkout [%s repository]', (kind) => {
  const run = skipUnavailable(kind) ? it.skip : it;
  const setup = async (env: Record<string, string | undefined> = {}) => makeHarness({ repo: await makeRepo(kind), env });
  const setProvince = (h: Harness, cartId: string, provinceCode: string | null) =>
    h.storefront.cartBuyerIdentityUpdate({ cartId, buyerIdentity: { provinceCode: provinceCode as ProvinceCode | null } });

  run('a cart without a province shows no tax; the total equals the subtotal', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30, quantity: 2 }], null);
    expect(cart.cost).toMatchObject({
      subtotalAmount: { amount: '48.00' }, totalAmount: { amount: '48.00' }, totalTaxAmount: null, taxLines: [], checkoutChargeAmount: { amount: '48.00' },
    });
    expect(cart.buyerIdentity.provinceCode).toBeNull();
  });

  run('setting SK adds GST + PST, persists, and is recomputed from the repriced catalog', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }, { merchandiseId: V.peppermint30 }], null);
    const r = await setProvince(h, cart.id, 'SK');
    expect(r.userErrors).toEqual([]);
    // 24.00 + 22.00 = 46.00; GST 1.20 + 1.10 = 2.30; PST 1.44 + 1.32 = 2.76
    expect(r.cart!.cost.taxLines.map((l) => [l.key, l.title, l.ratePercent, l.amount.amount])).toEqual([
      ['CA_GST', 'GST', '5', '2.30'], ['SK_PST', 'PST (Saskatchewan)', '6', '2.76'],
    ]);
    expect(r.cart!.cost).toMatchObject({ subtotalAmount: { amount: '46.00' }, totalTaxAmount: { amount: '5.06' }, totalAmount: { amount: '51.06' }, checkoutChargeAmount: { amount: '51.06' } });
    expect(r.cart!.buyerIdentity).toMatchObject({ provinceCode: 'SK' });
    const again = (await h.storefront.cart({ id: cart.id }))!;
    expect(again.buyerIdentity.provinceCode).toBe('SK');
    expect(again.cost.totalAmount.amount).toBe('51.06');
    // The server owns prices: a catalog change flows into tax.
    await h.repo.updateVariant(V.hero30, { priceMinor: 3000 });
    expect((await h.storefront.cart({ id: cart.id }))!.cost.taxLines.map((l) => l.amount.amount)).toEqual(['2.60', '3.12']);
    // Changing province replaces the lines; null clears them.
    expect((await setProvince(h, cart.id, 'ON')).cart!.cost.taxLines.map((l) => l.key)).toEqual(['CA_HST_ON']);
    const cleared = await setProvince(h, cart.id, null);
    expect(cleared.userErrors).toEqual([]);
    expect(cleared.cart!.cost).toMatchObject({ totalTaxAmount: null, taxLines: [] });
  });

  run('an invalid province is an INVALID userError at buyerIdentity.provinceCode and changes nothing', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }], 'ON');
    for (const bad of ['XX', 'sk', '', 'Saskatchewan', 'ON ', 5, {}, '__proto__']) {
      const r = await setProvince(h, cart.id, bad as never);
      expect(r.userErrors, String(bad)).toEqual([{ code: 'INVALID', field: ['buyerIdentity', 'provinceCode'], message: expect.any(String) }]);
    }
    expect((await h.storefront.cart({ id: cart.id }))!.buyerIdentity.provinceCode).toBe('ON');
    // All-or-nothing with the other buyer fields, and cartCreate validates the same way.
    const mixed = await h.storefront.cartBuyerIdentityUpdate({ cartId: cart.id, buyerIdentity: { email: 'a@b.co', provinceCode: 'ZZ' as never } });
    expect(mixed.userErrors.map((e) => e.field)).toEqual([['buyerIdentity', 'provinceCode']]);
    expect((await h.storefront.cart({ id: cart.id }))!.buyerIdentity.email).toBeNull();
    const created = await h.storefront.cartCreate({ input: { buyerIdentity: { provinceCode: 'ZZ' as never } } });
    expect(created).toMatchObject({ cart: null, userErrors: [{ code: 'INVALID', field: ['input', 'buyerIdentity', 'provinceCode'] }] });
    expect((await h.storefront.cartBuyerIdentityUpdate({ cartId: 'gid://crater/Cart/' + 'A'.repeat(32), buyerIdentity: { provinceCode: 'SK' } })).userErrors[0].code).toBe('MISSING_CART');
  });

  run('checkout needs a province, but only after the stock and price checks', async () => {
    const h = await setup();
    const none = await cartWith(h, [{ merchandiseId: V.hero30 }], null);
    expect(await h.checkout.createCheckoutSession(none.id)).toMatchObject({ ok: false, code: 'PROVINCE_REQUIRED' });
    expect(h.stripe.create).not.toHaveBeenCalled();
    expect(h.stripe.taxRates.list).not.toHaveBeenCalled();
    // Stock first: an out-of-stock bag with no province reports the stock problem.
    const cart = await cartWith(h, [{ merchandiseId: V.hawthorn30, quantity: 2 }], null);
    await h.repo.updateVariant(V.hawthorn30, { quantity: 1 });
    expect(await h.checkout.createCheckoutSession(cart.id)).toMatchObject({ ok: false, code: 'CART_INVALID' });
    // Price next.
    const priced = await cartWith(h, [{ merchandiseId: V.oil100 }], null);
    await h.repo.updateVariant(V.oil100, { priceMinor: 3100 });
    expect(await h.checkout.createCheckoutSession(priced.id)).toMatchObject({ ok: false, code: 'PRICE_CHANGED' });
    expect(h.stripe.create).not.toHaveBeenCalled();
    // Choosing a province clears it.
    await setProvince(h, none.id, 'SK');
    expect(await h.checkout.createCheckoutSession(none.id)).toMatchObject({ ok: true });
  });

  run('every line item carries the province\'s fixed tax rates; the snapshot records province and expected tax; shipping stays CA only', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30, quantity: 2 }, { merchandiseId: V.peppermint30 }], 'SK');
    expect(await h.checkout.createCheckoutSession(cart.id)).toMatchObject({ ok: true });
    const params = h.stripe.create.mock.calls[0][0] as unknown as {
      line_items: { tax_rates: string[] }[]; metadata: Record<string, string>; shipping_address_collection: unknown;
    };
    expect(params.line_items).toHaveLength(2);
    for (const li of params.line_items) expect(li.tax_rates).toEqual(['txr_test_CA_GST', 'txr_test_SK_PST']);
    expect(params.metadata.tax_province).toBe('SK');
    expect(params.shipping_address_collection).toEqual({ allowed_countries: ['CA'] });
    const snapshot = (await h.repo.getCheckout(params.metadata.checkout_id))!;
    expect(snapshot.province).toBe('SK');
    expect(snapshot.taxLines.map((l) => [l.key, l.amount.amount])).toEqual([['CA_GST', '3.50'], ['SK_PST', '4.20']]); // 70.00 at 5% and 6%
    // ON gets HST only.
    const on = await cartWith(h, [{ merchandiseId: V.hero30 }], 'ON');
    await h.checkout.createCheckoutSession(on.id);
    const onParams = h.stripe.create.mock.calls[1][0] as unknown as { line_items: { tax_rates: string[] }[] };
    expect(onParams.line_items[0].tax_rates).toEqual(['txr_test_CA_HST_ON']);
  });

  run('a different province is a different snapshot and idempotency key; the same province reuses it', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }], 'SK');
    await h.checkout.createCheckoutSession(cart.id);
    await h.checkout.createCheckoutSession(cart.id);
    await setProvince(h, cart.id, 'ON');
    await h.checkout.createCheckoutSession(cart.id);
    const keys = h.stripe.create.mock.calls.map((c) => (c as unknown as [unknown, { idempotencyKey: string }])[1].idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  run('tax-rate ids are looked up once per process and cached; a Stripe failure clears the cache', async () => {
    const h = await setup();
    const a = await cartWith(h, [{ merchandiseId: V.hero30 }], 'SK');
    const b = await cartWith(h, [{ merchandiseId: V.oil100 }], 'SK');
    await h.checkout.createCheckoutSession(a.id);
    await h.checkout.createCheckoutSession(b.id);
    expect(h.stripe.taxRates.list).toHaveBeenCalledTimes(1);
    // A province whose rates were not cached yet is looked up (one more call), then cached too.
    await setProvince(h, b.id, 'ON');
    await h.checkout.createCheckoutSession(b.id);
    expect(h.stripe.taxRates.list).toHaveBeenCalledTimes(2);
    // Session creation fails -> cache dropped -> next attempt looks the rates up again.
    h.stripe.create.mockRejectedValueOnce(new Error('stripe down'));
    const c = await cartWith(h, [{ merchandiseId: V.peppermint30 }], 'SK');
    expect(await h.checkout.createCheckoutSession(c.id)).toMatchObject({ ok: false, code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
    await h.checkout.createCheckoutSession(c.id);
    expect(h.stripe.taxRates.list).toHaveBeenCalledTimes(3);
  });

  run('missing or outdated Stripe tax rates fail safely: PAYMENT_PROVIDER_UNAVAILABLE, no session, nothing leaked', async () => {
    const h = await setup();
    h.stripe.rates.length = 0; // the owner has not run `npm run stripe:tax-rates`
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }], 'SK');
    const r = await h.checkout.createCheckoutSession(cart.id);
    expect(r).toMatchObject({ ok: false, code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
    expect(JSON.stringify(r)).not.toMatch(/stripe:tax-rates|txr_/);
    expect(h.stripe.create).not.toHaveBeenCalled();
    // Stripe's tax-rate API failing is handled the same way.
    const h2 = await setup();
    h2.stripe.taxRates.list.mockRejectedValue(new Error('boom'));
    const c2 = await cartWith(h2, [{ merchandiseId: V.hero30 }], 'ON');
    expect(await h2.checkout.createCheckoutSession(c2.id)).toMatchObject({ ok: false, code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
    // Recovery: once the rates exist, the same bag checks out.
    const h3 = await setup();
    const c3 = await cartWith(h3, [{ merchandiseId: V.hero30 }], 'ON');
    const keep = [...h3.stripe.rates];
    h3.stripe.rates.length = 0;
    expect(await h3.checkout.createCheckoutSession(c3.id)).toMatchObject({ ok: false });
    h3.stripe.rates.push(...keep);
    expect(await h3.checkout.createCheckoutSession(c3.id)).toMatchObject({ ok: true });
  });

  run('fixture mode never asks Stripe for tax rates', async () => {
    const h = await setup({ COMMERCE_PROVIDER: 'fixture' });
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }], 'SK');
    expect(await h.checkout.createCheckoutSession(cart.id)).toMatchObject({ ok: false, code: 'FIXTURE_MODE' });
    expect(h.stripe.taxRates.list).not.toHaveBeenCalled();
  });

  describe('webhook: Stripe\'s tax is recorded and checked', () => {
    const started = async (h: Harness, province: ProvinceCode, lines = [{ merchandiseId: V.hero30, quantity: 2 }, { merchandiseId: V.peppermint30 }]) => {
      const cart = await cartWith(h, lines, province);
      expect(await h.checkout.createCheckoutSession(cart.id)).toMatchObject({ ok: true });
      return cart;
    };
    const pay = (h: Harness, overrides: Record<string, unknown> = {}, id = 'evt_tax_1') => deliver(h, sessionEvent('checkout.session.completed', paidSession(h, overrides), id));

    run('SK: GST + PST amounts, both provinces and the PAID status are stored on the order', async () => {
      const h = await setup();
      await started(h, 'SK');
      expect((await pay(h)).status).toBe(200);
      const order = (await h.repo.getOrderBySessionId(SESSION_ID))!;
      // 70.00: GST (2x24.00 -> 2.40 + 22.00 -> 1.10) = 3.50; PST 2.88 + 1.32 = 4.20
      expect(order.taxLines.map((l) => [l.key, l.title, l.ratePercent, l.amount.amount])).toEqual([['CA_GST', 'GST', '5', '3.50'], ['SK_PST', 'PST (Saskatchewan)', '6', '4.20']]);
      expect(order).toMatchObject({ taxMinor: 770, totalMinor: 7770, financialStatus: 'PAID', reviewFlags: [], taxProvince: 'SK', shippingProvince: 'SK' });
      // The per-rate breakdown was fetched (webhook payloads omit it) with the expand parameter.
      expect(h.stripe.retrieve).toHaveBeenCalledWith(SESSION_ID, { expand: ['total_details.breakdown'] });
    });

    run('ON: HST 13% only', async () => {
      const h = await setup();
      await started(h, 'ON');
      await pay(h);
      const order = (await h.repo.getOrderBySessionId(SESSION_ID))!;
      expect(order.taxLines.map((l) => [l.key, l.amount.amount])).toEqual([['CA_HST_ON', '9.10']]);
      expect(order).toMatchObject({ taxMinor: 910, financialStatus: 'PAID', taxProvince: 'ON', shippingProvince: 'ON' });
    });

    run('uses a breakdown that is already on the event without calling Stripe again', async () => {
      const h = await setup();
      await started(h, 'ON');
      const session = paidSession(h);
      const full = h.stripe.known.get(SESSION_ID)!.full as { total_details: unknown };
      await deliver(h, sessionEvent('checkout.session.completed', { ...session, total_details: full.total_details }));
      expect(h.stripe.retrieve).not.toHaveBeenCalled();
      expect((await h.repo.getOrderBySessionId(SESSION_ID))!.taxLines).toHaveLength(1);
    });

    run('a collected address in another province flags TAX_PROVINCE_MISMATCH and holds the order PENDING', async () => {
      const h = await setup();
      await started(h, 'SK');
      const address = { line1: '1 Elsewhere Rd', line2: null, city: 'Calgary', state: 'AB', postal_code: 'T2P 1J9', country: 'CA' };
      expect((await pay(h, { collected_information: { shipping_details: { name: 'Sam', address } } })).status).toBe(200);
      const order = (await h.repo.getOrderBySessionId(SESSION_ID))!;
      expect(order).toMatchObject({ financialStatus: 'PENDING', reviewFlags: ['TAX_PROVINCE_MISMATCH'], taxProvince: 'SK', shippingProvince: 'AB' });
      expect(order.taxLines).toHaveLength(2); // what Stripe charged is still recorded
      expect((await h.checkout.getCheckoutResult(SESSION_ID)).status).toBe('processing'); // not shown as confirmed
    });

    run('a missing address cannot be verified, so it is held for review too', async () => {
      const h = await setup();
      await started(h, 'ON');
      await pay(h, { collected_information: null });
      expect(await h.repo.getOrderBySessionId(SESSION_ID)).toMatchObject({ financialStatus: 'PENDING', reviewFlags: ['TAX_PROVINCE_MISMATCH'], shippingProvince: null });
    });

    run('a province given by full name still matches', async () => {
      const h = await setup();
      await started(h, 'SK');
      const address = { line1: '1 Main St', line2: null, city: 'Regina', state: 'Saskatchewan', postal_code: 'S4P 1A1', country: 'CA' };
      await pay(h, { collected_information: { shipping_details: { name: 'Sam', address } } });
      expect(await h.repo.getOrderBySessionId(SESSION_ID)).toMatchObject({ financialStatus: 'PAID', reviewFlags: [] });
    });

    /** Makes Stripe report `skew` cents more tax than we expected, consistently in the total and the breakdown. */
    const skewTax = (h: Harness, skew: number) => {
      const known = h.stripe.known.get(SESSION_ID)!;
      for (const s of [known.light, known.full] as { amount_total: number; total_details: { amount_tax: number; breakdown?: { taxes: { amount: number }[] } } }[]) {
        s.amount_total += skew;
        s.total_details.amount_tax += skew;
        if (s.total_details.breakdown) s.total_details.breakdown.taxes[0].amount += skew;
      }
    };

    run('tax within 1 cent per line of the snapshot is accepted; more flags TAX_AMOUNT_MISMATCH', async () => {
      // Two line items -> two cents of tolerance.
      const ok = await setup();
      await started(ok, 'ON');
      paidSession(ok);
      skewTax(ok, 2);
      await deliver(ok, sessionEvent('checkout.session.completed', ok.stripe.known.get(SESSION_ID)!.light, 'evt_skew_ok'));
      expect(await ok.repo.getOrderBySessionId(SESSION_ID)).toMatchObject({ financialStatus: 'PAID', reviewFlags: [], taxMinor: 912 });

      const bad = await setup();
      await started(bad, 'ON');
      paidSession(bad);
      skewTax(bad, 3);
      await deliver(bad, sessionEvent('checkout.session.completed', bad.stripe.known.get(SESSION_ID)!.light, 'evt_skew_bad'));
      expect(await bad.repo.getOrderBySessionId(SESSION_ID)).toMatchObject({ financialStatus: 'PENDING', reviewFlags: ['TAX_AMOUNT_MISMATCH'], taxMinor: 913 });

      // One line item -> one cent of tolerance.
      const single = await setup();
      await started(single, 'ON', [{ merchandiseId: V.hero30 }]);
      paidSession(single);
      skewTax(single, 2);
      await deliver(single, sessionEvent('checkout.session.completed', single.stripe.known.get(SESSION_ID)!.light, 'evt_skew_single'));
      expect(await single.repo.getOrderBySessionId(SESSION_ID)).toMatchObject({ reviewFlags: ['TAX_AMOUNT_MISMATCH'] });
    });

    run('no tax charged when tax was expected, and tax charged by an unknown rate, are both flagged', async () => {
      const none = await setup();
      await started(none, 'SK');
      const s = paidSession(none, { amount_total: 7000, total_details: { amount_shipping: 0, amount_tax: 0, amount_discount: 0 } });
      await deliver(none, sessionEvent('checkout.session.completed', s));
      expect(await none.repo.getOrderBySessionId(SESSION_ID)).toMatchObject({ financialStatus: 'PENDING', reviewFlags: ['TAX_AMOUNT_MISMATCH'], taxLines: [] });

      const stranger = await setup();
      await started(stranger, 'ON');
      paidSession(stranger);
      const full = stranger.stripe.known.get(SESSION_ID)!.full as { total_details: { breakdown: { taxes: { rate: { id: string; metadata: unknown } }[] } } };
      full.total_details.breakdown.taxes[0].rate = { ...full.total_details.breakdown.taxes[0].rate, id: 'txr_foreign', metadata: {} };
      await deliver(stranger, sessionEvent('checkout.session.completed', stranger.stripe.known.get(SESSION_ID)!.light, 'evt_stranger'));
      const order = (await stranger.repo.getOrderBySessionId(SESSION_ID))!;
      expect(order.reviewFlags).toEqual(['TAX_AMOUNT_MISMATCH']);
      expect(order.taxLines[0].key).toBe('STRIPE_txr_foreign');
    });

    run('if the breakdown cannot be fetched the webhook answers 500 and creates nothing; the retry then succeeds', async () => {
      const h = await setup();
      await started(h, 'SK');
      const body = sessionEvent('checkout.session.completed', paidSession(h), 'evt_retry');
      const real = h.stripe.retrieve.getMockImplementation()!;
      h.stripe.retrieve.mockRejectedValueOnce(new Error('stripe timeout'));
      expect((await deliver(h, body)).status).toBe(500);
      expect(await h.repo.countOrders()).toBe(0);
      h.stripe.retrieve.mockImplementation(real);
      expect((await deliver(h, body)).status).toBe(200);
      expect(await h.repo.countOrders()).toBe(1);
      expect(await h.repo.getOrderBySessionId(SESSION_ID)).toMatchObject({ financialStatus: 'PAID', reviewFlags: [] });
      // A duplicate delivery afterwards changes nothing.
      expect((await deliver(h, body)).status).toBe(200);
      expect(await h.repo.countOrders()).toBe(1);
    });

    run('a session that charged no tax needs no breakdown call', async () => {
      const h = await setup();
      const cart = await cartWith(h, [{ merchandiseId: V.hero30 }], 'ON');
      await h.checkout.createCheckoutSession(cart.id);
      // A snapshot from before province tax existed (no province): nothing to compare, nothing flagged.
      const params = h.stripe.create.mock.calls[0][0] as unknown as { metadata: { checkout_id: string } };
      const snap = (await h.repo.getCheckout(params.metadata.checkout_id))!;
      expect(snap.province).toBe('ON');
      const s = paidSession(h, { amount_total: 2400, total_details: { amount_shipping: 0, amount_tax: 0, amount_discount: 0 } });
      await deliver(h, sessionEvent('checkout.session.completed', s));
      expect(h.stripe.retrieve).not.toHaveBeenCalled();
      expect((await h.repo.getOrderBySessionId(SESSION_ID))!.taxLines).toEqual([]);
    });
  });
});

describe('mockStripe sanity', () => {
  it('has all keys preloaded', () => {
    expect(mockStripe().rates.map((r) => r.id).sort()).toEqual(TAX_KEYS.map((k) => `txr_test_${k}`).sort());
    void createCheckoutService; void readConfig; void TEST_ENV;
  });
});
