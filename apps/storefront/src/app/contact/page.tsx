import { ContentPage } from '@/components/content-page';
import { getPageMetadata } from '@/lib/content/cms/metadata';
import { ContactForm } from '@/components/contact-form';
export async function generateMetadata() { return getPageMetadata('contact'); }
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) { const {preview}=await searchParams;return <ContentPage contentKey="contact" preview={preview}><ContactForm /></ContentPage>; }
