import type { ReactNode } from 'react';
import { getPageContent } from '@/lib/content/cms';
import { PageShell } from './page-shell';
export async function ContentPage({ contentKey, preview, children }: {
    contentKey: string;
    preview?: string | string[];
    children?: ReactNode;
}) {
    const c = await getPageContent(contentKey, preview);
    return <PageShell preview={preview}><article className="r-content-page">{preview === contentKey ? <p role="status" className="a-notice">Draft preview · visible only to signed-in editors</p> : null}<div className="r-content-hero"><div><span className="text-eyebrow">Craters Remedy</span><h1>{c.title}</h1>{c.intro ? <p>{c.intro}</p> : null}</div>{c.image ? <img src={c.image} alt={c.imageAlt}/> : null}</div><div className="r-content-body">{c.body.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}</div>{children}</article></PageShell>;
}
