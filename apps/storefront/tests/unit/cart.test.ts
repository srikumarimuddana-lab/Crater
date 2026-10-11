import { describe, expect, it } from 'vitest';
import { CART_TTL_MS } from '@/lib/commerce/cart-logic';
import { newCartId } from '@/lib/commerce/ids';
import { cartWith, makeHarness, V } from './helpers/harness';
import { closePoolsAfterAll, makeRepo, REPO_KINDS, skipUnavailable } from './helpers/repos';

closePoolsAfterAll();

describe.each(REPO_KINDS)('cart semantics [%s repository]', (kind) => {
  const setup = async () => makeHarness({ repo: await makeRepo(kind) });
  const run = skipUnavailable(kind) ? it.skip : it;

  run('cartCreate returns a repriced cart with decimal-string money and an unguessable id', async () => {
    const h = await setup();
    const { cart, userErrors, warnings } = await h.storefront.cartCreate({ input: { lines: [{ merchandiseId: V.hero30, quantity: 2 }] } });
    expect(userErrors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(cart!.id).toMatch(/^gid:\/\/crater\/Cart\/[A-Za-z0-9_-]{32}$/); // 192 bits of base64url
    expect(cart!.checkoutUrl).toBe('/api/checkout');
    expect(cart!.totalQuantity).toBe(2);
    expect(cart!.lines.nodes[0]).toMatchObject({
      quantity: 2,
      id: expect.stringMatching(/^gid:\/\/crater\/CartLine\/\d+$/),
      cost: { amountPerQuantity: { amount: '24.00', currencyCode: 'CAD' }, totalAmount: { amount: '48.00' } },
    });
    expect(cart!.cost).toMatchObject({ subtotalAmount: { amount: '48.00' }, totalAmount: { amount: '48.00' }, totalTaxAmount: null });
    // Cart ids are random per cart.
    const other = await cartWith(h, []);
    expect(other.id).not.toBe(cart!.id);
  });

  run('cartCreate with no input creates an empty cart', async () => {
    const h = await setup();
    const { cart } = await h.storefront.cartCreate({});
    expect(cart!.lines.nodes).toEqual([]);
    expect(cart!.cost.totalAmount.amount).toBe('0.00');
  });

  run('unknown or malformed merchandiseId -> MERCHANDISE_NOT_FOUND with field; nothing is created', async () => {
    const h = await setup();
    for (const bad of ['gid://crater/ProductVariant/9999', 'nonsense', 'gid://crater/Product/1', '', 'gid://crater/ProductVariant/0']) {
      const r = await h.storefront.cartCreate({ input: { lines: [{ merchandiseId: bad }] } });
      expect(r.cart, bad).toBeNull();
      expect(r.userErrors).toEqual([expect.objectContaining({ code: 'MERCHANDISE_NOT_FOUND', field: ['input', 'lines', '0', 'merchandiseId'] })]);
    }
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    const add = await h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.hero60 }, { merchandiseId: 'x' }] });
    expect(add.userErrors).toEqual([expect.objectContaining({ code: 'MERCHANDISE_NOT_FOUND', field: ['lines', '1', 'merchandiseId'] })]);
    // All-or-nothing: the valid first line was not added, and the returned cart is the unchanged one.
    expect(add.cart!.lines.nodes).toHaveLength(1);
    expect((await h.storefront.cart({ id: cart.id }))!.lines.nodes).toHaveLength(1);
  });

  run('quantity must be an integer 1..10: LESS_THAN / GREATER_THAN / INVALID', async () => {
    const h = await setup();
    const cart = await cartWith(h, []);
    const field = ['lines', '0', 'quantity'];
    const cases: [unknown, string][] = [
      [0, 'LESS_THAN'], [-3, 'LESS_THAN'], [11, 'GREATER_THAN'], [1000, 'GREATER_THAN'],
      [1.5, 'INVALID'], ['2', 'INVALID'], [null, 'INVALID'], [Number.NaN, 'INVALID'], [Number.POSITIVE_INFINITY, 'INVALID'],
    ];
    for (const [quantity, code] of cases) {
      const r = await h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.hero30, quantity: quantity as number }] });
      expect(r.userErrors, String(quantity)).toEqual([expect.objectContaining({ code, field })]);
    }
    expect((await h.storefront.cart({ id: cart.id }))!.lines.nodes).toEqual([]);
    const ok = await h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.hero30, quantity: 10 }] });
    expect(ok.userErrors).toEqual([]);
    expect(ok.cart!.lines.nodes[0].quantity).toBe(10);
  });

  run('adding the same variant merges into one line; the merged total is capped at 10', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30, quantity: 3 }]);
    const r = await h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.hero30, quantity: 4 }, { merchandiseId: V.hero30 }] });
    expect(r.cart!.lines.nodes).toHaveLength(1);
    expect(r.cart!.lines.nodes[0].quantity).toBe(8);
    const over = await h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.hero30, quantity: 3 }] });
    expect(over.userErrors).toEqual([expect.objectContaining({ code: 'GREATER_THAN', field: ['lines', '0', 'quantity'] })]);
    expect(over.cart!.lines.nodes[0].quantity).toBe(8);
  });

  run('quantity above stock is clamped with MERCHANDISE_NOT_ENOUGH_STOCK', async () => {
    const h = await setup();
    const cart = await cartWith(h, []);
    const r = await h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.hawthorn30, quantity: 5 }] });
    expect(r.userErrors).toEqual([]);
    expect(r.cart!.lines.nodes[0].quantity).toBe(2);
    expect(r.warnings).toEqual([
      expect.objectContaining({ code: 'MERCHANDISE_NOT_ENOUGH_STOCK', target: r.cart!.lines.nodes[0].id }),
    ]);
    // Already at the limit: another add changes nothing and warns again.
    const again = await h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.hawthorn30 }] });
    expect(again.cart!.lines.nodes[0].quantity).toBe(2);
    expect(again.warnings.map((w) => w.code)).toEqual(['MERCHANDISE_NOT_ENOUGH_STOCK']);
  });

  run('out-of-stock variant is not added and warns MERCHANDISE_OUT_OF_STOCK', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    const r = await h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.chamomile60 }] });
    expect(r.userErrors).toEqual([]);
    expect(r.warnings).toEqual([expect.objectContaining({ code: 'MERCHANDISE_OUT_OF_STOCK', target: V.chamomile60 })]);
    expect(r.cart!.lines.nodes.map((l) => l.merchandise.id)).toEqual([V.hero30]);
    const created = await h.storefront.cartCreate({ input: { lines: [{ merchandiseId: V.chamomile60 }] } });
    expect(created.cart!.lines.nodes).toEqual([]);
    expect(created.warnings[0].code).toBe('MERCHANDISE_OUT_OF_STOCK');
  });

  run('cartLinesUpdate: set quantity, 0 removes, unknown line -> INVALID_MERCHANDISE_LINE', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30, quantity: 2 }, { merchandiseId: V.oil100 }]);
    const [a, b] = cart.lines.nodes;
    const up = await h.storefront.cartLinesUpdate({ cartId: cart.id, lines: [{ id: a.id, quantity: 5 }] });
    expect(up.cart!.lines.nodes.find((l) => l.id === a.id)!.quantity).toBe(5);
    const rm = await h.storefront.cartLinesUpdate({ cartId: cart.id, lines: [{ id: b.id, quantity: 0 }] });
    expect(rm.cart!.lines.nodes.map((l) => l.id)).toEqual([a.id]);
    for (const id of ['gid://crater/CartLine/999', 'junk', b.id]) {
      const bad = await h.storefront.cartLinesUpdate({ cartId: cart.id, lines: [{ id, quantity: 1 }] });
      expect(bad.userErrors, id).toEqual([expect.objectContaining({ code: 'INVALID_MERCHANDISE_LINE', field: ['lines', '0', 'id'] })]);
    }
    const neg = await h.storefront.cartLinesUpdate({ cartId: cart.id, lines: [{ id: a.id, quantity: -1 }] });
    expect(neg.userErrors[0]).toMatchObject({ code: 'LESS_THAN', field: ['lines', '0', 'quantity'] });
    const big = await h.storefront.cartLinesUpdate({ cartId: cart.id, lines: [{ id: a.id, quantity: 11 }] });
    expect(big.userErrors[0]).toMatchObject({ code: 'GREATER_THAN' });
  });

  run('cartLinesUpdate clamps to stock, never raises beyond it, and can always lower', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hawthorn30, quantity: 2 }]);
    const line = cart.lines.nodes[0];
    const up = await h.storefront.cartLinesUpdate({ cartId: cart.id, lines: [{ id: line.id, quantity: 6 }] });
    expect(up.cart!.lines.nodes[0].quantity).toBe(2);
    expect(up.warnings.map((w) => w.code)).toEqual(['MERCHANDISE_NOT_ENOUGH_STOCK']);
    // Stock falls below what is in the cart: the shopper can still lower it, not raise it.
    await h.repo.updateVariant(V.hawthorn30, { quantity: 0 });
    const raise = await h.storefront.cartLinesUpdate({ cartId: cart.id, lines: [{ id: line.id, quantity: 3 }] });
    expect(raise.cart!.lines.nodes[0].quantity).toBe(2);
    expect(raise.warnings.map((w) => w.code)).toEqual(['MERCHANDISE_OUT_OF_STOCK']);
    const lower = await h.storefront.cartLinesUpdate({ cartId: cart.id, lines: [{ id: line.id, quantity: 1 }] });
    expect(lower.cart!.lines.nodes[0].quantity).toBe(1);
    expect(lower.warnings).toEqual([]);
  });

  run('cartLinesUpdate can switch variant and merges into an existing line', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30, quantity: 2 }, { merchandiseId: V.hero60, quantity: 3 }]);
    const [a, b] = cart.lines.nodes;
    const r = await h.storefront.cartLinesUpdate({ cartId: cart.id, lines: [{ id: a.id, merchandiseId: V.hero60 }] });
    expect(r.userErrors).toEqual([]);
    expect(r.cart!.lines.nodes).toHaveLength(1);
    expect(r.cart!.lines.nodes[0]).toMatchObject({ id: b.id, quantity: 5 });
  });

  run('cartLinesRemove removes lines; unknown ids -> INVALID_MERCHANDISE_LINE; empty -> INVALID', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }, { merchandiseId: V.oil100 }]);
    const [a, b] = cart.lines.nodes;
    const bad = await h.storefront.cartLinesRemove({ cartId: cart.id, lineIds: [a.id, 'gid://crater/CartLine/77'] });
    expect(bad.userErrors).toEqual([expect.objectContaining({ code: 'INVALID_MERCHANDISE_LINE', field: ['lineIds', '1'] })]);
    expect(bad.cart!.lines.nodes).toHaveLength(2); // all-or-nothing
    const ok = await h.storefront.cartLinesRemove({ cartId: cart.id, lineIds: [a.id] });
    expect(ok.cart!.lines.nodes.map((l) => l.id)).toEqual([b.id]);
    expect((await h.storefront.cartLinesRemove({ cartId: cart.id, lineIds: [] })).userErrors[0].code).toBe('INVALID');
  });

  run('unknown, malformed, or foreign cart ids -> MISSING_CART with a null cart', async () => {
    const h = await setup();
    const calls = [
      (cartId: string) => h.storefront.cartLinesAdd({ cartId, lines: [{ merchandiseId: V.hero30 }] }),
      (cartId: string) => h.storefront.cartLinesUpdate({ cartId, lines: [{ id: 'gid://crater/CartLine/1', quantity: 1 }] }),
      (cartId: string) => h.storefront.cartLinesRemove({ cartId, lineIds: ['gid://crater/CartLine/1'] }),
      (cartId: string) => h.storefront.cartNoteUpdate({ cartId, note: 'x' }),
      (cartId: string) => h.storefront.cartBuyerIdentityUpdate({ cartId, buyerIdentity: { countryCode: 'CA' } }),
    ];
    for (const id of [newCartId(), 'gid://crater/Cart/short', "gid://crater/Cart/'; drop table x;--", '', 'cart']) {
      for (const call of calls) {
        const r = await call(id);
        expect(r.cart).toBeNull();
        expect(r.userErrors).toEqual([expect.objectContaining({ code: 'MISSING_CART' })]);
      }
      expect(await h.storefront.cart({ id })).toBeNull();
    }
  });

  run('carts expire after 14 days of inactivity; activity extends the life', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    h.clock.now = new Date(h.clock.now.getTime() + CART_TTL_MS - 60_000);
    expect(await h.storefront.cart({ id: cart.id })).not.toBeNull(); // 13d23h59m
    // A mutation counts as activity and restarts the clock.
    await h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.oil100 }] });
    h.clock.now = new Date(h.clock.now.getTime() + CART_TTL_MS - 60_000);
    expect(await h.storefront.cart({ id: cart.id })).not.toBeNull();
    h.clock.now = new Date(h.clock.now.getTime() + 120_000);
    expect(await h.storefront.cart({ id: cart.id })).toBeNull();
    const add = await h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.hero30 }] });
    expect(add.cart).toBeNull();
    expect(add.userErrors[0].code).toBe('MISSING_CART');
    // The purge helper removes expired carts.
    expect(await h.repo.deleteExpiredCarts(new Date(h.clock.now.getTime() - CART_TTL_MS))).toBeGreaterThanOrEqual(1);
    expect(await h.repo.getCart(cart.id)).toBeNull();
  });

  run('cart() reprices from the current catalog and reflects availability', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30, quantity: 2 }, { merchandiseId: V.hawthorn30, quantity: 2 }]);
    expect(cart.cost.subtotalAmount.amount).toBe('100.00'); // 2*24 + 2*26
    await h.repo.updateVariant(V.hero30, { priceMinor: 2750 });
    await h.repo.updateVariant(V.hawthorn30, { quantity: 0 });
    const fresh = (await h.storefront.cart({ id: cart.id }))!;
    expect(fresh.lines.nodes[0].cost).toMatchObject({ amountPerQuantity: { amount: '27.50' }, totalAmount: { amount: '55.00' } });
    expect(fresh.cost.subtotalAmount.amount).toBe('107.00'); // 55.00 + 2*26.00
    expect(fresh.lines.nodes[1].merchandise).toMatchObject({ availableForSale: false, quantityAvailable: 0 });
    expect(fresh.lines.nodes[1].quantity).toBe(2); // still shown so the shopper can remove it
  });

  run('buyer identity and note are validated', async () => {
    const h = await setup();
    const cart = await cartWith(h, []);
    const ok = await h.storefront.cartBuyerIdentityUpdate({ cartId: cart.id, buyerIdentity: { email: 'a@b.co', countryCode: 'CA' } });
    expect(ok.cart!.buyerIdentity).toEqual({ email: 'a@b.co', countryCode: 'CA', provinceCode: 'ON' }); // cartWith defaults the province to ON
    const bad = await h.storefront.cartBuyerIdentityUpdate({ cartId: cart.id, buyerIdentity: { email: 'not-an-email', countryCode: 'canada' } });
    expect(bad.userErrors.map((e) => e.field)).toEqual([['buyerIdentity', 'email'], ['buyerIdentity', 'countryCode']]);
    expect((await h.storefront.cartNoteUpdate({ cartId: cart.id, note: 'gift' })).cart!.note).toBe('gift');
    expect((await h.storefront.cartNoteUpdate({ cartId: cart.id, note: 'x'.repeat(5001) })).userErrors[0].code).toBe('INVALID');
  });

  run('concurrent adds to one cart both land (no lost update)', async () => {
    const h = await setup();
    const cart = await cartWith(h, []);
    await Promise.all(Array.from({ length: 6 }, () => h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.oil100 }] })));
    expect((await h.storefront.cart({ id: cart.id }))!.lines.nodes[0].quantity).toBe(6);
  });
});
