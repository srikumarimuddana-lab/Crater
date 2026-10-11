import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM envelope for secrets at rest (TOTP seeds): `v1.<iv>.<ciphertext>.<tag>`, all base64url.
 * `aad` binds a ciphertext to its owner (the staff id), so a value copied to another row fails to decrypt.
 */
export function encryptSecret(plaintext: string, key: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), ct.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

/** Null when the envelope is malformed, the key is wrong, or the data/aad was tampered with. */
export function decryptSecret(envelope: string, key: Buffer, aad: string): string | null {
  const parts = typeof envelope === 'string' ? envelope.split('.') : [];
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64url'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(parts[3], 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
