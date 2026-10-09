import { describe, expect, it } from 'vitest';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from '@/lib/admin/auth/builtin';
import { seedDevStaff } from '@/lib/admin/auth/bootstrap';
import { parseDevStaff, readAdminConfig } from '@/lib/admin/config';
import { hashToken } from '@/lib/admin/auth/tokens';
import { createMemoryAdminRepository } from '@/lib/admin/memory-repository';
import { createMemoryRepository } from '@/lib/commerce/memory-repository';
import { decryptSecret } from '@/lib/admin/auth/secret-box';
import { base32Decode, totpAt } from '@/lib/admin/auth/totp';
import {
  PASSWORD, REPO_KINDS, SECRET_KEY, addStaff, closePoolsAfterAll, codeFor, makeEnv, signInFully, skipUnavailable,
} from './helpers';

closePoolsAfterAll();
const IP = '203.0.113.5';

describe.each(REPO_KINDS)('builtin sign-in (%s repository)', (kind) => {
  const t = skipUnavailable(kind) ? it.skip : it;

  t('password then TOTP signs in; cookie is HttpOnly-named, 256-bit, and only its SHA-256 is stored', async () => {
    const env = await makeEnv(kind);
    const { staff, secret } = await addStaff(env, 'ADMIN');
    expect(await env.auth.getSession()).toBeNull();
    expect(await env.auth.signIn({ email: ' ADMIN@example.test ', password: PASSWORD, ip: IP })).toEqual({ ok: true, next: 'MFA_REQUIRED' });
    expect(await env.auth.getSession()).toBeNull(); // password alone is not a session
    expect(await env.auth.verifySecondFactor({ code: codeFor(env, secret.base32), ip: IP })).toEqual({ ok: true });
    const token = env.jar.get('crater_admin') as string;
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    const stored = await env.admin.getSession(hashToken(token));
    expect(stored?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    const session = await env.auth.getSession();
    expect(session).toMatchObject({ staff: { email: staff.email, role: 'ADMIN', mfaEnrolled: true }, steppedUp: true });
    expect(session?.capabilities).toContain('products:publish');
    expect(env.jar.get('crater_admin_pending')).toBeUndefined();
  });

  t('wrong password, unknown email and disabled-looking failures give the same generic answer', async () => {
    const env = await makeEnv(kind);
    await addStaff(env, 'ADMIN');
    const bad = await env.auth.signIn({ email: 'admin@example.test', password: 'wrong password here', ip: IP });
    const unknown = await env.auth.signIn({ email: 'nobody@example.test', password: PASSWORD, ip: IP });
    const malformed = await env.auth.signIn({ email: 'not an email', password: PASSWORD, ip: IP });
    expect(bad).toEqual({ ok: false, code: 'INVALID_CREDENTIALS' });
    expect(unknown).toEqual(bad);
    expect(malformed).toEqual(bad);
    expect(await env.auth.getSession()).toBeNull();
  });

  t('rate limits per email with exponential backoff, generic for unknown emails, and per IP; success resets', async () => {
    const env = await makeEnv(kind);
    await addStaff(env, 'ADMIN');
    for (let i = 0; i < 5; i++) expect(await env.auth.signIn({ email: 'admin@example.test', password: 'wrong password here', ip: `198.51.100.${i}` })).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    // Locked now, even with the right password and from a fresh IP.
    expect(await env.auth.signIn({ email: 'admin@example.test', password: 'wrong password here', ip: '198.51.100.99' })).toEqual({ ok: false, code: 'INVALID_CREDENTIALS' });
    expect(await env.auth.signIn({ email: 'admin@example.test', password: PASSWORD, ip: '198.51.100.98' })).toEqual({ ok: false, code: 'RATE_LIMITED' });
    // Unknown emails are limited the same way (no enumeration through the limiter).
    for (let i = 0; i < 6; i++) await env.auth.signIn({ email: 'ghost@example.test', password: 'x'.repeat(14), ip: `192.0.2.${i}` });
    expect(await env.auth.signIn({ email: 'ghost@example.test', password: PASSWORD, ip: '192.0.2.200' })).toEqual({ ok: false, code: 'RATE_LIMITED' });
    // 30 s (first lock) later the right password works again.
    env.clock.advance(31_000);
    expect(await env.auth.signIn({ email: 'admin@example.test', password: PASSWORD, ip: '198.51.100.98' })).toMatchObject({ ok: true });
  });

  t('rate limits per IP across many emails', async () => {
    const env = await makeEnv(kind);
    for (let i = 0; i < 21; i++) await env.auth.signIn({ email: `user${i}@example.test`, password: 'x'.repeat(14), ip: '203.0.113.77' });
    expect(await env.auth.signIn({ email: 'user99@example.test', password: PASSWORD, ip: '203.0.113.77' })).toEqual({ ok: false, code: 'RATE_LIMITED' });
    expect(await env.auth.signIn({ email: 'user99@example.test', password: PASSWORD, ip: '203.0.113.78' })).toEqual({ ok: false, code: 'INVALID_CREDENTIALS' });
  });

  t('a TOTP code is single use (replay rejected), and an older step is rejected after a newer one', async () => {
    const env = await makeEnv(kind);
    const { secret } = await addStaff(env, 'ADMIN');
    await env.auth.signIn({ email: 'admin@example.test', password: PASSWORD, ip: IP });
    const code = codeFor(env, secret.base32);
    expect(await env.auth.verifySecondFactor({ code, ip: IP })).toEqual({ ok: true });
    // Replay of the same code at a fresh sign-in.
    await env.auth.signOut();
    await env.auth.signIn({ email: 'admin@example.test', password: PASSWORD, ip: IP });
    expect(await env.auth.verifySecondFactor({ code, ip: IP })).toEqual({ ok: false, code: 'INVALID_CODE' });
    // The previous step's code is also rejected once the current one was used.
    expect(await env.auth.verifySecondFactor({ code: codeFor(env, secret.base32, -1), ip: IP })).toEqual({ ok: false, code: 'INVALID_CODE' });
    // The next step's code is fine.
    expect(await env.auth.verifySecondFactor({ code: codeFor(env, secret.base32, 1), ip: IP })).toEqual({ ok: true });
  });

  t('concurrent submissions of one code: exactly one wins (atomic step consumption)', async () => {
    const env = await makeEnv(kind);
    const { staff } = await addStaff(env, 'ADMIN');
    const results = await Promise.all([env.admin.consumeTotpStep(staff.id, 100), env.admin.consumeTotpStep(staff.id, 100), env.admin.consumeTotpStep(staff.id, 100)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  t('five wrong codes destroy the pending sign-in', async () => {
    const env = await makeEnv(kind);
    const { secret } = await addStaff(env, 'ADMIN');
    await env.auth.signIn({ email: 'admin@example.test', password: PASSWORD, ip: IP });
    for (let i = 0; i < 5; i++) expect(await env.auth.verifySecondFactor({ code: '000000', ip: IP })).toMatchObject({ ok: false });
    expect(await env.auth.verifySecondFactor({ code: codeFor(env, secret.base32), ip: IP })).toEqual({ ok: false, code: 'NO_PENDING_SIGN_IN' });
    expect(await env.auth.verifySecondFactor({ code: '123456', ip: IP })).toEqual({ ok: false, code: 'NO_PENDING_SIGN_IN' });
  });

  t('first sign-in enrols TOTP: secret shown once, stored encrypted, confirmed with a code', async () => {
    const env = await makeEnv(kind);
    const { staff } = await addStaff(env, 'OWNER', 'owner@example.test', false);
    expect(await env.auth.beginMfaEnrolment()).toBeNull(); // no pending sign-in
    expect(await env.auth.signIn({ email: 'owner@example.test', password: PASSWORD, ip: IP })).toEqual({ ok: true, next: 'MFA_ENROL' });
    const begun = (await env.auth.beginMfaEnrolment())!;
    expect(begun.otpauthUri).toContain(`secret=${begun.secret}`);
    expect((await env.auth.beginMfaEnrolment())!.secret).toBe(begun.secret); // stable across a refresh
    expect(await env.auth.confirmMfaEnrolment({ code: '000000' })).toEqual({ ok: false, code: 'INVALID_CODE' });
    expect(await env.auth.getSession()).toBeNull();
    expect(await env.auth.confirmMfaEnrolment({ code: totpAt(base32Decode(begun.secret) as Buffer, env.clock.now.getTime()) })).toEqual({ ok: true });
    const row = (await env.admin.getStaff(staff.id))!;
    expect(row.mfaEnrolledAt).not.toBeNull();
    expect(row.totpSecretEnc).not.toContain(begun.secret);
    expect(decryptSecret(row.totpSecretEnc as string, SECRET_KEY, `crater-admin-totp:${staff.id}`)).toBe(begun.secret);
    expect((await env.auth.getSession())?.staff.email).toBe('owner@example.test');
    // Enrolment is closed once enrolled: a later pending sign-in asks for the code, not a new secret.
    await env.auth.signOut();
    expect(await env.auth.signIn({ email: 'owner@example.test', password: PASSWORD, ip: IP })).toEqual({ ok: true, next: 'MFA_REQUIRED' });
    expect(await env.auth.beginMfaEnrolment()).toBeNull();
  });

  t('idle timeout is 30 minutes and sliding; absolute limit is 12 hours', async () => {
    const env = await makeEnv(kind);
    const { staff, secret } = await addStaff(env, 'ADMIN');
    await signInFully(env, staff.email, secret.base32);
    env.clock.advance(20 * 60_000);
    expect(await env.auth.getSession()).not.toBeNull(); // activity at +20 min slides the window
    env.clock.advance(29 * 60_000);
    expect(await env.auth.getSession()).not.toBeNull(); // 29 min after the last activity
    env.clock.advance(SESSION_IDLE_MS + 1000);
    expect(await env.auth.getSession()).toBeNull(); // idle
    expect(await env.auth.getSession()).toBeNull(); // and stays gone (row deleted)

  });

  t('absolute expiry holds even with constant activity', async () => {
    const env = await makeEnv(kind);
    const { staff, secret } = await addStaff(env, 'ADMIN');
    await signInFully(env, staff.email, secret.base32);
    let alive = true;
    let elapsed = 0;
    while (elapsed < SESSION_ABSOLUTE_MS + 3_600_000 && alive) {
      env.clock.advance(20 * 60_000);
      elapsed += 20 * 60_000;
      alive = (await env.auth.getSession()) !== null;
    }
    expect(alive).toBe(false);
    expect(elapsed).toBeGreaterThanOrEqual(SESSION_ABSOLUTE_MS);
    expect(elapsed).toBeLessThanOrEqual(SESSION_ABSOLUTE_MS + 20 * 60_000);
  });

  t('signing in again rotates the session token and revokes the old one; sign-out revokes', async () => {
    const env = await makeEnv(kind);
    const { staff, secret } = await addStaff(env, 'ADMIN');
    await signInFully(env, staff.email, secret.base32);
    const first = env.jar.get('crater_admin') as string;
    env.clock.advance(31_000); // next TOTP step
    await env.auth.signIn({ email: staff.email, password: PASSWORD, ip: IP });
    expect(await env.auth.verifySecondFactor({ code: codeFor(env, secret.base32), ip: IP })).toEqual({ ok: true });
    const second = env.jar.get('crater_admin') as string;
    expect(second).not.toBe(first);
    expect(await env.admin.getSession(hashToken(first))).toBeNull();
    expect(await env.admin.getSession(hashToken(second))).not.toBeNull();
    await env.auth.signOut();
    expect(env.jar.get('crater_admin')).toBeUndefined();
    expect(await env.admin.getSession(hashToken(second))).toBeNull();
    env.jar.values.set('crater_admin', second); // a stolen copy of the cookie no longer works
    expect(await env.auth.getSession()).toBeNull();
  });

  t('step-up: fresh at sign-in, stale after 10 minutes, restored by a new code', async () => {
    const env = await makeEnv(kind);
    const { staff, secret } = await addStaff(env, 'OWNER');
    await signInFully(env, staff.email, secret.base32);
    expect((await env.auth.getSession())?.steppedUp).toBe(true);
    env.clock.advance(11 * 60_000);
    expect((await env.auth.getSession())?.steppedUp).toBe(false);
    expect(await env.auth.verifySecondFactor({ code: '111111', ip: IP })).toEqual({ ok: false, code: 'INVALID_CODE' });
    expect(await env.auth.verifySecondFactor({ code: codeFor(env, secret.base32), ip: IP })).toEqual({ ok: true });
    expect((await env.auth.getSession())?.steppedUp).toBe(true);
  });

  t('a disabled account cannot sign in and its live sessions stop working', async () => {
    const env = await makeEnv(kind);
    const { staff, secret } = await addStaff(env, 'ADMIN');
    await signInFully(env, staff.email, secret.base32);
    // Disable through the storage layer (staff management UI is a later slice).
    if (kind === 'memory') {
      const { memoryStateOf } = await import('@/lib/commerce/memory-repository');
      (memoryStateOf(env.h.repo).ext.get('admin') as { staff: { id: number; status: string }[] }).staff.find((s) => s.id === staff.id)!.status = 'DISABLED';
    } else {
      const { pgPoolOf } = await import('@/lib/commerce/postgres-repository');
      await pgPoolOf(env.h.repo).query("update admin.staff_users set status = 'DISABLED' where id = $1", [staff.id]);
    }
    expect(await env.auth.getSession()).toBeNull();
    await env.auth.signOut();
    expect(await env.auth.signIn({ email: staff.email, password: PASSWORD, ip: IP })).toEqual({ ok: false, code: 'DISABLED' });
  });

  t('audit rows are written for sign-in events and never contain a password, code or token', async () => {
    const env = await makeEnv(kind);
    const { staff, secret } = await addStaff(env, 'ADMIN');
    await env.auth.signIn({ email: 'ghost@example.test', password: 'secret-attempt-123', ip: IP });
    await signInFully(env, staff.email, secret.base32);
    await env.auth.signOut();
    const rows = await env.admin.listAudit({ first: 50, beforeId: null });
    expect(rows.map((r) => r.action).sort()).toEqual(['auth.sign_in', 'auth.sign_in_failed', 'auth.sign_out']);
    const text = JSON.stringify(rows);
    expect(text).not.toContain('secret-attempt-123');
    expect(text).not.toContain('ghost@example.test'); // failed sign-ins do not record the typed email
    expect(rows.find((r) => r.action === 'auth.sign_in_failed')?.ipTrunc).toBe('203.0.113.0/24');
  });
});

describe('ADMIN_DEV_STAFF bootstrap is memory-only', () => {
  const dev = JSON.stringify({ email: 'dev@example.test', password: 'dev password 12345', role: 'ADMIN', totpSecret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' });
  const baseEnv = { ADMIN_SECRET_KEY: SECRET_KEY.toString('base64') };

  it('is parsed in memory mode (object or array form)', () => {
    expect(parseDevStaff(dev, 'memory')).toHaveLength(1);
    expect(parseDevStaff(`[${dev}]`, 'memory')[0]).toMatchObject({ email: 'dev@example.test', role: 'ADMIN' });
    expect(readAdminConfig({ ...baseEnv, ADMIN_DEV_STAFF: dev }).devStaff).toHaveLength(1);
    expect(readAdminConfig({ ...baseEnv, COMMERCE_DB: 'memory', ADMIN_DEV_STAFF: dev }).devStaff).toHaveLength(1);
  });
  it('is refused when COMMERCE_DB=postgres, at config time', () => {
    expect(() => readAdminConfig({ ...baseEnv, COMMERCE_DB: 'postgres', ADMIN_DEV_STAFF: dev })).toThrow(/only allowed with COMMERCE_DB=memory/);
    expect(() => parseDevStaff(dev, 'postgres')).toThrow(/only allowed/);
    expect(readAdminConfig({ ...baseEnv, COMMERCE_DB: 'postgres' }).devStaff).toEqual([]);
  });
  it('is refused by the seeding step for any non-memory repository, and validates entries', async () => {
    const cfg = { devStaff: parseDevStaff(dev, 'memory'), secretKey: SECRET_KEY };
    const pgLike = { kind: 'postgres' } as never;
    await expect(seedDevStaff(pgLike, cfg)).rejects.toThrow(/only allowed/);
    expect(() => parseDevStaff(JSON.stringify({ email: 'x@example.test', password: 'short', role: 'ADMIN', totpSecret: 'GEZDGNBVGY3TQOJQ' }), 'memory')).toThrow(/at least 12/);
    expect(() => parseDevStaff(JSON.stringify({ email: 'x@example.test', password: 'long enough password', role: 'KING', totpSecret: 'GEZDGNBVGY3TQOJQ' }), 'memory')).toThrow(/invalid role/);
    expect(() => parseDevStaff('{nope', 'memory')).toThrow(/valid JSON/);
  });
  it('seeds enrolled staff in memory so a test can sign in by computing codes, idempotently', async () => {
    const commerce = createMemoryRepository();
    const repo = createMemoryAdminRepository(commerce);
    const cfg = { devStaff: parseDevStaff(dev, 'memory'), secretKey: SECRET_KEY };
    await seedDevStaff(repo, cfg);
    await seedDevStaff(repo, cfg);
    expect(await repo.listStaff()).toHaveLength(1);
    const s = (await repo.findStaffByEmail('dev@example.test'))!;
    expect(s.mfaEnrolledAt).not.toBeNull();
    expect(decryptSecret(s.totpSecretEnc as string, SECRET_KEY, `crater-admin-totp:${s.id}`)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });
  it('config refuses to start without a strong ADMIN_SECRET_KEY, a bad provider or a bad timezone', () => {
    expect(() => readAdminConfig({})).toThrow(/ADMIN_SECRET_KEY is required/);
    expect(() => readAdminConfig({ ...baseEnv, ADMIN_AUTH_PROVIDER: 'ldap' })).toThrow(/ADMIN_AUTH_PROVIDER/);
    expect(() => readAdminConfig({ ...baseEnv, TIMEZONE: 'Mars/Base' })).toThrow(/TIMEZONE/);
    expect(readAdminConfig(baseEnv)).toMatchObject({ provider: 'builtin', timezone: 'America/Toronto', secureCookies: false });
    expect(readAdminConfig({ ...baseEnv, SITE_URL: 'https://shop.example' }).secureCookies).toBe(true);
  });
});
