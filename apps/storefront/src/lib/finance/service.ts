import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ACCOUNTS, FinanceError, type Account, type FinanceRepository, type FinanceState, type Journal, type Line, type Mode, type Movement, type Payment, type ProviderRefund, type Refund, type RefundProvider, type Reconciliation } from './types';
const now = () => new Date().toISOString();
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
const line = (account: Account, debit = 0, credit = 0): Line => ({ account, debit, credit });
function checkMode(mode: Mode) {
    if (mode !== 'test' && mode !== 'live')
        throw new FinanceError('Invalid payment mode.');
}
function checkCurrency(currency: string) {
    if (currency !== 'CAD')
        throw new FinanceError('Only CAD is configured.');
}
function checkDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(date) || !Number.isFinite(Date.parse(date)))
        throw new FinanceError('Invalid posting date.');
}
function periodOf(date: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Regina', year: 'numeric', month: '2-digit' }).format(new Date(date)); }
export function validateJournal(j: Journal) {
    checkMode(j.mode);
    checkCurrency(j.currency);
    checkDate(j.occurredAt);
    if (j.lines.length < 2 || j.lines.some(l => !Object.hasOwn(ACCOUNTS, l.account) || !integer(l.debit) || !integer(l.credit) || (l.debit === 0) === (l.credit === 0)))
        throw new FinanceError('Journal needs balanced, positive debit/credit lines.');
    const debit = j.lines.reduce((n, l) => n + l.debit, 0), credit = j.lines.reduce((n, l) => n + l.credit, 0);
    if (!integer(debit) || debit !== credit)
        throw new FinanceError('Journal does not balance.');
}
function insertJournal(s: FinanceState, j: Journal) {
    const existing = s.journals.find(x => x.id === j.id);
    if (existing) {
        if (!isDeepStrictEqual(existing, j))
            throw new FinanceError('Event key already belongs to a different journal.');
        return existing;
    }
    validateJournal(j);
    if (s.periods.some(p => p.id === periodOf(j.occurredAt) && p.closed))
        throw new FinanceError('Reporting period is closed. Reopen with a reason before posting.');
    s.journals.push(j);
    return j;
}
function audit(s: FinanceState, action: string, actor: string, target: string, reason: string) { s.audit.push({ id: randomUUID(), action, actor, target, reason, at: now() }); }
function allocation(s: FinanceState, p: Payment, amount: number, confirmedOnly = false) {
    const reserved = s.refunds.filter(r => r.paymentId === p.id && (confirmedOnly ? r.status === 'succeeded' : r.status !== 'failed'));
    const remaining = p.totalMinor - reserved.reduce((n, r) => n + r.amountMinor, 0);
    if (amount > remaining)
        throw new FinanceError('Refund exceeds the remaining refundable amount (pending and unknown requests reserve funds).');
    const parts = [
        { key: 'productMinor' as const, capacity: p.subtotalMinor - reserved.reduce((n, r) => n + r.productMinor, 0) },
        { key: 'taxMinor' as const, capacity: p.taxMinor - reserved.reduce((n, r) => n + r.taxMinor, 0) },
        { key: 'shippingMinor' as const, capacity: p.shippingMinor - reserved.reduce((n, r) => n + r.shippingMinor, 0) },
    ].map(x => ({ ...x, allocated: Number(BigInt(amount) * BigInt(x.capacity) / BigInt(remaining)), fraction: BigInt(amount) * BigInt(x.capacity) % BigInt(remaining) }));
    let residue = amount - parts.reduce((n, x) => n + x.allocated, 0);
    for (const part of [...parts].sort((a, b) => a.fraction > b.fraction ? -1 : a.fraction < b.fraction ? 1 : 0)) {
        if (residue > 0 && part.allocated < part.capacity) {
            part.allocated++;
            residue--;
        }
    }
    return Object.fromEntries(parts.map(p => [p.key, p.allocated])) as {
        productMinor: number;
        taxMinor: number;
        shippingMinor: number;
    };
}
export function createFinance(repo: FinanceRepository, provider: RefundProvider) {
    const api = {
        snapshot: (mode: Mode) => { checkMode(mode); return repo.snapshot(mode); },
        async postOrder(p: Payment) {
            checkMode(p.mode);
            checkCurrency(p.currency);
            checkDate(p.occurredAt);
            if (![p.totalMinor, p.subtotalMinor, p.shippingMinor, p.taxMinor].every(integer) || p.totalMinor !== p.subtotalMinor + p.shippingMinor + p.taxMinor)
                throw new FinanceError('Payment totals do not balance.');
            return repo.transaction(p.mode, s => {
                const existing = s.payments.find(x => x.id === p.id);
                if (existing) {
                    if (!isDeepStrictEqual(existing, p))
                        throw new FinanceError('Payment event conflict.');
                    return existing;
                }
                if (p.totalMinor > 0)
                    insertJournal(s, { id: `paid:${p.id}`, mode: p.mode, currency: p.currency, occurredAt: p.occurredAt, source: p.id, description: `Order #${p.orderNumber} paid`, lines: [line('stripe_clearing', p.totalMinor), line('product_revenue', 0, p.subtotalMinor), line('shipping_revenue', 0, p.shippingMinor), line('tax_payable', 0, p.taxMinor)].filter(l => l.debit || l.credit) });
                s.payments.push(p);
                return p;
            });
        },
        async requestRefund(input: {
            id: string;
            paymentId: string;
            mode: Mode;
            amountMinor: number;
            reason: string;
            actor: string;
        }) {
            checkMode(input.mode);
            if (!/^[a-zA-Z0-9:_-]{8,150}$/.test(input.id) || !integer(input.amountMinor) || input.amountMinor === 0 || input.reason.trim().length < 3 || input.reason.length > 500)
                throw new FinanceError('Provide a request key, positive amount and refund reason.');
            return repo.transaction(input.mode, s => {
                const existing = s.refunds.find(r => r.id === input.id);
                if (existing) {
                    if (existing.paymentId !== input.paymentId || existing.amountMinor !== input.amountMinor || existing.reason !== input.reason.trim())
                        throw new FinanceError('Refund request key conflicts with another request.');
                    return existing;
                }
                const p = s.payments.find(p => p.id === input.paymentId);
                if (!p)
                    throw new FinanceError('Paid order not found in this mode.');
                if (s.periods.some(p => p.id === periodOf(now()) && p.closed))
                    throw new FinanceError('Current reporting period is closed.');
                const r: Refund = { ...input, ...allocation(s, p, input.amountMinor), currency: p.currency, reason: input.reason.trim(), status: 'requested', providerId: null, createdAt: now(), updatedAt: now(), message: null };
                s.refunds.push(r);
                audit(s, 'refund.requested', input.actor, r.id, r.reason);
                return r;
            });
        },
        async submitRefund(mode: Mode, id: string) {
            checkMode(mode);
            const claimed = await repo.transaction(mode, s => {
                const r = s.refunds.find(r => r.id === id);
                if (!r)
                    throw new FinanceError('Refund request not found.');
                // A crashed submit is never blindly retried; reconciliation discovers the provider result.
                if (r.status !== 'requested')
                    return null;
                r.status = 'submitted';
                r.updatedAt = now();
                return { r, p: s.payments.find(p => p.id === r.paymentId)! };
            });
            if (!claimed)
                return;
            let result: ProviderRefund;
            try {
                result = await provider.create(claimed.p, claimed.r);
            }
            catch {
                await repo.transaction(mode, s => {
                    const r = s.refunds.find(r => r.id === id)!;
                    if (r.status === 'submitted') {
                        r.status = 'unknown';
                        r.updatedAt = now();
                        r.message = 'Provider result is unknown. Reconcile this payment; do not submit another refund.';
                    }
                });
                return;
            }
            await repo.transaction(mode, s => { const r = s.refunds.find(r => r.id === id)!; r.providerId = result.id; r.updatedAt = now(); });
            return api.postRefund(result);
        },
        async postRefund(input: ProviderRefund) {
            checkMode(input.mode);
            checkCurrency(input.currency);
            checkDate(input.occurredAt);
            if (!integer(input.amountMinor) || input.amountMinor === 0 || !/^re_[A-Za-z0-9]+$/.test(input.id))
                throw new FinanceError('Invalid provider refund.');
            return repo.transaction(input.mode, s => {
                const p = s.payments.find(p => p.id === input.paymentId);
                if (!p || p.currency !== input.currency)
                    throw new FinanceError('Refund payment/currency mismatch.');
                let r = s.refunds.find(r => r.providerId === input.id || (input.requestKey && r.id === input.requestKey));
                if (r && (r.paymentId !== input.paymentId || r.amountMinor !== input.amountMinor || (r.providerId && r.providerId !== input.id)))
                    throw new FinanceError('Provider refund conflicts with the request.');
                if (!r) {
                    r = { id: `stripe:${input.id}`, paymentId: p.id, mode: p.mode, currency: p.currency, amountMinor: input.amountMinor, ...allocation(s, p, input.amountMinor, true), reason: 'Refund reconciled from Stripe', actor: 'stripe', status: 'pending', providerId: input.id, createdAt: input.occurredAt, updatedAt: now(), message: null };
                    s.refunds.push(r);
                }
                if (r.status === 'succeeded')
                    return r; // terminal success cannot be downgraded by late callbacks
                if (r.status === 'failed' && input.status !== 'failed')
                    throw new FinanceError('Failed refund requires review; provider status changed.');
                r.providerId = input.id;
                r.updatedAt = now();
                if (input.status === 'succeeded') {
                    Object.assign(r, allocation(s, p, input.amountMinor, true));
                    try {
                        insertJournal(s, { id: `refund:${input.id}`, mode: p.mode, currency: p.currency, occurredAt: input.occurredAt, source: r.id, description: `Order #${p.orderNumber} refund`, lines: [line('sales_returns', r.productMinor), line('shipping_revenue', r.shippingMinor), line('tax_payable', r.taxMinor), line('stripe_clearing', 0, r.amountMinor)].filter(l => l.debit || l.credit) });
                    }
                    catch (e) {
                        if (e instanceof FinanceError && e.message.includes('closed')) {
                            r.status = 'unknown';
                            r.message = 'Stripe confirmed refund; accounting period is closed. Reopen the period and reconcile.';
                            return r;
                        }
                        throw e;
                    }
                }
                r.status = input.status;
                if (input.status === 'succeeded')
                    r.succeededAt = input.occurredAt;
                r.message = null;
                audit(s, `refund.${r.status}`, 'stripe', r.id, input.id);
                return r;
            });
        },
        async reconcilePayment(mode: Mode, paymentId: string) {
            const s = await repo.snapshot(mode), p = s.payments.find(p => p.id === paymentId);
            if (!p)
                throw new FinanceError('Payment not found.');
            if (p.totalMinor === 0)
                return 0; // Free Checkout has no refundable PaymentIntent.
            const results = await provider.list(p);
            for (const r of results)
                await api.postRefund(r);
            await repo.transaction(mode, state => {
                for (const refund of state.refunds.filter(r => r.paymentId === paymentId && r.status === 'submitted')) {
                    if (Date.now() - Date.parse(refund.updatedAt) > 60000) {
                        refund.status = 'unknown';
                        refund.message = 'A worker stopped after submission. No matching provider refund is visible yet; keep reserved and investigate in Stripe.';
                        refund.updatedAt = now();
                    }
                }
            });
            return results.length;
        },
        async recordReconciliation(mode: Mode, record: Reconciliation) {
            return repo.transaction(mode, s => {
                const i = s.reconciliation.findIndex(r => r.id === record.id);
                if (i < 0)
                    s.reconciliation.push(record);
                else
                    s.reconciliation[i] = record;
                return record;
            });
        },
        async postMovement(m: Movement) {
            if (!integer(m.amountMinor) || m.amountMinor === 0)
                throw new FinanceError('Movement amount must be positive.');
            const accounts: Record<Movement['kind'], [
                Account,
                Account
            ]> = { fee: ['payment_fees', 'stripe_clearing'], payout: ['bank', 'stripe_clearing'], payout_reversal: ['stripe_clearing', 'bank'], dispute: ['suspense', 'stripe_clearing'], dispute_recovery: ['stripe_clearing', 'suspense'] };
            const pair = accounts[m.kind];
            if (!pair)
                throw new FinanceError('Invalid movement kind.');
            return repo.transaction(m.mode, s => insertJournal(s, { id: `${m.kind}:${m.id}`, mode: m.mode, currency: m.currency, occurredAt: m.occurredAt, source: m.id, description: `Stripe ${m.kind.replaceAll('_', ' ')}`, lines: [line(pair[0], m.amountMinor), line(pair[1], 0, m.amountMinor)] }));
        },
        async postCorrection(input: {
            id: string;
            mode: Mode;
            source: string;
            debit: Account;
            credit: Account;
            amountMinor: number;
            occurredAt: string;
            actor: string;
            reason: string;
        }) {
            if (!/^[a-zA-Z0-9:_-]{8,150}$/.test(input.id) || input.source.trim().length < 3 || input.reason.trim().length < 3 || input.reason.length > 500 || input.debit === input.credit || !integer(input.amountMinor) || input.amountMinor === 0)
                throw new FinanceError('Provide a source, reason, positive amount and different accounts.');
            return repo.transaction(input.mode, s => {
                const id = `correction:${input.id}`, existing = s.journals.find(j => j.id === id);
                const journal = insertJournal(s, { id, mode: input.mode, currency: 'CAD', occurredAt: input.occurredAt, source: input.source, description: input.reason.trim(), lines: [line(input.debit, input.amountMinor), line(input.credit, 0, input.amountMinor)] });
                if (!existing)
                    audit(s, 'journal.correction', input.actor, id, input.reason);
                return journal;
            });
        },
        async postInventoryCost(input: {
            id: string;
            mode: Mode;
            currency: string;
            kind: 'receipt' | 'fulfilled' | 'return' | 'adjustment';
            amountMinor: number;
            occurredAt: string;
        }) {
            if (!integer(input.amountMinor) || input.amountMinor === 0)
                throw new FinanceError('A positive, known cost snapshot is required.');
            const pair: Record<typeof input.kind, [
                Account,
                Account
            ]> = { receipt: ['inventory', 'supplier_payable'], fulfilled: ['cost_of_goods', 'inventory'], return: ['inventory', 'cost_of_goods'], adjustment: ['inventory_adjustments', 'inventory'] };
            const accounts = pair[input.kind];
            return repo.transaction(input.mode, s => insertJournal(s, { id: `cost:${input.kind}:${input.id}`, mode: input.mode, currency: input.currency, occurredAt: input.occurredAt, source: input.id, description: `Inventory cost: ${input.kind}`, lines: [line(accounts[0], input.amountMinor), line(accounts[1], 0, input.amountMinor)] }));
        },
        async reverseJournal(mode: Mode, id: string, occurredAt: string, actor: string, reason: string) {
            if (reason.trim().length < 3)
                throw new FinanceError('A correction reason is required.');
            return repo.transaction(mode, s => {
                const old = s.journals.find(j => j.id === id);
                if (!old)
                    throw new FinanceError('Journal not found.');
                const j = insertJournal(s, { ...old, id: `reversal:${id}`, occurredAt, source: id, reversalOf: id, description: `Reversal: ${reason.trim()}`, lines: old.lines.map(l => ({ ...l, debit: l.credit, credit: l.debit })) });
                audit(s, 'journal.reversed', actor, id, reason);
                return j;
            });
        },
        async setPeriod(mode: Mode, month: string, closed: boolean, actor: string, reason: string) {
            if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || reason.trim().length < 3 || reason.length > 500)
                throw new FinanceError('A valid month and reason are required.');
            return repo.transaction(mode, s => {
                const period = { id: month, closed, actor, reason: reason.trim(), updatedAt: now() };
                const i = s.periods.findIndex(p => p.id === month);
                if (i < 0)
                    s.periods.push(period);
                else
                    s.periods[i] = period;
                audit(s, closed ? 'period.closed' : 'period.reopened', actor, month, reason);
                return period;
            });
        },
    };
    return api;
}
export function trialBalance(s: FinanceState) { return Object.entries(ACCOUNTS).map(([account, name]) => { const lines = s.journals.flatMap(j => j.lines).filter(l => l.account === account); const debit = lines.reduce((n, l) => n + l.debit, 0), credit = lines.reduce((n, l) => n + l.credit, 0); return { account, name, debit, credit, balance: debit - credit }; }); }
export function refundable(s: FinanceState, p: Payment) { return Math.max(0, p.totalMinor - s.refunds.filter(r => r.paymentId === p.id && r.status !== 'failed').reduce((n, r) => n + r.amountMinor, 0)); }
export function ledgerCsv(s: FinanceState) {
    const cell = (v: string | number) => typeof v === 'number' ? String(v) : `"${(/^[=+\-@\t\r]/.test(v) ? "'" : "") + v.replaceAll('"', '""')}"`;
    return [['event', 'date', 'mode', 'currency', 'source', 'account', 'debit_minor', 'credit_minor'], ...s.journals.flatMap(j => j.lines.map(l => [j.id, j.occurredAt, j.mode, j.currency, j.source, l.account, l.debit, l.credit]))].map(row => row.map(cell).join(',')).join('\r\n');
}
