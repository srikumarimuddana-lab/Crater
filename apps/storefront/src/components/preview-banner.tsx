import type { CommerceMode } from '@/lib/commerce/config';
import { previewCopy, stripeTestModeBanner } from '@/lib/content/shop-copy';

/**
 * Announcement bar. Visible on every page while sample data is in use. `mode` is derived on the
 * server (commerceMode()) and passed in; it never reaches the browser through NEXT_PUBLIC.
 */
export function PreviewBanner({ mode }: { mode: CommerceMode }) {
  return (
    <section aria-label="Preview notice" className="on-dark bg-espresso text-ivory">
      <p className="page-gutter text-small flex min-h-9 items-center justify-center py-1.5 text-center">
        {previewCopy.bannerSample}
      </p>
      {mode === 'stripe-test' ? (
        <p className="page-gutter text-small border-t border-ivory/20 py-1.5 text-center font-semibold">{stripeTestModeBanner}</p>
      ) : null}
    </section>
  );
}
