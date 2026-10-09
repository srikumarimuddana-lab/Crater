import type { CommerceMode } from '@/lib/commerce/config';
import { previewCopy, stripeTestModeBanner } from '@/lib/content/shop-copy';

/**
 * Visible on every page while sample data is in use. `mode` is derived on the server
 * (commerceMode()) and passed in; it never reaches the browser through NEXT_PUBLIC.
 */
export function PreviewBanner({ mode }: { mode: CommerceMode }) {
  return (
    <section aria-label="Preview notice" className="on-dark bg-espresso text-ivory">
      <p className="page-gutter text-small flex min-h-11 flex-wrap items-center justify-center gap-x-2 py-2 text-center">
        <strong className="font-bold text-gold-light">{previewCopy.bannerSample}</strong>
        <span>Names, prices, images and copy are placeholders.</span>
      </p>
      {mode === 'stripe-test' ? (
        <p className="page-gutter text-small border-t border-gold/30 py-2 text-center font-semibold text-gold-light">
          {stripeTestModeBanner}
        </p>
      ) : null}
    </section>
  );
}
