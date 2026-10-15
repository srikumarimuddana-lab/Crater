import {getBooking} from '@/lib/booking';
import Link from 'next/link';
import { loadCart } from '@/app/_lib/cart';
import { commerceMode } from '@/lib/commerce';
import { getPageContent } from '@/lib/content/cms';
import { MobileNavigation } from './mobile-navigation';
import { BagControls } from './commerce/bag-controls';
export async function SiteHeader({ preview }: { preview?: string | string[] }) {
  const [{ cart }, c, booking] = await Promise.all([loadCart(), getPageContent('global', preview), (await getBooking()).read()]);
  return <header className="r-header"><nav aria-label="Main navigation" className="r-desktop-nav"><Link href="/#collection" data-track="nav.shop">{c.shopLabel}</Link><Link href="/about">{c.storyLabel}</Link><Link href="/journal">{c.journalLabel}</Link>{booking.settings.enabled?<Link href="/book" data-track="booking.start">Book an appointment</Link>:null}</nav><Link href="/" className="r-brand" aria-label={`${c.brand} ${c.brandSecond} home`}>{c.logo ? <img src={c.logo} alt={`${c.brand} ${c.brandSecond}`} width={120} height={60} /> : <>{c.brand}<span>{c.brandSecond}</span></>}</Link><div className="r-header-actions"><Link href="/#collection" className="r-search-icon" aria-label="Search products">⌕</Link><BagControls cart={cart} mode={commerceMode()} /><MobileNavigation><nav aria-label="Mobile navigation"><Link href="/#collection">{c.shopLabel}</Link><Link href="/about">{c.storyLabel}</Link><Link href="/journal">{c.journalLabel}</Link>{booking.settings.enabled?<Link href="/book" data-track="booking.start">Book an appointment</Link>:null}<Link href="/contact">{c.contactLabel}</Link></nav></MobileNavigation></div></header>;
}
