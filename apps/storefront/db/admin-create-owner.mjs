#!/usr/bin/env node
// `npm run admin:create-owner`: creates the FIRST Owner. There is no public sign-up.
//
//   ADMIN_OWNER_EMAIL=owner@example.com npm run admin:create-owner        (type the password; input is hidden)
//   printf '%s' "$PASSWORD" | ADMIN_OWNER_EMAIL=... npm run admin:create-owner   (non-interactive)
//
// The password is read from stdin only (never an argument or env var, so it stays out of shell history and
// process listings) and must be at least 12 characters. The script refuses if any Owner already exists. MFA is
// enrolled at the first sign-in. Connection: DIRECT_DATABASE_URL if set, else DATABASE_URL.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { hashPassword, passwordPolicyProblem } from '../src/lib/admin/auth/password.ts';
import { poolConfig } from './migrate.mjs';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

/** Reads one line from stdin; hides the typing when stdin is a terminal. */
export async function readPassword(stdin = process.stdin, stderr = process.stderr) {
  if (stdin.isTTY) {
    stderr.write('Owner password (hidden, min 12 characters): ');
    return new Promise((resolve, reject) => {
      let value = '';
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');
      const onData = (chunk) => {
        for (const ch of chunk) {
          if (ch === '\u0003') {
            stdin.setRawMode(false);
            reject(new Error('cancelled'));
            return;
          }
          if (ch === '\r' || ch === '\n') {
            stdin.setRawMode(false);
            stdin.pause();
            stdin.off('data', onData);
            stderr.write('\n');
            resolve(value);
            return;
          }
          if (ch === '\u007f') value = value.slice(0, -1);
          else value += ch;
        }
      };
      stdin.on('data', onData);
    });
  }
  let data = '';
  for await (const chunk of stdin) data += chunk;
  return data.replace(/\r?\n$/, '');
}

/** @param {import('pg').Pool} pool */
export async function createOwner(pool, { email, name, password }) {
  const address = String(email ?? '').trim().toLowerCase();
  if (!EMAIL.test(address) || address.length > 254) throw new Error('ADMIN_OWNER_EMAIL is missing or not a valid email address.');
  const problem = passwordPolicyProblem(password, address);
  if (problem) throw new Error(problem);
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Transaction-scoped lock (same one the app uses): two runs cannot both pass the check below.
    await client.query("select pg_advisory_xact_lock(hashtext('crater.admin.create_owner'))");
    const owners = await client.query("select 1 from admin.staff_users where role = 'OWNER' limit 1");
    if (owners.rowCount > 0) throw new Error('An Owner already exists. Refusing to create another; use the Staff screen (later slice).');
    const row = await client.query(
      `insert into admin.staff_users (email, name, role, password_hash) values ($1,$2,'OWNER',$3) returning id`,
      [address, (name || 'Owner').slice(0, 120), passwordHash],
    );
    await client.query(
      `insert into admin.audit_log (action, target_type, target_id, changes) values ('staff.owner_created', 'staff', $1, '{}'::jsonb)`,
      [`gid://crater/StaffUser/${row.rows[0].id}`],
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
  const pool = new pg.Pool(poolConfig(process.env, { direct: true }));
  try {
    const password = await readPassword();
    await createOwner(pool, { email: process.env.ADMIN_OWNER_EMAIL, name: process.env.ADMIN_OWNER_NAME, password });
    console.log('[admin:create-owner] Owner created. Sign in at /admin/login; you will enrol an authenticator app at first sign-in.');
  } catch (error) {
    console.error('[admin:create-owner] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
