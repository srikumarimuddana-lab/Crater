import { it, expect } from 'vitest';
import { roleCan } from '@/lib/admin/permissions';
it('limits module configuration while permitting support scheduling', () => {
  expect(roleCan('OWNER', 'chat:manage')).toBe(true);
  expect(roleCan('ADMIN', 'appointments:configure')).toBe(true);
  expect(roleCan('SUPPORT', 'appointments:manage')).toBe(true);
  expect(roleCan('SUPPORT', 'chat:manage')).toBe(false);
  expect(roleCan('BOOKKEEPER', 'appointments:read')).toBe(false);
});
