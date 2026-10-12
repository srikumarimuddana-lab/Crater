import type { CommerceMode } from '@/lib/commerce/config';
import { home, stripeTestModeBanner } from '@/lib/content/shop-copy';

/**
 * Announcement bar on Nuda's mint. Visible on every page while sample data is in use: one line that carries
 * both the store announcement and the preview notice. `mode` is derived on the server (commerceMode()) and
 * passed in; it never reaches the browser through NEXT_PUBLIC.
 */
export function PreviewBanner({ mode }: { mode: CommerceMode }) {
  return (
    <section aria-label="Preview notice" className="bg-mint text-ink">
      <p className="page-gutter text-small py-2 text-center font-medium leading-snug">{home.announcement}</p>
      {mode === 'stripe-test' ? (
        <p className="page-gutter text-small border-t border-ink/15 py-1.5 text-center font-semibold">{stripeTestModeBanner}</p>
      ) : null}
    </section>
  );
}
