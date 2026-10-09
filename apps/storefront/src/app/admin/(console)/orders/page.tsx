import type { Metadata } from 'next';
import Link from 'next/link';
import { getAdmin, type AdminOrder } from '@/lib/admin';
import { fmtAmount, gidSlug } from '@/components/admin/format';
import { FinancialBadge, FulfilmentBadge } from '@/components/admin/status';
import { StatusBadge, DateCell, EmptyState, PageHeader, Pagination, Tabs } from '@/components/admin/ui';
import { gate, one, type SearchParams } from '../../_lib/gate';

export const metadata: Metadata = { title: 'Orders' };

const FIN = ['PENDING', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'VOIDED'] as const;
const FUL = ['UNFULFILLED', 'FULFILLED'] as const;

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const g = await gate('orders:read');
  if (!g.ok) return g.view;
  const prices = g.can('orders:read_prices');
  const financial = FIN.find((f) => f === one(sp.financial));
  const fulfilment = FUL.find((f) => f === one(sp.fulfilment));
  const q = (one(sp.q) ?? '').trim().slice(0, 100);
  const after = one(sp.after) ?? null;
  const result = await (await getAdmin()).orders.list({ first: 25, after, financialStatus: financial as AdminOrder['financialStatus'] | undefined, fulfilmentStatus: fulfilment, query: q || undefined });
  const filtered = Boolean(financial || fulfilment || q);
  const cur = result.nodes.find((n) => n.total)?.total?.currencyCode ?? 'CAD';
  const params = { financial, fulfilment, q: q || undefined };
  const qs = (o: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/admin/orders?${s}` : '/admin/orders';
  };

  return (
    <>
      <PageHeader title="Orders" />
      <Tabs
        label="Order views"
        items={[
          { label: 'All', href: '/admin/orders', current: !filtered },
          { label: 'Unfulfilled', href: qs({ fulfilment: 'UNFULFILLED' }), current: fulfilment === 'UNFULFILLED' && !financial && !q },
        ]}
      />
      <form method="get" action="/admin/orders" className="a-filters" role="search" aria-label="Filter orders">
        <div className="a-field a-search">
          <label htmlFor="q">Search</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder={prices ? 'Order number or email' : 'Order number'} />
        </div>
        {prices ? (
          <div className="a-field">
            <label htmlFor="financial">Payment status</label>
            <select id="financial" name="financial" defaultValue={financial ?? ''}>
              <option value="">Any</option>
              {FIN.map((f) => (
                <option key={f} value={f}>
                  {f === 'PARTIALLY_REFUNDED' ? 'Partially refunded' : f.charAt(0) + f.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="a-field">
          <label htmlFor="fulfilment">Fulfilment status</label>
          <select id="fulfilment" name="fulfilment" defaultValue={fulfilment ?? ''}>
            <option value="">Any</option>
            <option value="UNFULFILLED">Unfulfilled</option>
            <option value="FULFILLED">Fulfilled</option>
          </select>
        </div>
        <button type="submit" className="a-btn">
          Apply
        </button>
        {filtered ? <Link href="/admin/orders">Clear filters</Link> : null}
      </form>

      {result.nodes.length === 0 ? (
        <div className="a-tablewrap">
          <EmptyState action={filtered ? <Link href="/admin/orders">Clear filters</Link> : undefined}>
            {filtered ? 'No orders match these filters.' : 'No orders yet. Orders appear here after a customer pays at checkout.'}
          </EmptyState>
        </div>
      ) : (
        <div className="a-tablewrap">
          <table className="a-table">
            <caption className="a-sr">Orders, newest first{filtered ? ', filtered' : ''}</caption>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Date</th>
                {prices ? <th scope="col">Payment</th> : null}
                <th scope="col">Fulfilment</th>
                <th scope="col" className="a-num">
                  Items
                </th>
                {prices ? (
                  <th scope="col" className="a-num">
                    Total, {cur}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {result.nodes.map((o) => (
                <tr key={o.id}>
                  <th scope="row">
                    <Link href={`/admin/orders/${gidSlug(o.id)}`}>{o.name}</Link>
                    {o.reviewFlags.length ? (
                      <>
                        {' '}
                        <StatusBadge tone="warning" shape="triangle" label="Needs attention" />
                      </>
                    ) : null}
                  </th>
                  <td>
                    <DateCell value={o.processedAt} tz={g.tz} />
                  </td>
                  {prices ? (
                    <td>
                      <FinancialBadge status={o.financialStatus} />
                    </td>
                  ) : null}
                  <td>
                    <FulfilmentBadge status={o.fulfilmentStatus} />
                  </td>
                  <td className="a-num">{o.itemCount}</td>
                  {prices ? <td className="a-num">{o.total ? fmtAmount(o.total.amount) : null}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination basePath="/admin/orders" params={params} endCursor={result.pageInfo.endCursor} hasNext={result.pageInfo.hasNextPage} isFirst={!after} />
    </>
  );
}
