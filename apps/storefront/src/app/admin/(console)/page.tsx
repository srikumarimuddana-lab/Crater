import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { getPageContent } from '@/lib/content/cms';
import type { Mode } from '@/lib/analytics/schema';
import { redirect } from 'next/navigation';
import { getAdmin, getAdminSession, type OverviewPeriod } from '@/lib/admin';
import { navFor } from '@/components/admin/shell';
import { fmtAmount, fmtMoney } from '@/components/admin/format';
import { DateCell, EmptyState, PageHeader, StatusBadge, Tabs, TableWrap } from '@/components/admin/ui';
import { gate, one, type SearchParams } from '../_lib/gate';

export const metadata: Metadata = { title: 'Overview' };

const PERIODS: { key: string; value: OverviewPeriod; label: string; long: string }[] = [
  { key: 'today', value: 'TODAY', label: 'Today', long: 'today' },
  { key: '7d', value: 'LAST_7_DAYS', label: '7 days', long: 'the last 7 days' },
  { key: '30d', value: 'LAST_30_DAYS', label: '30 days', long: 'the last 30 days' },
];

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  // Roles without the overview (Fulfilment) land on their first allowed page.
  const s = await getAdminSession();
  if (s && !s.capabilities.includes('overview:read')) {
    const first = navFor(s)[0]?.items[0]?.href;
    if (first) redirect(first);
  }
  const g = await gate('overview:read');
  if (!g.ok) return g.view;
  const period = PERIODS.find((p) => p.key === one(sp.period)) ?? PERIODS[1];
  const mode: Mode = one(sp.mode) === 'stripe-live' ? 'stripe-live' : one(sp.mode) === 'fixture' ? 'fixture' : 'stripe-test';
  const [m, copy] = await Promise.all([(await getAdmin()).overview.get(period.value, mode), getPageContent('admin', g.can('content:write') ? sp.preview : undefined)]);
  const cur = m.grossSales.currencyCode;

  const tiles: { label: string; value: string; def: string }[] = [
    { label: 'Gross sales', value: fmtMoney(m.grossSales) ?? '–', def: 'Paid orders’ subtotals by order date, before refunds. Excludes tax and shipping.' },
    { label: 'Net sales (by refund date)', value: fmtMoney(m.netSales) ?? '–', def: 'Gross product sales minus confirmed product refunds by refund date. Excludes refunded tax and shipping.' },
    { label: 'Confirmed refunds', value: fmtMoney(m.refunds) ?? '–', def: 'Successful refunds by provider success date, including refunded product, tax and shipping.' },
    { label: 'Shipping collected', value: fmtMoney(m.shipping) ?? '–', def: 'Shipping on paid orders before refunds.' },
    { label: 'Tax collected', value: fmtMoney(m.tax) ?? '–', def: 'Tax on paid orders before refunds.' },
    { label: 'Fulfilment backlog', value: String(m.fulfilmentBacklog), def: 'Paid orders from this period that are not fully fulfilled.' },
    { label: 'Orders', value: String(m.orders), def: 'Paid orders by order date.' },
    { label: 'Average order value', value: m.averageOrderValue ? (fmtMoney(m.averageOrderValue) ?? '–') : '–', def: 'Gross sales divided by orders. Shows – when there are no orders.' },
  ];

  return (
    <>
      <PageHeader title="Overview" actions={g.can('analytics:read') ? <Link className="a-btn" href={`/admin/analytics?mode=${mode}`}>Sales &amp; traffic report</Link> : undefined} />
      <section className="a-card" aria-label="Store welcome">
        {copy.image ? <Image src={copy.image} alt={copy.imageAlt || ""} width={960} height={240} style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 12 }} /> : null}
        <h2>{copy.title}</h2><p style={{ whiteSpace: 'pre-line' }}>{copy.body}</p>
      </section>
      <form method="get" className="a-row" aria-label="Payment mode filter">
        <input type="hidden" name="period" value={period.key} />
        <label className="a-field">Payment mode<select name="mode" defaultValue={mode}><option value="stripe-test">Stripe test</option><option value="stripe-live">Stripe live</option><option value="fixture">Fixture</option></select></label>
        <button type="submit" className="a-btn">Update overview</button>
      </form>
      <div className="a-row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <Tabs label="Period" items={PERIODS.map((p) => ({ label: p.label, href: `/admin?period=${p.key}&mode=${mode}`, current: p.key === period.key }))} />
        <p className="a-muted">Reporting time zone: {m.timezone}. {mode === 'stripe-live' ? 'Live payments only.' : mode === 'stripe-test' ? 'Test payments only.' : 'Development fixtures only.'}</p>
      </div>
      <dl className="a-tiles" aria-label={`Sales for ${period.long}`}>
        {tiles.map((t) => (
          <div className="a-tile" key={t.label}>
            <dt>{t.label}</dt>
            <dd className="a-big">{t.value}</dd>
            <dd className="a-def">{t.def}</dd>
          </div>
        ))}
        <div className="a-tile">
          <dt>Low stock</dt>
          <dd className="a-big">
            {g.can('inventory:read') ? <Link href="/admin/inventory?low=1">{m.lowStockVariants}</Link> : m.lowStockVariants}
          </dd>
          <dd className="a-def">Active tracked variants at or under their low-stock threshold.</dd>
        </div>
      </dl>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <h2>Payment event health</h2><p className="a-muted">All payment modes, last 24 hours.</p>
        <p className="a-row" style={{ marginTop: 8 }}>
          {m.webhookHealth.failedLast24h > 0 ? (
            <StatusBadge tone="warning" shape="triangle" label="Needs attention" />
          ) : (
            <StatusBadge tone="success" shape="check-circle" label="OK" />
          )}
          <span>
            {m.webhookHealth.lastEventAt ? (
              <>
                Last event received <DateCell value={m.webhookHealth.lastEventAt} tz={g.tz} />.
              </>
            ) : (
              'No payment events received yet.'
            )}{' '}
            Failed or rejected in the last 24 hours: {m.webhookHealth.failedLast24h}.
          </span>
        </p>
      </div>

      <h2 style={{ marginBottom: 8 }}>Sales by day</h2>
      <TableWrap label="Sales by day">
        <table className="a-table">
          <caption className="a-sr">
            Sales by day, {period.long}, reporting time zone {m.timezone}. Amounts in {cur}.
          </caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col" className="a-num">
                Orders
              </th>
              <th scope="col" className="a-num">
                Gross sales, {cur}
              </th>
            </tr>
          </thead>
          <tbody>
            {m.salesByDay.map((d) => (
              <tr key={d.date}>
                <th scope="row">{d.date}</th>
                <td className="a-num">{d.orders}</td>
                <td className="a-num">{fmtAmount(d.grossSales.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {m.orders === 0 ? <EmptyState>No orders yet in {period.long}.</EmptyState> : null}
      </TableWrap>
    </>
  );
}
