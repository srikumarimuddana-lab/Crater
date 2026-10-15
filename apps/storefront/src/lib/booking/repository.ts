import 'server-only';
import type { Pool, PoolClient } from 'pg';
import type { Store } from '@/lib/public-interactions/store';
import { initialBooking } from './service';
import type { BookingState } from './types';
export function createPostgresBookingStore(pool: Pool): Store<BookingState> {
  async function read(c: Pool | PoolClient) {
    const state = initialBooking();
    const settings = await c.query(
      'select data from commerce.booking_config where id=1',
    );
    if (settings.rows[0]) state.settings = settings.rows[0].data;
    for (const [field, table] of [
      ['resources', 'booking_resources'],
      ['services', 'booking_services'],
      ['bookings', 'booking_records'],
      ['events', 'booking_events'],
      ['requests', 'booking_requests'],
      ['audit', 'booking_audit'],
    ] as const) {
      const r = await c.query(`select data from commerce.${table}`);
      (state[field] as unknown[]) = r.rows.map((r) => r.data);
    }
    return state;
  }
  return {
    async read() {
      const c = await pool.connect();
      try {
        await c.query('begin isolation level repeatable read read only');
        const s = await read(c);
        await c.query('commit');
        return s;
      } catch (e) {
        await c.query('rollback');
        throw e;
      } finally {
        c.release();
      }
    },
    async mutate<T>(fn: (s: BookingState) => T | Promise<T>) {
      const c = await pool.connect();
      try {
        await c.query('begin');
        await c.query('select pg_advisory_xact_lock(81290147)');
        const s = await read(c),
          auditCount = s.audit.length,
          result = await fn(s);
        await c.query(
          'insert into commerce.booking_config(id,data) values(1,$1) on conflict(id) do update set data=excluded.data',
          [JSON.stringify(s.settings)],
        );
        for (const r of s.resources)
          await c.query(
            'insert into commerce.booking_resources(id,data) values($1,$2) on conflict(id) do update set data=excluded.data',
            [r.id, JSON.stringify(r)],
          );
        for (const r of s.services)
          await c.query(
            'insert into commerce.booking_services(id,data) values($1,$2) on conflict(id) do update set data=excluded.data',
            [r.id, JSON.stringify(r)],
          );
        for (const b of s.bookings)
          await c.query(
            'insert into commerce.booking_records(id,resource_id,service_id,starts_at,ends_at,status,data) values($1,$2,$3,$4,$5,$6,$7) on conflict(id) do update set resource_id=excluded.resource_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,status=excluded.status,data=excluded.data',
            [
              b.id,
              b.resourceId,
              b.serviceId,
              b.startsAt,
              b.endsAt,
              b.status,
              JSON.stringify(b),
            ],
          );
        for (const e of s.events)
          await c.query(
            'insert into commerce.booking_events(id,booking_id,data) values($1,$2,$3) on conflict(id) do update set data=excluded.data',
            [e.id, e.bookingId, JSON.stringify(e)],
          );
        for (const r of s.requests)
          await c.query(
            'insert into commerce.booking_requests(key,booking_id,data) values($1,$2,$3) on conflict(key) do update set data=excluded.data',
            [r.key, r.bookingId, JSON.stringify(r)],
          );
        for (const a of s.audit.slice(auditCount))
          await c.query('insert into commerce.booking_audit(data) values($1)', [
            JSON.stringify(a),
          ]);
        await c.query('commit');
        return result;
      } catch (e) {
        await c.query('rollback');
        throw e;
      } finally {
        c.release();
      }
    },
  };
}
