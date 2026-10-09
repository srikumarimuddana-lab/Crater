import type { Pool } from 'pg';
export function readPassword(stdin?: NodeJS.ReadStream, stderr?: NodeJS.WriteStream, label?: string): Promise<string>;
export function createOwner(pool: Pool, input: { email: string | undefined; name?: string; password: string }): Promise<number>;
