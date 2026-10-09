import { mkdtemp, readFile, copyFile, rm } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS_DIR } from '../../../db/migrate.mjs';
import { createOwner } from '../../../db/admin-create-owner.mjs';
import { resetDatabase, TEST_DATABASE_URL } from '../helpers/repos';

const NEW_TABLES = ['admin.staff_users', 'admin.staff_sessions', 'admin.pending_sign_ins', 'admin.login_attempts', 'admin.audit_log', 'commerce.order_fulfilments', 'commerce.inventory_movements', 'commerce.webhook_events'];

describe.skipIf(!TEST_DATABASE_URL)('migration 0004 (admin) on Postgres', () => {
  const connect = () => new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
  const rejects = async (pool: pg.Pool, sql: string, re: RegExp, params: unknown[] = []) => expect(pool.query(sql, params)).rejects.toThrow(re);

  it('creates the admin schema with RLS on and no policies, and locks the API roles out', async () => {
    const pool = connect();
    try {
      for (const role of ['anon', 'authenticated']) {
        await pool.query(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${role}') then create role ${role} nologin; end if; end $$`);
      }
      await resetDatabase(pool);
      const rls = (await pool.query(
        `select n.nspname || '.' || c.relname as name, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where c.relkind = 'r' and n.nspname in ('admin', 'commerce')`,
      )).rows;
      expect(rls.filter((r) => r.name.startsWith('admin.')).map((r) => r.name).sort()).toEqual(NEW_TABLES.filter((t) => t.startsWith('admin.')).sort());
      expect(rls.every((r) => r.rls === true)).toBe(true);
      expect((await pool.query("select count(*)::int as n from pg_policies where schemaname in ('admin', 'commerce')")).rows[0].n).toBe(0);
      for (const role of ['anon', 'authenticated']) {
        for (const table of NEW_TABLES) {
          const c = await pool.connect();
          try {
            await c.query('begin');
            await c.query(`set local role ${role}`);
            await expect(c.query(`select * from ${table}`), `${role} ${table}`).rejects.toThrow(/permission denied/);
          } finally {
            await c.query('rollback');
            c.release();
          }
        }
      }
      // Even if grants were added back, RLS with no policies shows and allows nothing.
      await pool.query('grant usage on schema admin to anon; grant select, insert, update, delete on all tables in schema admin to anon');
      await pool.query("insert into admin.staff_users (email, name, role) values ('a@example.test', 'A', 'ADMIN')");
      const c = await pool.connect();
      try {
        await c.query('begin');
        await c.query('set local role anon');
        expect((await c.query('select * from admin.staff_users')).rowCount).toBe(0);
        await expect(c.query("insert into admin.staff_users (email, name, role) values ('b@example.test', 'B', 'OWNER')")).rejects.toThrow(/row-level security/);
      } finally {
        await c.query('rollback');
        c.release();
      }
    } finally {
      await pool.end();
    }
  });

  it('audit_log and inventory_movements are append-only for every role, the owner included', async () => {
    const pool = connect();
    try {
      await resetDatabase(pool);
      await pool.query("insert into admin.audit_log (action) values ('x.y')");
      await pool.query("insert into commerce.inventory_movements (variant_id, sku, delta, reason, available_after) values (11, 'S', 1, 'RECEIVED', 41)");
      for (const table of ['admin.audit_log', 'commerce.inventory_movements']) {
        await rejects(pool, `update ${table} set ${table === 'admin.audit_log' ? 'action' : 'delta'} = ${table === 'admin.audit_log' ? "'z'" : '5'}`, /append-only/);
        await rejects(pool, `delete from ${table}`, /append-only/);
        await rejects(pool, `truncate ${table}`, /append-only/);
        expect((await pool.query(`select count(*)::int as n from ${table}`)).rows[0].n).toBe(1);
      }
      // Movements: a zero delta, a negative balance, and a second ORDER_PAID row for one order/variant are all refused.
      await rejects(pool, "insert into commerce.inventory_movements (variant_id, sku, delta, reason, available_after) values (11, 'S', 0, 'RECEIVED', 1)", /check/);
      await rejects(pool, "insert into commerce.inventory_movements (variant_id, sku, delta, reason, available_after) values (11, 'S', -1, 'DAMAGED', -1)", /check/);
      await rejects(pool, "insert into commerce.inventory_movements (variant_id, sku, delta, reason, available_after) values (11, 'S', 1, 'MAGIC', 1)", /check/);
      // The application never uses the bypass the test reset helper uses.
      const src = execSync("grep -rIl 'session_replication_role' src db/migrate.mjs db/seed.mjs db/admin-create-owner.mjs || true", { cwd: process.cwd() }).toString();
      expect(src.trim()).toBe('');
    } finally {
      await pool.end();
    }
  });

  it('product status and archived_at cannot disagree; new products default to DRAFT; variants gain cost and threshold', async () => {
    const pool = connect();
    try {
      await resetDatabase(pool);
      expect((await pool.query("select count(*)::int as n from commerce.products where status = 'ACTIVE'")).rows[0].n).toBe(9);
      await rejects(pool, "update commerce.products set status = 'ARCHIVED' where id = 11", /products_status_archived_at_check/);
      await rejects(pool, "update commerce.products set archived_at = now() where id = 11", /products_status_archived_at_check/);
      await rejects(pool, "update commerce.products set status = 'LIVE' where id = 11", /products_status_check/);
      await pool.query("update commerce.products set status = 'ARCHIVED', archived_at = now() where id = 11");
      await pool.query(
        `insert into commerce.products (id, handle, title, description, vendor, product_type, details, created_at, updated_at)
         values (90, 'new-one', 't', 'd', 'v', 'p', '{}'::jsonb, now(), now())`,
      );
      expect((await pool.query('select status from commerce.products where id = 90')).rows[0].status).toBe('DRAFT');
      expect((await pool.query('select cost_minor, low_stock_threshold from commerce.variants where id = 12')).rows[0]).toEqual({ cost_minor: 1330, low_stock_threshold: 5 });
      await rejects(pool, 'update commerce.variants set low_stock_threshold = -1 where id = 12', /check/);
      await rejects(pool, 'update commerce.variants set cost_minor = -1 where id = 12', /check/);
    } finally {
      await pool.end();
    }
  });

  it('upgrading a database that already holds 0001-0003 data keeps it: archived rows become ARCHIVED, others ACTIVE', async () => {
    const pool = connect();
    const dir = await mkdtemp(path.join(os.tmpdir(), 'crater-mig-'));
    try {
      await pool.query('drop schema if exists admin cascade; drop schema if exists commerce cascade');
      for (const f of ['0001_init.sql', '0002_price_at_add.sql', '0003_product_archive.sql']) await copyFile(path.join(MIGRATIONS_DIR, f), path.join(dir, f));
      await migrate(pool, { dir });
      for (const [id, archived] of [[1, true], [2, false]] as const) {
        await pool.query(
          `insert into commerce.products (id, handle, title, description, vendor, product_type, details, created_at, updated_at, archived_at)
           values ($1, $2, 't', 'd', 'v', 'p', '{}'::jsonb, now(), now(), $3)`,
          [id, `p${id}`, archived ? new Date().toISOString() : null],
        );
      }
      await pool.query("insert into commerce.variants (id, product_id, position, sku, title, price_minor, selected_options, inventory_quantity) values (1, 2, 0, 'S1', 'v', 100, '[]', 3)");
      expect(await migrate(pool)).toEqual(['0004_admin.sql', '0005_tax.sql']);
      expect((await pool.query('select id, status, archived_at is not null as archived from commerce.products order by id')).rows).toEqual([
        { id: 1, status: 'ARCHIVED', archived: true }, { id: 2, status: 'ACTIVE', archived: false },
      ]);
      expect((await pool.query('select low_stock_threshold, inventory_quantity from commerce.variants')).rows).toEqual([{ low_stock_threshold: 5, inventory_quantity: 3 }]);
      // Re-running the file by hand is harmless (idempotent) and loses nothing.
      await pool.query("insert into admin.staff_users (email, name, role) values ('keep@example.test', 'K', 'ADMIN')");
      await pool.query(await readFile(path.join(MIGRATIONS_DIR, '0004_admin.sql'), 'utf8'));
      await pool.query(await readFile(path.join(MIGRATIONS_DIR, '0004_admin.sql'), 'utf8'));
      expect((await pool.query('select count(*)::int as n from admin.staff_users')).rows[0].n).toBe(1);
      expect((await pool.query("select status from commerce.products where id = 1")).rows[0].status).toBe('ARCHIVED');
    } finally {
      await rm(dir, { recursive: true, force: true });
      await pool.end();
    }
  });

  it('staff constraints: lower-case unique emails, valid roles, MFA fields move together, hex token hashes', async () => {
    const pool = connect();
    try {
      await resetDatabase(pool);
      await pool.query("insert into admin.staff_users (email, name, role) values ('a@example.test', 'A', 'ADMIN')");
      await rejects(pool, "insert into admin.staff_users (email, name, role) values ('a@example.test', 'A2', 'ADMIN')", /unique/);
      await rejects(pool, "insert into admin.staff_users (email, name, role) values ('B@example.test', 'B', 'ADMIN')", /check/);
      await rejects(pool, "insert into admin.staff_users (email, name, role) values ('c@example.test', 'C', 'GOD')", /check/);
      await rejects(pool, "update admin.staff_users set totp_secret_enc = 'v1.a.b.c'", /check/);
      await rejects(pool, "insert into admin.staff_sessions (staff_id, token_hash, created_at, last_seen_at, absolute_expires_at) values (1, 'plaintext-token', now(), now(), now())", /check/);
    } finally {
      await pool.end();
    }
  });
});

describe.skipIf(!TEST_DATABASE_URL)('migration 0005 (tax, stock reasons) on Postgres', () => {
  it('constrains provinces, widens the movement reasons, and re-running the file is harmless', async () => {
    const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
    try {
      await resetDatabase(pool);
      const rejects = (sql: string, re: RegExp) => expect(pool.query(sql)).rejects.toThrow(re);
      await rejects("insert into commerce.carts (id, created_at, updated_at, attributes, line_seq, buyer_province) values ('gid://crater/Cart/" + 'A'.repeat(32) + "', now(), now(), '[]', 0, 'XX')", /check/);
      for (const reason of ['EXPIRED', 'SAMPLES_GIFTS', 'LOST_STOLEN']) {
        await pool.query("insert into commerce.inventory_movements (variant_id, sku, delta, reason, available_after) values (11, 'S', -1, $1, 1)", [reason]);
      }
      await rejects("insert into commerce.inventory_movements (variant_id, sku, delta, reason, available_after) values (11, 'S', -1, 'MAGIC', 1)", /check/);
      const sql = await readFile(path.join(MIGRATIONS_DIR, '0005_tax.sql'), 'utf8');
      await pool.query(sql);
      await pool.query(sql);
      expect((await pool.query('select count(*)::int as n from commerce.inventory_movements')).rows[0].n).toBe(3);
      const cols = (await pool.query("select column_name from information_schema.columns where table_schema='commerce' and column_name in ('buyer_province','tax_province','tax_lines','shipping_province')")).rows;
      expect(cols).toHaveLength(6); // carts.buyer_province; checkouts and orders: tax_province, tax_lines; orders.shipping_province
    } finally {
      await pool.end();
    }
  });
});

describe.skipIf(!TEST_DATABASE_URL)('admin:create-owner', () => {
  it('creates the first Owner (hashed password, audited), refuses a second, and enforces the password policy', async () => {
    const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
    try {
      await resetDatabase(pool);
      await expect(createOwner(pool, { email: 'not-an-email', password: 'long enough password' })).rejects.toThrow(/valid email/);
      await expect(createOwner(pool, { email: 'owner@example.test', password: 'short' })).rejects.toThrow(/at least 12/);
      expect((await pool.query('select count(*)::int as n from admin.staff_users')).rows[0].n).toBe(0);
      const id = await createOwner(pool, { email: ' Owner@Example.test ', password: 'long enough password' });
      const row = (await pool.query('select * from admin.staff_users where id = $1', [id])).rows[0];
      expect(row).toMatchObject({ email: 'owner@example.test', role: 'OWNER', status: 'ACTIVE', mfa_enrolled_at: null, totp_secret_enc: null });
      expect(row.password_hash).toMatch(/^scrypt\$32768\$8\$1\$/);
      expect(row.password_hash).not.toContain('long enough password');
      expect((await pool.query("select action from admin.audit_log")).rows).toEqual([{ action: 'staff.owner_created' }]);
      await expect(createOwner(pool, { email: 'second@example.test', password: 'another long password' })).rejects.toThrow(/already exists/);
      // Two simultaneous runs on an empty table: exactly one wins.
      await resetDatabase(pool);
      const results = await Promise.allSettled([
        createOwner(pool, { email: 'a@example.test', password: 'long enough password' }),
        createOwner(pool, { email: 'b@example.test', password: 'long enough password' }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((await pool.query("select count(*)::int as n from admin.staff_users where role = 'OWNER'")).rows[0].n).toBe(1);
    } finally {
      await pool.end();
    }
  });
});
