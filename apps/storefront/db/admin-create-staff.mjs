#!/usr/bin/env node
// `npm run admin:create-staff -- --role <ROLE> --email <email> [--name <name>]`: creates a non-Owner staff user.
//
//   npm run admin:create-staff -- --role FULFILMENT --email packer@example.com --name "Pat"   (type the password; hidden)
//   printf '%s' "$PASSWORD" | npm run admin:create-staff -- --role ADMIN --email a@example.com  (non-interactive)
//
// Roles: ADMIN, FULFILMENT, BOOKKEEPER, SUPPORT. The Owner is created with `npm run admin:create-owner`; this script
// refuses OWNER. The password is read from stdin only (never an argument or env var, so it stays out of shell history
// and process listings), 12+ characters. It refuses an email that already exists, writes an audit row, and enrols MFA at
// the first sign-in, exactly like the Owner. Connection: DIRECT_DATABASE_URL if set, else DATABASE_URL.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { hashPassword, passwordPolicyProblem } from '../src/lib/admin/auth/password.ts';
import { readPassword } from './admin-create-owner.mjs';
import { poolConfig } from './migrate.mjs';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export const STAFF_ROLES = ['ADMIN', 'FULFILMENT', 'BOOKKEEPER', 'SUPPORT'];

/** @param {string[]} argv arguments after the script name */
export function parseStaffArgs(argv) {
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: { role: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' } }, strict: true }));
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : 'bad arguments'}. Usage: npm run admin:create-staff -- --role <${STAFF_ROLES.join('|')}> --email <email> [--name <name>]`);
  }
  return { role: values.role, email: values.email, name: values.name };
}

/** @param {import('pg').Pool} pool */
export async function createStaff(pool, { role, email, name, password }) {
  const wanted = String(role ?? '').trim().toUpperCase();
  if (wanted === 'OWNER') throw new Error('Refusing to create an Owner here. Use `npm run admin:create-owner` (there is exactly one Owner).');
  if (!STAFF_ROLES.includes(wanted)) throw new Error(`--role must be one of ${STAFF_ROLES.join(', ')}.`);
  const address = String(email ?? '').trim().toLowerCase();
  if (!EMAIL.test(address) || address.length > 254) throw new Error('--email is missing or not a valid email address.');
  const problem = passwordPolicyProblem(password, address);
  if (problem) throw new Error(problem);
  const display = String(name ?? '').trim().slice(0, 120) || address.split('@')[0].slice(0, 120);
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Serialises concurrent runs for the same address; the unique index on email is the final guard.
    await client.query("select pg_advisory_xact_lock(hashtext('crater.admin.create_staff'))");
    const dup = await client.query('select 1 from admin.staff_users where email = $1', [address]);
    if (dup.rowCount > 0) throw new Error('A staff user with this email already exists. Refusing to create a duplicate.');
    const row = await client.query(
      `insert into admin.staff_users (email, name, role, password_hash) values ($1,$2,$3,$4) returning id`,
      [address, display, wanted, passwordHash],
    );
    const id = `gid://crater/StaffUser/${row.rows[0].id}`;
    // No email or name in the log: only what changed and how.
    await client.query(
      `insert into admin.audit_log (action, target_type, target_id, changes) values ('staff.created', 'staff', $1, $2::jsonb)`,
      [id, JSON.stringify({ role: { from: null, to: wanted }, via: { from: null, to: 'cli' } })],
    );
    await client.query('commit');
    return row.rows[0].id;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let pool;
  try {
    const args = parseStaffArgs(process.argv.slice(2));
    pool = new pg.Pool(poolConfig(process.env, { direct: true }));
    const password = await readPassword(process.stdin, process.stderr, 'Staff password');
    await createStaff(pool, { ...args, password });
    console.log('[admin:create-staff] Staff user created. They sign in at /admin/login and enrol an authenticator app at first sign-in.');
  } catch (error) {
    console.error('[admin:create-staff] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
