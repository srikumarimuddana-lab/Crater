import { ContentPage } from '@/components/content-page';
import { getPageMetadata } from '@/lib/content/cms/metadata';
export async function generateMetadata() { return getPageMetadata('shipping-returns'); }
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) { const {preview}=await searchParams;return <ContentPage contentKey="shipping-returns" preview={preview}></ContentPage>; }
