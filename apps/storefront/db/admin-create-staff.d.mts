import type { Pool } from 'pg';
export const STAFF_ROLES: string[];
export function parseStaffArgs(argv: string[]): { role: string | undefined; email: string | undefined; name: string | undefined };
export function createStaff(pool: Pool, input: { role: string | undefined; email: string | undefined; name?: string; password: string }): Promise<number>;
