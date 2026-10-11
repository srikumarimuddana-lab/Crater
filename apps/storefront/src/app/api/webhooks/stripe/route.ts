import { getServices } from '@/lib/commerce/services';
import { methodNotAllowed } from '@/lib/commerce/http';

// pg and the Stripe SDK need the Node.js runtime.
export const runtime = 'nodejs';

/**
 * Stripe webhook endpoint. The body is read as raw text (never request.json()) because the
 * signature covers the exact bytes. Failures return a bare status with no detail.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const { checkout } = await getServices();
  const { status, body } = await checkout.handleStripeWebhook(rawBody, request.headers.get('stripe-signature'));
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const GET = () => methodNotAllowed('POST');
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
