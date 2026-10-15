import type { CommerceMode } from '@/lib/commerce/config';
import { home, stripeTestModeBanner } from '@/lib/content/shop-copy';
import { getPublishedContent } from '@/lib/content/cms';

/**
 * Announcement bar. Visible on every page while sample data is in use: one line that carries both the
 * store announcement and the preview notice. `mode` is derived on the server (commerceMode()) and passed in; it never
 * reaches the browser through NEXT_PUBLIC.
 */
export async function PreviewBanner({ mode }: { mode: CommerceMode }) {
  const c = await getPublishedContent('global');
  return (
    <section aria-label="Preview notice" className="on-dark bg-espresso text-ivory">
      <p className="page-gutter text-small py-2 text-center leading-snug">{mode === 'fixture' ? home.announcement : c.announcement}</p>
      {mode === 'stripe-test' ? (
        <p className="page-gutter text-small border-t border-ivory/20 py-1.5 text-center font-semibold">{stripeTestModeBanner}</p>
      ) : null}
    </section>
  );
}
