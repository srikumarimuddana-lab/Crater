import Link from 'next/link';
import { getPageContent } from '@/lib/content/cms';
import { NewsletterForm } from './newsletter-form';
export async function SiteFooter({ preview }: { preview?: string | string[] }) {
  const c = await getPageContent('global', preview);
  return <footer className="r-footer"><section className="r-newsletter">{c.newsletterImage ? <img src={c.newsletterImage} alt="" loading="lazy" /> : null}<div><span className="text-eyebrow">Keep in touch</span><h2>{c.newsletterTitle}</h2><p>{c.newsletterText}</p></div><NewsletterForm /></section><div className="page-gutter"><div className="r-footer-top"><Link className="r-brand" href="/">{c.brand}<span>{c.brandSecond}</span></Link><h2>{c.footerTitle}</h2><Link className="r-pill" href="/#collection">Discover the collection ↗</Link></div><p className="r-footer-description">{c.footerText}</p><div className="r-footer-bottom"><span>© {new Date().getFullYear()} {c.brand} {c.brandSecond}</span><nav aria-label="Footer"><Link href="/about">Our story</Link><Link href="/contact">Contact</Link><Link href="/shipping-returns">Shipping & returns</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link>{c.instagram ? <a href={c.instagram} rel="noopener noreferrer">Instagram ↗</a> : null}</nav><a href="#main">Back to top ↑</a></div></div></footer>;
}
