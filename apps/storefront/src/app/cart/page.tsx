import type { Metadata } from 'next';
import { loadCart } from '@/app/_lib/cart';
import { CartLines, CartSummary } from '@/components/commerce/cart-lines';
import { PriceChangeNotice } from '@/components/commerce/price-change-notice';
import { PageShell } from '@/components/page-shell';
import {
  bag,
  checkoutCancelled,
  checkoutErrorMessage,
  fixtureCheckout,
} from '@/lib/content/shop-copy';

export const metadata: Metadata = {
  title: `${bag.title} — Crater`,
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Always dynamic: it reads the private cart cookie. Query values are mapped to copy, never echoed. */
export default async function CartPage({ searchParams }: Props) {
  const sp = await searchParams;
  const errorCode = first(sp.checkout_error);
  const cancelled = first(sp.checkout) === 'cancelled';
  const { cart, expired } = await loadCart();
  const hasLines = Boolean(cart && cart.lines.length > 0);
  // Once the new prices are accepted, the PRICE_CHANGED message is resolved and no longer shown.
  const priceResolved = errorCode === 'PRICE_CHANGED' && !(cart && cart.hasPriceChanges);
  const errorText = priceResolved ? null : checkoutErrorMessage(errorCode);
  const fixtureRefusal = errorCode === 'FIXTURE_MODE';

  return (
    <PageShell>
      <div className="page-gutter py-10 md:py-16">
        <h1 id="bag-page-title" tabIndex={-1} className="!text-[clamp(2rem,1.6rem+1.4vw,2.75rem)] focus:outline-none">
          {bag.title}
        </h1>

        {errorText ? (
          <div role="alert" className="mt-8 rounded-xs border border-espresso bg-parchment px-5 py-4">
            {fixtureRefusal ? (
              <>
                <p className="font-display text-2xl">{fixtureCheckout.heading}</p>
                <p className="mt-2">{fixtureCheckout.body}</p>
              </>
            ) : (
              <p>{errorText}</p>
            )}
            <a href="#bag-lines" className="focus-ring mt-3 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
              {fixtureRefusal ? fixtureCheckout.action : bag.title}
            </a>
          </div>
        ) : null}

        <div className="mt-6 empty:hidden">
          <PriceChangeNotice cart={cart} />
        </div>

        {cancelled && !errorText ? (
          <div role="status" className="mt-8 rounded-xs border border-walnut bg-parchment px-5 py-4">
            <p className="font-display text-2xl">{checkoutCancelled.heading}</p>
            <p className="mt-2">{checkoutCancelled.body}</p>
          </div>
        ) : null}

        <div className="mt-10 grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-[1fr_22rem]">
          <section id="bag-lines" tabIndex={-1} aria-labelledby="bag-page-title" className="focus:outline-none">
            <CartLines cart={cart} expired={expired} focusId="bag-page-title" />
          </section>

          {cart && hasLines ? (
            <aside aria-label={bag.summaryLabel} className="h-fit rounded-xs border border-espresso/15 bg-parchment p-5 lg:sticky lg:top-6">
              <CartSummary cart={cart} />
              <p className="text-small mt-4 text-walnut">{bag.sampleNote}</p>
            </aside>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
