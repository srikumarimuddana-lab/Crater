import { describe, expect, it } from 'vitest';
import { passwordPolicyProblem, hashPassword, verifyPassword, SCRYPT } from '@/lib/admin/auth/password';
import { decryptSecret, encryptSecret } from '@/lib/admin/auth/secret-box';
import { hashToken, newToken } from '@/lib/admin/auth/tokens';
import { base32Decode, base32Encode, hotp, otpauthUri, totpAt, verifyTotp } from '@/lib/admin/auth/totp';
import { backoffMs, lockedForMs, withFailure } from '@/lib/admin/auth/rate-limit';
import { parseSecretKey } from '@/lib/admin/config';
import { SECRET_KEY } from './helpers';

const ascii = (s: string) => Buffer.from(s, 'ascii');
const S1 = ascii('12345678901234567890');
const S256 = ascii('12345678901234567890123456789012');
const S512 = ascii('1234567890123456789012345678901234567890123456789012345678901234');

describe('TOTP (RFC 6238 appendix B vectors)', () => {
  const sha1: [number, string][] = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']];
  it.each(sha1)('SHA1 at t=%i -> %s', (t, code) => expect(totpAt(S1, t * 1000, { digits: 8 })).toBe(code));
  it('SHA256 and SHA512 vectors at t=59', () => {
    expect(totpAt(S256, 59_000, { digits: 8, algorithm: 'sha256' })).toBe('46119246');
    expect(totpAt(S512, 59_000, { digits: 8, algorithm: 'sha512' })).toBe('90693936');
  });
  it('RFC 4226 HOTP vector', () => expect([0, 1, 2].map((c) => hotp(S1, c))).toEqual(['755224', '287082', '359152']));
  it('accepts +/- 1 step and rejects 2 steps away', () => {
    const t = 1_700_000_000_000;
    const code = (offset: number) => totpAt(S1, t + offset * 30_000);
    const step = Math.floor(t / 30_000);
    expect(verifyTotp(S1, code(0), t)).toBe(step);
    expect(verifyTotp(S1, code(-1), t)).toBe(step - 1);
    expect(verifyTotp(S1, code(1), t)).toBe(step + 1);
    expect(verifyTotp(S1, code(2), t)).toBeNull();
    expect(verifyTotp(S1, code(-2), t)).toBeNull();
  });
  it('rejects malformed codes', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 345']) expect(verifyTotp(S1, bad, 59_000)).toBeNull();
  });
  it('base32 round-trips and builds an otpauth uri', () => {
    expect(base32Encode(S1)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('gezd gnbv-GY3TQOJQGEZDGNBVGY3TQOJQ')?.equals(S1)).toBe(true);
    expect(base32Decode('not base32!')).toBeNull();
    const uri = otpauthUri({ issuer: 'Crater Admin', account: 'a@b.test', secretBase32: 'ABC' });
    expect(uri).toMatch(/^otpauth:\/\/totp\/Crater%20Admin:a%40b\.test\?secret=ABC&issuer=Crater\+Admin&algorithm=SHA1&digits=6&period=30$/);
  });
});

describe('scrypt passwords', () => {
  it('hashes with N=2^15 r=8 p=1, a 16-byte salt, and verifies in constant-time form', async () => {
    const h = await hashPassword('a long enough password');
    const [alg, N, r, p, salt] = h.split('$');
    expect([alg, Number(N), Number(r), Number(p)]).toEqual(['scrypt', SCRYPT.N, 8, 1]);
    expect(Buffer.from(salt, 'base64url')).toHaveLength(16);
    expect(await verifyPassword('a long enough password', h)).toBe(true);
    expect(await verifyPassword('a long enough passwore', h)).toBe(false);
    expect(await hashPassword('a long enough password')).not.toBe(h); // fresh salt
  });
  it('treats malformed or out-of-bounds stored hashes as a failed verification', async () => {
    for (const bad of ['', 'plain', 'scrypt$1$8$1$AAAA$AAAA', 'scrypt$32768$8$1$AA$AA', `scrypt$${2 ** 30}$8$1$${'A'.repeat(22)}$${'A'.repeat(43)}`]) {
      expect(await verifyPassword('anything at all 123', bad)).toBe(false);
    }
  });
  it('enforces the policy: 12+ characters', () => {
    expect(passwordPolicyProblem('short')).toMatch(/at least 12/);
    expect(passwordPolicyProblem('aaaaaaaaaaaaaaaa')).toMatch(/repetitive/);
    expect(passwordPolicyProblem('a@b.test', 'a@b.test')).not.toBeNull();
    expect(passwordPolicyProblem('x'.repeat(201))).toMatch(/at most/);
    expect(passwordPolicyProblem('correct horse battery')).toBeNull();
  });
});

describe('secrets and tokens', () => {
  it('AES-256-GCM round trip is bound to the owner (aad) and detects tampering', () => {
    const env = encryptSecret('JBSWY3DPEHPK3PXP', SECRET_KEY, 'crater-admin-totp:1');
    expect(env).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(env).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(env, SECRET_KEY, 'crater-admin-totp:1')).toBe('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(env, SECRET_KEY, 'crater-admin-totp:2')).toBeNull();
    expect(decryptSecret(env.slice(0, -2) + 'AA', SECRET_KEY, 'crater-admin-totp:1')).toBeNull();
    expect(decryptSecret(env, Buffer.alloc(32, 7), 'crater-admin-totp:1')).toBeNull();
  });
  it('session tokens are 256 random bits and stored only as SHA-256', () => {
    const a = newToken();
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(newToken()).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(a)).not.toContain(a);
  });
  it('ADMIN_SECRET_KEY must be 32 random bytes', () => {
    expect(() => parseSecretKey(undefined)).toThrow(/required/);
    expect(() => parseSecretKey('')).toThrow(/required/);
    expect(() => parseSecretKey(Buffer.alloc(16, 1).toString('base64'))).toThrow(/32 bytes/);
    expect(() => parseSecretKey(Buffer.alloc(32, 9).toString('base64'))).toThrow(/weak/);
    expect(() => parseSecretKey('not base64 !!')).toThrow(/base64/);
    expect(parseSecretKey(SECRET_KEY.toString('base64'))).toHaveLength(32);
  });
});

describe('rate-limit policy', () => {
  it('backs off exponentially after the free attempts and is capped', () => {
    expect([5, 6, 7, 8, 9].map((f) => backoffMs(f, 5))).toEqual([0, 30_000, 60_000, 120_000, 240_000]);
    expect(backoffMs(40, 5)).toBe(15 * 60_000);
  });
  it('locks after the free failures, forgets after a quiet hour, and stays per key', () => {
    let now = new Date('2026-03-01T12:00:00Z');
    let rec = null as ReturnType<typeof withFailure> | null;
    for (let i = 0; i < 5; i++) rec = withFailure(rec, 'email', 'k', now);
    expect(lockedForMs(rec, now)).toBe(0);
    rec = withFailure(rec, 'email', 'k', now);
    expect(lockedForMs(rec, now)).toBe(30_000);
    now = new Date(now.getTime() + 31_000);
    expect(lockedForMs(rec, now)).toBe(0);
    rec = withFailure(rec, 'email', 'k', now);
    expect(lockedForMs(rec, now)).toBe(60_000);
    now = new Date(now.getTime() + 61 * 60_000);
    rec = withFailure(rec, 'email', 'k', now);
    expect(rec.failures).toBe(1);
    expect(lockedForMs(rec, now)).toBe(0);
  });
});
