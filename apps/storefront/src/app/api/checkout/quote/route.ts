import { getCartId } from '@/lib/commerce/cart-cookie';
import { getCheckoutQuote } from '@/lib/commerce';
import { readConfig } from '@/lib/commerce/config';
export async function POST(request: Request) {
    const origin = readConfig().siteUrl;
    if (!origin || request.headers.get('origin') !== origin)
        return Response.json({ error: 'Not allowed.' }, { status: 403 });
    if (Number(request.headers.get('content-length') || 0) > 2048)
        return Response.json({ error: 'Request too large.' }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 2048)
        return Response.json({ error: 'Request too large.' }, { status: 413 });
    let data;
    try {
        data = JSON.parse(raw);
    }
    catch {
        return Response.json({ error: 'Invalid request.' }, { status: 400 });
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.discountCode !== 'string' || data.discountCode.length > 40)
        return Response.json({ error: 'Enter a valid discount code.' }, { status: 400 });
    const id = await getCartId();
    if (!id)
        return Response.json({ error: 'Your bag is empty.' }, { status: 400 });
    const result = await getCheckoutQuote(id, { discountCode: data.discountCode.trim().toUpperCase() });
    return Response.json(result, { status: result.ok ? 200 : 400, headers: { 'Cache-Control': 'private, no-store' } });
}
