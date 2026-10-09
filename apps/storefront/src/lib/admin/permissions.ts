import type { Capability, StaffRole, StockAdjustmentReason } from './types';

/**
 * Role -> capability matrix (docs/admin/requirements.md section 1, narrowed to the Slice 1 capability list).
 * Deny by default: a role has a capability only if it is listed here; unknown roles and capabilities get nothing.
 *
 * Deliberate narrowings, because the shared contract (types.ts) cannot express a price-free product or a
 * money-free overview:
 *   - FULFILMENT has no `products:read` (AdminVariant.price is not nullable) and no `overview:read`
 *     (OverviewMetrics money is not nullable). They work from Orders and Inventory, which carry no prices.
 *   - Cost price is visible only to roles for which `fieldAccess(role).productCost` is true.
 */
export const ALL_CAPABILITIES: readonly Capability[] = [
  'overview:read', 'orders:read', 'orders:read_prices', 'orders:fulfil', 'orders:internal_notes',
  'products:read', 'products:write', 'products:publish', 'inventory:read', 'inventory:adjust',
  'events:read', 'audit:read', 'staff:read', 'staff:manage',
];

export const ROLE_CAPABILITIES: Readonly<Record<StaffRole, readonly Capability[]>> = {
  OWNER: ALL_CAPABILITIES,
  ADMIN: [
    'overview:read', 'orders:read', 'orders:read_prices', 'orders:fulfil', 'orders:internal_notes',
    'products:read', 'products:write', 'products:publish', 'inventory:read', 'inventory:adjust', 'events:read',
  ],
  FULFILMENT: ['orders:read', 'orders:fulfil', 'inventory:read', 'inventory:adjust'],
  BOOKKEEPER: ['overview:read', 'orders:read', 'orders:read_prices', 'products:read', 'inventory:read', 'audit:read'],
  SUPPORT: ['overview:read', 'orders:read', 'orders:read_prices', 'products:read', 'inventory:read'],
};

export function capabilitiesFor(role: string): Capability[] {
  return Object.hasOwn(ROLE_CAPABILITIES, role) ? [...ROLE_CAPABILITIES[role as StaffRole]] : [];
}

export function roleCan(role: string, capability: string): boolean {
  return Object.hasOwn(ROLE_CAPABILITIES, role) && (ROLE_CAPABILITIES[role as StaffRole] as readonly string[]).includes(capability);
}

/** Every stock-adjustment reason, in the order the UI lists them (docs/tax.md). */
export const ADJUST_REASONS: readonly StockAdjustmentReason[] = [
  'RECEIVED', 'COUNT_CORRECTION', 'DAMAGED', 'EXPIRED', 'RETURN_RESTOCK', 'SAMPLES_GIFTS', 'LOST_STOLEN', 'OTHER',
];

/** Direction each reason allows: '+' adds stock, '-' removes it, '±' either. */
export const REASON_SIGN: Readonly<Record<StockAdjustmentReason, '+' | '-' | '±'>> = {
  RECEIVED: '+', COUNT_CORRECTION: '±', DAMAGED: '-', EXPIRED: '-', RETURN_RESTOCK: '+', SAMPLES_GIFTS: '-', LOST_STOLEN: '-', OTHER: '±',
};

/** Stock reasons a role may use. Fulfilment: received, count correction, damaged, expired. Owner and Admin: all. */
export function allowedAdjustReasons(role: StaffRole): StockAdjustmentReason[] {
  if (!roleCan(role, 'inventory:adjust')) return [];
  return role === 'FULFILMENT' ? ['RECEIVED', 'COUNT_CORRECTION', 'DAMAGED', 'EXPIRED'] : [...ADJUST_REASONS];
}

/** Field-level redaction that the capability list cannot express. Applied by the services, never the UI. */
export function fieldAccess(role: StaffRole): { productCost: boolean; orderEmail: 'full' | 'masked' | 'none' } {
  switch (role) {
    case 'OWNER':
    case 'ADMIN':
      return { productCost: true, orderEmail: 'full' };
    case 'BOOKKEEPER':
      return { productCost: true, orderEmail: 'masked' };
    case 'SUPPORT':
      return { productCost: false, orderEmail: 'full' };
    default:
      return { productCost: false, orderEmail: 'none' };
  }
}

/** `jane.doe@example.com` -> `j***@example.com`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  return at < 1 ? '***' : `${email[0]}***${email.slice(at)}`;
}
