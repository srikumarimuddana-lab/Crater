import { describe, expect, it } from 'vitest';
import { priceCheckoutLines } from '@/lib/commerce/checkout-pricing';
import { createInventoryRepository } from '@/lib/inventory-operations/repository';
import { cartWith, deliver, makeHarness, paidSession, sessionEvent, SESSION_ID, V, variantQuantity } from './helpers/harness';
import { closePoolsAfterAll, makeRepo, REPO_KINDS, skipUnavailable } from './helpers/repos';

closePoolsAfterAll();
describe('integer discount allocation', () => {
  it('splits units only to allocate the exact discount and retains catalog prices', () => {
    const lines = [{ variantId: V.hero30, sku: 'S', title: 'Product', variantTitle: 'Size', quantity: 3, unitMinor: 2401 }];
    const priced = priceCheckoutLines(lines, 3601);
    expect(priced.reduce((sum, line) => sum + line.quantity * line.unitMinor, 0)).toBe(3602);
    expect(priced.reduce((sum, line) => sum + line.quantity, 0)).toBe(3);
    expect(priced.every(line => line.originalUnitMinor === 2401)).toBe(true);
    expect(priced.map(line => [line.quantity, line.unitMinor])).toEqual([[1, 1200], [2, 1201]]);
  });
});
describe.each(REPO_KINDS)('authoritative checkout pricing [%s]', kind => {
  const run = skipUnavailable(kind) ? it.skip : it;
  run('shipping and discounts use frozen server prices, taxable Stripe lines and balanced stored totals', async () => {
    const h = await makeHarness({ repo: await makeRepo(kind) });
    await h.repo.updateVariant(V.hero30, { priceMinor: 2401 });
    const inventory = createInventoryRepository(h.repo);
    await inventory.saveRule({ id: 'ship-on', version: 0, kind: 'shipping', name: 'Standard', provinces: ['ON'], amountMinor: 500, freeAboveMinor: null, active: true }, 0);
    await inventory.saveRule({ id: 'save-half', version: 0, kind: 'discount', code: 'HALF', percent: 50, minimumMinor: 0, startsAt: null, endsAt: null, active: true }, 0);
    const cart = await cartWith(h, [{ merchandiseId: V.hero30, quantity: 3 }]);
    const quote = await h.checkout.getCheckoutQuote(cart.id, { discountCode: 'half' });
    expect(quote).toMatchObject({ ok: true, quote: { originalSubtotalMinor: 7203, subtotalMinor: 3602, discountMinor: 3601, discountCode: 'HALF', shippingMinor: 500, taxMinor: 533, totalMinor: 4635 } });
    expect((await h.checkout.createCheckoutSession(cart.id, { discountCode: 'HALF' })).ok).toBe(true);
    const params = (h.stripe.create.mock.calls as unknown as unknown[][])[0][0] as { line_items: { quantity: number; price_data: { unit_amount: number; product_data: { name: string } }; tax_rates: string[] }[] };
    expect(params.line_items.at(-1)?.price_data.product_data.name).toBe('Shipping — Standard');
    expect(params.line_items.every(line => line.tax_rates.includes('txr_test_CA_HST_ON'))).toBe(true);
    expect(params.line_items.reduce((sum, line) => sum + line.quantity * line.price_data.unit_amount, 0)).toBe(4102);
    expect((await deliver(h, sessionEvent('checkout.session.completed', paidSession(h)))).status).toBe(200);
    const order = (await h.repo.getOrderBySessionId(SESSION_ID))!;
    expect(order).toMatchObject({ financialStatus: 'PAID', subtotalMinor: 3602, discountMinor: 3601, discountCode: 'HALF', shippingMinor: 500, taxMinor: 533, totalMinor: 4635, reviewFlags: [] });
    expect(order.lines.reduce((sum, line) => sum + line.quantity, 0)).toBe(3);
    expect(order.lines.reduce((sum, line) => sum + line.quantity * line.unitMinor, 0)).toBe(order.subtotalMinor);
    expect(order.subtotalMinor + order.shippingMinor + order.taxMinor).toBe(order.totalMinor);
  });
  run('a signed zero-value completed session converts its hold to a real free order once', async () => {
    const h = await makeHarness({ repo: await makeRepo(kind) });
    await createInventoryRepository(h.repo).saveRule({ id: 'free', version: 0, kind: 'discount', code: 'FREE', percent: 100, minimumMinor: 0, startsAt: null, endsAt: null, active: true }, 0);
    const stockBefore = variantQuantity(await h.repo.listProducts(), V.hero30)!;
    const cart = await cartWith(h, [{ merchandiseId: V.hero30, quantity: 1 }]);
    expect(await h.checkout.createCheckoutSession(cart.id, { discountCode: 'FREE' })).toMatchObject({ ok: true });
    const session = { ...paidSession(h), payment_status: 'no_payment_required' as const };
    const event = sessionEvent('checkout.session.completed', session);
    expect((await deliver(h, event)).status).toBe(200);
    expect((await deliver(h, event)).status).toBe(200);
    expect(await h.repo.getOrderBySessionId(SESSION_ID)).toMatchObject({ financialStatus: 'PAID', subtotalMinor: 0, discountMinor: 2400, shippingMinor: 0, taxMinor: 0, totalMinor: 0, reviewFlags: [] });
    expect(variantQuantity(await h.repo.listProducts(), V.hero30)).toBe(stockBefore - 1);
    expect(await h.repo.reservedQuantities(h.clock.now)).toEqual(new Map());
  });
  run('invalid discount never reserves inventory or calls Stripe; free shipping uses discounted threshold', async () => {
    const h = await makeHarness({ repo: await makeRepo(kind) });
    const inventory = createInventoryRepository(h.repo);
    await inventory.saveRule({ id: 'ship', version: 0, kind: 'shipping', name: 'Standard', provinces: [], amountMinor: 500, freeAboveMinor: 3000, active: true }, 0);
    await inventory.saveRule({ id: 'half', version: 0, kind: 'discount', code: 'HALF', percent: 50, minimumMinor: 0, startsAt: null, endsAt: null, active: true }, 0);
    const cart = await cartWith(h, [{ merchandiseId: V.hero30, quantity: 2 }]);
    expect(await h.checkout.createCheckoutSession(cart.id, { discountCode: 'INVALID' })).toMatchObject({ ok: false, code: 'CART_INVALID' });
    expect(h.stripe.create).not.toHaveBeenCalled();
    expect(await h.repo.reservedQuantities(h.clock.now)).toEqual(new Map());
    expect(await h.checkout.getCheckoutQuote(cart.id)).toMatchObject({ ok: true, quote: { shippingMinor: 0 } });
    expect(await h.checkout.getCheckoutQuote(cart.id, { discountCode: 'HALF' })).toMatchObject({ ok: true, quote: { shippingMinor: 500 } });
  });
});
