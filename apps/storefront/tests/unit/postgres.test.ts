import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../db/migrate.mjs';
import { catalogSeed } from '@/lib/commerce/catalog-seed';
import { createPostgresRepository } from '@/lib/commerce/postgres-repository';
import { cartWith, deliver, makeHarness, paidSession, sessionEvent, V, variantQuantity } from './helpers/harness';
import { closePoolsAfterAll, makeRepo, resetDatabase, TEST_DATABASE_URL } from './helpers/repos';

closePoolsAfterAll();

// Whole file is skipped (and reported as skipped) when no throwaway database is configured.
describe.skipIf(!TEST_DATABASE_URL)('postgres schema and locking', () => {
  const connect = () => new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });

  it('puts everything in the commerce schema with RLS enabled and no policies', async () => {
    const pool = connect();
    try {
      await resetDatabase(pool);
      const tables = (await pool.query(
        `select n.nspname as schema, c.relname as name, c.relrowsecurity as rls
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where c.relkind = 'r' and n.nspname in ('commerce', 'public')`,
      )).rows;
      expect(tables.filter((t) => t.schema === 'public')).toEqual([]);
      const names = tables.map((t) => t.name).sort();
      expect(names).toEqual([
        'cart_lines', 'carts', 'checkouts', 'collection_products', 'collections', 'counters',
        'inventory_movements', 'order_fulfilments', 'order_lines', 'orders', 'processed_webhook_events', 'products',
        'schema_migrations', 'variants', 'webhook_events',
      ]);
      expect(tables.every((t) => t.rls === true)).toBe(true);
      expect((await pool.query("select count(*)::int as n from pg_policies where schemaname = 'commerce'")).rows[0].n).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it('API roles (anon/authenticated) can neither read nor write, even if granted table access', async () => {
    const pool = connect();
    try {
      // Supabase ships these roles; create them for the plain-Postgres test cluster first.
      for (const role of ['anon', 'authenticated']) {
        await pool.query(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${role}') then create role ${role} nologin; end if; end $$`);
      }
      await resetDatabase(pool); // migrate runs AFTER the roles exist, as on Supabase
      for (const role of ['anon', 'authenticated']) {
        const c = await pool.connect();
        try {
          await c.query('begin');
          await c.query(`set local role ${role}`);
          await expect(c.query('select * from commerce.products'), role).rejects.toThrow(/permission denied/);
          await c.query('rollback');
        } finally {
          c.release();
        }
      }
      // Belt and braces: even with grants re-added, RLS (no policies) returns nothing and blocks writes.
      await pool.query('grant usage on schema commerce to anon; grant select, insert, update, delete on all tables in schema commerce to anon');
      const c = await pool.connect();
      try {
        await c.query('begin');
        await c.query('set local role anon');
        expect((await c.query('select * from commerce.products')).rowCount).toBe(0);
        expect((await c.query('select * from commerce.carts')).rowCount).toBe(0);
        await expect(
          c.query(`insert into commerce.collections (id, handle, title, description) values (99, 'x', 'x', 'x')`),
        ).rejects.toThrow(/row-level security/);
        await c.query('rollback');
      } finally {
        c.release();
      }
      expect((await pool.query('select count(*)::int as n from commerce.products')).rows[0].n).toBe(9); // the owner still sees data
    } finally {
      await pool.end();
    }
  });

  it('migrations are idempotent and tracked in commerce.schema_migrations', async () => {
    const pool = connect();
    try {
      await resetDatabase(pool);
      expect(await migrate(pool)).toEqual([]); // second run applies nothing
      const rows = (await pool.query('select name from commerce.schema_migrations')).rows;
      expect(rows).toEqual([
        { name: '0001_init.sql' }, { name: '0002_price_at_add.sql' }, { name: '0003_product_archive.sql' }, { name: '0004_admin.sql' },
      ]);
      // Concurrent runners serialize on the transaction-scoped lock and do not conflict.
      await Promise.all([migrate(pool), migrate(pool), migrate(pool)]);
      expect((await pool.query('select count(*)::int as n from commerce.schema_migrations')).rows[0].n).toBe(4);
    } finally {
      await pool.end();
    }
  });

  it('reseeding refreshes prices but preserves recorded inventory', async () => {
    const repo = await makeRepo('postgres');
    await repo.updateVariant(V.hero30, { quantity: 7, priceMinor: 1 });
    const pool = connect();
    try {
      const { seedCatalog } = await import('../../db/seed.mjs');
      await seedCatalog(pool);
      const [serum] = (await repo.listProducts()).filter((p) => p.handle === 'lemon-balm-oat-extract');
      expect(serum.variants[0]).toMatchObject({ priceMinor: 2400, quantity: 7 });
    } finally {
      await pool.end();
    }
  });

  it('two paid orders racing for the last unit both succeed; stock floors at 0 and one is flagged', async () => {
    const h = await makeHarness({ repo: await makeRepo('postgres') });
    await h.repo.updateVariant(V.hawthorn30, { quantity: 2 });
    const sessions = ['cs_test_raceone0000001', 'cs_test_racetwo0000002'];
    const bodies: string[] = [];
    for (const [i, id] of sessions.entries()) {
      h.stripe.create.mockResolvedValueOnce({ id, url: `https://checkout.stripe.com/c/pay/${id}` } as never);
      const cart = await cartWith(h, [{ merchandiseId: V.hawthorn30, quantity: 2 }]);
      await h.checkout.createCheckoutSession(cart.id);
      bodies.push(sessionEvent('checkout.session.completed', paidSession(h, { id }), `evt_race_${i}`));
    }
    const results = await Promise.all(bodies.map((b) => deliver(h, b)));
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await h.repo.countOrders()).toBe(2);
    expect(variantQuantity(await h.repo.listProducts(), V.hawthorn30)).toBe(0);
    const orders = await Promise.all(sessions.map((s) => h.repo.getOrderBySessionId(s)));
    expect(orders.map((o) => o!.number).sort()).toEqual([1001, 1002]); // gap-free numbering under contention
    expect(orders.filter((o) => o!.reviewFlags.includes('INVENTORY_SHORT'))).toHaveLength(1);
  });

  it('a rejected event rolls back completely: no dedupe row is left behind to block a retry', async () => {
    const h = await makeHarness({ repo: await makeRepo('postgres') });
    const cart = await cartWith(h, [{ merchandiseId: V.hero30 }]);
    await h.checkout.createCheckoutSession(cart.id);
    const good = paidSession(h);
    const swapped = { ...good, id: 'cs_test_notmysession001' }; // checkout already bound to another session
    await h.repo.attachSession((good.metadata as { checkout_id: string }).checkout_id, good.id, new Date().toISOString());
    expect((await deliver(h, sessionEvent('checkout.session.completed', swapped, 'evt_swap'))).status).toBe(200);
    const pool = connect();
    try {
      expect((await pool.query("select count(*)::int as n from commerce.processed_webhook_events where event_id = 'evt_swap'")).rows[0].n).toBe(0);
    } finally {
      await pool.end();
    }
    expect(await h.repo.countOrders()).toBe(0);
    // The legitimate event still works afterwards.
    await deliver(h, sessionEvent('checkout.session.completed', good, 'evt_good'));
    expect(await h.repo.countOrders()).toBe(1);
  });

  describe('retiring the old sample catalogue on re-seed', () => {
    const now = '2026-01-01T00:00:00.000Z';
    const legacyProduct = (pool: pg.Pool, id: number, handle: string, sample: boolean) =>
      pool.query(
        `insert into commerce.products (id, handle, title, description, vendor, product_type, details, sample, created_at, updated_at, status)
         values ($1,$2,$2,'old','Crater','Serum','{"benefits":[],"ingredients":[],"howToUse":"","precautions":""}'::jsonb,$3,$4,$4,'ACTIVE')`,
        [id, handle, sample, now],
      );
    const legacyVariant = (pool: pg.Pool, id: number, productId: number, position: number, sku: string, qty = 5) =>
      pool.query(
        `insert into commerce.variants (id, product_id, position, sku, title, price_minor, selected_options, inventory_quantity)
         values ($1,$2,$3,$4,'30 mL',6800,'[{"name":"Size","value":"30 mL"}]'::jsonb,$5)`,
        [id, productId, position, sku, qty],
      );
    const checkoutWith = (pool: pg.Pool, n: number, variantId: number) =>
      pool.query(
        `insert into commerce.checkouts (id, cart_id, cart_ref, status, fingerprint, subtotal_minor, lines, created_at, updated_at)
         values ($1,'gid://crater/Cart/${'Q'.repeat(32)}','ref','session_created','fp',6800,$2::jsonb,$3,$3)`,
        [`chk_${String(n).padStart(32, '0')}`, JSON.stringify([{ variantId: `gid://crater/ProductVariant/${variantId}`, title: 't', variantTitle: 'v', sku: 's', quantity: 1, unitMinor: 6800 }]), now],
      );
    const snapshot = async (pool: pg.Pool) =>
      JSON.stringify(
        await Promise.all(
          ['products order by id', 'variants order by id', 'collections order by id', 'collection_products order by collection_id, product_id'].map(
            async (t) => (await pool.query(`select * from commerce.${t}`)).rows,
          ),
        ),
      );

    it('deletes unreferenced old rows, archives referenced ones, leaves non-samples alone, and a second run changes nothing', async () => {
      const pool = connect();
      try {
        await resetDatabase(pool); // the current seed
        const { seedCatalog } = await import('../../db/seed.mjs');

        // The previous skincare catalogue, as an old database would still hold it.
        await legacyProduct(pool, 1, 'mineral-serum', true); // referenced by a checkout snapshot
        await legacyVariant(pool, 1, 1, 0, 'SAMPLE-MSR-30');
        await legacyProduct(pool, 2, 'cloud-cream', true); // referenced by an order line
        await legacyVariant(pool, 3, 2, 0, 'SAMPLE-CCR-50');
        await legacyProduct(pool, 3, 'gel-cleanser', true); // unreferenced
        await legacyVariant(pool, 5, 3, 0, 'SAMPLE-GCL-150');
        await legacyProduct(pool, 50, 'owner-added-product', false); // not a sample: never touched
        await legacyVariant(pool, 50, 50, 0, 'REAL-1');
        await pool.query(
          `insert into commerce.collections (id, handle, title, description) values
             (1,'serums','Serums','Sample collection — preview copy.'), (51,'owner-collection','Owner','Real collection')`,
        );
        await pool.query('insert into commerce.collection_products (collection_id, product_id, position) values (1,1,0),(1,2,1),(1,3,2),(51,50,0)');
        await checkoutWith(pool, 1, 1);
        await checkoutWith(pool, 2, 3);
        await pool.query(
          `insert into commerce.orders (order_number, checkout_id, stripe_session_id, financial_status, subtotal_minor, total_minor, processed_at)
           values (1001, $1, 'cs_test_legacyorder0001', 'PAID', 5800, 5800, $2)`,
          [`chk_${'2'.padStart(32, '0')}`, now],
        );
        await pool.query(
          `insert into commerce.order_lines (order_id, position, variant_id, title, variant_title, sku, quantity, unit_minor)
           select id, 0, 'gid://crater/ProductVariant/3', 'Cloud Cream', '50 mL', 'SAMPLE-CCR-50', 1, 5800 from commerce.orders`,
        );
        // A stale variant on a seeded product: one unreferenced (deleted), one referenced (made unavailable).
        await legacyVariant(pool, 900, 11, 5, 'SAMPLE-OLD-A');
        await legacyVariant(pool, 901, 11, 6, 'SAMPLE-OLD-B', 9);
        await checkoutWith(pool, 3, 901);

        const first = await seedCatalog(pool);
        expect(first).toEqual({ productsDeleted: 1, productsArchived: 2, variantsDeleted: 1, variantsParked: 1, collectionsDeleted: 1 });

        const products = (await pool.query("select id, handle, archived_at is not null as archived, status = 'ARCHIVED' as by_status from commerce.products order by id")).rows;
        expect(products.filter((p) => p.id < 11 || p.id === 50)).toEqual([
          { id: 1, handle: 'mineral-serum', archived: true, by_status: true },
          { id: 2, handle: 'cloud-cream', archived: true, by_status: true },
          { id: 50, handle: 'owner-added-product', archived: false, by_status: false },
        ]);
        expect(products.filter((p) => p.id >= 11 && p.id !== 50).every((p) => !p.archived)).toBe(true);
        expect((await pool.query('select handle from commerce.collections order by id')).rows.map((c) => c.handle)).toEqual([
          'tinctures', 'body-oils', 'single-herbs', 'kits-gifts', 'daily-ritual', 'evening-ritual', 'seasonal', 'body-care', 'owner-collection',
        ]);
        expect((await pool.query('select count(*)::int as n from commerce.collection_products where product_id in (1,2,3)')).rows[0].n).toBe(0);
        // Financial records keep their rows, untouched.
        expect((await pool.query('select count(*)::int as n from commerce.order_lines where variant_id = $1', ['gid://crater/ProductVariant/3'])).rows[0].n).toBe(1);
        expect((await pool.query('select count(*)::int as n from commerce.variants where id in (1,3)')).rows[0].n).toBe(2);
        expect((await pool.query('select id from commerce.variants where id in (5, 900)')).rows).toEqual([]);
        expect((await pool.query('select inventory_quantity, position from commerce.variants where id = 901')).rows).toEqual([{ inventory_quantity: 0, position: 1901 }]);

        // The storefront sees exactly the new catalogue: nothing archived, parked or foreign to the seed.
        const repo = createPostgresRepository(pool);
        const listed = await repo.listProducts();
        expect(listed.map((p) => p.handle).filter((h) => h !== 'owner-added-product')).toEqual(catalogSeed.products.map((p) => p.handle));
        expect((await repo.listCollections()).map((c) => c.handle).filter((h) => h !== 'owner-collection')).toEqual(catalogSeed.collections.map((c) => c.handle));
        expect((await repo.listCollections()).flatMap((c) => c.productHandles)).not.toContain('mineral-serum');
        // A bag that still holds a retired variant simply stops showing the line.
        const h = await makeHarness({ repo });
        const cart = await cartWith(h, [{ merchandiseId: V.hero30 }]);
        await pool.query('insert into commerce.cart_lines (cart_id, line_number, variant_id, quantity, position, price_at_add_minor) values ($1,9,1,1,1,6800)', [cart.id]);
        expect((await h.storefront.cart({ id: cart.id }))!.lines.nodes.map((l) => l.merchandise.id)).toEqual([V.hero30]);

        // Second run: nothing to retire, nothing changes.
        const before = await snapshot(pool);
        expect(await seedCatalog(pool)).toEqual({ productsDeleted: 0, productsArchived: 0, variantsDeleted: 0, variantsParked: 0, collectionsDeleted: 0 });
        expect(await snapshot(pool)).toBe(before);
        // And a third, for good measure.
        await seedCatalog(pool);
        expect(await snapshot(pool)).toBe(before);
      } finally {
        await pool.end();
      }
    });

    it('re-seeding a fresh database twice is a no-op, with no legacy rows to retire', async () => {
      const pool = connect();
      try {
        await resetDatabase(pool);
        const { seedCatalog } = await import('../../db/seed.mjs');
        const before = await snapshot(pool);
        expect(await seedCatalog(pool)).toEqual({ productsDeleted: 0, productsArchived: 0, variantsDeleted: 0, variantsParked: 0, collectionsDeleted: 0 });
        expect(await snapshot(pool)).toBe(before);
        expect((await pool.query('select count(*)::int as n from commerce.products')).rows[0].n).toBe(9);
        expect((await pool.query('select count(*)::int as n from commerce.collections')).rows[0].n).toBe(8);
      } finally {
        await pool.end();
      }
    });
  });
});
