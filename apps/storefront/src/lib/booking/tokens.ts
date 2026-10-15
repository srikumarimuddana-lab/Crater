import 'server-only';
import {
  createCipheriv,
  createHmac,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { hash, InteractionError } from '@/lib/public-interactions/validation';
function key() {
  const k = process.env.BOOKING_TOKEN_ENCRYPTION_KEY ?? '';
  if (!/^[a-fA-F0-9]{64}$/.test(k))
    throw new InteractionError(
      'Set BOOKING_TOKEN_ENCRYPTION_KEY to 32 random bytes encoded as 64 hex characters before enabling appointments.',
      503,
    );
  return Buffer.from(k, 'hex');
}
export function checkBookingKey() {
  key();
}
export function encryptToken(token: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}
export function decryptToken(value: string) {
  const b = Buffer.from(value, 'base64url'),
    cipher = createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
  cipher.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([
    cipher.update(b.subarray(28)),
    cipher.final(),
  ]).toString('utf8');
}
export function tokenMatches(token: string, expected: string) {
  return (
    /^[a-f0-9]{64}$/.test(expected) &&
    timingSafeEqual(
      Buffer.from(hash(token), 'hex'),
      Buffer.from(expected, 'hex'),
    )
  );
}

export function issueBookingVisitor() {
  const id = randomBytes(32).toString('base64url');
  return `${id}.${createHmac('sha256', key()).update(`booking-visitor:${id}`).digest('base64url')}`;
}
export function validBookingVisitor(value: string) {
  const [id, signature] = value.split('.');
  if (
    !id ||
    !signature ||
    value.split('.').length !== 2 ||
    !/^[A-Za-z0-9_-]{43}$/.test(id) ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  )
    return false;
  const expected = createHmac('sha256', key())
    .update(`booking-visitor:${id}`)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'base64url'));
}
