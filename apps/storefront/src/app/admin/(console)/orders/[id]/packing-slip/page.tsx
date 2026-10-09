import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAdmin } from '@/lib/admin';
import { gidFrom } from '@/components/admin/format';
import { PrintButton } from '@/components/admin/print-button';
import { DateCell, PageHeader } from '@/components/admin/ui';
import { gate } from '../../../../_lib/gate';

export const metadata: Metadata = { title: 'Packing slip' };

/** Price-free by construction: the PackingSlip type carries no money, email or internal notes. */
export default async function PackingSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const g = await gate('orders:read');
  if (!g.ok) return g.view;
  const gid = gidFrom('Order', slug);
  const slip = gid ? await (await getAdmin()).orders.packingSlip(gid) : null;
  if (!slip) notFound();
  const a = slip.shippingAddress;
  return (
    <>
      <PageHeader
        title={`Packing slip ${slip.orderName}`}
        breadcrumb={[{ label: 'Orders', href: '/admin/orders' }, { label: slip.orderName, href: `/admin/orders/${slug}` }, { label: 'Packing slip' }]}
        actions={<PrintButton />}
      />
      <div className="a-card a-stack">
        <p>
          Order {slip.orderName} placed <DateCell value={slip.processedAt} tz={g.tz} />
        </p>
        <section aria-labelledby="slip-ship">
          <h2 id="slip-ship">Ship to</h2>
          {a ? (
            <address style={{ fontStyle: 'normal' }}>
              {a.name}
              <br />
              {a.line1}
              <br />
              {a.line2 ? (
                <>
                  {a.line2}
                  <br />
                </>
              ) : null}
              {a.city}, {a.province} {a.postalCode}
              <br />
              {a.country}
            </address>
          ) : (
            <p className="a-muted">No shipping address recorded.</p>
          )}
        </section>
        {slip.packingInstructions ? (
          <section aria-labelledby="slip-notes">
            <h2 id="slip-notes">Packing instructions</h2>
            <p>{slip.packingInstructions}</p>
          </section>
        ) : null}
        <div className="a-tablewrap">
          <table className="a-table">
            <caption className="a-sr">Items to pack for order {slip.orderName}</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">SKU</th>
                <th scope="col" className="a-num">
                  Qty
                </th>
              </tr>
            </thead>
            <tbody>
              {slip.lines.map((l) => (
                <tr key={l.sku}>
                  <th scope="row">
                    {l.title} <span className="a-muted" style={{ fontWeight: 400 }}>({l.variantTitle})</span>
                  </th>
                  <td>{l.sku}</td>
                  <td className="a-num">{l.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
