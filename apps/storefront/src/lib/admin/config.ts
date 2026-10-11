import { AdminConfigError } from './errors';
import { base32Decode } from './auth/totp';
import { passwordPolicyProblem } from './auth/password';
import type { StaffRole } from './types';

export type DevStaff = { email: string; name: string; password: string; role: StaffRole; totpSecret: string };

export type AdminConfig = {
  provider: 'builtin' | 'supabase';
  /** 32-byte AES-256-GCM key for TOTP secrets at rest. */
  secretKey: Buffer;
  /** IANA timezone for "today" and sales by day. */
  timezone: string;
  ownerEmail: string | null;
  devStaff: DevStaff[];
  /** Secure cookies use the `__Host-` prefix. */
  secureCookies: boolean;
  database: 'memory' | 'postgres';
};

type Env = Record<string, string | undefined>;

/** Owner decision (docs/tax.md): Saskatchewan, no daylight saving. */
export const DEFAULT_TIMEZONE = 'America/Regina';
const ROLES: readonly StaffRole[] = ['OWNER', 'ADMIN', 'FULFILMENT', 'BOOKKEEPER', 'SUPPORT'];
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export const normaliseEmail = (email: unknown): string | null => {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  return e.length <= 254 && EMAIL.test(e) ? e : null;
};

/**
 * ADMIN_SECRET_KEY must be 32 random bytes, base64 (`openssl rand -base64 32`). Missing, wrong-length or
 * visibly low-entropy keys are refused. Messages never echo the value.
 */
export function parseSecretKey(raw: string | undefined): Buffer {
  if (!raw) throw new AdminConfigError('ADMIN_SECRET_KEY is required (32 random bytes, base64). Generate one with: openssl rand -base64 32');
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw.trim())) throw new AdminConfigError('ADMIN_SECRET_KEY must be base64.');
  const key = Buffer.from(raw.trim(), 'base64');
  if (key.length !== 32) throw new AdminConfigError('ADMIN_SECRET_KEY must decode to exactly 32 bytes.');
  if (new Set(key).size < 12) throw new AdminConfigError('ADMIN_SECRET_KEY is too weak; use 32 random bytes.');
  return key;
}

export function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function parseDevStaff(raw: string | undefined, database: 'memory' | 'postgres'): DevStaff[] {
  if (raw === undefined || raw.trim() === '') return [];
  // Impossible in Postgres mode: fixed credentials must never reach a real database.
  if (database !== 'memory') throw new AdminConfigError('ADMIN_DEV_STAFF is only allowed with COMMERCE_DB=memory.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AdminConfigError('ADMIN_DEV_STAFF must be valid JSON.');
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.map((item, i): DevStaff => {
    const o = (item ?? {}) as Record<string, unknown>;
    const email = normaliseEmail(o.email);
    if (!email) throw new AdminConfigError(`ADMIN_DEV_STAFF[${i}]: invalid email.`);
    if (!ROLES.includes(o.role as StaffRole)) throw new AdminConfigError(`ADMIN_DEV_STAFF[${i}]: invalid role.`);
    const problem = passwordPolicyProblem(o.password, email);
    if (problem) throw new AdminConfigError(`ADMIN_DEV_STAFF[${i}]: ${problem}`);
    const secret = typeof o.totpSecret === 'string' ? base32Decode(o.totpSecret) : null;
    if (!secret || secret.length < 10) throw new AdminConfigError(`ADMIN_DEV_STAFF[${i}]: totpSecret must be base32 (at least 80 bits).`);
    const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 120) : email.split('@')[0];
    return { email, name, password: o.password as string, role: o.role as StaffRole, totpSecret: (o.totpSecret as string).replace(/[\s-]/g, '').toUpperCase() };
  });
}

function wantsSecureCookies(env: Env): boolean {
  if (env.ADMIN_COOKIE_SECURE === 'true') return true;
  if (env.ADMIN_COOKIE_SECURE === 'false') return false;
  const site = env.SITE_URL || env.NEXT_PUBLIC_SITE_URL;
  if (site) {
    try {
      return new URL(site).protocol === 'https:';
    } catch {
      return true;
    }
  }
  return env.NODE_ENV === 'production';
}

export function readAdminConfig(env: Env = process.env): AdminConfig {
  const provider = (env.ADMIN_AUTH_PROVIDER ?? 'builtin').trim();
  if (provider !== 'builtin' && provider !== 'supabase') throw new AdminConfigError('ADMIN_AUTH_PROVIDER must be "builtin" or "supabase".');
  const dbName = env.COMMERCE_DB ?? 'memory';
  if (dbName !== 'memory' && dbName !== 'postgres') throw new AdminConfigError('COMMERCE_DB must be "memory" or "postgres".');
  const timezone = (env.TIMEZONE ?? '').trim() || DEFAULT_TIMEZONE;
  if (!validTimezone(timezone)) throw new AdminConfigError(`TIMEZONE "${timezone.slice(0, 60)}" is not a valid IANA timezone.`);
  return {
    provider,
    secretKey: parseSecretKey(env.ADMIN_SECRET_KEY),
    timezone,
    ownerEmail: normaliseEmail(env.ADMIN_OWNER_EMAIL),
    devStaff: parseDevStaff(env.ADMIN_DEV_STAFF, dbName),
    secureCookies: wantsSecureCookies(env),
    database: dbName,
  };
}
