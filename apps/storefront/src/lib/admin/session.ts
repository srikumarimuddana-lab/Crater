import 'server-only';
import { getAdminAuth } from './auth';
import { AdminAuthError } from './errors';
import { roleCan } from './permissions';
import type { AdminSession, Capability } from './types';

export async function getAdminSession(): Promise<AdminSession | null> {
  return (await getAdminAuth()).getSession();
}

/**
 * Gate for Server Components, Server Actions and route handlers. Returns the session or throws AdminAuthError:
 * UNAUTHENTICATED (redirect to /admin/login), FORBIDDEN (403 page), STEP_UP_REQUIRED (ask for a code).
 * The layout check alone is never trusted: call this in every action.
 */
export async function requireAdmin(capability?: Capability, options: { stepUp?: boolean } = {}): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new AdminAuthError('UNAUTHENTICATED');
  if (capability && !(session.capabilities.includes(capability) && roleCan(session.staff.role, capability))) {
    throw new AdminAuthError('FORBIDDEN', capability);
  }
  if (options.stepUp && !session.steppedUp) throw new AdminAuthError('STEP_UP_REQUIRED', capability ?? null);
  return session;
}

/** Best-effort client address for rate limiting and audit: first x-forwarded-for hop, else x-real-ip. */
export function clientIpFrom(headers: { get(name: string): string | null }): string {
  const raw = headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip')?.trim() || '';
  return /^[0-9a-fA-F:.]{3,45}$/.test(raw) ? raw : 'unknown';
}
