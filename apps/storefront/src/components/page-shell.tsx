import { commerceMode } from '@/lib/commerce';
import { PreviewBanner } from './preview-banner';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

/** Banner, header, main landmark and footer for shop pages. */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PreviewBanner mode={commerceMode()} />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
