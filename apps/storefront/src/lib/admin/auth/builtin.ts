import type {
  AdminAuthProvider,
  AdminSession,
  SecondFactorResult,
  SignInResult,
  StaffUser,
} from '../types';
import { audit, type AuditDraft } from '../audit';
import { normaliseEmail, type AdminConfig } from '../config';
import { adminGid } from '../ids';
import { capabilitiesFor } from '../permissions';
import type { AdminRepository, PendingSignInRecord, StaffRecord } from '../records';
import { cookieNames, type CookieJar } from './cookies';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password';
import { lockedForMs, withFailure, type AttemptKind } from './rate-limit';
import { decryptSecret, encryptSecret } from './secret-box';
import { hashIdentifier, hashToken, newToken } from './tokens';
import { base32Decode, generateTotpSecret, otpauthUri, stepAt, verifyTotp } from './totp';

/** Session and sign-in lifetimes (docs/admin/plan.md section 3). */
export const SESSION_IDLE_MS = 30 * 60_000;
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60_000;
export const STEP_UP_WINDOW_MS = 10 * 60_000;
export const PENDING_MS = 5 * 60_000;
const MAX_PENDING_ATTEMPTS = 5;
const TOUCH_AFTER_MS = 60_000;
const ISSUER = 'Crater Admin';

export type BuiltinAuthDeps = {
  repo: AdminRepository;
  config: Pick<AdminConfig, 'secretKey' | 'secureCookies'>;
  cookies: () => Promise<CookieJar>;
  now?: () => Date;
};

export type BuiltinAuth = Omit<AdminAuthProvider, 'confirmMfaEnrolment'> & {
  /** Extension of the contract: also accepts the client address for rate limiting. */
  confirmMfaEnrolment(args: { code: string; ip?: string }): Promise<SecondFactorResult>;
};

const totpAad = (staffId: number) => `crater-admin-totp:${staffId}`;

export function toStaffUser(s: StaffRecord): StaffUser {
  return {
    id: adminGid('StaffUser', s.id),
    email: s.email,
    name: s.name,
    role: s.role,
    status: s.status,
    mfaEnrolled: s.mfaEnrolledAt !== null,
    authSubject: s.authSubject,
    createdAt: s.createdAt,
    lastSignInAt: s.lastSignInAt,
  };
}

/**
 * `AdminAuthProvider` backed by our own tables: scrypt passwords, TOTP second factor, hashed session tokens.
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

  async function readPending(jar: CookieJar): Promise<PendingSignInRecord | null> {
    const token = jar.get(names.pending);
    if (!token) return null;
    const row = await repo.getPending(hashToken(token));
    if (!row) return null;
    if (new Date(row.expiresAt) <= now()) {
      await repo.deletePending(row.tokenHash);
      return null;
    }
    return row;
  }

  function dropPendingCookie(jar: CookieJar) {
    try {
      jar.delete(names.pending);
    } catch {
      // read-only cookie context (Server Component): the row is gone, the stale cookie is harmless
    }
  }

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
      steppedUpAt: at.toISOString(), // the second factor was just verified
    });
    jar.set(names.session, token, { maxAgeSeconds: SESSION_ABSOLUTE_MS / 1000 });
    await repo.recordSignIn(staff.id, at.toISOString());
    void repo.purgeExpired(at).catch(() => undefined);
  }

  function checkCode(staff: StaffRecord, secretEnc: string | null, code: string): { step: number } | null {
    if (!secretEnc) return null;
    const base32 = decryptSecret(secretEnc, config.secretKey, totpAad(staff.id));
    const secret = base32 ? base32Decode(base32) : null;
    if (!secret) return null;
    const normalised = typeof code === 'string' ? code.replace(/\s/g, '') : '';
    const step = verifyTotp(secret, normalised, now().getTime());
    return step === null ? null : { step };
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

      const old = jar.get(names.pending);
      if (old) await repo.deletePending(hashToken(old));
      const token = newToken();
      const at = now();
      const kind = staff.mfaEnrolledAt ? 'MFA_REQUIRED' : 'MFA_ENROL';
      await repo.createPending({
        tokenHash: hashToken(token),
        staffId: staff.id,
        kind,
        enrolSecretEnc: null,
        attempts: 0,
        createdAt: at.toISOString(),
        expiresAt: new Date(at.getTime() + PENDING_MS).toISOString(),
      });
      jar.set(names.pending, token, { maxAgeSeconds: PENDING_MS / 1000 });
      return { ok: true, next: kind };
    },

    async verifySecondFactor({ code, ip }): Promise<SecondFactorResult> {
      const jar = await deps.cookies();
      const pending = await readPending(jar);

      if (pending) {
        if (pending.kind !== 'MFA_REQUIRED') return { ok: false, code: 'NO_PENDING_SIGN_IN' };
        const staff = await repo.getStaff(pending.staffId);
        if (!staff || staff.status !== 'ACTIVE') {
          await repo.deletePending(pending.tokenHash);
          return { ok: false, code: 'NO_PENDING_SIGN_IN' };
        }
        if ((await lockedMs(staff.email, ip)) > 0) return { ok: false, code: 'RATE_LIMITED' };
        const match = checkCode(staff, staff.totpSecretEnc, code);
        // consumeTotpStep is the replay guard: a code (or any older one) can be used once.
        if (!match || !(await repo.consumeTotpStep(staff.id, match.step))) {
          await recordFailure(staff.email, ip);
          const attempts = pending.attempts + 1;
          if (attempts >= MAX_PENDING_ATTEMPTS) {
            await repo.deletePending(pending.tokenHash);
            dropPendingCookie(jar);
          } else {
            await repo.updatePending(pending.tokenHash, { attempts });
          }
          await ev({ actor: actorOf(staff), action: 'auth.mfa_failed', changes: { reason: { from: null, to: match ? 'REPLAY' : 'INVALID_CODE' } }, ip });
          return { ok: false, code: 'INVALID_CODE' };
        }
        await repo.deletePending(pending.tokenHash);
        dropPendingCookie(jar);
        await clearEmail(staff.email);
        await startSession(jar, staff);
        await ev({ actor: actorOf(staff), action: 'auth.sign_in', target: { type: 'staff', id: adminGid('StaffUser', staff.id) }, ip });
        return { ok: true };
      }

      // No pending sign-in: this is a step-up on an existing session.
      const session = await readSession(jar);
      if (!session) return { ok: false, code: 'NO_PENDING_SIGN_IN' };
      const staff = session.staffRecord;
      if ((await lockedMs(staff.email, ip)) > 0) return { ok: false, code: 'RATE_LIMITED' };
      const match = checkCode(staff, staff.totpSecretEnc, code);
      if (!match || !(await repo.consumeTotpStep(staff.id, match.step))) {
        await recordFailure(staff.email, ip);
        await ev({ actor: actorOf(staff), action: 'auth.step_up_failed', ip });
        return { ok: false, code: 'INVALID_CODE' };
      }
      await clearEmail(staff.email);
      await repo.markSteppedUp(session.row.tokenHash, now().toISOString());
      await ev({ actor: actorOf(staff), action: 'auth.step_up', ip });
      return { ok: true };
    },

    async beginMfaEnrolment() {
      const jar = await deps.cookies();
      const pending = await readPending(jar);
      if (!pending || pending.kind !== 'MFA_ENROL') return null;
      const staff = await repo.getStaff(pending.staffId);
      if (!staff || staff.status !== 'ACTIVE' || staff.mfaEnrolledAt) return null;
      // Reuse the candidate secret on refresh so an authenticator app scanned a moment ago stays valid.
      let base32 = pending.enrolSecretEnc ? decryptSecret(pending.enrolSecretEnc, config.secretKey, totpAad(staff.id)) : null;
      if (!base32) {
        base32 = generateTotpSecret().base32;
        await repo.updatePending(pending.tokenHash, { enrolSecretEnc: encryptSecret(base32, config.secretKey, totpAad(staff.id)) });
      }
      return { otpauthUri: otpauthUri({ issuer: ISSUER, account: staff.email, secretBase32: base32 }), secret: base32 };
    },

    async confirmMfaEnrolment({ code, ip }): Promise<SecondFactorResult> {
      const jar = await deps.cookies();
      const pending = await readPending(jar);
      if (!pending || pending.kind !== 'MFA_ENROL' || !pending.enrolSecretEnc) return { ok: false, code: 'NO_PENDING_SIGN_IN' };
      const staff = await repo.getStaff(pending.staffId);
      if (!staff || staff.status !== 'ACTIVE' || staff.mfaEnrolledAt) return { ok: false, code: 'NO_PENDING_SIGN_IN' };
      if ((await lockedMs(staff.email, ip ?? 'unknown')) > 0) return { ok: false, code: 'RATE_LIMITED' };
      const match = checkCode(staff, pending.enrolSecretEnc, code);
      if (!match || !(await repo.consumeTotpStep(staff.id, match.step))) {
        await recordFailure(staff.email, ip ?? 'unknown');
        const attempts = pending.attempts + 1;
        if (attempts >= MAX_PENDING_ATTEMPTS) {
          await repo.deletePending(pending.tokenHash);
          dropPendingCookie(jar);
        } else {
          await repo.updatePending(pending.tokenHash, { attempts });
        }
        await ev({ actor: actorOf(staff), action: 'auth.mfa_failed', changes: { reason: { from: null, to: 'INVALID_CODE' } }, ip });
        return { ok: false, code: 'INVALID_CODE' };
      }
      await repo.setMfa(staff.id, pending.enrolSecretEnc, now().toISOString());
      await repo.deletePending(pending.tokenHash);
      dropPendingCookie(jar);
      await clearEmail(staff.email);
      await startSession(jar, staff);
      await ev({ actor: actorOf(staff), action: 'auth.mfa_enrolled', target: { type: 'staff', id: adminGid('StaffUser', staff.id) }, ip });
      await ev({ actor: actorOf(staff), action: 'auth.sign_in', target: { type: 'staff', id: adminGid('StaffUser', staff.id) }, ip });
      return { ok: true };
    },

    async getSession(): Promise<AdminSession | null> {
      const jar = await deps.cookies();
      const found = await readSession(jar);
      if (!found) return null;
      const { row, staffRecord } = found;
      const at = now().getTime();
      const idleEnd = new Date(row.lastSeenAt).getTime() + SESSION_IDLE_MS;
      const absEnd = new Date(row.absoluteExpiresAt).getTime();
      const steppedUp = row.steppedUpAt !== null && at - new Date(row.steppedUpAt).getTime() <= STEP_UP_WINDOW_MS;
      return {
        staff: toStaffUser(staffRecord),
        capabilities: capabilitiesFor(staffRecord.role),
        steppedUp,
        expiresAt: new Date(Math.min(idleEnd, absEnd)).toISOString(),
      };
    },

    async signOut() {
      const jar = await deps.cookies();
      const token = jar.get(names.session);
      const found = token ? await readSession(jar) : null;
      if (token) await repo.deleteSession(hashToken(token));
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
    if (at - new Date(row.lastSeenAt).getTime() > SESSION_IDLE_MS || at >= new Date(row.absoluteExpiresAt).getTime()) {
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
  input: { email: string; name: string; role: StaffRecord['role']; password: string; totpSecretEnc?: string; createdAt?: string },
) {
  return repo.createStaff({
    email: input.email,
    name: input.name,
    role: input.role,
    passwordHash: await hashPassword(input.password),
    totpSecretEnc: input.totpSecretEnc ?? null,
    mfaEnrolledAt: input.totpSecretEnc ? (input.createdAt ?? new Date().toISOString()) : null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export { stepAt };
