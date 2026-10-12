import { commerceMode } from '@/lib/commerce';
import { PreviewBanner } from './preview-banner';
import { SiteFooter } from './site-footer';
import { SiteHeader, type HeaderTone } from './site-header';

/** Banner, header, main landmark and footer for shop pages. The home page sits its header on the green hero. */
export function PageShell({ children, tone = 'light' }: { children: React.ReactNode; tone?: HeaderTone }) {
  return (
    <>
      <PreviewBanner mode={commerceMode()} />
      <SiteHeader tone={tone} />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
