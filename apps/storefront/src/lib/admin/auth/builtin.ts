import type {
  AdminAuthProvider,
  AdminSession,
  SignInResult,
  StaffUser,
} from '../types';
import { audit, type AuditDraft } from '../audit';
import { normaliseEmail, type AdminConfig } from '../config';
import { adminGid } from '../ids';
import { capabilitiesFor } from '../permissions';
import type { AdminRepository, StaffRecord } from '../records';
import { cookieNames, type CookieJar } from './cookies';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password';
import { lockedForMs, withFailure, type AttemptKind } from './rate-limit';
import { hashIdentifier, hashToken, newToken } from './tokens';

/** Session and sign-in lifetimes (docs/admin/plan.md section 3). */
export const SESSION_IDLE_MS = 30 * 60_000;
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60_000;
const TOUCH_AFTER_MS = 60_000;

export type BuiltinAuthDeps = {
  repo: AdminRepository;
  config: Pick<AdminConfig, 'secureCookies'>;
  cookies: () => Promise<CookieJar>;
  now?: () => Date;
};

export type BuiltinAuth = AdminAuthProvider;

export function toStaffUser(s: StaffRecord): StaffUser {
  return {
    id: adminGid('StaffUser', s.id),
    email: s.email,
    name: s.name,
    role: s.role,
    status: s.status,
    authSubject: s.authSubject,
    createdAt: s.createdAt,
    lastSignInAt: s.lastSignInAt,
  };
}

/**
 * `AdminAuthProvider` backed by our own tables: scrypt passwords and hashed session tokens.
 * A future Supabase provider implements the same interface (see ./supabase.ts) and keeps roles, audit and
 * screens unchanged.
 */
export function createBuiltinAuth(deps: BuiltinAuthDeps): BuiltinAuth {
  const { repo, config } = deps;
  const now = deps.now ?? (() => new Date());
  const names = cookieNames(config.secureCookies);

  const ev = (draft: Omit<AuditDraft, 'at'>) => audit(repo, { ...draft, at: now().toISOString() });
  const actorOf = (s: StaffRecord) => ({ id: s.id, email: s.email });

  // ---- rate limiting ---------------------------------------------------------------------------------

  async function lockedMs(email: string | null, ip: string): Promise<number> {
    const checks: Promise<number>[] = [];
    if (email) checks.push(repo.getAttempt('email', hashIdentifier('email', email)).then((a) => lockedForMs(a, now())));
    checks.push(repo.getAttempt('ip', hashIdentifier('ip', ip)).then((a) => lockedForMs(a, now())));
    return Math.max(...(await Promise.all(checks)));
  }
  async function recordFailure(email: string | null, ip: string): Promise<void> {
    const at = now();
    const bump = (kind: AttemptKind, value: string) =>
      repo.mutateAttempt(kind, hashIdentifier(kind, value), (cur) => withFailure(cur, kind, hashIdentifier(kind, value), at));
    await Promise.all([email ? bump('email', email) : Promise.resolve(), bump('ip', ip)]);
  }
  async function clearEmail(email: string): Promise<void> {
    await repo.mutateAttempt('email', hashIdentifier('email', email), () => null);
  }

  // ---- cookies and sessions --------------------------------------------------------------------------

  /** Rotation: any session presented with the sign-in is revoked, and a brand-new token is issued. */
  async function startSession(jar: CookieJar, staff: StaffRecord): Promise<void> {
    const old = jar.get(names.session);
    if (old) await repo.deleteSession(hashToken(old));
    const at = now();
    const token = newToken();
    await repo.createSession({
      staffId: staff.id,
      tokenHash: hashToken(token),
      createdAt: at.toISOString(),
      lastSeenAt: at.toISOString(),
      absoluteExpiresAt: new Date(at.getTime() + SESSION_ABSOLUTE_MS).toISOString(),
      steppedUpAt: null, // retired column retained for repository compatibility
    });
    jar.set(names.session, token, { maxAgeSeconds: SESSION_ABSOLUTE_MS / 1000 });
    await repo.recordSignIn(staff.id, at.toISOString());
    void repo.purgeExpired(at).catch(() => undefined);
  }

  // ---- provider --------------------------------------------------------------------------------------

  const provider: BuiltinAuth = {
    async signIn({ email, password, ip }): Promise<SignInResult> {
      const jar = await deps.cookies();
      const address = normaliseEmail(email);
      if ((await lockedMs(address, ip)) > 0) return { ok: false, code: 'RATE_LIMITED' };

      const staff = address ? await repo.findStaffByEmail(address) : null;
      // Always spend one verification's worth of time, whether or not the account exists.
      const valid = staff?.passwordHash && typeof password === 'string' ? await verifyPassword(password, staff.passwordHash) : await verifyAgainstDummy(String(password ?? ''));
      if (!staff || !valid) {
        await recordFailure(address, ip);
        await ev({ actor: null, action: 'auth.sign_in_failed', changes: { reason: { from: null, to: 'INVALID_CREDENTIALS' } }, ip });
        return { ok: false, code: 'INVALID_CREDENTIALS' };
      }
      if (staff.status !== 'ACTIVE') {
        await ev({ actor: actorOf(staff), action: 'auth.sign_in_failed', changes: { reason: { from: null, to: 'DISABLED' } }, ip });
        return { ok: false, code: 'DISABLED' };
      }

      // Retire any legacy partial sign-in, then rotate into a complete password-authenticated session.
      const old = jar.get(names.pending);
      if (old) await repo.deletePending(hashToken(old));
      jar.delete(names.pending);
      await clearEmail(staff.email);
      await startSession(jar, staff);
      await ev({ actor: actorOf(staff), action: 'auth.sign_in', target: { type: 'staff', id: adminGid('StaffUser', staff.id) }, ip });
      return { ok: true, next: 'AUTHENTICATED' };
    },

    async getSession(): Promise<AdminSession | null> {
      const jar = await deps.cookies();
      const found = await readSession(jar);
      if (!found) return null;
      const { row, staffRecord } = found;
      const idleEnd = new Date(row.lastSeenAt).getTime() + SESSION_IDLE_MS;
      const absEnd = new Date(row.absoluteExpiresAt).getTime();
      return {
        staff: toStaffUser(staffRecord),
        capabilities: capabilitiesFor(staffRecord.role),
        expiresAt: new Date(Math.min(idleEnd, absEnd)).toISOString(),
      };
    },

    async signOut() {
      const jar = await deps.cookies();
      const token = jar.get(names.session);
      const found = token ? await readSession(jar) : null;
      if (token) await repo.deleteSession(hashToken(token));
      const pending = jar.get(names.pending);
      if (pending) await repo.deletePending(hashToken(pending));
      try {
        jar.delete(names.session);
        jar.delete(names.pending);
      } catch {
        // read-only cookie context
      }
      if (found) await ev({ actor: actorOf(found.staffRecord), action: 'auth.sign_out' });
    },
  };

  /** Valid session = known token, within idle and absolute limits, staff still active. Slides the idle window. */
  async function readSession(jar: CookieJar) {
    const token = jar.get(names.session);
    if (!token) return null;
    const hash = hashToken(token);
    const row = await repo.getSession(hash);
    if (!row) return null;
    const at = now().getTime();
    if (at - new Date(row.lastSeenAt).getTime() >= SESSION_IDLE_MS || at >= new Date(row.absoluteExpiresAt).getTime()) {
      await repo.deleteSession(hash);
      return null;
    }
    const staffRecord = await repo.getStaff(row.staffId);
    if (!staffRecord || staffRecord.status !== 'ACTIVE') {
      await repo.deleteSession(hash);
      return null;
    }
    if (at - new Date(row.lastSeenAt).getTime() >= TOUCH_AFTER_MS) {
      await repo.touchSession(hash, new Date(at).toISOString());
      row.lastSeenAt = new Date(at).toISOString();
    }
    return { row, staffRecord };
  }

  return provider;
}

// ---- accounts ------------------------------------------------------------------------------------------

/** Used by tests and the dev bootstrap: creates a staff row with a hashed password. */
export async function createStaffWithPassword(
  repo: AdminRepository,
  input: { email: string; name: string; role: StaffRecord['role']; password: string; createdAt?: string },
) {
  return repo.createStaff({
    email: input.email,
    name: input.name,
    role: input.role,
    passwordHash: await hashPassword(input.password),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}
