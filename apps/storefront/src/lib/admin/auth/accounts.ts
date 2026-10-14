import { AccountError } from './account-errors';
import type { AdminRepository } from '../records';
import type { AdminSession, StaffRole } from '../types';
import { normaliseEmail } from '../config';
import { AdminAuthError } from '../errors';
import { gidTail } from '../ids';
import { roleCan } from '../permissions';
import { audit } from '../audit';
import { hashPassword, passwordPolicyProblem } from './password';
import { hashIdentifier, hashToken, newToken } from './tokens';
import { lockedForMs, withFailure } from './rate-limit';
import type { AccountRepository } from './account-repository';

export type AccountLink = { recipient: string; kind: 'INVITE' | 'RESET'; url: string; eventKey: string };
export type AccountServiceDeps = {
  admin: AdminRepository;
  repo: AccountRepository;
  getSession(): Promise<AdminSession | null>;
  enqueueLink(link: AccountLink): Promise<void>;
  origin: string;
  now?: () => Date;
};
const ROLES: StaffRole[] = ['OWNER', 'ADMIN', 'FULFILMENT', 'BOOKKEEPER', 'SUPPORT'];
const GENERIC_RESET = { ok: true as const, message: 'If this account can sign in, a password reset link will be sent.' };
const INVALID_LINK = { ok: false as const, message: 'This link is invalid or expired. Request a new one.' };

export function createAccountService(deps: AccountServiceDeps) {
  const { admin, repo } = deps;
  const now = deps.now ?? (() => new Date());
  async function owner() {
    const session = await deps.getSession();
    if (!session) throw new AdminAuthError('UNAUTHENTICATED');
    const id = gidTail(session.staff.id, 'StaffUser');
    const staff = id ? await admin.getStaff(id) : null;
    if (!staff || staff.status !== 'ACTIVE' || !roleCan(staff.role, 'staff:manage') || !session.capabilities.includes('staff:manage')) throw new AdminAuthError('FORBIDDEN', 'staff:manage');
    return staff;
  }
  async function sendLink(staffId: number, recipient: string, kind: 'INVITE' | 'RESET') {
    const token = newToken();
    const hash = hashToken(token);
    const url = new URL('/admin/reset-password', deps.origin);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new AccountError('Configure a secure public site URL before sending staff links.');
    url.searchParams.set('token', token);
    await repo.issueToken({ hash, staffId, kind, expiresAt: new Date(now().getTime() + (kind === 'INVITE' ? 24 * 60 : 30) * 60_000).toISOString() });
    await deps.enqueueLink({ recipient, kind, url: url.toString(), eventKey: `staff-link:${hash}` });
  }
  return {
    async invite(input: { email: string; name: string; role: StaffRole }) {
      const actor = await owner();
      const email = normaliseEmail(input.email);
      const name = input.name.trim();
      if (!email || !name || name.length > 120 || !ROLES.includes(input.role)) throw new AccountError('Enter a valid email, name and role.');
      const existing = await admin.findStaffByEmail(email);
      if (existing && (existing.passwordHash || existing.status !== 'ACTIVE')) throw new AccountError('This staff account already exists. Manage it below.');
      const created = existing ? null : await admin.createStaff({ email, name, role: input.role, passwordHash: null, createdAt: now().toISOString() });
      const staff = existing ?? (created?.kind === 'created' ? created.staff : null);
      if (!staff) throw new AccountError('This staff account already exists. Reload the page.');
      await sendLink(staff.id, staff.email, 'INVITE');
      await audit(admin, { actor: { id: actor.id, email: actor.email }, action: 'staff.invited', target: { type: 'staff', id: `gid://crater/StaffUser/${staff.id}` }, at: now().toISOString() });
      return { ok: true as const };
    },
    async updateStaff(input: { id: number; role: StaffRole; status: 'ACTIVE' | 'DISABLED' }) {
      const actor = await owner();
      if (!Number.isSafeInteger(input.id) || input.id <= 0 || !ROLES.includes(input.role) || !['ACTIVE', 'DISABLED'].includes(input.status)) throw new AccountError('Choose a valid staff account, role and status.');
      await repo.updateStaff(actor.id, input);
      return { ok: true as const };
    },
    async requestReset(rawEmail: string, ip: string) {
      const email = normaliseEmail(rawEmail);
      // Separate hashed limiter keys prevent a recovery request from locking ordinary sign-in.
      const keys = [{ kind: 'ip' as const, hash: hashIdentifier('ip', `reset:${ip}`) }, { kind: 'email' as const, hash: hashIdentifier('email', `reset:${email ?? 'invalid'}`) }];
      const checks = await Promise.all(keys.map(key => admin.getAttempt(key.kind, key.hash)));
      if (checks.some(attempt => lockedForMs(attempt, now()) > 0)) return GENERIC_RESET;
      await Promise.all(keys.map(key => admin.mutateAttempt(key.kind, key.hash, current => withFailure(current, key.kind, key.hash, now()))));
      const staff = email ? await admin.findStaffByEmail(email) : null;
      if (staff?.status === 'ACTIVE' && staff.passwordHash) {
        // Keep the outward response identical if delivery is not configured or temporarily unavailable.
        // The communications outbox records retry/failure state; no account membership leaks here.
        try { await sendLink(staff.id, staff.email, 'RESET'); } catch { /* generic recovery response */ }
      }
      return GENERIC_RESET;
    },
    async acceptPassword(input: { token: string; password: string }) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(input.token)) return INVALID_LINK;
      const token = await repo.getToken(hashToken(input.token));
      if (!token || new Date(token.expiresAt) <= now()) return INVALID_LINK;
      const staff = await admin.getStaff(token.staffId);
      if (!staff || staff.status !== 'ACTIVE') return INVALID_LINK;
      const problem = passwordPolicyProblem(input.password, staff.email);
      if (problem) return { ok: false as const, message: problem };
      const hash = await hashPassword(input.password);
      return await repo.consumeToken(token.hash, hash, now()) ? { ok: true as const } : INVALID_LINK;
    },
  };
}
