import Link from 'next/link';
import { notFound } from 'next/navigation';
import { gate } from '../../../_lib/gate';
import { PageHeader, Card } from '@/components/admin/ui';
import { ActionForm, Field, Submit } from '@/components/admin/form';
import { contentSchemas, defaultsFor } from '@/lib/content/cms/schema';
import { getCmsRepository } from '@/lib/content/cms';
import { getMediaRepository } from '@/lib/media';
import { saveContentAction, publishContentAction, restoreContentAction } from '@/app/admin/_actions/content';
export default async function ContentEditor({ params }: {
    params: Promise<{
        key: string;
    }>;
}) {
    const g = await gate('content:write');
    if (!g.ok)
        return g.view;
    const { key } = await params;
    const schema = contentSchemas[key];
    if (!schema)
        notFound();
    const repo = await getCmsRepository();
    const [doc, history, media] = await Promise.all([repo.read(key), repo.history(key), (await getMediaRepository()).list()]);
    const data = { ...defaultsFor(key), ...(doc.draft ?? doc.published) };
    return <><PageHeader title={schema.title} breadcrumb={[{ label: 'Content', href: '/admin/content' }, { label: schema.title }]} actions={<><Link className="a-btn" href={`${schema.path}?preview=${key}`} target="_blank">Preview draft ↗</Link><Link className="a-btn" href="/admin/media">Upload image</Link></>}/>
    <div className="a-content-editor"><Card title="Page fields"><ActionForm action={saveContentAction} key={doc.version}><input type="hidden" name="key" value={key}/><input type="hidden" name="version" value={doc.version}/>{schema.fields.map(f => f.type === 'image' ? <div key={f.key} className="a-media-field"><Field name={f.key} label={f.label} as="select" defaultValue={data[f.key]} options={[{ value: '', label: 'No image' }, ...(f.value ? [{ value: f.value, label: 'Original design image' }] : []), ...(data[f.key] && data[f.key] !== f.value && !media.some(m => `/api/media/${m.id}` === data[f.key]) ? [{ value: data[f.key], label: 'Current image' }] : []), ...media.map(m => ({ value: `/api/media/${m.id}`, label: m.name }))]}/>{data[f.key] ? <img src={data[f.key]} alt={data[`${f.key}Alt`] || f.label} width={120} height={90}/> : null}</div> : <Field key={f.key} name={f.key} label={f.label} as={f.type === 'textarea' ? 'textarea' : 'input'} defaultValue={data[f.key]} maxLength={f.type === 'textarea' ? 20000 : 500}/>)}<Submit>Save draft</Submit></ActionForm></Card>
    <div><Card title="Publish"><p>Revision {doc.version}. {doc.published ? 'A published version is live.' : 'The store currently uses the original design content.'}</p><ActionForm action={publishContentAction}><input type="hidden" name="key" value={key}/><input type="hidden" name="version" value={doc.version}/><Submit>Publish saved draft</Submit></ActionForm></Card><Card title="Revision history">{history.length ? history.map(r => <ActionForm key={r.version} action={restoreContentAction}><input type="hidden" name="key" value={key}/><input type="hidden" name="version" value={doc.version}/><input type="hidden" name="revision" value={r.version}/><p>#{r.version} · {r.action} · {new Date(r.at).toLocaleString('en-CA', { timeZone: g.tz })}</p><Submit primary={false}>Restore as draft</Submit></ActionForm>) : <p>No changes yet.</p>}</Card></div></div></>;
}
