import { createMemoryRepository } from './memory-repository';
import { createPostgresRepository, poolConfigFromEnv } from './postgres-repository';
import type { CommerceRepository } from './records';

const REPO_KEY = Symbol.for('crater.commerce.repository');

type Holder = { repo?: CommerceRepository };
const holder = (): Holder => {
  const g = globalThis as unknown as Record<symbol, Holder | undefined>;
  return (g[REPO_KEY] ??= {});
};

/**
 * Repository selected by COMMERCE_DB ('memory' default | 'postgres'). The instance
 * (and for Postgres its small connection pool) is a globalThis singleton so dev HMR
 * and warm serverless invocations reuse it instead of opening new pools.
 */
export async function getRepository(env: Record<string, string | undefined> = process.env): Promise<CommerceRepository> {
  const h = holder();
  if (h.repo) return h.repo;
  const which = env.COMMERCE_DB ?? 'memory';
  if (which === 'postgres') {
    const { Pool } = await import('pg'); // loaded lazily: memory mode never touches pg
    const pool = new Pool(poolConfigFromEnv(env));
    pool.on('error', () => {
      // An idle client died (e.g. pooler restart). pg discards it; the next query reconnects.
    });
    h.repo = createPostgresRepository(pool);
  } else if (which === 'memory') {
    h.repo = createMemoryRepository({ shared: true });
  } else {
    throw new Error(`Unknown COMMERCE_DB value "${which}" (expected "memory" or "postgres")`);
  }
  return h.repo;
}

/** Test seam: drop the cached repository. */
export function resetRepositoryForTests(): void {
  delete holder().repo;
}
