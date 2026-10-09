import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdmin } from '@/lib/admin';
import { fmtAmount, fmtMoney, gidFrom } from '@/components/admin/format';
import { ActionForm, Field, Submit } from '@/components/admin/form';
import { FinancialBadge, FulfilmentBadge } from '@/components/admin/status';
import { Card, DateCell, KeyValue, Notice, PageHeader, StatusBadge, TableWrap } from '@/components/admin/ui';
import { markFulfilledAction, updateNotesAction } from '../../../_actions/orders';
import { gate } from '../../../_lib/gate';
import { taxCopy } from '@/lib/content/shop-copy';

const provinceName = (v: string | null): string | null => (v === null ? null : (Object.hasOwn(taxCopy.provinces, v) ? taxCopy.provinces[v as keyof typeof taxCopy.provinces] : v));

export const metadata: Metadata = { title: 'Order' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const g = await gate('orders:read');
  if (!g.ok) return g.view;
  const gid = gidFrom('Order', slug);
  const order = gid ? await (await getAdmin()).orders.get(gid) : null;
  if (!order) notFound();

  const prices = order.totals !== null;
  const canFulfil = g.can('orders:fulfil');
  const paid = order.financialStatus === 'PAID' || order.financialStatus === 'PARTIALLY_REFUNDED';
  const timeline = [...order.timeline].sort((a, b) => b.at.localeCompare(a.at));
  const a = order.shippingAddress;
  const taxFlags: string[] = order.reviewFlags.filter((f) => f === 'TAX_PROVINCE_MISMATCH' || f === 'TAX_AMOUNT_MISMATCH');
  const otherFlags = order.reviewFlags.filter((f) => !taxFlags.includes(f));
  const basis = provinceName(order.taxProvince);
  const stripeProvince = provinceName(order.shippingProvince);

  return (
    <>
      <PageHeader
        title={prices ? `Order ${order.name}` : `Pack order ${order.name}`}
        breadcrumb={[{ label: 'Orders', href: '/admin/orders' }, { label: order.name }]}
        badges={
          <>
            {prices ? <FinancialBadge status={order.financialStatus} /> : null}
            <FulfilmentBadge status={order.fulfilmentStatus} />
            {order.reviewFlags.length ? <StatusBadge tone="warning" shape="triangle" label="Needs attention" /> : null}
          </>
        }
        actions={
          <Link className="a-btn" href={`/admin/orders/${slug}/packing-slip`}>
            Packing slip
          </Link>
        }
      />
      {taxFlags.length ? (
        <div className="a-stack" style={{ marginBottom: 16 }} data-testid="tax-flags">
          {taxFlags.includes('TAX_PROVINCE_MISMATCH') ? (
            <Notice tone="warning" role="status" title="Review: tax province mismatch.">
              Tax was charged for {basis ?? 'the province chosen in the bag'}, but the shipping address Stripe collected is in {stripeProvince ?? 'a different province'}. The order is held (payment status Pending) until
              staff review it. Refund the order or contact the customer before shipping.
            </Notice>
          ) : null}
          {taxFlags.includes('TAX_AMOUNT_MISMATCH') ? (
            <Notice tone="warning" role="status" title="Review: tax amount mismatch.">
              The tax Stripe charged differs from the tax Crater calculated by more than 1 cent on a line. Compare the tax lines below with the payment in Stripe before shipping. Stripe’s amounts are the ones recorded.
            </Notice>
          ) : null}
        </div>
      ) : null}
      <div className="a-grid2">
        <div className="a-stack">
          {canFulfil && !order.fulfilment ? (
            <Card title="Fulfil items" id="fulfil">
              {paid ? (
                <ActionForm action={markFulfilledAction} label="Mark fulfilled">
                  <input type="hidden" name="orderId" value={slug} />
                  <Field name="carrier" label="Carrier" required maxLength={60} autoComplete="off" />
                  <Field name="trackingNumber" label="Tracking number" required maxLength={60} autoComplete="off" hint="Letters, numbers, spaces and . _ / -" />
                  <Submit pendingText="Marking fulfilled…">Mark fulfilled</Submit>
                </ActionForm>
              ) : (
                <p className="a-muted">This order is not paid, so it cannot be fulfilled yet.</p>
              )}
            </Card>
          ) : null}
          {order.fulfilment ? (
            <Card title="Fulfilment" id="fulfilment">
              <KeyValue
                items={[
                  { label: 'Carrier', value: order.fulfilment.carrier },
                  { label: 'Tracking number', value: order.fulfilment.trackingNumber },
                  { label: 'Fulfilled', value: <DateCell value={order.fulfilment.fulfilledAt} tz={g.tz} /> },
                  { label: 'By', value: order.fulfilment.by },
                ]}
              />
            </Card>
          ) : null}

          <Card title={`Items (${order.lines.reduce((n, l) => n + l.quantity, 0)})`} id="items">
            <TableWrap label="Order items">
              <table className="a-table">
                <caption className="a-sr">Items in order {order.name}</caption>
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">SKU</th>
                    <th scope="col" className="a-num">
                      Qty
                    </th>
                    {prices ? (
                      <>
                        <th scope="col" className="a-num">
                          Unit price
                        </th>
                        <th scope="col" className="a-num">
                          Total
                        </th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((l) => (
                    <tr key={l.variantId}>
                      <th scope="row">
                        {l.title}
                        <br />
                        <span className="a-muted" style={{ fontWeight: 400 }}>
                          {l.variantTitle}
                        </span>
                      </th>
                      <td>{l.sku}</td>
                      <td className="a-num">{l.quantity}</td>
                      {prices ? (
                        <>
                          <td className="a-num">{l.unitPrice ? fmtAmount(l.unitPrice.amount) : null}</td>
                          <td className="a-num">{l.total ? fmtAmount(l.total.amount) : null}</td>
                        </>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>

          {order.totals ? (
            <Card title="Payment" id="payment">
              <KeyValue
                items={[
                  { label: 'Subtotal', value: fmtMoney(order.totals.subtotal) },
                  { label: 'Shipping', value: fmtMoney(order.totals.shipping) },
                  ...(order.taxLines && order.taxLines.length > 0
                    ? order.taxLines.map((t) => ({ label: `${t.title} ${t.ratePercent}%`, value: fmtMoney(t.amount) }))
                    : [{ label: 'Tax', value: fmtMoney(order.totals.tax) }]),
                  ...(order.taxLines && order.taxLines.length > 1 ? [{ label: 'Tax total', value: fmtMoney(order.totals.tax) }] : []),
                  { label: 'Total', value: <strong>{fmtMoney(order.totals.total)}</strong> },
                ]}
              />
              <p className="a-muted" style={{ marginTop: 12 }} data-testid="tax-basis">
                Tax basis: <strong>{basis ?? 'not recorded'}</strong> (the province the shopper chose in the bag).
                <br />
                Ship-to (Stripe): <strong>{stripeProvince ?? 'not recorded'}</strong> (the address collected at checkout).
              </p>
            </Card>
          ) : null}

          <Card title="Timeline" id="timeline">
            <ol className="a-timeline">
              {timeline.map((t, i) => (
                <li key={`${t.at}-${i}`}>
                  <div>
                    <p>
                      <strong>{t.message}</strong>
                    </p>
                    <p className="a-muted">
                      <DateCell value={t.at} tz={g.tz} />
                      {t.actor ? ` · ${t.actor}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="a-stack">
          <Card title="Ship to" id="ship-to">
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
          </Card>
          {order.email ? (
            <Card title="Customer" id="customer">
              <p>{order.email}</p>
            </Card>
          ) : null}
          {otherFlags.length ? (
            <Notice tone="warning" title="Needs attention:">
              {otherFlags.join(', ')}
            </Notice>
          ) : null}
          {g.can('orders:internal_notes') ? (
            <Card title="Notes" id="notes">
              <ActionForm action={updateNotesAction} label="Order notes">
                <input type="hidden" name="orderId" value={slug} />
                <Field name="packingInstructions" label="Packing instructions" as="textarea" rows={3} defaultValue={order.packingInstructions ?? ''} hint="Visible to everyone who packs orders." />
                <Field name="internalNotes" label="Internal notes" as="textarea" rows={3} defaultValue={order.internalNotes ?? ''} hint="Hidden from Fulfilment." />
                <Submit primary={false} pendingText="Saving…">
                  Save notes
                </Submit>
              </ActionForm>
            </Card>
          ) : order.packingInstructions ? (
            <Card title="Packing instructions" id="packing">
              <p>{order.packingInstructions}</p>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
