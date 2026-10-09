import 'server-only';
import { getAdminRepository } from './repository-factory';
import { getAdminAuth, getAdminConfig } from './auth';
import { getAdminSession } from './session';
import { createAdminServices, type AdminServices } from './services';

/**
 * Public entry point of the admin backend for the UI (server-only).
 *
 *   const session = await requireAdmin('orders:read');       // gate every page and action
 *   const { orders } = await getAdmin();                       // services enforce capabilities again
 */

const KEY = Symbol.for('crater.admin.services');
type Holder = { services?: AdminServices; for?: unknown };

export async function getAdmin(): Promise<AdminServices> {
  const g = globalThis as unknown as Record<symbol, Holder | undefined>;
  const h = (g[KEY] ??= {});
  const { admin, commerce } = await getAdminRepository();
  if (!h.services || h.for !== admin) {
    h.services = createAdminServices({ admin, commerce, config: { timezone: getAdminConfig().timezone }, getSession: getAdminSession });
    h.for = admin;
  }
  return h.services;
}

export { getAdminAuth, getAdminConfig } from './auth';
export { requireAdmin, getAdminSession, clientIpFrom } from './session';
export { AdminAuthError, AdminConfigError } from './errors';
export { ALL_CAPABILITIES, ROLE_CAPABILITIES, capabilitiesFor, roleCan, allowedAdjustReasons, fieldAccess } from './permissions';
export { audit } from './audit';
export type { AdminServices } from './services';
export type * from './service-types';
export type * from './types';
