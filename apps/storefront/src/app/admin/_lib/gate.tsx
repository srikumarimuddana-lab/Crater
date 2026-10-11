import 'server-only';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminAuthError, AdminConfigError, getAdminConfig, requireAdmin, type AdminSession, type Capability } from '@/lib/admin';
import { ConfigProblem, Forbidden } from '@/components/admin/ui';

export type Gate = { ok: true; session: AdminSession; can: (c: Capability) => boolean; tz: string } | { ok: false; view: ReactNode };

/**
 * Per-page authorisation (the layout check alone is never trusted). Signed out -> /admin/login;
 * missing capability -> an in-place 403 view; misconfiguration -> a clear page without secrets.
 */
export async function gate(capability: Capability): Promise<Gate> {
  try {
    const session = await requireAdmin(capability);
    return { ok: true, session, can: (c) => session.capabilities.includes(c), tz: getAdminConfig().timezone };
  } catch (e) {
    return { ok: false, view: authFailureView(e) };
  }
}

/** Maps backend errors to UI. Unknown errors are rethrown to the error boundary. */
export function authFailureView(e: unknown): ReactNode {
  if (e instanceof AdminAuthError) {
    if (e.code === 'UNAUTHENTICATED') redirect('/admin/login');
    return <Forbidden capability={e.capability} />;
  }
  if (e instanceof AdminConfigError) return <ConfigProblem message={e.message} />;
  throw e;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
