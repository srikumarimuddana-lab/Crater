import { ContentPage } from '@/components/content-page';
import { getPageMetadata } from '@/lib/content/cms/metadata';
export async function generateMetadata() { return getPageMetadata('ingredients-sourcing'); }
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) { const {preview}=await searchParams;return <ContentPage contentKey="ingredients-sourcing" preview={preview}></ContentPage>; }
