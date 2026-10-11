import type { Capability } from './types';

/**
 * Thrown by `requireAdmin` and by service reads. The UI maps it:
 *   UNAUTHENTICATED   -> redirect to /admin/login
 *   FORBIDDEN         -> 403 page (name the capability, not the role)
 *   STEP_UP_REQUIRED  -> ask for an authenticator code, then retry
 */
export class AdminAuthError extends Error {
  readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'STEP_UP_REQUIRED';
  readonly capability: Capability | null;
  constructor(code: AdminAuthError['code'], capability: Capability | null = null) {
    super(code === 'UNAUTHENTICATED' ? 'Sign in required' : code === 'FORBIDDEN' ? 'Not allowed' : 'Recent authenticator code required');
    this.name = 'AdminAuthError';
    this.code = code;
    this.capability = capability;
  }
}

/** Misconfiguration (missing or weak ADMIN_SECRET_KEY, bad ADMIN_DEV_STAFF, ...). Admin refuses to start. */
export class AdminConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminConfigError';
  }
}
