import Link from 'next/link';
import { brand } from '@/lib/content/brand';
import { footer } from '@/lib/content/shop-copy';
import { BrandLogo } from './brand-logo';
import { MapleLeaf } from './maple-leaf';

const linkClass =
  'focus-ring inline-flex min-h-11 flex-wrap items-center gap-x-2 text-base text-ink underline-offset-4 hover:underline hover:decoration-1';

/**
 * Elise-style footer on Nuda's cream: logo and tagline, Canadian tags, a "Get in touch" block (details
 * pending), link columns, the brand name set very large across the bottom, then the preview note and
 * copyright. No dark band.
 */
export function SiteFooter() {
  return (
    <footer className="bg-cream text-ink">
      <div className="page-gutter grid gap-12 py-14 md:grid-cols-12 md:gap-8 lg:py-20">
        <div className="flex flex-col gap-5 md:col-span-5">
          <BrandLogo size="footer" />
          <p className="font-display text-2xl font-semibold text-deep">{brand.tagline}</p>
          <ul aria-label="Canadian company" className="text-small flex flex-wrap gap-2 font-semibold">
            {brand.canadianTags.map((tag, i) => (
              <li key={tag} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-page px-3">
                {i === 0 ? <MapleLeaf className="size-4 text-leaf" /> : null}
                {tag}
              </li>
            ))}
          </ul>
          <div>
            <p className="font-semibold">{footer.getInTouch.heading}</p>
            <p className="text-small mt-1 text-grey">{footer.getInTouch.body}</p>
          </div>
          {footer.newsletter.enabled ? (
            <div className="max-w-[32ch]">
              <p className="font-display text-xl">{footer.newsletter.heading}</p>
              <p className="text-small mt-1 text-grey">{footer.newsletter.body}</p>
            </div>
          ) : null}
        </div>

        <nav aria-label={footer.label} className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 md:col-span-7">
          {footer.columns.map((col) => (
            <div key={col.heading}>
              <h2 className="!font-sans !text-small font-bold text-amber-deep">{col.heading}</h2>
              <ul className="mt-2">
                {col.items.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className={linkClass}>
                      {item.label}
                      {item.pending ? <span className="text-small flex-none whitespace-nowrap text-grey">{footer.pendingSuffix}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* The brand name set very large across the bottom (Elise). Drawn as SVG text so it is decoration, not low-contrast copy. */}
      <div className="page-gutter" aria-hidden="true">
        <svg viewBox="0 0 1180 150" className="block h-auto w-full text-deep/15" preserveAspectRatio="xMinYMid meet" focusable="false">
          <text x="0" y="128" fill="currentColor" fontFamily="var(--font-display)" fontWeight="800" fontSize="150" letterSpacing="-6" textLength="1180" lengthAdjust="spacingAndGlyphs">
            {brand.name}
          </text>
        </svg>
      </div>

      <div className="mt-6 border-t border-ink/10">
        <div className="page-gutter text-small flex flex-wrap justify-between gap-x-6 gap-y-1 py-4 text-grey">
          <p>{footer.note}</p>
          <p>{brand.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
