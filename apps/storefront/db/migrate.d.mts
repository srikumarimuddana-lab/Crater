import type { Pool, PoolConfig } from 'pg';

export const MIGRATIONS_DIR: string;
export function poolConfig(env?: Record<string, string | undefined>, options?: { direct?: boolean }): PoolConfig;
export function migrate(pool: Pool, options?: { dir?: string; log?: (message: string) => void }): Promise<string[]>;
