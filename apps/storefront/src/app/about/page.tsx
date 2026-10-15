import { ContentPage } from '@/components/content-page';
import { getPageMetadata } from '@/lib/content/cms/metadata';
export async function generateMetadata() { return getPageMetadata('about'); }
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) { const {preview}=await searchParams;return <ContentPage contentKey="about" preview={preview}></ContentPage>; }
