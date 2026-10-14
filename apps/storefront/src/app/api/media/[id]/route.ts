import { getMediaRepository } from '@/lib/media';
import { getAdminSession } from '@/lib/admin';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))
        return new Response(null, { status: 404 });
    const asset = await (await getMediaRepository()).get(id);
    if (!asset || (!asset.published && !(await getAdminSession())?.capabilities.includes('products:write')))
        return new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
    return new Response(new Uint8Array(asset.content), { headers: { 'Content-Type': asset.mime, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cache-Control': asset.published ? 'public, max-age=31536000, immutable' : 'private, no-store' } });
}
