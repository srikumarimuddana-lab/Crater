import { AdminConfigError } from '../errors';
import type { AdminAuthProvider } from '../types';

/**
 * FUTURE: Supabase Auth implementation of `AdminAuthProvider` (ADMIN_AUTH_PROVIDER=supabase). Not built.
 *
 * Migration notes, so the swap does not touch roles, audit or screens:
 *  - staff_users.id stays the stable identity; map `auth.users.id` into staff_users.auth_subject on first sign-in.
 *  - signIn maps to email+password; getSession returns the staff role from our table,
 *    never from a client token, and preserves idle/absolute session expiry.
 *  - password_hash becomes unused; audit rows are unaffected.
 *  - Keep `requireAdmin` and the services untouched: they only see `AdminAuthProvider`.
 */
export type SupabaseAdminAuthOptions = { url: string; anonKey: string };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createSupabaseAuth(_options: SupabaseAdminAuthOptions): AdminAuthProvider {
  throw new AdminConfigError('ADMIN_AUTH_PROVIDER=supabase is not implemented yet. Use "builtin".');
}
