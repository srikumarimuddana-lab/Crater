import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import { ContentPageBody } from '@/components/content-page';
import { getPublishedContent, getPageContent } from '@/lib/content/cms';
import { getJournalArticle, getJournalArticles } from '@/lib/content/cms/journal';
type Props={params:Promise<{slug:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>};
export async function generateMetadata({params}:Props) {
  const [article,global]=await Promise.all([getJournalArticle((await params).slug),getPublishedContent('global')]);
  if(!article)notFound();
  return {title:`${article.content.seoTitle||article.content.title} — ${global.brand} ${global.brandSecond}`,description:article.content.seoDescription};
}
export default async function Article({params,searchParams}:Props) {
  const [{slug},{preview}]=await Promise.all([params,searchParams]);
  const [article,global,journal,articles]=await Promise.all([getJournalArticle(slug,preview),getPageContent('global',preview),getPageContent('journal',preview),getJournalArticles()]);
  if(!article)notFound();
  return <PageShell preview={preview}>
    {preview===article.key?<p className="r-draft-notice" role="status">Draft preview · visible only to signed-in editors</p>:null}
    <ContentPageBody content={article.content} brand={`${global.brand} ${global.brandSecond}`} headerExtra={<p className="r-article-byline">{article.content.category}{article.content.author?` · ${article.content.author}`:''}</p>}>
      <Link className="r-pill" href="/journal">← {journal.backLabel}</Link>
      <nav className="r-related-stories" aria-label="More journal stories"><h2>{journal.relatedTitle}</h2>{articles.filter(item=>item.key!==article.key).map(item=><Link key={item.key} href={item.href}>{item.content.title} ↗</Link>)}</nav>
    </ContentPageBody>
  </PageShell>;
}
