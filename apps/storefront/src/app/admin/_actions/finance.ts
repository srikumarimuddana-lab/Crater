'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import { getFinance, reconcileStripe, syncFinanceOrders, FinanceError, type Mode, ACCOUNTS, type Account } from '@/lib/finance';
import { stripeForMode } from '@/lib/finance/provider';
import type { FormState } from '@/components/admin/form-state';
const str = (f: FormData, k: string) => String(f.get(k) ?? '');
function mode(f: FormData): Mode {
    const m = str(f, 'mode');
    if (m !== 'test' && m !== 'live')
        throw new FinanceError('Select test or live mode.');
    return m;
}
function state(message: string): FormState { return { status: 'success', message, errors: [] }; }
function fail(e: unknown): FormState { return { status: 'error', message: e instanceof FinanceError ? e.message : 'The operation could not finish. Check integration status and reconcile before retrying.', errors: [] }; }
function invalidate() { revalidatePath('/admin/payments'); revalidatePath('/admin/finance'); revalidatePath('/admin/orders'); }
export async function refundAction(_: FormState, fd: FormData): Promise<FormState> {
    const session = await requireAdmin('payments:refund');
    try {
        if (fd.get('confirm') !== 'on')
            throw new FinanceError('Confirm the refund before submitting.');
        const amount = str(fd, 'amount');
        if (!/^\d+(\.\d{1,2})?$/.test(amount))
            throw new FinanceError('Enter a positive CAD amount with at most two decimal places.');
        const m = mode(fd);
        stripeForMode(m); // configuration/mode failures cannot create a refund reservation
        const f = await getFinance();
        const r = await f.requestRefund({ mode: m, id: str(fd, 'requestKey'), paymentId: str(fd, 'paymentId'), amountMinor: Math.round(Number(amount) * 100), reason: str(fd, 'reason'), actor: session.staff.id });
        await f.submitRefund(m, r.id);
        invalidate();
        const current = (await f.snapshot(m)).refunds.find(x => x.id === r.id)!;
        return state(current.status === 'succeeded' ? 'Refund confirmed by Stripe.' : `Refund ${current.status}. ${current.message ?? 'Use reconciliation to check provider progress.'}`);
    }
    catch (e) {
        return fail(e);
    }
}
export async function reconcilePaymentAction(_: FormState, fd: FormData): Promise<FormState> {
    await requireAdmin('payments:read');
    try {
        const n = await (await getFinance()).reconcilePayment(mode(fd), str(fd, 'paymentId'));
        invalidate();
        return state(`Reconciled ${n} provider refund records. Unknown requests stay reserved until a matching provider record is found.`);
    }
    catch (e) {
        return fail(e);
    }
}
export async function reconcileFinanceAction(_: FormState, fd: FormData): Promise<FormState> {
    await requireAdmin('finance:read');
    try {
        const r = await reconcileStripe(mode(fd));
        invalidate();
        return state(`Checked ${r.refunds} refunds and ${r.movements} fee/payout movements. ${r.unresolved.length} provider transactions require review${r.unresolved.length ? `: ${r.unresolved.slice(0, 10).map(x => `${x.id} (${x.type})`).join(', ')}` : '.'}`);
    }
    catch (e) {
        return fail(e);
    }
}
export async function backfillFinanceAction(_: FormState, fd: FormData): Promise<FormState> {
    await requireAdmin('finance:read');
    try {
        const dryRun = fd.get('commit') !== 'on';
        const r = await syncFinanceOrders({ dryRun });
        invalidate();
        return state(`${dryRun ? 'Dry run: would post' : 'Posted'} ${r.posted} payments; ${r.existing} already recorded; ${r.unknownMode} unknown mode; ${r.errors.length} errors${r.errors.length ? `: ${r.errors[0].message}` : '.'}`);
    }
    catch (e) {
        return fail(e);
    }
}
export async function periodAction(_: FormState, fd: FormData): Promise<FormState> {
    const closed = str(fd, 'operation') === 'close';
    const session = await requireAdmin(closed ? 'finance:close' : 'finance:reopen');
    try {
        await (await getFinance()).setPeriod(mode(fd), str(fd, 'month'), closed, session.staff.id, str(fd, 'reason'));
        invalidate();
        return state(`Reporting period ${closed ? 'closed' : 'reopened'}.`);
    }
    catch (e) {
        return fail(e);
    }
}
export async function correctionAction(_: FormState, fd: FormData): Promise<FormState> {
    const session = await requireAdmin('finance:close');
    try {
        if (fd.get('confirm') !== 'on')
            throw new FinanceError('Confirm the accounting correction.');
        const debit = str(fd, 'debit'), credit = str(fd, 'credit'), amount = str(fd, 'amount');
        if (!Object.hasOwn(ACCOUNTS, debit) || !Object.hasOwn(ACCOUNTS, credit) || !/^\d+(\.\d{1,2})?$/.test(amount))
            throw new FinanceError('Choose valid accounts and an amount.');
        await (await getFinance()).postCorrection({ id: str(fd, 'requestKey'), mode: mode(fd), source: str(fd, 'source'), debit: debit as Account, credit: credit as Account, amountMinor: Math.round(Number(amount) * 100), occurredAt: str(fd, 'occurredAt'), actor: session.staff.id, reason: str(fd, 'reason') });
        invalidate();
        return state('Balanced correction posted; original history is retained.');
    }
    catch (e) {
        return fail(e);
    }
}
