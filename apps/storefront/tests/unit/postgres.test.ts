import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../db/migrate.mjs';
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
        'order_lines', 'orders', 'processed_webhook_events', 'products', 'schema_migrations', 'variants',
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
      expect((await pool.query('select count(*)::int as n from commerce.products')).rows[0].n).toBe(6); // the owner still sees data
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
      expect(rows).toEqual([{ name: '0001_init.sql' }, { name: '0002_price_at_add.sql' }]);
      // Concurrent runners serialize on the transaction-scoped lock and do not conflict.
      await Promise.all([migrate(pool), migrate(pool), migrate(pool)]);
      expect((await pool.query('select count(*)::int as n from commerce.schema_migrations')).rows[0].n).toBe(2);
    } finally {
      await pool.end();
    }
  });

  it('reseeding refreshes prices but preserves recorded inventory', async () => {
    const repo = await makeRepo('postgres');
    await repo.updateVariant(V.serum30, { quantity: 7, priceMinor: 1 });
    const pool = connect();
    try {
      const { seedCatalog } = await import('../../db/seed.mjs');
      await seedCatalog(pool);
      const [serum] = (await repo.listProducts()).filter((p) => p.handle === 'mineral-serum');
      expect(serum.variants[0]).toMatchObject({ priceMinor: 6800, quantity: 7 });
    } finally {
      await pool.end();
    }
  });

  it('two paid orders racing for the last unit both succeed; stock floors at 0 and one is flagged', async () => {
    const h = await makeHarness({ repo: await makeRepo('postgres') });
    await h.repo.updateVariant(V.creamRefill, { quantity: 2 });
    const sessions = ['cs_test_raceone0000001', 'cs_test_racetwo0000002'];
    const bodies: string[] = [];
    for (const [i, id] of sessions.entries()) {
      h.stripe.create.mockResolvedValueOnce({ id, url: `https://checkout.stripe.com/c/pay/${id}` } as never);
      const cart = await cartWith(h, [{ merchandiseId: V.creamRefill, quantity: 2 }]);
      await h.checkout.createCheckoutSession(cart.id);
      bodies.push(sessionEvent('checkout.session.completed', paidSession(h, { id }), `evt_race_${i}`));
    }
    const results = await Promise.all(bodies.map((b) => deliver(h, b)));
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await h.repo.countOrders()).toBe(2);
    expect(variantQuantity(await h.repo.listProducts(), V.creamRefill)).toBe(0);
    const orders = await Promise.all(sessions.map((s) => h.repo.getOrderBySessionId(s)));
    expect(orders.map((o) => o!.number).sort()).toEqual([1001, 1002]); // gap-free numbering under contention
    expect(orders.filter((o) => o!.reviewFlags.includes('INVENTORY_SHORT'))).toHaveLength(1);
  });

  it('a rejected event rolls back completely: no dedupe row is left behind to block a retry', async () => {
    const h = await makeHarness({ repo: await makeRepo('postgres') });
    const cart = await cartWith(h, [{ merchandiseId: V.serum30 }]);
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
});
