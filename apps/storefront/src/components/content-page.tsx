import type { ReactNode } from 'react';
import { getPageContent } from '@/lib/content/cms';
import type { Content } from '@/lib/content/cms/schema';
import { paragraphs } from '@/lib/content/cms/presentation';
import { ContentImage } from './content-image';
import { PageShell } from './page-shell';

export function ContentPageBody({content,brand,headerExtra,children}:{content:Content;brand:string;headerExtra?:ReactNode;children?:ReactNode}) {
  return <article className="r-content-page"><div className="r-content-hero"><div><span className="text-eyebrow">{brand}</span><h1>{content.title}</h1>{content.intro?<p>{content.intro}</p>:null}{headerExtra}</div><ContentImage content={content} field="image" alt={content.imageAlt}/></div><div className="r-content-body">{paragraphs(content.body).map((text,i)=><p key={i}>{text}</p>)}</div>{children}</article>;
}
export async function ContentPage({contentKey,preview,children}:{contentKey:string;preview?:string|string[];children?:ReactNode}) {
  const [c,global]=await Promise.all([getPageContent(contentKey,preview),getPageContent('global',preview)]);
  return <PageShell preview={preview}>{preview===contentKey?<p role="status" className="r-draft-notice">Draft preview · visible only to signed-in editors</p>:null}<ContentPageBody content={c} brand={`${global.brand} ${global.brandSecond}`}>{children}</ContentPageBody></PageShell>;
}
