import Link from 'next/link';
import { footer } from '@/lib/content/shop-copy';

const linkClass =
  'focus-ring inline-flex min-h-11 flex-wrap items-center gap-x-2 text-base text-ivory underline-offset-4 hover:underline hover:decoration-1';

export function SiteFooter() {
  return (
    <footer className="on-dark bg-espresso text-ivory">
      <div className="page-gutter grid gap-10 py-12 md:grid-cols-12 md:gap-8 lg:py-16">
        <div className="md:col-span-4">
          <p className="font-display text-2xl tracking-[0.2em] text-ivory uppercase">Crater</p>
          {footer.newsletter.enabled ? (
            <div className="mt-6 max-w-[32ch]">
              <p className="font-display text-xl">{footer.newsletter.heading}</p>
              <p className="text-small mt-1 text-ivory/85">{footer.newsletter.body}</p>
            </div>
          ) : null}
        </div>

        <nav aria-label={footer.label} className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 md:col-span-8">
          {footer.columns.map((col) => (
            <div key={col.heading}>
              <h2 className="!font-sans !text-base font-semibold text-gold-light">{col.heading}</h2>
              <ul className="mt-2">
                {col.items.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className={linkClass}>
                      {item.label}
                      {item.pending ? <span className="text-small flex-none whitespace-nowrap text-ivory/75">{footer.pendingSuffix}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-ivory/15">
        <p className="page-gutter text-small py-4 text-ivory/80">{footer.note}</p>
      </div>
    </footer>
  );
}
