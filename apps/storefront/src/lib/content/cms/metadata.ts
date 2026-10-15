import 'server-only';
import type { Metadata } from 'next';
import { getPublishedContent } from '@/lib/content/cms';

/** Metadata always reads published values, even on authenticated draft-preview URLs. */
export async function getPageMetadata(key:string):Promise<Metadata> {
  const [global,c]=await Promise.all([getPublishedContent('global'),getPublishedContent(key)]);
  const brand=`${global.brand} ${global.brandSecond}`.trim();
  const heading=c.seoTitle||c.title||brand;
  const title=key==='home'||key==='global'?heading:`${heading} — ${brand}`;
  return {title,description:c.seoDescription||global.seoDescription};
}
