import type { ID } from '@/lib/commerce/types';

export type AdminGidType = 'StaffUser' | 'AuditEntry' | 'InventoryMovement';

export const adminGid = (type: AdminGidType, n: number | string): ID => `gid://crater/${type}/${n}`;

/** Positive integer tail of `gid://crater/<type>/<n>`, else null (also for Order, Product, ProductVariant). */
export function gidTail(id: unknown, type: AdminGidType | 'Order' | 'Product' | 'ProductVariant'): number | null {
  if (typeof id !== 'string') return null;
  const prefix = `gid://crater/${type}/`;
  if (!id.startsWith(prefix)) return null;
  const tail = id.slice(prefix.length);
  return /^[1-9]\d{0,9}$/.test(tail) && Number(tail) <= 2_147_483_647 ? Number(tail) : null;
}
