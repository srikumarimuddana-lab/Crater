import { createHash, randomBytes } from 'node:crypto';

/** 256 random bits, base64url (43 chars). This is the bearer value of a cookie; never log or store it. */
export const newToken = (): string => randomBytes(32).toString('base64url');

/** Only this SHA-256 hex digest is stored server-side. */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Domain-separated digest for rate-limit keys, so no raw email or IP address is stored. */
export const hashIdentifier = (kind: 'email' | 'ip', value: string): string =>
  createHash('sha256').update(`crater-admin-rl:${kind}:${value}`).digest('hex');
