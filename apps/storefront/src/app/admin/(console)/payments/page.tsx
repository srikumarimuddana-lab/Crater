import Link from 'next/link';
import { getFinance, refundable, type Mode } from '@/lib/finance';
import { PageHeader, TableWrap, EmptyState } from '@/components/admin/ui';
import { gate, one, type SearchParams } from '../../_lib/gate';
export const metadata = { title: 'Payments' };
export default async function PaymentsPage({ searchParams }: {
    searchParams: SearchParams;
}) {
    const g = await gate('payments:read');
    if (!g.ok)
        return g.view;
    const sp = await searchParams, mode: Mode = one(sp.mode) === 'live' ? 'live' : 'test';
    const s = await (await getFinance()).snapshot(mode);
    return <><PageHeader title="Payments"/><p>Paid orders and confirmed refunds · CAD · {mode} mode. Refunds do not restock inventory.</p><nav className="a-filters"><Link href="/admin/payments?mode=test">Test payments</Link><Link href="/admin/payments?mode=live">Live payments</Link>{g.can('finance:read') ? <Link href="/admin/finance">Financial ledger</Link> : null}</nav>
 {s.payments.length === 0 ? <EmptyState>No recorded payments in this mode. Paid orders are imported by the operations worker; historical orders can be reviewed from the ledger backfill.</EmptyState> : <TableWrap label="Payments"><table className="a-table"><thead><tr><th>Order</th><th>Paid</th><th>Confirmed refunds</th><th>Available to refund</th><th>State</th></tr></thead><tbody>{s.payments.slice().reverse().map(p => { const refunds = s.refunds.filter(r => r.paymentId === p.id); const total = refunds.filter(r => r.status === 'succeeded').reduce((n, r) => n + r.amountMinor, 0); return <tr key={p.id}><td><Link href={`/admin/payments/${p.orderId}?mode=${mode}`}>#{p.orderNumber}</Link></td><td>{(p.totalMinor / 100).toFixed(2)}</td><td>{(total / 100).toFixed(2)}</td><td>{(refundable(s, p) / 100).toFixed(2)}</td><td>{refunds.some(r => ['unknown', 'submitted'].includes(r.status)) ? 'Needs reconciliation' : total === p.totalMinor ? 'Refunded' : total ? 'Partially refunded' : 'Paid'}</td></tr>; })}</tbody></table></TableWrap>}</>;
}
