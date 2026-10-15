import type { AdminConfig } from '../config';
import { AdminConfigError } from '../errors';
import type { AdminRepository } from '../records';
import { hashPassword } from './password';

/**
 * Test/dev only: seeds staff with passwords for end-to-end sign-in tests.
 * Refuses outright unless the database is the in-memory one (also enforced when ADMIN_DEV_STAFF is parsed),
 * so fixed credentials can never reach a real database. Idempotent per email.
 */
export async function seedDevStaff(repo: AdminRepository, config: Pick<AdminConfig, 'devStaff'>): Promise<void> {
  if (!config.devStaff.length) return;
  if (repo.kind !== 'memory') throw new AdminConfigError('ADMIN_DEV_STAFF is only allowed with COMMERCE_DB=memory.');
  for (const dev of config.devStaff) {
    if (await repo.findStaffByEmail(dev.email)) continue;
    const at = new Date().toISOString();
    await repo.createStaff({ email: dev.email, name: dev.name, role: dev.role, passwordHash: await hashPassword(dev.password), createdAt: at });

  }
}
