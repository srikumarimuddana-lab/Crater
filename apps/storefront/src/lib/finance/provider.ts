import 'server-only';
import Stripe from 'stripe';
import { readConfig, stripeUsable } from '@/lib/commerce/config';
import { resolveStripeEndpoint } from '@/lib/commerce/stripe-client';
import { FinanceError, type Mode, type Payment, type ProviderRefund, type RefundProvider } from './types';
export function stripeForMode(mode: Mode) {
    const config = readConfig();
    if (!stripeUsable(config) || !config.stripeSecretKey)
        throw new FinanceError('Stripe is not configured for refunds. Check the payment integration settings.');
    if (config.mode !== `stripe-${mode}`)
        throw new FinanceError('Stripe key mode does not match this payment.');
    return new Stripe(config.stripeSecretKey, { maxNetworkRetries: 0, timeout: 20000, ...(resolveStripeEndpoint(config.stripeSecretKey, process.env.STRIPE_API_BASE) ?? {}) });
}
async function intent(stripe: Stripe, p: Payment) {
    const session = await stripe.checkout.sessions.retrieve(p.sessionId);
    if (session.livemode !== (p.mode === 'live') || session.currency?.toUpperCase() !== p.currency || session.amount_total !== p.totalMinor || session.payment_status !== 'paid')
        throw new FinanceError('Stripe payment does not match the recorded paid order.');
    const id = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!id)
        throw new FinanceError('Stripe payment has no refundable payment intent.');
    return id;
}
function mapped(r: Stripe.Refund, p: Payment): ProviderRefund {
    if (r.currency.toUpperCase() !== p.currency)
        throw new FinanceError('Provider refund currency mismatch.');
    return { id: r.id, paymentId: p.id, requestKey: r.metadata?.crater_request, mode: p.mode, currency: p.currency, amountMinor: r.amount, status: r.status === 'succeeded' ? 'succeeded' : r.status === 'failed' || r.status === 'canceled' ? 'failed' : 'pending', occurredAt: new Date(r.created * 1000).toISOString() };
}
export const stripeRefundProvider: RefundProvider = {
    async create(p, r) { const stripe = stripeForMode(p.mode); const paymentIntent = await intent(stripe, p); return mapped(await stripe.refunds.create({ payment_intent: paymentIntent, amount: r.amountMinor, reason: 'requested_by_customer', metadata: { crater_request: r.id, crater_order: String(p.orderId) } }, { idempotencyKey: `crater:refund:${p.mode}:${r.id}` }), p); },
    async list(p) {
        const stripe = stripeForMode(p.mode), paymentIntent = await intent(stripe, p);
        const records: ProviderRefund[] = [];
        for await (const r of stripe.refunds.list({ payment_intent: paymentIntent, limit: 100 }))
            records.push(mapped(r, p));
        return records;
    },
};
