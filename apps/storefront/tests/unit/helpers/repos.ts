import { afterAll } from 'vitest';
import { migrate } from '../../../db/migrate.mjs';
import { seedCatalog } from '../../../db/seed.mjs';
import { createMemoryRepository } from '@/lib/commerce/memory-repository';
import { createPostgresRepository } from '@/lib/commerce/postgres-repository';
import type { CommerceRepository } from '@/lib/commerce/records';
import pg from 'pg';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const REPO_KINDS = ['memory', 'postgres'] as const;
export type RepoKind = (typeof REPO_KINDS)[number];

/** Postgres suites are skipped (visibly) unless TEST_DATABASE_URL points at a throwaway database. */
export const skipUnavailable = (kind: RepoKind) => kind === 'postgres' && !TEST_DATABASE_URL;

let shared: pg.Pool | null = null;

export async function resetDatabase(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query('select current_database() as name');
  // Guard: this DROPS the commerce schema. Only ever run it against an obviously-test database.
  if (!/test/i.test(String(rows[0].name))) throw new Error('Refusing to reset a database whose name does not contain "test"');
  await pool.query('drop schema if exists commerce cascade');
  await migrate(pool);
  await seedCatalog(pool);
}

export async function makeRepo(kind: RepoKind): Promise<CommerceRepository> {
  if (kind === 'memory') return createMemoryRepository();
  // One pool for the whole test process; every test resets the schema before use.
  shared ??= new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 8 });
  await resetDatabase(shared);
  return createPostgresRepository(shared);
}

export function closePoolsAfterAll() {
  afterAll(async () => {
    const pool = shared;
    shared = null;
    await pool?.end().catch(() => undefined);
  });
}
