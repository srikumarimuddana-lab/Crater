import Link from 'next/link';
import { footer } from '@/lib/content/shop-copy';

const linkClass =
  'focus-ring inline-flex min-h-11 flex-wrap items-center gap-x-2 text-base text-ink underline-offset-4 hover:underline hover:decoration-1';

/** Light footer on the surface tint (no dark band): wordmark, link columns and the preview note. */
export function SiteFooter() {
  return (
    <footer className="border-t border-ink/10 bg-surface text-ink">
      <div className="page-gutter grid gap-10 py-14 md:grid-cols-12 md:gap-8 lg:py-20">
        <div className="md:col-span-4">
          <p className="font-display text-2xl tracking-[0.22em] text-moss-deep uppercase">Crater</p>
          {footer.newsletter.enabled ? (
            <div className="mt-6 max-w-[32ch]">
              <p className="font-display text-xl">{footer.newsletter.heading}</p>
              <p className="text-small mt-1 text-ink-soft">{footer.newsletter.body}</p>
            </div>
          ) : null}
        </div>

        <nav aria-label={footer.label} className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 md:col-span-8">
          {footer.columns.map((col) => (
            <div key={col.heading}>
              <h2 className="!font-sans !text-small font-semibold text-bronze">{col.heading}</h2>
              <ul className="mt-2">
                {col.items.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className={linkClass}>
                      {item.label}
                      {item.pending ? <span className="text-small flex-none whitespace-nowrap text-ink-soft">{footer.pendingSuffix}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-ink/10">
        <p className="page-gutter text-small py-4 text-ink-soft">{footer.note}</p>
      </div>
    </footer>
  );
}
