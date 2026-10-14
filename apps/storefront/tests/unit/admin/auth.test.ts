import { describe, expect, it } from 'vitest';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from '@/lib/admin/auth/builtin';
import { seedDevStaff } from '@/lib/admin/auth/bootstrap';
import { parseDevStaff, readAdminConfig } from '@/lib/admin/config';
import { hashToken } from '@/lib/admin/auth/tokens';
import { createMemoryAdminRepository } from '@/lib/admin/memory-repository';
import { createMemoryRepository } from '@/lib/commerce/memory-repository';
import {
  PASSWORD, REPO_KINDS, addStaff, closePoolsAfterAll, makeEnv, signInFully, skipUnavailable,
} from './helpers';

closePoolsAfterAll();
const IP = '203.0.113.5';

describe.each(REPO_KINDS)('builtin sign-in (%s repository)', (kind) => {
  const t = skipUnavailable(kind) ? it.skip : it;

  t('password signs in an enrolled legacy account immediately; cookie is HttpOnly-named, 256-bit, and only its SHA-256 is stored', async () => {
    const env = await makeEnv(kind);
    const { staff } = await addStaff(env, 'ADMIN');
    expect(await env.auth.getSession()).toBeNull();
    expect(await env.auth.signIn({ email: ' ADMIN@example.test ', password: PASSWORD, ip: IP })).toEqual({ ok: true, next: 'AUTHENTICATED' });
    const token = env.jar.get('crater_admin') as string;
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    const stored = await env.admin.getSession(hashToken(token));
    expect(stored?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    const session = await env.auth.getSession();
    expect(session).toMatchObject({ staff: { email: staff.email, role: 'ADMIN' } });
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

  t('a new staff account signs in without enrolment or a pending cookie', async () => {
    const env = await makeEnv(kind);
    const { staff } = await addStaff(env, 'OWNER', 'owner@example.test', false);
    expect(await env.auth.signIn({ email: staff.email, password: PASSWORD, ip: IP })).toEqual({ ok: true, next: 'AUTHENTICATED' });
    expect((await env.auth.getSession())?.staff.email).toBe(staff.email);
    expect(env.jar.get('crater_admin_pending')).toBeUndefined();
    expect(await env.admin.getStaff(staff.id)).toMatchObject({ totpSecretEnc: null, mfaEnrolledAt: null });
  });

  t('retires a legacy pending sign-in when password authentication succeeds', async () => {
    const env = await makeEnv(kind);
    const { staff } = await addStaff(env, 'ADMIN');
    const token = 'legacy-pending-token';
    env.jar.values.set('crater_admin_pending', token);
    await env.admin.createPending({ tokenHash: hashToken(token), staffId: staff.id, kind: 'MFA_REQUIRED', enrolSecretEnc: null, attempts: 0, createdAt: env.clock.now.toISOString(), expiresAt: new Date(env.clock.now.getTime() + 300_000).toISOString() });
    await env.auth.signIn({ email: staff.email, password: PASSWORD, ip: IP });
    expect(await env.admin.getPending(hashToken(token))).toBeNull();
    expect(env.jar.get('crater_admin_pending')).toBeUndefined();
    expect(await env.auth.getSession()).not.toBeNull();
  });

  t('idle timeout is 30 minutes and sliding; absolute limit is 12 hours', async () => {
    const env = await makeEnv(kind);
    const { staff } = await addStaff(env, 'ADMIN');
    await signInFully(env, staff.email);
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
    const { staff } = await addStaff(env, 'ADMIN');
    await signInFully(env, staff.email);
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
    const { staff } = await addStaff(env, 'ADMIN');
    await signInFully(env, staff.email);
    const first = env.jar.get('crater_admin') as string;
    await env.auth.signIn({ email: staff.email, password: PASSWORD, ip: IP });
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

  t('session authorizes normally without second-factor flags', async () => {
    const env = await makeEnv(kind);
    const { staff } = await addStaff(env, 'OWNER');
    await env.auth.signIn({ email: staff.email, password: PASSWORD, ip: IP });
    env.clock.advance(11 * 60_000);
    const session = await env.auth.getSession();
    expect(session?.capabilities).toContain('staff:manage');
    expect(session).not.toHaveProperty('steppedUp');
    expect(session?.staff).not.toHaveProperty('mfaEnrolled');
    const token = env.jar.get('crater_admin')!;
    expect((await env.admin.getSession(hashToken(token)))?.steppedUpAt).toBeNull();
  });

  t('a disabled account cannot sign in and its live sessions stop working', async () => {
    const env = await makeEnv(kind);
    const { staff } = await addStaff(env, 'ADMIN');
    await signInFully(env, staff.email);
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
    const { staff } = await addStaff(env, 'ADMIN');
    await env.auth.signIn({ email: 'ghost@example.test', password: 'secret-attempt-123', ip: IP });
    await signInFully(env, staff.email);
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
  const dev = JSON.stringify({ email: 'dev@example.test', password: 'dev password 12345', role: 'ADMIN' });
  const baseEnv = {};

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
    const cfg = { devStaff: parseDevStaff(dev, 'memory') };
    const pgLike = { kind: 'postgres' } as never;
    await expect(seedDevStaff(pgLike, cfg)).rejects.toThrow(/only allowed/);
    expect(() => parseDevStaff(JSON.stringify({ email: 'x@example.test', password: 'short', role: 'ADMIN', totpSecret: 'GEZDGNBVGY3TQOJQ' }), 'memory')).toThrow(/at least 12/);
    expect(() => parseDevStaff(JSON.stringify({ email: 'x@example.test', password: 'long enough password', role: 'KING', totpSecret: 'GEZDGNBVGY3TQOJQ' }), 'memory')).toThrow(/invalid role/);
    expect(() => parseDevStaff('{nope', 'memory')).toThrow(/valid JSON/);
  });
  it('seeds password-only staff in memory idempotently', async () => {
    const commerce = createMemoryRepository();
    const repo = createMemoryAdminRepository(commerce);
    const cfg = { devStaff: parseDevStaff(dev, 'memory') };
    await seedDevStaff(repo, cfg);
    await seedDevStaff(repo, cfg);
    expect(await repo.listStaff()).toHaveLength(1);
    const s = (await repo.findStaffByEmail('dev@example.test'))!;
    expect(s.mfaEnrolledAt).toBeNull();
    expect(s.totpSecretEnc).toBeNull();
  });
  it('config requires no TOTP key and rejects invalid providers or timezones', () => {
    expect(readAdminConfig({})).not.toHaveProperty('secretKey');
    expect(readAdminConfig({ ADMIN_SECRET_KEY: 'retired-and-ignored' }).provider).toBe('builtin');
    expect(() => readAdminConfig({ ...baseEnv, ADMIN_AUTH_PROVIDER: 'ldap' })).toThrow(/ADMIN_AUTH_PROVIDER/);
    expect(() => readAdminConfig({ ...baseEnv, TIMEZONE: 'Mars/Base' })).toThrow(/TIMEZONE/);
    expect(readAdminConfig(baseEnv)).toMatchObject({ provider: 'builtin', timezone: 'America/Regina', secureCookies: false });
    expect(readAdminConfig({ ...baseEnv, SITE_URL: 'https://shop.example' }).secureCookies).toBe(true);
  });
});
