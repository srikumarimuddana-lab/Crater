import 'server-only';
import type { Pool } from 'pg';
export interface Store<S> {
  read(): Promise<S>;
  mutate<T>(fn: (state: S) => T | Promise<T>): Promise<T>;
}
export function memoryStore<S>(initial: () => S): Store<S> {
  let state = initial(),
    pending = Promise.resolve();
  return {
    async read() {
      await pending;
      return structuredClone(state);
    },
    async mutate<T>(fn: (s: S) => T | Promise<T>) {
      const prior = pending;
      let release!: () => void;
      pending = new Promise<void>((r) => (release = r));
      await prior;
      try {
        const next = structuredClone(state),
          result = await fn(next);
        state = next;
        return structuredClone(result);
      } finally {
        release();
      }
    },
  };
}
export function postgresDocumentStore<S>(
  pool: Pool,
  key: 'chat',
  initial: () => S,
): Store<S> {
  return {
    async read() {
      const r = await pool.query(
        'select data from commerce.interaction_documents where key=$1',
        [key],
      );
      return r.rows[0]?.data ?? initial();
    },
    async mutate<T>(fn: (s: S) => T | Promise<T>) {
      const c = await pool.connect();
      try {
        await c.query('begin');
        await c.query(
          'insert into commerce.interaction_documents(key,data) values($1,$2) on conflict do nothing',
          [key, JSON.stringify(initial())],
        );
        const r = await c.query(
          'select data from commerce.interaction_documents where key=$1 for update',
          [key],
        );
        const state = r.rows[0].data as S,
          result = await fn(state);
        await c.query(
          'update commerce.interaction_documents set data=$2 where key=$1',
          [key, JSON.stringify(state)],
        );
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
