import type { AdminConfig } from '../config';
import { AdminConfigError } from '../errors';
import type { AdminRepository } from '../records';
import { hashPassword } from './password';
import { encryptSecret } from './secret-box';

/**
 * Test/dev only: seeds staff with MFA already enrolled so e2e can sign in by computing TOTP codes.
 * Refuses outright unless the database is the in-memory one (also enforced when ADMIN_DEV_STAFF is parsed),
 * so fixed credentials can never reach a real database. Idempotent per email.
 */
export async function seedDevStaff(repo: AdminRepository, config: Pick<AdminConfig, 'devStaff' | 'secretKey'>): Promise<void> {
  if (!config.devStaff.length) return;
  if (repo.kind !== 'memory') throw new AdminConfigError('ADMIN_DEV_STAFF is only allowed with COMMERCE_DB=memory.');
  for (const dev of config.devStaff) {
    if (await repo.findStaffByEmail(dev.email)) continue;
    const at = new Date().toISOString();
    const created = await repo.createStaff({ email: dev.email, name: dev.name, role: dev.role, passwordHash: await hashPassword(dev.password), createdAt: at });
    if (created.kind === 'created') {
      await repo.setMfa(created.staff.id, encryptSecret(dev.totpSecret, config.secretKey, `crater-admin-totp:${created.staff.id}`), at);
    }
  }
}
