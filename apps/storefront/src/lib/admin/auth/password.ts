// Password hashing with Node's built-in scrypt (no dependency). Self-contained on purpose: the
// `admin:create-owner` script loads this file directly through Node's type stripping, so it may import
// only node: modules and must use erasable TypeScript syntax only.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** scrypt cost parameters: N = 2^15, r = 8, p = 1, 16-byte salt, 32-byte key. */
export const SCRYPT = { N: 2 ** 15, r: 8, p: 1, saltBytes: 16, keyBytes: 32 };
export const MIN_PASSWORD_LENGTH = 12;
/** Upper bound so a huge "password" cannot be used to burn CPU/memory. */
export const MAX_PASSWORD_LENGTH = 200;
const MAXMEM = 128 * 1024 * 1024; // scrypt with N=2^15, r=8 needs ~32 MiB; Node's default cap is exactly 32 MiB

const derive = (password: string, salt: Buffer, N: number, r: number, p: number, keyBytes: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keyBytes, { N, r, p, maxmem: MAXMEM }, (error, key) => (error ? reject(error) : resolve(key)));
  });

/** Returns a human-readable problem, or null when the password is acceptable. Never echoes the password. */
export function passwordPolicyProblem(password: unknown, email?: string): string | null {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  if (new Set(password).size < 5) return 'Password is too repetitive.';
  if (email && password.toLowerCase() === email.toLowerCase()) return 'Password must not be the email address.';
  return null;
}

/** `scrypt$N$r$p$<salt b64url>$<hash b64url>`; parameters travel with the hash so they can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT.saltBytes);
  const key = await derive(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keyBytes);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

/** Constant-time check. Malformed or out-of-bounds stored hashes (tampered rows) verify as false. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH * 4) return false;
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || N < 2 ** 14 || N > 2 ** 20 || (N & (N - 1)) !== 0) return false;
  if (!Number.isInteger(r) || r < 1 || r > 16 || !Number.isInteger(p) || p < 1 || p > 4) return false;
  const salt = Buffer.from(parts[4], 'base64url');
  const expected = Buffer.from(parts[5], 'base64url');
  if (salt.length < 8 || expected.length < 16 || expected.length > 64) return false;
  try {
    const actual = await derive(password, salt, N, r, p, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;
/**
 * Spends the same time as a real verification when the account does not exist, so response timing does
 * not reveal which emails are staff.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummy ??= hashPassword(randomBytes(24).toString('base64url'));
  await verifyPassword(password, await dummy);
  return false;
}
