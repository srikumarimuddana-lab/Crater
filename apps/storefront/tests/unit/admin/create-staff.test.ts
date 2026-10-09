import { spawnSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { createStaff, parseStaffArgs } from '../../../db/admin-create-staff.mjs';
import { resetDatabase, TEST_DATABASE_URL } from '../helpers/repos';

const PW = 'long enough password';
const NO_DB = { connect: () => { throw new Error('must not connect'); } } as unknown as pg.Pool;
const SCRIPT = path.resolve(__dirname, '../../../db/admin-create-staff.mjs');

describe('admin:create-staff validation (no database needed)', () => {
  it('parses --role --email --name and rejects unknown options', () => {
    expect(parseStaffArgs(['--role', 'FULFILMENT', '--email', 'a@b.co', '--name', 'Pat'])).toEqual({ role: 'FULFILMENT', email: 'a@b.co', name: 'Pat' });
    expect(() => parseStaffArgs(['--password', 'x'])).toThrow(/Usage/);
    expect(() => parseStaffArgs(['positional'])).toThrow(/Usage/);
  });
  it('refuses OWNER, unknown roles, bad emails and weak passwords before touching the database', async () => {
    await expect(createStaff(NO_DB, { role: 'OWNER', email: 'o@example.test', password: PW })).rejects.toThrow(/admin:create-owner/);
    await expect(createStaff(NO_DB, { role: 'owner', email: 'o@example.test', password: PW })).rejects.toThrow(/admin:create-owner/);
    await expect(createStaff(NO_DB, { role: 'GOD', email: 'o@example.test', password: PW })).rejects.toThrow(/--role/);
    await expect(createStaff(NO_DB, { role: undefined, email: 'o@example.test', password: PW })).rejects.toThrow(/--role/);
    await expect(createStaff(NO_DB, { role: 'ADMIN', email: 'nope', password: PW })).rejects.toThrow(/valid email/);
    await expect(createStaff(NO_DB, { role: 'ADMIN', email: 'a@example.test', password: 'short' })).rejects.toThrow(/at least 12/);
  });
  it('the CLI reads the password from stdin, fails without echoing it, and never takes it as an argument', () => {
    const run = (args: string[], input: string) =>
      spawnSync(process.execPath, [SCRIPT, ...args], { input, encoding: 'utf8', env: { PATH: process.env.PATH, DATABASE_URL: 'postgresql://x@127.0.0.1:1/crater_test' } as unknown as NodeJS.ProcessEnv });
    const owner = run(['--role', 'OWNER', '--email', 'o@example.test'], `${PW}\n`);
    expect(owner.status).toBe(1);
    expect(owner.stderr).toContain('admin:create-owner');
    expect(owner.stderr + owner.stdout).not.toContain(PW);
    const flag = run(['--role', 'ADMIN', '--email', 'a@example.test', '--password', PW], '');
    expect(flag.status).toBe(1);
    expect(flag.stderr).toContain('Usage');
    expect(flag.stderr).not.toContain(PW);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('admin:create-staff on Postgres', () => {
  it('creates a hashed, audited staff user; refuses duplicates (case-insensitive) and OWNER', async () => {
    const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
    try {
      await resetDatabase(pool);
      const id = await createStaff(pool, { role: 'fulfilment', email: ' Packer@Example.test ', name: 'Pat Packer', password: PW });
      const row = (await pool.query('select * from admin.staff_users where id = $1', [id])).rows[0];
      expect(row).toMatchObject({ email: 'packer@example.test', name: 'Pat Packer', role: 'FULFILMENT', status: 'ACTIVE', mfa_enrolled_at: null, totp_secret_enc: null });
      expect(row.password_hash).toMatch(/^scrypt\$/);
      expect(row.password_hash).not.toContain(PW);
      const audit = (await pool.query("select action, target_id, changes::text as changes from admin.audit_log")).rows;
      expect(audit).toEqual([{ action: 'staff.created', target_id: `gid://crater/StaffUser/${id}`, changes: expect.stringContaining('FULFILMENT') }]);
      expect(audit[0].changes).not.toMatch(/packer|Pat/i);
      await expect(createStaff(pool, { role: 'ADMIN', email: 'PACKER@example.test', password: PW })).rejects.toThrow(/already exists/);
      await expect(createStaff(pool, { role: 'OWNER', email: 'x@example.test', password: PW })).rejects.toThrow(/create-owner/);
      expect((await pool.query('select count(*)::int as n from admin.staff_users')).rows[0].n).toBe(1);
      // Simultaneous runs for one address: exactly one wins.
      const results = await Promise.allSettled([
        createStaff(pool, { role: 'SUPPORT', email: 'race@example.test', password: PW }),
        createStaff(pool, { role: 'SUPPORT', email: 'race@example.test', password: PW }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      // The CLI end to end, password on stdin.
      const r = spawnSync(process.execPath, [SCRIPT, '--role', 'BOOKKEEPER', '--email', 'books@example.test'], {
        input: `${PW}\n`, encoding: 'utf8', env: { PATH: process.env.PATH, DATABASE_URL: TEST_DATABASE_URL } as unknown as NodeJS.ProcessEnv,
      });
      expect(r.status, r.stderr).toBe(0);
      expect((await pool.query("select role from admin.staff_users where email = 'books@example.test'")).rows).toEqual([{ role: 'BOOKKEEPER' }]);
    } finally {
      await pool.end();
    }
  });
});
