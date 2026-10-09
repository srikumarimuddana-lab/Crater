import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createBuiltinAuth as createAuth, toStaffUser } from '@/lib/admin/auth/builtin';
import type { CookieJar } from '@/lib/admin/auth/cookies';
import { hashPassword } from '@/lib/admin/auth/password';
import { encryptSecret } from '@/lib/admin/auth/secret-box';
import { totpAt, generateTotpSecret, base32Decode } from '@/lib/admin/auth/totp';
import { capabilitiesFor } from '@/lib/admin/permissions';
import { adminRepositoryFor } from '@/lib/admin/repository-factory';
import { createAdminServices } from '@/lib/admin/services';
import type { StaffRole } from '@/lib/admin/types';
import type { AdminSession } from '@/lib/admin/types';
import { memoryStateOf } from '@/lib/commerce/memory-repository';
import { cartWith, deliver, makeHarness, paidSession, sessionEvent, type Harness } from '../helpers/harness';
import { makeRepo, TEST_DATABASE_URL, type RepoKind } from '../helpers/repos';

export { REPO_KINDS, skipUnavailable, closePoolsAfterAll } from '../helpers/repos';
export { TEST_DATABASE_URL };

export const SECRET_KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 37 + 11) % 251));
export const PASSWORD = 'correct horse battery staple';

let cachedHash: Promise<string> | null = null;
export const passwordHash = () => (cachedHash ??= hashPassword(PASSWORD));

export type FakeJar = CookieJar & { values: Map<string, string> };
export function fakeJar(): FakeJar {
  const values = new Map<string, string>();
  return { values, get: (n) => values.get(n), set: (n, v) => void values.set(n, v), delete: (n) => void values.delete(n) };
}

export type Clock = { now: Date; advance(ms: number): void };
export const makeClock = (iso = '2026-03-01T12:00:00.000Z'): Clock => {
  const c = { now: new Date(iso), advance(ms: number) { c.now = new Date(c.now.getTime() + ms); } };
  return c;
};

export async function makeEnv(kind: RepoKind) {
  const h = await makeHarness({ repo: await makeRepo(kind) });
  const admin = adminRepositoryFor(h.repo);
  const jar = fakeJar();
  const auth = createAuth({ repo: admin, config: { secretKey: SECRET_KEY, secureCookies: false }, cookies: async () => jar, now: () => h.clock.now });
  return { h, admin, jar, auth, clock: h.clock, kind };
}
export type Env = Awaited<ReturnType<typeof makeEnv>>;

/** Creates a staff member (optionally with MFA enrolled) and returns the TOTP secret bytes. */
export async function addStaff(env: Env, role: StaffRole, email = `${role.toLowerCase()}@example.test`, enrolled = true) {
  const secret = generateTotpSecret();
  const created = await env.admin.createStaff({ email, name: `${role} Person`, role, passwordHash: await passwordHash(), createdAt: env.clock.now.toISOString() });
  if (created.kind !== 'created') throw new Error('staff exists');
  if (enrolled) await env.admin.setMfa(created.staff.id, encryptSecret(secret.base32, SECRET_KEY, `crater-admin-totp:${created.staff.id}`), env.clock.now.toISOString());
  return { staff: created.staff, secret };
}

export const codeFor = (env: Env, secretBase32: string, offsetSteps = 0) =>
  totpAt(base32Decode(secretBase32) as Buffer, env.clock.now.getTime() + offsetSteps * 30_000);

export async function signInFully(env: Env, email: string, secretBase32: string) {
  const a = await env.auth.signIn({ email, password: PASSWORD, ip: '203.0.113.5' });
  if (!a.ok) throw new Error(`sign-in failed: ${a.code}`);
  const b = await env.auth.verifySecondFactor({ code: codeFor(env, secretBase32), ip: '203.0.113.5' });
  if (!b.ok) throw new Error(`mfa failed: ${b.code}`);
}

export function sessionFor(staff: { id: number; email: string; role: StaffRole }, opts: { steppedUp?: boolean } = {}): AdminSession {
  return {
    staff: toStaffUser({
      ...staff, name: staff.role, status: 'ACTIVE', passwordHash: null, totpSecretEnc: null, mfaEnrolledAt: null,
      lastTotpStep: null, authSubject: null, createdAt: '2026-01-01T00:00:00.000Z', lastSignInAt: null,
    }),
    capabilities: capabilitiesFor(staff.role),
    steppedUp: opts.steppedUp ?? true,
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
}

/** Services whose "current session" can be switched between roles inside a test. */
export async function makeServices(env: Env) {
  const staff = new Map<StaffRole, { id: number; email: string; role: StaffRole }>();
  for (const role of ['OWNER', 'ADMIN', 'FULFILMENT', 'BOOKKEEPER', 'SUPPORT'] as StaffRole[]) {
    const { staff: s } = await addStaff(env, role, `${role.toLowerCase()}@example.test`, false);
    staff.set(role, { id: s.id, email: s.email, role });
  }
  let current: AdminSession | null = null;
  const services = createAdminServices({
    admin: env.admin,
    commerce: env.h.repo,
    config: { timezone: 'America/Toronto' },
    getSession: async () => current,
    now: () => env.clock.now,
  });
  return {
    ...services,
    as(role: StaffRole | null) {
      current = role ? sessionFor(staff.get(role) as { id: number; email: string; role: StaffRole }) : null;
    },
    staff,
  };
}

let sessionSeq = 0;
/** Pays a real checkout through the webhook. Returns the order record. */
export async function placePaidOrder(
  h: Harness,
  lines: { merchandiseId: string; quantity?: number }[],
  extra: Record<string, unknown> = {},
) {
  const id = `cs_test_admin${String(++sessionSeq).padStart(8, '0')}x`;
  h.stripe.create.mockResolvedValueOnce({ id, url: `https://checkout.stripe.com/c/pay/${id}` } as never);
  const cart = await cartWith(h, lines);
  const created = await h.checkout.createCheckoutSession(cart.id);
  if (!created.ok) throw new Error(`checkout failed: ${created.code}`);
  const session = paidSession(h, {
    id,
    collected_information: {
      shipping_details: { name: 'Sam Buyer', address: { line1: '100 Sample Street', line2: 'Unit 4', city: 'Toronto', state: 'ON', postal_code: 'M5V 2T6', country: 'CA' } },
    },
    ...extra,
  });
  const res = await deliver(h, sessionEvent('checkout.session.completed', session, `evt_admin_${sessionSeq}`));
  if (res.status !== 200) throw new Error(`webhook ${res.status}`);
  const order = await h.repo.getOrderBySessionId(id);
  if (!order) throw new Error('order missing');
  return order;
}

/** Turns a sample product into a complete, non-sample draft (what an owner would do through content work). */
export async function makeProductPublishable(env: Env, handle: string) {
  const content = {
    benefits: ['A real description.'], ingredients: ['Melissa officinalis leaf'], howToUse: 'Take 1 mL twice daily.', precautions: 'Not for use in pregnancy. Ask a pharmacist.',
  };
  if (env.kind === 'memory') {
    const p = memoryStateOf(env.h.repo).products.find((x) => x.handle === handle)!;
    Object.assign(p, { sample: false, status: 'DRAFT', details: content });
    return p.id;
  }
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  try {
    const r = await pool.query(
      "update commerce.products set sample = false, status = 'DRAFT', details = $2::jsonb where handle = $1 returning id",
      [handle, JSON.stringify(content)],
    );
    return `gid://crater/Product/${r.rows[0].id}`;
  } finally {
    await pool.end();
  }
}

export const randomEmail = () => `${randomBytes(4).toString('hex')}@example.test`;
