import Link from 'next/link';
import { getFinance, type Mode, trialBalance } from '@/lib/finance';
import { readConfig, stripeUsable } from '@/lib/commerce/config';
import { PageHeader, TableWrap } from '@/components/admin/ui';
import { gate, one, type SearchParams } from '../../../_lib/gate';
import { reconcileFinanceAction } from '../../../_actions/finance';
import { FinanceForm } from '../forms';
export const metadata = { title: 'Payment reconciliation' };
export default async function ReconciliationPage({ searchParams }: {
    searchParams: SearchParams;
}) {
    const g = await gate('finance:read');
    if (!g.ok)
        return g.view;
    const sp = await searchParams, mode: Mode = one(sp.mode) === 'live' ? 'live' : 'test', s = await (await getFinance()).snapshot(mode), config = readConfig(), open = s.refunds.filter(r => !['succeeded', 'failed'].includes(r.status));
    const clearing = trialBalance(s).find(b => b.account === 'stripe_clearing')!;
    return <><PageHeader title="Payment reconciliation"/><Link href={`/admin/finance?mode=${mode}`}>Back to {mode} ledger</Link><p>Stripe configuration: {stripeUsable(config) ? config.mode : 'Missing configuration or live activation'}. All amounts below are CAD unless specified.</p><p>Recorded clearing balance: <strong>{(clearing.balance / 100).toFixed(2)}</strong>. Compare this with Stripe available/pending funds and your bank statement. Payouts move clearing to bank; they never count as sales.</p><FinanceForm action={reconcileFinanceAction} label="Reconcile provider records"><input type="hidden" name="mode" value={mode}/><p>Read refunds, actual fees and payouts from the matching Stripe mode. Unsupported adjustments and disputes remain flagged for investigation.</p></FinanceForm>
 <h2>Refunds awaiting resolution</h2>{open.length ? <TableWrap label="Unresolved refunds"><table className="a-table"><thead><tr><th>Payment</th><th>Amount</th><th>State</th><th>Next step</th></tr></thead><tbody>{open.map(r => <tr key={r.id}><td><Link href={`/admin/payments/${r.paymentId.replace('order:', '')}?mode=${mode}`}>{r.paymentId}</Link></td><td>{(r.amountMinor / 100).toFixed(2)}</td><td>{r.status}</td><td>{r.message ?? 'Reconcile with the provider. An absent result does not prove the refund failed.'}</td></tr>)}</tbody></table></TableWrap> : <p>No pending or unknown refund operations.</p>}
 <h2>Provider balance transactions</h2>{s.reconciliation.length ? <TableWrap label="Provider balances"><table className="a-table"><thead><tr><th>Provider ID</th><th>Type</th><th>Amount</th><th>Actual fee</th><th>Status / next step</th></tr></thead><tbody>{s.reconciliation.slice().reverse().map(r => <tr key={r.id}><td>{r.id}</td><td>{r.type}</td><td>{(r.amountMinor / 100).toFixed(2)} {r.currency}</td><td>{(r.feeMinor / 100).toFixed(2)}</td><td>{r.status}: {r.message}</td></tr>)}</tbody></table></TableWrap> : <p>No provider balance transactions imported. Missing fees are unknown, not zero-cost transactions.</p>}</>;
}
