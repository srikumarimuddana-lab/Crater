import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { createFinance } from '@/lib/finance/service';
import { createPostgresFinanceRepository } from '@/lib/finance/repository';
import type { Payment, RefundProvider } from '@/lib/finance/types';
const url = process.env.TEST_DATABASE_URL;
const provider: RefundProvider = { create: async () => { throw new Error('No real provider calls'); }, list: async () => [] };
const p: Payment = { id: 'order:900001', orderId: 900001, orderNumber: 900001, sessionId: 'cs_test_ledger', mode: 'test', currency: 'CAD', subtotalMinor: 1000, shippingMinor: 0, taxMinor: 50, totalMinor: 1050, occurredAt: '2026-10-14T12:00:00.000Z' };
describe.skipIf(!url)('finance Postgres durability', () => {
    let pool: Pool;
    beforeAll(async () => { pool = new Pool({ connectionString: url }); await pool.query(await readFile('db/migrations/0001_init.sql', 'utf8')); await pool.query(await readFile('db/migrations/0009_finance.sql', 'utf8')); });
    afterAll(async () => { await pool?.end(); });
    it('serializes concurrent refund reservations across independent service instances', async () => { const a = createFinance(createPostgresFinanceRepository(pool), provider), b = createFinance(createPostgresFinanceRepository(pool), provider); await Promise.all([a.postOrder(p), b.postOrder(p)]); const results = await Promise.allSettled([a, b].map((f, i) => f.requestRefund({ id: `pg-request-000${i}`, paymentId: p.id, mode: 'test', amountMinor: 800, reason: 'Requested by customer', actor: 'owner' }))); expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); const fresh = createFinance(createPostgresFinanceRepository(pool), provider); expect((await fresh.snapshot('test')).journals).toHaveLength(1); expect((await fresh.snapshot('live')).journals).toHaveLength(0); });
    it('database refuses modifying posted journals and enforces balance', async () => { await expect(pool.query("update commerce.finance_journals set data=data where id=$1", [`paid:${p.id}`])).rejects.toThrow(/immutable/); await expect(pool.query('insert into commerce.finance_journals(mode,id,data) values ($1,$2,$3)', ['test', 'bad', JSON.stringify({ mode: 'test', lines: [{ account: 'bank', debit: 100, credit: 0 }, { account: 'stripe_clearing', debit: 0, credit: 99 }] })])).rejects.toThrow(/check constraint/); });
    it('replays fee and cost journals after PostgreSQL JSONB normalization', async () => {
        const a = createFinance(createPostgresFinanceRepository(pool), provider), b = createFinance(createPostgresFinanceRepository(pool), provider);
        const fee = {id:'txn_pg_replay',mode:'test' as const,currency:'CAD',kind:'fee' as const,amountMinor:25,occurredAt:p.occurredAt};
        const cost = {id:'receipt_pg_replay',mode:'test' as const,currency:'CAD',kind:'receipt' as const,amountMinor:300,occurredAt:p.occurredAt};
        await a.postMovement(fee); await b.postMovement(fee);
        await a.postInventoryCost(cost); await b.postInventoryCost(cost);
        const state = await b.snapshot('test');
        expect(state.journals.filter(j=>j.id==='fee:txn_pg_replay')).toHaveLength(1);
        expect(state.journals.filter(j=>j.id==='cost:receipt:receipt_pg_replay')).toHaveLength(1);
        await expect(b.postMovement({...fee,amountMinor:26})).rejects.toThrow(/different journal/);
    });

});
