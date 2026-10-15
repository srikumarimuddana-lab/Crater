import Link from 'next/link';
import { getPageContent } from '@/lib/content/cms';
import { ContentImage } from './content-image';
import { NewsletterForm } from './newsletter-form';
export async function SiteFooter({preview}:{preview?:string|string[]}) {
  const c=await getPageContent('global',preview);
  return <footer className="r-footer"><section className="r-newsletter">
    <ContentImage content={c} field="newsletterImage" alt="" loading="lazy"/>
    <div><span className="text-eyebrow">{c.newsletterEyebrow}</span><h2>{c.newsletterTitle}</h2><p>{c.newsletterText}</p></div>
    <NewsletterForm placeholder={c.newsletterPlaceholder} buttonLabel={c.newsletterButton}/>
  </section><div className="page-gutter"><div className="r-footer-top"><Link className="r-brand" href="/">{c.logo?<ContentImage content={c} field="logo" alt={`${c.brand} ${c.brandSecond}`} width={120} height={60}/>:<>{c.brand}<span>{c.brandSecond}</span></>}</Link><h2>{c.footerTitle}</h2><Link className="r-pill" href="/#collection">{c.footerShopLabel} ↗</Link></div>
    <p className="r-footer-description">{c.footerText}</p>{c.supportEmail?<p className="r-footer-support"><a href={`mailto:${encodeURIComponent(c.supportEmail)}`}>{c.supportEmail}</a></p>:null}
    <div className="r-footer-bottom"><span>© {new Date().getFullYear()} {c.brand} {c.brandSecond}</span><nav aria-label="Footer"><Link href="/about">{c.storyLabel}</Link><Link href="/contact">{c.contactLabel}</Link><Link href="/shipping-returns">{c.shippingLabel}</Link><Link href="/privacy">{c.privacyLabel}</Link><Link href="/terms">{c.termsLabel}</Link>{c.instagram?<a href={c.instagram} rel="noopener noreferrer">{c.instagramLabel} ↗</a>:null}</nav><a href="#main">{c.backToTopLabel} ↑</a></div>
  </div></footer>;
}
