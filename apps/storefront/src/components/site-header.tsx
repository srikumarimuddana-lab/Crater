import Link from 'next/link';
import { loadCart } from '@/app/_lib/cart';
import { commerceMode, getStorefront } from '@/lib/commerce';
import type { Collection } from '@/lib/commerce/types';
import { productPage } from '@/lib/content/shop-copy';
import { BagControls } from './commerce/bag-controls';
import { MobileMenu } from './mobile-menu';

const linkClass =
  'focus-ring inline-flex min-h-11 items-center text-[0.9375rem] font-semibold text-espresso underline-offset-[0.45em] hover:underline hover:decoration-1';

/** Server-rendered from the private cart cookie, so any page using it is dynamic and uncached. */
export async function SiteHeader() {
  const { cart } = await loadCart();
  const mode = commerceMode();
  let collections: Collection[] = [];
  try {
    collections = await getStorefront().collections();
  } catch {
    // The header still works without category links.
  }
  const links = [
    { href: '/#collection', label: productPage.shopAll },
    ...collections.map((c) => ({ href: `/?category=${c.handle}#collection`, label: c.title })),
  ];

  return (
    <header className="border-b border-espresso/15 bg-ivory">
      <div className="page-gutter flex min-h-16 items-center justify-between gap-4 md:min-h-20">
        <Link href="/" className="focus-ring inline-flex min-h-11 items-center font-display text-2xl tracking-[0.2em] text-forest uppercase">
          Crater
        </Link>
        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-7">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={linkClass}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-1">
          <MobileMenu>
            <ul>
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={`${linkClass} w-full px-2`}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </MobileMenu>
          <BagControls cart={cart} mode={mode} />
        </div>
      </div>
    </header>
  );
}
