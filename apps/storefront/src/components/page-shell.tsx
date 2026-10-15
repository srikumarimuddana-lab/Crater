import {ChatSlot} from './chat/slot';
import { commerceMode } from '@/lib/commerce';
import { PreviewBanner } from './preview-banner';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { AnalyticsConsentTracker } from './analytics/consent-tracker';

/** Banner, header, main landmark and footer for shop pages. */
export function PageShell({ children, preview }: { children: React.ReactNode; preview?: string | string[] }) {
  return (
    <>
      <PreviewBanner mode={commerceMode()} />
      <SiteHeader preview={preview} />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <SiteFooter preview={preview} />
      <AnalyticsConsentTracker />
      <ChatSlot />
    </>
  );
}
