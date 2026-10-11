import { readAdminConfig, type AdminConfig } from '../config';
import { getAdminRepository } from '../repository-factory';
import type { AdminAuthProvider } from '../types';
import { seedDevStaff } from './bootstrap';
import { createBuiltinAuth } from './builtin';
import { nextCookieJar } from './cookies';
import { createSupabaseAuth } from './supabase';

export { createBuiltinAuth, SESSION_IDLE_MS, SESSION_ABSOLUTE_MS, STEP_UP_WINDOW_MS } from './builtin';

const KEY = Symbol.for('crater.admin.auth');
type Holder = { auth?: AdminAuthProvider; config?: AdminConfig };
const holder = (): Holder => {
  const g = globalThis as unknown as Record<symbol, Holder | undefined>;
  return (g[KEY] ??= {});
};

/** Validated admin configuration. Throws AdminConfigError (admin refuses to start) on a missing or weak ADMIN_SECRET_KEY. */
export function getAdminConfig(): AdminConfig {
  const h = holder();
  return (h.config ??= readAdminConfig(process.env));
}

/** The configured sign-in provider (ADMIN_AUTH_PROVIDER, default builtin). */
export async function getAdminAuth(): Promise<AdminAuthProvider> {
  const h = holder();
  if (h.auth) return h.auth;
  const config = getAdminConfig();
  if (config.provider === 'supabase') {
    h.auth = createSupabaseAuth({ url: process.env.SUPABASE_URL ?? '', anonKey: process.env.SUPABASE_ANON_KEY ?? '' });
    return h.auth;
  }
  const { admin } = await getAdminRepository();
  await seedDevStaff(admin, config);
  h.auth = createBuiltinAuth({ repo: admin, config, cookies: () => nextCookieJar(config.secureCookies) });
  return h.auth;
}

export function resetAdminAuthForTests(): void {
  delete holder().auth;
  delete holder().config;
}
