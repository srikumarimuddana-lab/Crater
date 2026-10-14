import { AccountError } from './account-errors';
import type { CommerceRepository } from '@/lib/commerce/records';
import { memoryStateOf } from '@/lib/commerce/memory-repository';
import { pgPoolOf } from '@/lib/commerce/postgres-repository';
import type { SessionRecord, StaffRecord } from '../records';
import type { StaffRole } from '../types';
import { AdminAuthError } from '../errors';

export type AccountToken = { hash: string; staffId: number; kind: 'INVITE' | 'RESET'; expiresAt: string };
export interface AccountRepository {
  getToken(hash: string): Promise<AccountToken | null>;
  issueToken(token: AccountToken): Promise<void>;
  consumeToken(hash: string, passwordHash: string, now: Date): Promise<boolean>;
  updateStaff(actorId: number, input: { id: number; role: StaffRole; status: 'ACTIVE' | 'DISABLED' }): Promise<void>;
}

/** Account operations share the existing staff/session tables and run atomically. */
export function accountRepositoryFor(commerce: CommerceRepository): AccountRepository {
  if (commerce.kind === 'postgres') {
    const pool = pgPoolOf(commerce);
    return {
      async getToken(hash) {
        const { rows } = await pool.query('select token_hash, staff_id, kind, expires_at from admin.account_tokens where token_hash = $1', [hash]);
        const row = rows[0];
        return row ? { hash: row.token_hash, staffId: row.staff_id, kind: row.kind, expiresAt: new Date(row.expires_at).toISOString() } : null;
      },
      async issueToken(token) {
        const client = await pool.connect();
        try {
          await client.query('begin');
          await client.query('select id from admin.staff_users where id = $1 for update', [token.staffId]);
          await client.query('delete from admin.account_tokens where staff_id = $1', [token.staffId]);
          await client.query('insert into admin.account_tokens (token_hash, staff_id, kind, expires_at) values ($1,$2,$3,$4)', [token.hash, token.staffId, token.kind, token.expiresAt]);
          await client.query('commit');
        } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
      },
      async consumeToken(hash, passwordHash, now) {
        const client = await pool.connect();
        try {
          await client.query('begin');
          // Lock staff before tokens, matching issueToken/updateStaff lock ordering.
          const { rows } = await client.query('select s.id, s.status from admin.staff_users s join admin.account_tokens t on t.staff_id = s.id where t.token_hash = $1 for update of s', [hash]);
          const staff = rows[0];
          if (!staff || staff.status !== 'ACTIVE') { await client.query('rollback'); return false; }
          const consumed = await client.query('delete from admin.account_tokens where token_hash = $1 and expires_at > $2 returning staff_id', [hash, now]);
          if (!consumed.rowCount) { await client.query('rollback'); return false; }
          await client.query('update admin.staff_users set password_hash = $2 where id = $1', [staff.id, passwordHash]);
          await client.query('delete from admin.staff_sessions where staff_id = $1', [staff.id]);
          await client.query('delete from admin.account_tokens where staff_id = $1', [staff.id]);
          await client.query("insert into admin.audit_log (action, target_type, target_id) values ('staff.password_changed', 'staff', $1)", [`gid://crater/StaffUser/${staff.id}`]);
          await client.query('commit');
          return true;
        } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
      },
      async updateStaff(actorId, input) {
        const client = await pool.connect();
        try {
          await client.query('begin');
          // Serializes owner-count changes, including simultaneous demotions by two owners.
          await client.query("select pg_advisory_xact_lock(hashtext('crater.admin.manage_staff'))");
          const { rows: actors } = await client.query('select role, status from admin.staff_users where id = $1', [actorId]);
          if (actors[0]?.role !== 'OWNER' || actors[0]?.status !== 'ACTIVE') throw new AdminAuthError('FORBIDDEN', 'staff:manage');
          const { rows } = await client.query('select role, status, password_hash, auth_subject from admin.staff_users where id = $1 for update', [input.id]);
          const previous = rows[0];
          if (!previous) throw new AccountError('Staff account not found.');
          if (previous.role === 'OWNER' && previous.status === 'ACTIVE' && (previous.password_hash || previous.auth_subject) && (input.role !== 'OWNER' || input.status !== 'ACTIVE')) {
            const count = await client.query("select count(*)::int as total from admin.staff_users where role = 'OWNER' and status = 'ACTIVE' and (password_hash is not null or auth_subject is not null)");
            if (count.rows[0].total <= 1) throw new AccountError('The final active Owner cannot be disabled or demoted.');
          }
          await client.query('update admin.staff_users set role = $2, status = $3 where id = $1', [input.id, input.role, input.status]);
          await client.query('delete from admin.staff_sessions where staff_id = $1', [input.id]);
          if (input.status === 'DISABLED') await client.query('delete from admin.account_tokens where staff_id = $1', [input.id]);
          await client.query("insert into admin.audit_log (actor_id, action, target_type, target_id, changes) values ($1, 'staff.updated', 'staff', $2, $3::jsonb)", [actorId, `gid://crater/StaffUser/${input.id}`, JSON.stringify({ role: { from: previous.role, to: input.role }, status: { from: previous.status, to: input.status } })]);
          await client.query('commit');
        } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
      },
    };
  }
  const state = memoryStateOf(commerce);
  type AdminState = { staff: StaffRecord[]; sessions: Map<string, SessionRecord>; audit: unknown[]; seq: { audit: number } };
  // The factory is called after getAdminRepository has initialized the shared admin state.
  const admin = () => {
    const value = state.ext.get('admin') as AdminState | undefined;
    if (!value) throw new AccountError('Admin repository must be initialized first.');
    return value;
  };
  let tokens = state.ext.get('admin.account_tokens') as Map<string, AccountToken> | undefined;
  if (!tokens) { tokens = new Map(); state.ext.set('admin.account_tokens', tokens); }
  const tokenRows = tokens;
  const revokeSessions = (id: number) => { for (const [key, session] of admin().sessions) if (session.staffId === id) admin().sessions.delete(key); };
  const revokeTokens = (id: number) => { for (const [key, token] of tokenRows) if (token.staffId === id) tokenRows.delete(key); };
  const audit = (action: string, staffId: number, actorId: number | null, changes: unknown = {}) => {
    const a = admin();
    a.audit.push({ id: ++a.seq.audit, at: new Date().toISOString(), actorId, actorEmail: a.staff.find(s => s.id === actorId)?.email ?? null, action, targetType: 'staff', targetId: `gid://crater/StaffUser/${staffId}`, changes, ipTrunc: null });
  };
  return {
    async getToken(hash) { return structuredClone(tokenRows.get(hash) ?? null); },
    async issueToken(token) { revokeTokens(token.staffId); tokenRows.set(token.hash, structuredClone(token)); },
    async consumeToken(hash, passwordHash, now) {
      const token = tokenRows.get(hash);
      const staff = token && admin().staff.find(s => s.id === token.staffId);
      if (!token || new Date(token.expiresAt) <= now || !staff || staff.status !== 'ACTIVE') return false;
      staff.passwordHash = passwordHash;
      revokeTokens(staff.id);
      revokeSessions(staff.id);
      audit('staff.password_changed', staff.id, null);
      return true;
    },
    async updateStaff(actorId, input) {
      const a = admin();
      const actor = a.staff.find(s => s.id === actorId);
      if (actor?.role !== 'OWNER' || actor.status !== 'ACTIVE') throw new AdminAuthError('FORBIDDEN', 'staff:manage');
      const staff = a.staff.find(s => s.id === input.id);
      if (!staff) throw new AccountError('Staff account not found.');
      if (staff.role === 'OWNER' && staff.status === 'ACTIVE' && (staff.passwordHash || staff.authSubject) && (input.role !== 'OWNER' || input.status !== 'ACTIVE') && a.staff.filter(s => s.role === 'OWNER' && s.status === 'ACTIVE' && (s.passwordHash || s.authSubject)).length <= 1) throw new AccountError('The final active Owner cannot be disabled or demoted.');
      const changes = { role: { from: staff.role, to: input.role }, status: { from: staff.status, to: input.status } };
      Object.assign(staff, { role: input.role, status: input.status });
      revokeSessions(staff.id);
      if (input.status === 'DISABLED') revokeTokens(staff.id);
      audit('staff.updated', staff.id, actorId, changes);
    },
  };
}
