import type { Pool } from 'pg';
import { isDeepStrictEqual } from 'node:util';
import { emptyState, type FinanceRepository, type FinanceState, type Mode } from './types';
/** Explicit test/preview adapter. Serializes mutations, including concurrent refunds. */
export function createMemoryFinanceRepository(): FinanceRepository {
    const states = { test: emptyState(), live: emptyState() };
    let tail: Promise<unknown> = Promise.resolve();
    return {
        transaction<T>(mode: Mode, fn: (state: FinanceState) => T): Promise<T> {
            const operation = tail.then(() => { const draft = structuredClone(states[mode]); const result = fn(draft); states[mode] = draft; return structuredClone(result); });
            tail = operation.catch(() => undefined);
            return operation;
        },
        async snapshot(mode) { await tail; return structuredClone(states[mode]); },
    };
}
const tables = { payments: 'finance_payments', refunds: 'finance_refunds', journals: 'finance_journals', periods: 'finance_periods', audit: 'finance_audit', reconciliation: 'finance_reconciliation' } as const;
/** Mode mutex rows serialize reservation, posting and period-close checks across workers.
 * Network calls are deliberately outside this transaction. Posted journals are insert-only.
 */
export function createPostgresFinanceRepository(pool: Pool): FinanceRepository {
    async function load(client: Pick<Pool, 'query'>, mode: Mode): Promise<FinanceState> {
        const state = emptyState();
        for (const [key, table] of Object.entries(tables)) {
            const { rows } = await client.query(`select data from commerce.${table} where mode=$1 order by id`, [mode]);
            (state as unknown as Record<string, unknown>)[key] = rows.map(r => r.data);
        }
        return state;
    }
    return {
        async snapshot(mode) {
            const c = await pool.connect();
            try {
                await c.query('begin isolation level repeatable read read only');
                const state = await load(c, mode);
                await c.query('commit');
                return state;
            }
            catch (e) {
                await c.query('rollback');
                throw e;
            }
            finally {
                c.release();
            }
        },
        async transaction<T>(mode: Mode, fn: (s: FinanceState) => T): Promise<T> {
            const client = await pool.connect();
            try {
                await client.query('begin');
                await client.query('select mode from commerce.finance_locks where mode=$1 for update', [mode]);
                const state = await load(client, mode);
                const before = structuredClone(state);
                const result = fn(state);
                for (const [key, table] of Object.entries(tables)) {
                    const k = key as keyof FinanceState;
                    const previous = new Map(before[k].map(r => [r.id, r]));
                    for (const record of state[k]) {
                        const json = JSON.stringify(record);
                        if (isDeepStrictEqual(previous.get(record.id), record))
                            continue;
                        if (key === 'journals' || key === 'audit' || key === 'payments') {
                            if (previous.has(record.id))
                                throw new Error('Immutable finance record cannot be changed');
                            await client.query(`insert into commerce.${table} (mode,id,data) values ($1,$2,$3::jsonb)`, [mode, record.id, json]);
                        }
                        else
                            await client.query(`insert into commerce.${table} (mode,id,data) values ($1,$2,$3::jsonb) on conflict (mode,id) do update set data=excluded.data`, [mode, record.id, json]);
                    }
                }
                // Finance success and the order financial status commit together. No inventory mutation.
                for (const p of state.payments) {
                    const total = state.refunds.filter(r => r.paymentId === p.id && r.status === 'succeeded').reduce((n, r) => n + r.amountMinor, 0);
                    if (total > 0)
                        await client.query("update commerce.orders set financial_status=$2 where id=$1 and financial_status in ('PAID','PARTIALLY_REFUNDED','REFUNDED')", [p.orderId, total >= p.totalMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED']);
                }
                await client.query('commit');
                return structuredClone(result);
            }
            catch (e) {
                await client.query('rollback');
                throw e;
            }
            finally {
                client.release();
            }
        },
    };
}
