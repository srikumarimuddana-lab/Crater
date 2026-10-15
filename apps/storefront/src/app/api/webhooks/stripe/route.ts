import { getServices } from '@/lib/commerce/services';
import { methodNotAllowed } from '@/lib/commerce/http';
import { attemptCommerceEffects } from '@/lib/operations/commerce';
import { reconcileStripeRefund } from '@/lib/finance';
import { logger } from '@/lib/commerce/log';

// pg and the Stripe SDK need the Node.js runtime.
export const runtime = 'nodejs';

/**
 * Stripe webhook endpoint. The body is read as raw text (never request.json()) because the
 * signature covers the exact bytes. Failures return a bare status with no detail.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 1024 * 1024) return new Response(null, { status: 413 });
  const rawBody = await request.text();
  if (rawBody.length > 1024 * 1024) return new Response(null, { status: 413 });
  const { checkout } = await getServices();
  const { status, body } = await checkout.handleStripeWebhook(rawBody, request.headers.get('stripe-signature'));
  if (status === 200) {
    // The service above has verified the raw-body signature before returning 200.
    const event = JSON.parse(rawBody);
    if (['refund.created','refund.updated','refund.failed'].includes(event.type)) {
      try { await reconcileStripeRefund(event.data.object.id, event.livemode ? 'live' : 'test'); }
      catch(e) { logger.error('refund callback pending reconciliation', e); return Response.json({error:'retry'},{status:503,headers:{'Cache-Control':'no-store'}}); }
    }
    await attemptCommerceEffects();
  }
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const GET = () => methodNotAllowed('POST');
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
