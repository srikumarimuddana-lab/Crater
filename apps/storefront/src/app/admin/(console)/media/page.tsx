import { gate } from '../../_lib/gate';
import { PageHeader, Card } from '@/components/admin/ui';
import { ActionForm, Field, Submit } from '@/components/admin/form';
import { getMediaRepository } from '@/lib/media';
import { uploadMediaAction, archiveMediaAction } from '@/app/admin/_actions/content';
export default async function MediaPage() {
    const g = await gate('products:write');
    if (!g.ok)
        return g.view;
    const assets = await (await getMediaRepository()).list();
    return <><PageHeader title="Media library"/><Card title="Upload photography"><ActionForm action={uploadMediaAction}><label className="a-field">Image<input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/avif" required/></label><Field name="alt" label="Image description" hint="Describe the image for customers using a screen reader." maxLength={500}/><p className="a-muted">JPEG, PNG, WebP or AVIF · up to 10 MB. Images are optimized and kept private until published.</p><Submit>Upload image</Submit></ActionForm></Card><div className="a-content-grid">{assets.map(a => <Card key={a.id} title={a.name}><img src={`/api/media/${a.id}`} alt={a.alt} width={320} height={220} style={{ width: '100%', height: 220, objectFit: 'contain', background: '#f7f8f3' }}/><p>{a.width} × {a.height} · {a.published ? 'Published' : 'Private draft'}</p><p>{a.alt || 'No description'}</p><label className="a-field">Image path<input readOnly value={`/api/media/${a.id}`} aria-label={`Path for ${a.name}`}/></label>{!a.published ? <ActionForm action={archiveMediaAction}><input type="hidden" name="id" value={a.id}/><Submit primary={false}>Archive unused image</Submit></ActionForm> : null}</Card>)}</div>{!assets.length ? <p>No uploads yet. The original design photography is available in each page editor.</p> : null}</>;
}
