import Link from 'next/link';
import { ContentPage } from '@/components/content-page';
import { ContentImage } from '@/components/content-image';
import { getPageContent } from '@/lib/content/cms';
import { getJournalArticles } from '@/lib/content/cms/journal';
import { getPageMetadata } from '@/lib/content/cms/metadata';
export async function generateMetadata(){return getPageMetadata('journal');}
export default async function Journal({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {preview}=await searchParams;
  const [articles,c]=await Promise.all([getJournalArticles(preview),getPageContent('journal',preview)]);
  return <ContentPage contentKey="journal" preview={preview}><div className="r-article-list">{articles.map(article=><article className="r-journal-article" id={`article-${article.legacyIndex}`} key={article.key}><Link href={article.href} aria-label={`${c.readLabel}: ${article.content.title}`} tabIndex={-1} aria-hidden="true"><ContentImage content={article.content} field="image" alt="" loading="lazy"/></Link><div><span className="text-eyebrow">{article.content.category}</span><h2><Link href={article.href}>{article.content.title}</Link></h2><p>{article.content.intro||article.content.body.slice(0,180)}</p><Link className="r-pill" href={article.href}>{c.readLabel} ↗</Link></div></article>)}</div></ContentPage>;
}
