import { FIXTURE_MODE } from '@/lib/content/fixtures';

/** Visible on every page while fixture data is in use. Remove only with verified data. */
export function PreviewBanner() {
  if (!FIXTURE_MODE) return null;
  return (
    <section aria-label="Preview notice" className="on-dark bg-espresso text-ivory">
      <p className="page-gutter text-small flex min-h-11 flex-wrap items-center justify-center gap-x-2 py-2 text-center">
        <strong className="font-bold text-gold-light">Preview — sample products, not for sale.</strong>
        <span>Names, prices, images and copy are placeholders.</span>
      </p>
    </section>
  );
}
