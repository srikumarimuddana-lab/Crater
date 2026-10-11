import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../db/migrate.mjs';
import { catalogSeed } from '@/lib/commerce/catalog-seed';
import { cartWith, makeHarness, V } from './helpers/harness';
import { closePoolsAfterAll, makeRepo, REPO_KINDS, resetDatabase, skipUnavailable, TEST_DATABASE_URL } from './helpers/repos';

closePoolsAfterAll();

describe.each(REPO_KINDS)('price tracking [%s repository]', (kind) => {
  const setup = async () => makeHarness({ repo: await makeRepo(kind) });
  const run = skipUnavailable(kind) ? it.skip : it;

  run('records priceAtAdd on creation; no change reported while prices hold', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30, quantity: 2 }, { merchandiseId: V.oil100 }]);
    expect(cart.hasPriceChanges).toBe(false);
    expect(cart.lines.nodes.map((l) => l.priceAtAdd)).toEqual([
      { amount: '24.00', currencyCode: 'CAD' },
      { amount: '30.00', currencyCode: 'CAD' },
    ]);
    const read = (await h.storefront.cart({ id: cart.id }))!;
    expect(read.hasPriceChanges).toBe(false);
  });

  run('a catalog price change sets hasPriceChanges and keeps the shown price; quantity updates do NOT refresh it', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }, { merchandiseId: V.oil100 }]);
    await h.repo.updateVariant(V.hero30, { priceMinor: 2750 });
    const read = (await h.storefront.cart({ id: cart.id }))!;
    expect(read.hasPriceChanges).toBe(true);
    expect(read.lines.nodes[0].priceAtAdd.amount).toBe('24.00');
    expect(read.lines.nodes[0].cost.amountPerQuantity.amount).toBe('27.50');
    expect(read.lines.nodes[1].priceAtAdd.amount).toBe('30.00'); // untouched line

    const upd = await h.storefront.cartLinesUpdate({ cartId: cart.id, lines: [{ id: read.lines.nodes[0].id, quantity: 3 }] });
    expect(upd.userErrors).toEqual([]);
    expect(upd.cart!.hasPriceChanges).toBe(true);
    expect(upd.cart!.lines.nodes[0].priceAtAdd.amount).toBe('24.00');
    // Persisted, not just computed on the response.
    expect((await h.storefront.cart({ id: cart.id }))!.lines.nodes[0].priceAtAdd.amount).toBe('24.00');
  });

  run('an add that merges into an existing line refreshes that line only', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }, { merchandiseId: V.oil100 }]);
    await h.repo.updateVariant(V.hero30, { priceMinor: 2750 });
    await h.repo.updateVariant(V.oil100, { priceMinor: 3500 });
    const added = await h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.hero30 }] });
    expect(added.userErrors).toEqual([]);
    const [serum, cleanser] = added.cart!.lines.nodes;
    expect(serum.quantity).toBe(2);
    expect(serum.priceAtAdd.amount).toBe('27.50');
    expect(cleanser.priceAtAdd.amount).toBe('30.00');
    expect(added.cart!.hasPriceChanges).toBe(true); // the cleanser still differs
    // A brand-new line gets the current price.
    const fresh = await h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.peppermint30 }] });
    expect(fresh.cart!.lines.nodes[2].priceAtAdd.amount).toBe('22.00');
  });

  run('a rejected add does not refresh the snapshot', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30, quantity: 10 }]);
    await h.repo.updateVariant(V.hero30, { priceMinor: 2750 });
    const over = await h.storefront.cartLinesAdd({ cartId: cart.id, lines: [{ merchandiseId: V.hero30 }] });
    expect(over.userErrors[0].code).toBe('GREATER_THAN');
    expect((await h.storefront.cart({ id: cart.id }))!.lines.nodes[0].priceAtAdd.amount).toBe('24.00');
  });

  run('cartPriceChangesAcknowledge refreshes every line, is idempotent, and extends the cart life', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }, { merchandiseId: V.oil100 }]);
    await h.repo.updateVariant(V.hero30, { priceMinor: 2750 });
    await h.repo.updateVariant(V.oil100, { priceMinor: 2800 }); // a decrease counts as a change too
    expect((await h.storefront.cart({ id: cart.id }))!.hasPriceChanges).toBe(true);

    h.clock.now = new Date(h.clock.now.getTime() + 13 * 24 * 60 * 60 * 1000); // 1 day before expiry
    const ack = await h.storefront.cartPriceChangesAcknowledge({ cartId: cart.id });
    expect(ack.userErrors).toEqual([]);
    expect(ack.cart!.hasPriceChanges).toBe(false);
    expect(ack.cart!.lines.nodes.map((l) => l.priceAtAdd.amount)).toEqual(['27.50', '28.00']);
    expect(ack.cart!.updatedAt).toBe(h.clock.now.toISOString());

    h.clock.now = new Date(h.clock.now.getTime() + 13 * 24 * 60 * 60 * 1000); // expired without the acknowledge
    expect((await h.storefront.cart({ id: cart.id }))!.id).toBe(cart.id);
    const again = await h.storefront.cartPriceChangesAcknowledge({ cartId: cart.id });
    expect(again.cart!.hasPriceChanges).toBe(false);
  });

  run('acknowledge returns MISSING_CART for unknown, malformed and expired carts', async () => {
    const h = await setup();
    for (const cartId of ['gid://crater/Cart/' + 'z'.repeat(32), 'nope', '']) {
      const r = await h.storefront.cartPriceChangesAcknowledge({ cartId });
      expect(r).toMatchObject({ cart: null, userErrors: [{ code: 'MISSING_CART', field: ['cartId'] }], warnings: [] });
    }
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    h.clock.now = new Date(h.clock.now.getTime() + 15 * 24 * 60 * 60 * 1000);
    expect((await h.storefront.cartPriceChangesAcknowledge({ cartId: cart.id })).userErrors[0].code).toBe('MISSING_CART');
  });

  run('a decrease in price also blocks checkout until acknowledged (PRICE_CHANGED), before any snapshot or Stripe call', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    await h.repo.updateVariant(V.hero30, { priceMinor: 2000 });
    const blocked = await h.checkout.createCheckoutSession(cart.id);
    expect(blocked).toMatchObject({ ok: false, code: 'PRICE_CHANGED' });
    expect(h.stripe.create).not.toHaveBeenCalled();

    await h.storefront.cartPriceChangesAcknowledge({ cartId: cart.id });
    const ok = await h.checkout.createCheckoutSession(cart.id);
    expect(ok.ok).toBe(true);
    const params = (h.stripe.create.mock.calls as unknown as { 0: { line_items: { price_data: { unit_amount: number } }[] } }[])[0][0];
    expect(params.line_items[0].price_data.unit_amount).toBe(2000);
  });

  run('PRICE_CHANGED outranks nothing else: an unavailable line still reports CART_INVALID first', async () => {
    const h = await setup();
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }, { merchandiseId: V.hawthorn30 }]);
    await h.repo.updateVariant(V.hero30, { priceMinor: 2000 });
    await h.repo.updateVariant(V.hawthorn30, { quantity: 0 });
    expect(await h.checkout.createCheckoutSession(cart.id)).toMatchObject({ ok: false, code: 'CART_INVALID' });
    expect(h.stripe.create).not.toHaveBeenCalled();
  });

  run('every product has [packshot, detail] images and the packshot stays featured', async () => {
    const repo = await makeRepo(kind);
    const products = await repo.listProducts();
    expect(products).toHaveLength(9);
    for (const p of products) {
      expect(p.images).toEqual([
        {
          url: `/products/${p.handle}/packshot.svg`,
          altText: `Illustration placeholder: ${p.title}`,
          width: 800,
          height: 1000,
          placeholder: true,
        },
        {
          url: `/products/${p.handle}/detail.svg`,
          altText: `Illustration placeholder: ${p.title} texture`,
          width: 800,
          height: 1000,
          placeholder: true,
        },
      ]);
      expect(p.featuredImage).toEqual(p.images[0]);
    }
    expect(products.map((p) => p.images)).toEqual(catalogSeed.products.map((p) => p.images));
  });
});

describe.skipIf(!TEST_DATABASE_URL)('migration 0002 and idempotent re-seed (postgres)', () => {
  it('backfills price_at_add_minor from current variant prices, sets NOT NULL, and can be re-applied', async () => {
    const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
    try {
      await resetDatabase(pool);
      // Rebuild the state before 0002: drop the column and its record, then add legacy lines.
      await pool.query('alter table commerce.cart_lines drop column price_at_add_minor');
      await pool.query("delete from commerce.schema_migrations where name = '0002_price_at_add.sql'");
      const cartId = 'gid://crater/Cart/' + 'L'.repeat(32);
      const now = new Date().toISOString();
      await pool.query('insert into commerce.carts (id, created_at, updated_at, line_seq) values ($1,$2,$2,3)', [cartId, now]);
      await pool.query(
        `insert into commerce.cart_lines (cart_id, line_number, variant_id, quantity, position) values
           ($1,1,11,2,0), ($1,2,23,1,1), ($1,3,999,1,2)`,
        [cartId],
      );
      await pool.query('update commerce.variants set price_minor = 2900 where id = 11');

      expect(await migrate(pool)).toEqual(['0002_price_at_add.sql']);
      const rows = (await pool.query('select line_number, price_at_add_minor from commerce.cart_lines order by line_number')).rows;
      expect(rows).toEqual([
        { line_number: 1, price_at_add_minor: 2900 }, // current variant price, so no change is reported
        { line_number: 2, price_at_add_minor: 3000 },
        { line_number: 3, price_at_add_minor: 0 }, // variant no longer exists
      ]);
      const col = (await pool.query(
        "select is_nullable from information_schema.columns where table_schema='commerce' and table_name='cart_lines' and column_name='price_at_add_minor'",
      )).rows[0];
      expect(col.is_nullable).toBe('NO');
      expect(await migrate(pool)).toEqual([]);

      // The SQL itself is idempotent when run again outside the runner.
      const { readFile } = await import('node:fs/promises');
      await pool.query(await readFile(new URL('../../db/migrations/0002_price_at_add.sql', import.meta.url), 'utf8'));
      expect((await pool.query('select count(*)::int as n from commerce.cart_lines where price_at_add_minor is not null')).rows[0].n).toBe(3);
      expect((await pool.query("select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='commerce' and c.relrowsecurity")).rows[0].n).toBeGreaterThan(0);
    } finally {
      await pool.end();
    }
  });

  it('re-seeding is idempotent: same images, prices refreshed, recorded inventory preserved', async () => {
    const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
    try {
      await resetDatabase(pool);
      const { seedCatalog } = await import('../../db/seed.mjs');
      await pool.query('update commerce.variants set inventory_quantity = 7 where id = 11');
      await pool.query("update commerce.products set images = '[]' where id = 11");
      await seedCatalog(pool);
      await seedCatalog(pool);
      const p = (await pool.query('select images from commerce.products where id = 11')).rows[0];
      expect(p.images.map((i: { url: string }) => i.url)).toEqual(['/products/lemon-balm-oat-extract/packshot.svg', '/products/lemon-balm-oat-extract/detail.svg']);
      expect((await pool.query('select inventory_quantity from commerce.variants where id = 11')).rows[0].inventory_quantity).toBe(7);
      expect((await pool.query('select count(*)::int as n from commerce.products')).rows[0].n).toBe(9);
    } finally {
      await pool.end();
    }
  });
});
