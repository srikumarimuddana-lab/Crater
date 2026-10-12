import Link from 'next/link';
import { loadCart } from '@/app/_lib/cart';
import { commerceMode } from '@/lib/commerce';
import { nav, productPage } from '@/lib/content/shop-copy';
import { BrandLogo } from './brand-logo';
import { BagControls } from './commerce/bag-controls';
import { MobileMenu } from './mobile-menu';
import { NavColumns } from './nav-columns';
import { ShopMenu } from './shop-menu';
import { ArrowLink, ButtonLink } from './ui/button';

export type HeaderTone = 'light' | 'green';

/**
 * Nuda-style header: logo on the left, the menu on the right ("Home / Shop / Coaching / Education / About /
 * Journal"), a green "Take a quiz" button and the bag. Server-rendered from the private cart cookie, so any
 * page using it is dynamic and uncached. Below lg the links live in the slide-out "Menu" panel.
 * `tone="green"` sits the header on the home page's green hero.
 */
export async function SiteHeader({ tone = 'light' }: { tone?: HeaderTone }) {
  const { cart } = await loadCart();
  const mode = commerceMode();
  const green = tone === 'green';
  const linkClass =
    'focus-ring inline-flex min-h-11 items-center px-1 text-[0.9375rem] font-semibold underline-offset-[0.45em] hover:underline hover:decoration-1 ' +
    (green ? 'text-white' : 'text-ink');
  const [homeLink, ...rest] = nav.primary;

  return (
    <header className={`relative ${green ? 'on-green bg-deep text-white' : 'border-b border-ink/10 bg-page'}`}>
      <div className="page-gutter flex min-h-16 items-center justify-between gap-4 md:min-h-20">
        <BrandLogo tone={tone} />

        <nav aria-label="Primary" className="hidden items-center gap-5 lg:flex">
          <Link href={homeLink.href} className={linkClass}>
            {homeLink.label}
          </Link>
          <ShopMenu label={nav.shop} panelLabel={nav.megaMenuLabel} tone={tone}>
            <div className="page-gutter py-10">
              <NavColumns columns={nav.columns} pendingSuffix={nav.pendingSuffix} idPrefix="mega" className="grid grid-cols-3 gap-x-10 gap-y-6" />
              <ArrowLink href="/#collection" className="mt-6">
                {productPage.shopAll}
              </ArrowLink>
            </div>
          </ShopMenu>
          {rest.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <ButtonLink href={nav.quiz.href} variant={green ? 'light' : 'primary'} className="!min-h-11 px-5 !text-[0.9375rem] max-md:hidden">
            {nav.quiz.label}
          </ButtonLink>
          <BagControls cart={cart} mode={mode} tone={tone} />
          <MobileMenu tone={tone} label={nav.menuLabel} closeLabel={nav.closeMenu}>
            <ul className="mb-6 grid gap-1">
              {nav.primary.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="focus-ring inline-flex min-h-11 items-center font-display text-xl font-semibold text-ink">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <NavColumns columns={nav.columns} pendingSuffix={nav.pendingSuffix} idPrefix="menu" className="grid gap-5" />
            <ArrowLink href="/#collection" className="mt-5">
              {productPage.shopAll}
            </ArrowLink>
            <div className="on-green mt-6 rounded-tile bg-deep p-5 text-white">
              <p className="font-display text-lg font-semibold">{nav.quizCard.title}</p>
              <p className="text-small mt-1 text-white/85">{nav.quizCard.body}</p>
              <ButtonLink href={nav.quiz.href} variant="light" className="mt-4 !min-h-11">
                {nav.quiz.label}
              </ButtonLink>
            </div>
          </MobileMenu>
        </div>
      </div>
    </header>
  );
}
