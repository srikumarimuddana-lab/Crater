import { ContentPage } from '@/components/content-page';
import { getPublishedContent } from '@/lib/content/cms';
export async function generateMetadata() { const c = await getPublishedContent('terms'); return { title: `${c.seoTitle} — Craters Remedy`, description: c.seoDescription }; }
export default async function Page({ searchParams }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) { const { preview } = await searchParams; return <ContentPage contentKey="terms" preview={preview}></ContentPage>; }
