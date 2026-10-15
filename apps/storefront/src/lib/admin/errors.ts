import type { Capability } from './types';

/**
 * Thrown by `requireAdmin` and by service reads. The UI maps it:
 *   UNAUTHENTICATED   -> redirect to /admin/login
 *   FORBIDDEN         -> 403 page (name the capability, not the role)
 */
export class AdminAuthError extends Error {
  readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN';
  readonly capability: Capability | null;
  constructor(code: AdminAuthError['code'], capability: Capability | null = null) {
    super(code === 'UNAUTHENTICATED' ? 'Sign in required' : 'Not allowed');
    this.name = 'AdminAuthError';
    this.code = code;
    this.capability = capability;
  }
}

/** Misconfiguration (invalid provider, bad ADMIN_DEV_STAFF, ...). Admin refuses to start. */
export class AdminConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminConfigError';
  }
}
