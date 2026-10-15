import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFinance, refundable, type Mode } from '@/lib/finance';
import { PageHeader, TableWrap } from '@/components/admin/ui';
import { gate, one, type SearchParams } from '../../../_lib/gate';
import { refundAction, reconcilePaymentAction } from '../../../_actions/finance';
import { FinanceForm } from '../../finance/forms';
export const metadata = { title: 'Payment detail' };
export default async function PaymentPage({ params, searchParams }: {
    params: Promise<{
        id: string;
    }>;
    searchParams: SearchParams;
}) {
    const g = await gate('payments:read');
    if (!g.ok)
        return g.view;
    const { id } = await params, sp = await searchParams, mode: Mode = one(sp.mode) === 'live' ? 'live' : 'test', s = await (await getFinance()).snapshot(mode), p = s.payments.find(p => String(p.orderId) === id);
    if (!p)
        notFound();
    const remaining = refundable(s, p), refunds = s.refunds.filter(r => r.paymentId === p.id);
    return <><PageHeader title={`Payment for order #${p.orderNumber}`}/><nav className="a-filters"><Link href={`/admin/orders/${id}`}>View order</Link><Link href={`/admin/payments?mode=${mode}`}>All payments</Link></nav><p>{mode} mode · CAD {(p.totalMinor / 100).toFixed(2)} paid · {(remaining / 100).toFixed(2)} available to refund</p><p>Product {(p.subtotalMinor / 100).toFixed(2)} · Shipping {(p.shippingMinor / 100).toFixed(2)} · Tax {(p.taxMinor / 100).toFixed(2)}</p>
 <h2>Refund history</h2>{refunds.length ? <TableWrap label="Refund history"><table className="a-table"><thead><tr><th>Date</th><th>Amount CAD</th><th>Status</th><th>Provider ID</th><th>Reason / next step</th></tr></thead><tbody>{refunds.map(r => <tr key={r.id}><td>{r.createdAt.slice(0, 10)}</td><td>{(r.amountMinor / 100).toFixed(2)}</td><td>{r.status}</td><td>{r.providerId ?? 'Awaiting reconciliation'}</td><td>{r.reason}{r.message ? <p>{r.message}</p> : null}</td></tr>)}</tbody></table></TableWrap> : <p>No refunds recorded.</p>}
 <FinanceForm action={reconcilePaymentAction} label="Reconcile with Stripe"><input type="hidden" name="paymentId" value={p.id}/><input type="hidden" name="mode" value={mode}/><p>Read authoritative provider refunds, including refunds created directly in Stripe. This does not send a new refund.</p></FinanceForm>
 {g.can('payments:refund') && remaining > 0 ? <><h2>Issue a refund</h2><p>Refund allocation proportionally reverses product, shipping and tax balances. Unknown and pending requests reserve their amounts. Receive returned stock separately.</p><FinanceForm action={refundAction} label="Confirm and request refund"><input type="hidden" name="paymentId" value={p.id}/><input type="hidden" name="mode" value={mode}/><input type="hidden" name="requestKey" value={randomUUID()}/><label className="a-field">Amount (CAD)<input name="amount" inputMode="decimal" required pattern="[0-9]+([.][0-9]{1,2})?" defaultValue={(remaining / 100).toFixed(2)}/></label><label className="a-field">Reason<textarea name="reason" required minLength={3} maxLength={500}/></label><label><input type="checkbox" name="confirm" required/> I confirm this amount should be refunded to the original payment method ({mode} mode).</label></FinanceForm></> : null}</>;
}
