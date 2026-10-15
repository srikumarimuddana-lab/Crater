import 'server-only';
import { requireAdmin } from '@/lib/admin';
import { getCmsRepository } from '@/lib/content/cms';
import { defaultsFor, type Content } from './schema';
import { JOURNAL_STORIES } from './journal-model';

export async function getJournalArticle(slug: string, preview?: string | string[]) {
  const story=JOURNAL_STORIES.find(story=>story.slug===slug);
  if (!story) return null;
  const previewHome=preview==='home';
  const previewArticle=preview===story.key;
  if (previewHome || previewArticle) await requireAdmin('content:write');
  const repo=await getCmsRepository();
  const [article,home]=await Promise.all([repo.read(story.key),repo.read('home')]);
  const legacy={...defaultsFor('home'),...((previewHome||previewArticle) ? home.draft??home.published : home.published)};
  const i=story.legacyIndex;
  const content:Content={...defaultsFor(story.key),title:legacy[`article${i}Title`],body:legacy[`article${i}Body`],image:legacy[`article${i}Image`],imageAlt:legacy[`article${i}Title`],imagePosition:legacy[`article${i}ImagePosition`]??'50 50',seoTitle:legacy[`article${i}Title`],seoDescription:legacy[`article${i}Body`].slice(0,160),...(previewArticle ? article.draft??article.published : article.published)};
  return {...story,href:`/journal/${story.slug}`,content};
}
export async function getJournalArticles(preview?: string | string[]) {
  return Promise.all(JOURNAL_STORIES.map(async story=>(await getJournalArticle(story.slug,preview))!));
}
