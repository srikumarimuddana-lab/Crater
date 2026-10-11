import Link from 'next/link';
import { loadCart } from '@/app/_lib/cart';
import { commerceMode } from '@/lib/commerce';
import { nav, productPage } from '@/lib/content/shop-copy';
import { BagControls } from './commerce/bag-controls';
import { MobileMenu } from './mobile-menu';
import { NavColumns } from './nav-columns';
import { ShopMenu } from './shop-menu';

const shopAllClass =
  'focus-ring inline-flex min-h-11 items-center text-base font-semibold text-espresso underline underline-offset-4 hover:text-forest-hover';

/**
 * Logo centred between the menu control (left) and the bag (right). Server-rendered from the private
 * cart cookie, so any page using it is dynamic and uncached. Desktop: "Shop" mega menu. Small
 * screens: the "Menu" disclosure lists the same columns.
 */
export async function SiteHeader() {
  const { cart } = await loadCart();
  const mode = commerceMode();

  return (
    <header className="relative border-b border-espresso/15 bg-ivory">
      <div className="page-gutter grid min-h-16 grid-cols-[1fr_auto_1fr] items-center gap-4 md:min-h-20">
        <div className="flex items-center justify-start">
          <ShopMenu label={nav.shop} panelLabel={nav.megaMenuLabel}>
            <div className="page-gutter py-8">
              <NavColumns
                columns={nav.columns}
                pendingSuffix={nav.pendingSuffix}
                idPrefix="mega"
                className="grid grid-cols-3 gap-x-10 gap-y-6"
              />
              <Link href="/#collection" className={`${shopAllClass} mt-4`}>
                {productPage.shopAll}
              </Link>
            </div>
          </ShopMenu>
          <MobileMenu>
            <NavColumns columns={nav.columns} pendingSuffix={nav.pendingSuffix} idPrefix="menu" className="grid gap-4 px-2 pb-2" />
            <Link href="/#collection" className={`${shopAllClass} mx-2`}>
              {productPage.shopAll}
            </Link>
          </MobileMenu>
        </div>
        <Link href="/" className="focus-ring inline-flex min-h-11 items-center font-display text-2xl tracking-[0.2em] text-forest uppercase">
          Crater
        </Link>
        <div className="flex items-center justify-end">
          <BagControls cart={cart} mode={mode} />
        </div>
      </div>
    </header>
  );
}
