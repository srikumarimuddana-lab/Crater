import { getRepository } from '@/lib/commerce/repository-factory';
import type { CommerceRepository } from '@/lib/commerce/records';
import { createMemoryAdminRepository } from './memory-repository';
import { createPostgresAdminRepository } from './postgres-repository';
import type { AdminRepository } from './records';

/** Builds the admin repository that matches a commerce repository (same database, same state). */
export function adminRepositoryFor(commerce: CommerceRepository): AdminRepository {
  return commerce.kind === 'postgres' ? createPostgresAdminRepository(commerce) : createMemoryAdminRepository(commerce);
}

const KEY = Symbol.for('crater.admin.repository');
type Holder = { repo?: AdminRepository; commerce?: CommerceRepository };

/** Singleton on globalThis (survives dev HMR), following COMMERCE_DB through the commerce factory. */
export async function getAdminRepository(): Promise<{ admin: AdminRepository; commerce: CommerceRepository }> {
  const g = globalThis as unknown as Record<symbol, Holder | undefined>;
  const holder = (g[KEY] ??= {});
  const commerce = await getRepository();
  if (!holder.repo || holder.commerce !== commerce) {
    holder.repo = adminRepositoryFor(commerce);
    holder.commerce = commerce;
  }
  return { admin: holder.repo, commerce };
}

export function resetAdminRepositoryForTests(): void {
  const g = globalThis as unknown as Record<symbol, Holder | undefined>;
  delete g[KEY];
}
