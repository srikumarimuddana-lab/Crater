import Link from 'next/link';
import { gate } from '../../_lib/gate';
import { PageHeader, Card } from '@/components/admin/ui';
import { contentSchemas } from '@/lib/content/cms/schema';
import { getCmsRepository } from '@/lib/content/cms';
export default async function ContentPage() {
    const g = await gate('content:read');
    if (!g.ok)
        return g.view;
    const repo = await getCmsRepository();
    const pages = await Promise.all(Object.entries(contentSchemas).map(async ([key, schema]) => ({ key, ...schema, doc: await repo.read(key) })));
    return <><PageHeader title="Pages & content" actions={<Link className="a-btn" href="/admin/media">Media library ↗</Link>}/><p className="a-muted">Edit copy and photography across your store. Save a draft, preview it, then publish.</p><div className="a-content-grid">{pages.map(p => <Card key={p.key} title={p.title}><p>{p.fields.length} editable fields · {p.doc.published ? 'Published' : 'Default content'}</p><p className="a-muted">{p.path} · Revision {p.doc.version}</p><Link className="a-btn" href={`/admin/content/${p.key}`}>Edit page ↗</Link></Card>)}</div></>;
}
