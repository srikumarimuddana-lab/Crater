import { createHash } from 'node:crypto';
import type Stripe from 'stripe';
import { isCartDead } from './cart-logic';
import { readConfig, stripeUsable, type CommerceConfig } from './config';
import { isCartId, isCheckoutId, isStripeSessionId, newCheckoutId } from './ids';
import { logger, redactSession, ref } from './log';
import { minorToAmount, multiplyMinor, sumMinor, toMoney } from './money';
import type { CheckoutLineSnapshot, CheckoutRecord, CommerceRepository, OrderRecord } from './records';
import { loadIndex } from './storefront';
import { isStripeCheckoutUrl, type StripeClient, type StripeFactory } from './stripe-client';
import type { CheckoutSessionResult, ID, Order } from './types';

export type CheckoutDeps = {
  repo: CommerceRepository;
  stripe: StripeFactory;
  config?: () => CommerceConfig;
  now?: () => Date;
};

export type CheckoutResult = { status: 'paid' | 'processing' | 'unpaid' | 'not_found'; order: Order | null };

/** A reusable checkout (and so its Stripe idempotency key) lives at most this long. */
const REUSE_WINDOW_MS = 20 * 60 * 60 * 1000;
const CHECKOUT_FAIL = (code: Extract<CheckoutSessionResult, { ok: false }>['code'], message: string): CheckoutSessionResult => ({ ok: false, code, message });

export const cartRefOf = (cartId: ID): string => createHash('sha256').update(`crater-cart-ref:${cartId}`).digest('hex').slice(0, 32);

export function orderFromRecord(o: OrderRecord): Order {
  return {
    id: `gid://crater/Order/${o.id}`,
    name: `#${o.number}`,
    email: o.email,
    processedAt: o.processedAt,
    financialStatus: o.financialStatus,
    currencyCode: 'CAD',
    subtotalPrice: toMoney(o.subtotalMinor),
    totalShippingPrice: toMoney(o.shippingMinor),
    totalTax: toMoney(o.taxMinor),
    totalPrice: toMoney(o.totalMinor),
    lineItems: o.lines.map((l) => ({
      title: l.title,
      variantTitle: l.variantTitle,
      sku: l.sku,
      quantity: l.quantity,
      originalUnitPrice: toMoney(l.unitMinor),
      originalTotalPrice: toMoney(multiplyMinor(l.unitMinor, l.quantity)),
      variantId: l.variantId,
    })),
    paymentReference: o.stripeSessionId,
  };
}

export function createCheckoutService(deps: CheckoutDeps) {
  const { repo } = deps;
  const config = deps.config ?? (() => readConfig());
  const now = deps.now ?? (() => new Date());

  async function createCheckoutSession(cartId: ID): Promise<CheckoutSessionResult> {
    const cfg = config();
    // Fixture mode never reaches Stripe, whatever else is configured.
    if (cfg.mode === 'fixture') {
      return CHECKOUT_FAIL('FIXTURE_MODE', 'Checkout is not available in preview mode. No payment can be taken.');
    }
    if (!stripeUsable(cfg)) {
      return CHECKOUT_FAIL('PAYMENT_PROVIDER_UNAVAILABLE', 'Checkout is temporarily unavailable.');
    }
    if (cfg.mode === 'stripe-live' && !cfg.webhookSecret) {
      return CHECKOUT_FAIL('PAYMENT_PROVIDER_UNAVAILABLE', 'Checkout is temporarily unavailable.');
    }
    if (!cfg.siteUrl) {
      logger.warn('checkout refused: NEXT_PUBLIC_SITE_URL is missing or invalid');
      return CHECKOUT_FAIL('PAYMENT_PROVIDER_UNAVAILABLE', 'Checkout is temporarily unavailable.');
    }

    try {
      if (!isCartId(cartId)) return CHECKOUT_FAIL('EMPTY_CART', 'Your cart is empty.');
      const at = now();
      const record = await repo.getCart(cartId);
      if (!record || isCartDead(record, at) || record.lines.length === 0) {
        return CHECKOUT_FAIL('EMPTY_CART', 'Your cart is empty.');
      }
      const index = await loadIndex(repo);

      // Re-validate and reprice from the authoritative catalog.
      const lines: CheckoutLineSnapshot[] = [];
      for (const line of record.lines) {
        const found = index.variants.get(line.variantId);
        const stockOk = found && (found.variant.quantity === null || (found.variant.quantity > 0 && line.quantity <= found.variant.quantity));
        if (!found || !stockOk) {
          return CHECKOUT_FAIL('CART_INVALID', 'Some items in your cart are no longer available in the requested quantity. Review your cart and try again.');
        }
        lines.push({
          variantId: found.variant.id,
          title: found.product.title,
          variantTitle: found.variant.title,
          sku: found.variant.sku,
          quantity: line.quantity,
          unitMinor: found.variant.priceMinor,
        });
      }
      if (lines.length === 0) return CHECKOUT_FAIL('EMPTY_CART', 'Your cart is empty.');
      const subtotalMinor = sumMinor(lines.map((l) => multiplyMinor(l.unitMinor, l.quantity)));
      if (subtotalMinor <= 0) return CHECKOUT_FAIL('CART_INVALID', 'Your cart total is not valid.');

      const fingerprint = createHash('sha256')
        .update(JSON.stringify([lines.map((l) => [l.variantId, l.quantity, l.unitMinor]), record.buyerEmail, 'CAD']))
        .digest('hex');

      // Persist the frozen snapshot BEFORE calling Stripe. A repeat click on an unchanged
      // cart reuses the snapshot and therefore the idempotency key, so Stripe returns the
      // same session instead of creating a second one.
      let checkout = await repo.findReusableCheckout(cartId, fingerprint, new Date(at.getTime() - REUSE_WINDOW_MS));
      if (!checkout) {
        const iso = at.toISOString();
        const fresh: CheckoutRecord = {
          id: newCheckoutId(),
          cartId,
          cartRef: cartRefOf(cartId),
          status: 'created',
          stripeSessionId: null,
          fingerprint,
          subtotalMinor,
          buyerEmail: record.buyerEmail,
          lines,
          createdAt: iso,
          updatedAt: iso,
        };
        await repo.createCheckout(fresh);
        checkout = fresh;
      }

      const stripe = deps.stripe(cfg.stripeSecretKey as string);
      const params: Stripe.Checkout.SessionCreateParams = {
        mode: 'payment',
        client_reference_id: checkout.id,
        // Prices come from OUR catalog snapshot, never from the browser.
        line_items: checkout.lines.map((l) => ({
          quantity: l.quantity,
          price_data: {
            currency: 'cad',
            unit_amount: l.unitMinor,
            product_data: { name: `${l.title} — ${l.variantTitle}`, metadata: { variant_id: l.variantId } },
          },
        })),
        metadata: { cart_id: checkout.cartRef, checkout_id: checkout.id },
        shipping_address_collection: { allowed_countries: ['CA'] },
        phone_number_collection: { enabled: false },
        ...(checkout.buyerEmail ? { customer_email: checkout.buyerEmail } : {}),
        success_url: `${cfg.siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${cfg.siteUrl}/cart?checkout=cancelled`,
        // TODO(owner decision): Stripe Tax (paid add-on) is intentionally NOT enabled, and no
        // shipping_options are configured, so no tax or shipping is charged. Do not invent rates.
      };
      const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `crater-${checkout.id}` });

      if (!isStripeCheckoutUrl(session.url)) {
        logger.warn('checkout refused: Stripe returned a non-checkout.stripe.com url', { checkout: ref(checkout.id) });
        return CHECKOUT_FAIL('PAYMENT_PROVIDER_UNAVAILABLE', 'Checkout is temporarily unavailable.');
      }
      await repo.attachSession(checkout.id, session.id, at.toISOString());
      return { ok: true, redirectUrl: session.url };
    } catch (error) {
      logger.error('checkout session creation failed', error);
      return CHECKOUT_FAIL('PAYMENT_PROVIDER_UNAVAILABLE', 'Checkout is temporarily unavailable. Please try again.');
    }
  }

  async function getCheckoutResult(sessionId: string): Promise<CheckoutResult> {
    if (!isStripeSessionId(sessionId)) return { status: 'not_found', order: null };
    const checkout = await repo.getCheckoutBySessionId(sessionId);
    if (!checkout) return { status: 'not_found', order: null };
    // Only the order tied to THIS session id is ever returned.
    const order = await repo.getOrderBySessionId(sessionId);
    if (order) {
      return order.financialStatus === 'PAID'
        ? { status: 'paid', order: orderFromRecord(order) }
        : { status: 'processing', order: null };
    }
    if (checkout.status === 'expired' || checkout.status === 'payment_failed') return { status: 'unpaid', order: null };
    if (checkout.status === 'awaiting_payment') return { status: 'processing', order: null };
    // Session created but no order yet: ask Stripe whether the buyer actually paid.
    const cfg = config();
    if (stripeUsable(cfg)) {
      try {
        const s = await deps.stripe(cfg.stripeSecretKey as string).checkout.sessions.retrieve(sessionId);
        return { status: s.payment_status === 'paid' ? 'processing' : 'unpaid', order: null };
      } catch (error) {
        logger.error('session lookup failed', error, { session: redactSession(sessionId) });
      }
    }
    return { status: 'processing', order: null };
  }

  async function handleStripeWebhook(rawBody: string, signature: string | null): Promise<{ status: number; body: Record<string, unknown> }> {
    const cfg = config();
    if (!stripeUsable(cfg) || !cfg.webhookSecret) return { status: 503, body: { error: 'unavailable' } };
    if (!signature) return { status: 400, body: { error: 'invalid_request' } };

    let event: Stripe.Event;
    try {
      // The raw, unparsed body is required: the signature covers the exact bytes Stripe sent.
      event = (deps.stripe(cfg.stripeSecretKey as string) as StripeClient).webhooks.constructEvent(rawBody, signature, cfg.webhookSecret);
    } catch {
      return { status: 400, body: { error: 'invalid_request' } };
    }

    try {
      const at = now().toISOString();
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.payment_status !== 'paid') {
            // Delayed payment method: the money has not arrived yet. async_payment_succeeded follows.
            const checkoutId = session.metadata?.checkout_id;
            if (isCheckoutId(checkoutId) && session.payment_status === 'unpaid') {
              await repo.recordCheckoutStatus({ eventId: event.id, eventType: event.type, checkoutId, status: 'awaiting_payment', now: at });
            }
            return { status: 200, body: { received: true } };
          }
          return { status: 200, body: { received: true, ...(await fulfil(event, session, at)) } };
        }
        case 'checkout.session.async_payment_failed':
        case 'checkout.session.expired': {
          const session = event.data.object as Stripe.Checkout.Session;
          const checkoutId = session.metadata?.checkout_id;
          if (isCheckoutId(checkoutId)) {
            await repo.recordCheckoutStatus({
              eventId: event.id,
              eventType: event.type,
              checkoutId,
              status: event.type === 'checkout.session.expired' ? 'expired' : 'payment_failed',
              now: at,
            });
          }
          return { status: 200, body: { received: true } };
        }
        default:
          return { status: 200, body: { received: true } };
      }
    } catch (error) {
      // 5xx makes Stripe retry later; the event id dedupe makes that safe.
      logger.error('webhook processing failed', error, { event: ref(event.id) });
      return { status: 500, body: { error: 'processing_failed' } };
    }
  }

  async function fulfil(event: Stripe.Event, session: Stripe.Checkout.Session, at: string): Promise<Record<string, unknown>> {
    const checkoutId = session.metadata?.checkout_id;
    const checkout = isCheckoutId(checkoutId) ? await repo.getCheckout(checkoutId) : await repo.getCheckoutBySessionId(session.id);
    if (!checkout) {
      logger.warn('paid session has no matching checkout', { event: ref(event.id), session: redactSession(session.id) });
      return { handled: false };
    }
    // Compare Stripe's numbers with our frozen snapshot; trust neither on disagreement.
    const flags: string[] = [];
    if (session.amount_subtotal !== checkout.subtotalMinor) flags.push('AMOUNT_MISMATCH');
    if ((session.currency ?? '').toLowerCase() !== 'cad') flags.push('CURRENCY_MISMATCH');
    if (session.metadata?.cart_id !== checkout.cartRef) flags.push('REFERENCE_MISMATCH');
    const shippingMinor = session.total_details?.amount_shipping ?? 0;
    const taxMinor = session.total_details?.amount_tax ?? 0;
    const totalMinor = session.amount_total ?? checkout.subtotalMinor;
    if (totalMinor !== checkout.subtotalMinor + shippingMinor + taxMinor - (session.total_details?.amount_discount ?? 0)) {
      flags.push('TOTAL_MISMATCH');
    }
    const outcome = await repo.completeCheckout({
      eventId: event.id,
      eventType: event.type,
      checkoutId: checkout.id,
      sessionId: session.id,
      email: session.customer_details?.email ?? session.customer_email ?? null,
      financialStatus: flags.length ? 'PENDING' : 'PAID',
      flags,
      shippingMinor,
      taxMinor,
      totalMinor,
      now: at,
    });
    if (outcome.kind === 'created') {
      if (outcome.order.reviewFlags.length) {
        logger.warn('order created and flagged for review', {
          order: outcome.order.number,
          flags: outcome.order.reviewFlags,
          ...(outcome.order.reviewFlags.includes('AMOUNT_MISMATCH')
            ? { expected: minorToAmount(checkout.subtotalMinor), received: minorToAmount(session.amount_subtotal ?? 0) }
            : {}),
          session: redactSession(session.id),
        });
      }
      return { handled: true, order: outcome.order.number };
    }
    if (outcome.kind === 'session_mismatch' || outcome.kind === 'unknown_checkout') {
      logger.warn('paid session rejected', { reason: outcome.kind, session: redactSession(session.id) });
    }
    return { handled: false, reason: outcome.kind };
  }

  return { createCheckoutSession, getCheckoutResult, handleStripeWebhook };
}

export type CheckoutService = ReturnType<typeof createCheckoutService>;
