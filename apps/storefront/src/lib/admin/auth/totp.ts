// RFC 6238 TOTP (RFC 4226 HOTP underneath). Defaults: HMAC-SHA1, 6 digits, 30 s steps, +/- 1 step.
// Self-contained (node:crypto only) so scripts and unit tests can load it directly.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type TotpOptions = { digits?: number; stepSeconds?: number; algorithm?: 'sha1' | 'sha256' | 'sha512' };
const DEFAULTS = { digits: 6, stepSeconds: 30, algorithm: 'sha1' as const };
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Decodes RFC 4648 base32 (case-insensitive; spaces, hyphens and padding ignored). Null when invalid. */
export function base32Decode(text: string): Buffer | null {
  const clean = text.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit random secret, the size RFC 4226 recommends. */
export function generateTotpSecret(): { bytes: Buffer; base32: string } {
  const bytes = randomBytes(20);
  return { bytes, base32: base32Encode(bytes) };
}

export function hotp(secret: Uint8Array, counter: number, { digits = 6, algorithm = 'sha1' }: TotpOptions = {}): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm, secret).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export const stepAt = (timeMs: number, stepSeconds = DEFAULTS.stepSeconds): number => Math.floor(timeMs / 1000 / stepSeconds);

export function totpAt(secret: Uint8Array, timeMs: number, options: TotpOptions = {}): string {
  return hotp(secret, stepAt(timeMs, options.stepSeconds), options);
}

/**
 * Checks `code` against the steps within `window` of `timeMs`. Returns the matching time-step (so the caller
 * can reject replays of an already-used step), or null. Every candidate is compared in constant time.
 */
export function verifyTotp(secret: Uint8Array, code: string, timeMs: number, options: TotpOptions & { window?: number } = {}): number | null {
  const digits = options.digits ?? DEFAULTS.digits;
  if (typeof code !== 'string' || !new RegExp(`^\\d{${digits}}$`).test(code)) return null;
  const window = options.window ?? 1;
  const current = stepAt(timeMs, options.stepSeconds);
  let matched: number | null = null;
  const given = Buffer.from(code);
  for (let step = current - window; step <= current + window; step++) {
    if (step < 0) continue;
    const expected = Buffer.from(hotp(secret, step, options));
    if (timingSafeEqual(given, expected) && matched === null) matched = step;
  }
  return matched;
}

export function otpauthUri(args: { issuer: string; account: string; secretBase32: string }): string {
  const label = `${encodeURIComponent(args.issuer)}:${encodeURIComponent(args.account)}`;
  const q = new URLSearchParams({ secret: args.secretBase32, issuer: args.issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${q.toString()}`;
}
