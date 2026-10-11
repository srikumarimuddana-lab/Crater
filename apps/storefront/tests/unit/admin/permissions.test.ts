import { describe, expect, it } from 'vitest';
import { AdminAuthError } from '@/lib/admin/errors';
import { ALL_CAPABILITIES, allowedAdjustReasons, capabilitiesFor, fieldAccess, maskEmail, roleCan } from '@/lib/admin/permissions';
import type { Capability, StaffRole } from '@/lib/admin/types';

const ROLES: StaffRole[] = ['OWNER', 'ADMIN', 'FULFILMENT', 'BOOKKEEPER', 'SUPPORT'];

// The expected matrix, written out independently of permissions.ts. A cell not listed here must be denied.
const GRANTS: Record<StaffRole, Capability[]> = {
  OWNER: [...ALL_CAPABILITIES],
  ADMIN: ['overview:read', 'orders:read', 'orders:read_prices', 'orders:fulfil', 'orders:internal_notes', 'products:read', 'products:write', 'products:publish', 'inventory:read', 'inventory:adjust', 'events:read'],
  FULFILMENT: ['orders:read', 'orders:fulfil', 'inventory:read', 'inventory:adjust'],
  BOOKKEEPER: ['overview:read', 'orders:read', 'orders:read_prices', 'products:read', 'inventory:read', 'audit:read'],
  SUPPORT: ['overview:read', 'orders:read', 'orders:read_prices', 'products:read', 'inventory:read'],
};
const CASES = ROLES.flatMap((role) => ALL_CAPABILITIES.map((cap) => [role, cap, GRANTS[role].includes(cap)] as const));

describe('permissions matrix (deny by default)', () => {
  it.each(CASES)('%s / %s -> %s', (role, cap, allowed) => {
    expect(roleCan(role, cap)).toBe(allowed);
    expect(capabilitiesFor(role).includes(cap)).toBe(allowed);
  });
  it('lists 14 capabilities and every grant names a real one', () => {
    expect(ALL_CAPABILITIES).toHaveLength(14);
    for (const role of ROLES) for (const c of GRANTS[role]) expect(ALL_CAPABILITIES).toContain(c);
  });
  it('unknown roles, unknown capabilities and prototype keys get nothing', () => {
    for (const role of ['', 'ROOT', 'owner', '__proto__', 'constructor', 'toString']) {
      expect(capabilitiesFor(role)).toEqual([]);
      expect(roleCan(role, 'orders:read')).toBe(false);
    }
    expect(roleCan('OWNER', 'orders:delete')).toBe(false);
    expect(roleCan('OWNER', '')).toBe(false);
  });
  it('the sensitive rules from the brief hold', () => {
    expect(roleCan('FULFILMENT', 'orders:read_prices')).toBe(false);
    expect(roleCan('FULFILMENT', 'orders:internal_notes')).toBe(false);
    expect(roleCan('FULFILMENT', 'products:write')).toBe(false);
    expect(roleCan('FULFILMENT', 'products:read')).toBe(false); // would expose prices (types.ts has no price-free variant)
    for (const cap of ALL_CAPABILITIES.filter((c) => c.endsWith(':write') || c.endsWith(':publish') || c.endsWith(':adjust') || c.endsWith(':fulfil') || c.endsWith(':manage') || c.endsWith('internal_notes'))) {
      expect(roleCan('BOOKKEEPER', cap)).toBe(false);
      expect(roleCan('SUPPORT', cap)).toBe(false);
    }
    expect(ROLES.filter((r) => roleCan(r, 'staff:manage'))).toEqual(['OWNER']);
    expect(ROLES.filter((r) => roleCan(r, 'audit:read'))).toEqual(['OWNER', 'BOOKKEEPER']);
  });
  it('field access and stock reasons are role-limited', () => {
    expect(fieldAccess('FULFILMENT')).toEqual({ productCost: false, orderEmail: 'none' });
    expect(fieldAccess('SUPPORT').productCost).toBe(false);
    expect(fieldAccess('BOOKKEEPER')).toEqual({ productCost: true, orderEmail: 'masked' });
    expect(allowedAdjustReasons('FULFILMENT')).toEqual(['RECEIVED', 'COUNT_CORRECTION', 'DAMAGED', 'EXPIRED']);
    for (const role of ['OWNER', 'ADMIN'] as const) {
      expect(allowedAdjustReasons(role)).toEqual(['RECEIVED', 'COUNT_CORRECTION', 'DAMAGED', 'EXPIRED', 'RETURN_RESTOCK', 'SAMPLES_GIFTS', 'LOST_STOLEN', 'OTHER']);
    }
    for (const role of ['BOOKKEEPER', 'SUPPORT'] as const) expect(allowedAdjustReasons(role)).toEqual([]);
    expect(allowedAdjustReasons('SUPPORT')).toEqual([]);
    expect(maskEmail('jane.doe@example.com')).toBe('j***@example.com');
  });
  it('AdminAuthError carries the code the UI maps', () => {
    const e = new AdminAuthError('FORBIDDEN', 'orders:read');
    expect([e.code, e.capability, e.name]).toEqual(['FORBIDDEN', 'orders:read', 'AdminAuthError']);
  });
});
