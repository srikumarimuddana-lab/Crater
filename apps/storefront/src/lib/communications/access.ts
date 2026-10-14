import 'server-only';
import { requireAdmin } from '@/lib/admin/session';
import { AdminAuthError } from '@/lib/admin/errors';
import type { StaffRole } from '@/lib/admin/types';
export type CommunicationsAccess='crm'|'manage'|'integrations';
export const COMMUNICATIONS_ROLES:Record<CommunicationsAccess,StaffRole[]>={crm:['OWNER','ADMIN','SUPPORT'],manage:['OWNER','ADMIN'],integrations:['OWNER']};
export async function requireCommunications(access:CommunicationsAccess='crm'){
  const session=await requireAdmin(access==='crm'?'customers:read':'communications:manage');if(!COMMUNICATIONS_ROLES[access].includes(session.staff.role))throw new AdminAuthError('FORBIDDEN');return session;
}
