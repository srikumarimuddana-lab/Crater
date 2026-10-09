import type { CommerceMode } from '@/lib/commerce/config';
import { home, previewCopy, stripeTestModeBanner } from '@/lib/content/shop-copy';

/**
 * Announcement bar. Visible on every page while sample data is in use: the store announcement plus
 * the preview notice. `mode` is derived on the server (commerceMode()) and passed in; it never
 * reaches the browser through NEXT_PUBLIC.
 */
export function PreviewBanner({ mode }: { mode: CommerceMode }) {
  return (
    <section aria-label="Preview notice" className="on-dark bg-espresso text-ivory">
      <div className="page-gutter text-small flex flex-col items-center justify-center gap-x-4 py-2 text-center lg:flex-row">
        <p>{home.announcement}</p>
        <p className="text-ivory/80">{previewCopy.bannerSample}</p>
      </div>
      {mode === 'stripe-test' ? (
        <p className="page-gutter text-small border-t border-ivory/20 py-1.5 text-center font-semibold">{stripeTestModeBanner}</p>
      ) : null}
    </section>
  );
}
