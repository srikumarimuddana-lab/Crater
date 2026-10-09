import type { Metadata } from 'next';
import Link from 'next/link';
import { FocusHeading } from '@/components/commerce/focus-heading';
import { PageShell } from '@/components/page-shell';
import { buttonClassName } from '@/components/ui/button';
import { commerceMode, formatMoney, getCheckoutResult } from '@/lib/commerce';
import type { Order } from '@/lib/commerce/types';
import { confirmation, contactLine } from '@/lib/content/shop-copy';

export const metadata: Metadata = {
  title: 'Order confirmation — Crater',
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Dynamic and private. Shows only what getCheckoutResult returns; the session id is never rendered. */
export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const sessionId = first((await searchParams).session_id) ?? '';
  let result: Awaited<ReturnType<typeof getCheckoutResult>>;
  try {
    result = sessionId ? await getCheckoutResult(sessionId) : { status: 'not_found', order: null };
  } catch {
    result = { status: 'processing', order: null };
  }
  const mode = commerceMode();
  const refreshHref = `/checkout/success?session_id=${encodeURIComponent(sessionId)}`;

  return (
    <PageShell>
      <div className="page-gutter mx-auto max-w-3xl py-12 md:py-20">
        {result.status === 'paid' && result.order ? (
          <Paid order={result.order} mode={mode} />
        ) : result.status === 'processing' ? (
          <div>
            <FocusHeading>{confirmation.processing.heading}</FocusHeading>
            <div aria-hidden="true" className="ornament mt-5 w-32" />
            <p className="mt-6" role="status">
              {confirmation.processing.body}
            </p>
            <p className="mt-4 text-walnut">{contactLine(null)}</p>
            <Link href={refreshHref} className={buttonClassName('primary', 'mt-8')}>
              {confirmation.processing.refresh}
            </Link>
          </div>
        ) : result.status === 'unpaid' ? (
          <div>
            <FocusHeading>{confirmation.unpaid.heading}</FocusHeading>
            <div aria-hidden="true" className="ornament mt-5 w-32" />
            <p className="mt-6">{confirmation.unpaid.body}</p>
            <Link href="/cart" className={buttonClassName('primary', 'mt-8')}>
              {confirmation.unpaid.action}
            </Link>
          </div>
        ) : (
          <div>
            <FocusHeading>{confirmation.not_found.heading}</FocusHeading>
            <div aria-hidden="true" className="ornament mt-5 w-32" />
            <p className="mt-6">{confirmation.not_found.body}</p>
            <Link href="/#collection" className={buttonClassName('primary', 'mt-8')}>
              {confirmation.not_found.action}
            </Link>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function Paid({ order, mode }: { order: Order; mode: ReturnType<typeof commerceMode> }) {
  const c = confirmation.paid;
  const totals: [string, string][] = [
    [c.subtotal, formatMoney(order.subtotalPrice)],
    [c.shipping, formatMoney(order.totalShippingPrice)],
    [c.tax, formatMoney(order.totalTax)],
  ];
  return (
    <div>
      <FocusHeading>{c.heading}</FocusHeading>
      <div aria-hidden="true" className="ornament mt-5 w-32" />
      {mode === 'stripe-test' ? <p className="mt-6 font-semibold">{c.testOrderNote}</p> : null}
      {mode === 'fixture' ? <p className="mt-6 font-semibold">{c.fixtureOrderNote}</p> : null}
      <p className="mt-6">
        <span className="text-eyebrow block text-walnut">{c.orderNumberLabel}</span>
        <span className="font-display text-3xl">{order.name}</span>
      </p>
      <p className="text-small mt-1 text-walnut">{c.keepNumber}</p>

      <section aria-labelledby="ordered-items" className="mt-10">
        <h2 id="ordered-items" className="text-3xl">
          {c.itemsLabel}
        </h2>
        <ul className="mt-4 divide-y divide-gold-deep/30 border-y border-gold-deep/30">
          {order.lineItems.map((item) => (
            <li key={item.variantId} className="flex flex-wrap items-baseline justify-between gap-x-4 py-3">
              <span>
                {item.title}
                {item.variantTitle ? `, ${item.variantTitle}` : ''} × {item.quantity}
              </span>
              <span className="font-semibold tabular-nums">{formatMoney(item.originalTotalPrice)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2">
          {totals.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-walnut">{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-gold-deep/50 pt-3">
            <dt className="font-semibold">{c.total}</dt>
            <dd className="text-price">{formatMoney(order.totalPrice)}</dd>
          </div>
        </dl>
      </section>

      <p className="mt-8 text-walnut">{contactLine(null)}</p>
      <Link href="/#collection" className={buttonClassName('primary', 'mt-8')}>
        {c.continueShopping}
      </Link>
    </div>
  );
}
