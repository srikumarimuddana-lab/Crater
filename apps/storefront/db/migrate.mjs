#!/usr/bin/env node
// Applies db/migrations/*.sql in filename order. Safe to re-run: applied files are
// recorded in commerce.schema_migrations and skipped.
//
// Connection: DIRECT_DATABASE_URL (direct or session-mode connection) if set, else
// DATABASE_URL. Run migrations over a direct/session connection, not a transaction pooler.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.join(here, 'migrations');

/** pg Pool settings from the environment. TLS verification is never disabled. */
export function poolConfig(env = process.env, { direct = false } = {}) {
  const connectionString = (direct ? env.DIRECT_DATABASE_URL : undefined) || env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL (or DIRECT_DATABASE_URL) is required');
  const config = { connectionString, max: 1 };
  // An explicit sslmode in the URL takes precedence over this (pg merges the URL last).
  if (env.DATABASE_SSL === 'require') config.ssl = { rejectUnauthorized: true };
  return config;
}

/** @param {import('pg').Pool} pool */
export async function migrate(pool, { dir = MIGRATIONS_DIR, log = () => {} } = {}) {
  const files = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const client = await pool.connect();
  const applied = [];
  try {
    await client.query('begin');
    // Transaction-scoped advisory lock: serializes concurrent runners, released at commit.
    await client.query("select pg_advisory_xact_lock(hashtext('crater.commerce.migrate'))");
    await client.query('create schema if not exists commerce');
    await client.query(`create table if not exists commerce.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);
    await client.query('alter table commerce.schema_migrations enable row level security');
    await client.query('commit');

    for (const file of files) {
      const sql = await readFile(path.join(dir, file), 'utf8');
      await client.query('begin');
      try {
        await client.query("select pg_advisory_xact_lock(hashtext('crater.commerce.migrate'))");
        const done = await client.query('select 1 from commerce.schema_migrations where name = $1', [file]);
        if (done.rowCount === 0) {
          await client.query(sql);
          await client.query('insert into commerce.schema_migrations (name) values ($1)', [file]);
          applied.push(file);
          log(`applied ${file}`);
        } else {
          log(`skipped ${file} (already applied)`);
        }
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    client.release();
  }
  return applied;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pool = new pg.Pool(poolConfig(process.env, { direct: true }));
  try {
    const applied = await migrate(pool, { log: (m) => console.log(`[db:migrate] ${m}`) });
    console.log(`[db:migrate] done (${applied.length} applied)`);
  } catch (error) {
    console.error('[db:migrate] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
