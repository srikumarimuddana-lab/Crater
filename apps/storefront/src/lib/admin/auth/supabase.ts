import { AdminConfigError } from '../errors';
import type { AdminAuthProvider } from '../types';

/**
 * FUTURE: Supabase Auth implementation of `AdminAuthProvider` (ADMIN_AUTH_PROVIDER=supabase). Not built.
 *
 * Migration notes, so the swap does not touch roles, audit or screens:
 *  - staff_users.id stays the stable identity; map `auth.users.id` into staff_users.auth_subject on first sign-in.
 *  - signIn / verifySecondFactor / beginMfaEnrolment / confirmMfaEnrolment map to Supabase email+password and its
 *    TOTP MFA factors; getSession must still return an `AdminSession` built from the staff_users row (role comes
 *    from our table, never from the token), and must keep the idle/absolute limits and step-up window.
 *  - password_hash / totp_secret_enc become unused (leave them null); audit rows are unaffected.
 *  - Keep `requireAdmin` and the services untouched: they only see `AdminAuthProvider`.
 */
export type SupabaseAdminAuthOptions = { url: string; anonKey: string };

export function createSupabaseAuth(_options: SupabaseAdminAuthOptions): AdminAuthProvider {
  throw new AdminConfigError('ADMIN_AUTH_PROVIDER=supabase is not implemented yet. Use "builtin".');
}
