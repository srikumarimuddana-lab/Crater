import { createHash, timingSafeEqual } from 'node:crypto';
import type Stripe from 'stripe';
import { isCartDead, lineHasPriceChange } from './cart-logic';
import { readConfig, stripeUsable, type CommerceConfig } from './config';
import { isCartId, isCheckoutId, isStripeSessionId, newCheckoutId } from './ids';
import { logger, redactSession, ref } from './log';
import { minorToAmount, multiplyMinor, sumMinor, toMoney } from './money';
import { TAX_RATES, normaliseProvince, sumTaxMinor, taxLinesFor, PROVINCE_TAX_KEYS, type TaxKey } from './tax';
import { TAX_KEY_METADATA, resolveTaxRateIds } from './tax-rates';
import type { CheckoutLineSnapshot, CheckoutRecord, CommerceRepository, OrderRecord, PostalAddressRecord, WebhookOutcome } from './records';
import { loadIndex } from './storefront';
import { isStripeCheckoutUrl, type StripeClient, type StripeFactory } from './stripe-client';
import type { CheckoutSessionResult, ID, Order, ProvinceCode, TaxLine } from './types';

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

const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';

/**
 * The shipping address Stripe collected. In the installed SDK's API version (2026-08-26.dahlia) it lives
 * at `collected_information.shipping_details` (older versions had `shipping_details` on the session).
 * Null when Stripe returned no usable address; the order is still created and staff look in Stripe.
 */
export function shippingAddressFromSession(session: Stripe.Checkout.Session): PostalAddressRecord | null {
  const details = session.collected_information?.shipping_details;
  const a = details?.address;
  if (!details || !a) return null;
  const line1 = clean(a.line1, 200);
  const city = clean(a.city, 100);
  const country = clean(a.country, 2).toUpperCase();
  if (!line1 || !city || !country) return null;
  return {
    name: clean(details.name, 200),
    line1,
    line2: clean(a.line2, 200) || null,
    city,
    province: clean(a.state, 100),
    postalCode: clean(a.postal_code, 20),
    country,
  };
}

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

/** Tax rate ids are looked up once per process (and secret key) and re-checked after this long or after any Stripe failure. */
const TAX_RATE_CACHE_MS = 10 * 60 * 1000;
/** Allowed rounding drift between our per-line tax and Stripe's: one cent per line item. */
const taxToleranceMinor = (lineCount: number): number => lineCount;

/** Per-rate tax Stripe charged, from `total_details.breakdown.taxes`. Rates are identified by their crater_tax_key metadata. */
export function chargedTaxLines(taxes: Stripe.Checkout.Session.TotalDetails.Breakdown.Tax[]): TaxLine[] {
  const byKey = new Map<string, TaxLine>();
  for (const t of taxes) {
    const tagged = t.rate?.metadata?.[TAX_KEY_METADATA];
    const known = tagged && Object.hasOwn(TAX_RATES, tagged) ? TAX_RATES[tagged as TaxKey] : null;
    const key = known ? known.key : `STRIPE_${String(t.rate?.id ?? 'unknown').slice(0, 40)}`;
    const prior = byKey.get(key);
    const minor = (prior ? Math.round(Number(prior.amount.amount) * 100) : 0) + t.amount;
    byKey.set(key, {
      key,
      title: known ? known.title : String(t.rate?.display_name ?? 'Tax').slice(0, 60),
      ratePercent: known ? known.ratePercent : String(t.rate?.percentage ?? ''),
      amount: toMoney(minor),
    });
  }
  return [...byKey.values()];
}

/** Tax flags: empty when the order matches the checkout snapshot (province and amounts within the per-line tolerance). */
export function taxFlags(
  checkout: Pick<CheckoutRecord, 'province' | 'taxLines' | 'lines'>,
  charged: TaxLine[],
  chargedTotalMinor: number,
  shippingProvince: ProvinceCode | null,
): string[] {
  if (!checkout.province) return []; // snapshot predates province tax: nothing to compare
  const flags: string[] = [];
  if (shippingProvince !== checkout.province) flags.push('TAX_PROVINCE_MISMATCH');
  const tolerance = taxToleranceMinor(checkout.lines.length);
  const minor = (l: TaxLine) => Math.round(Number(l.amount.amount) * 100);
  const expected = new Map(checkout.taxLines.map((l) => [l.key, minor(l)]));
  const got = new Map(charged.map((l) => [l.key, minor(l)]));
  const keys = new Set([...expected.keys(), ...got.keys()]);
  let off = Math.abs(chargedTotalMinor - sumTaxMinor(checkout.taxLines)) > tolerance;
  for (const k of keys) if (Math.abs((got.get(k) ?? 0) - (expected.get(k) ?? 0)) > tolerance) off = true;
  if (sumTaxMinor(charged) !== chargedTotalMinor) off = true; // breakdown must add up to Stripe's own total
  if (off) flags.push('TAX_AMOUNT_MISMATCH');
  return flags;
}

export function createCheckoutService(deps: CheckoutDeps) {
  const { repo } = deps;
  let rateCache: { at: number; secret: string; ids: Map<TaxKey, string> } | null = null;
  const config = deps.config ?? (() => readConfig());
  const now = deps.now ?? (() => new Date());

  /** Tax Rate ids for a province, looked up by metadata once per process (re-checked every 10 minutes). Null if unavailable. */
  async function taxRateIds(stripe: StripeClient, secret: string, province: ProvinceCode, nowMs: number): Promise<string[] | null> {
    const keys = PROVINCE_TAX_KEYS[province];
    const fresh = rateCache && rateCache.secret === secret && nowMs - rateCache.at < TAX_RATE_CACHE_MS ? rateCache : null;
    if (fresh && keys.every((k) => fresh.ids.has(k))) return keys.map((k) => fresh.ids.get(k) as string);
    try {
      const ids = await resolveTaxRateIds(stripe, TAX_RATES, keys);
      rateCache = { at: nowMs, secret, ids: new Map([...(fresh?.ids ?? []), ...ids]) };
      return keys.map((k) => ids.get(k) as string);
    } catch (error) {
      rateCache = null;
      logger.error('stripe tax rates unavailable (run "npm run stripe:tax-rates")', error);
      return null;
    }
  }

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
      // The shopper must have seen the current prices. Checked before any snapshot or Stripe call.
      if (record.lines.some((l) => lineHasPriceChange(l, index))) {
        return CHECKOUT_FAIL('PRICE_CHANGED', 'A price in your cart changed since you added it. Review your cart and try again.');
      }
      const lineTotals = lines.map((l) => multiplyMinor(l.unitMinor, l.quantity));
      const subtotalMinor = sumMinor(lineTotals);
      if (subtotalMinor <= 0) return CHECKOUT_FAIL('CART_INVALID', 'Your cart total is not valid.');
      // Tax depends on the ship-to province the shopper chose in the bag. Checked after stock and price.
      const province = record.buyerProvince ?? null;
      if (!province) return CHECKOUT_FAIL('PROVINCE_REQUIRED', 'Choose the province you are shipping to before checkout.');
      const expectedTax = taxLinesFor(province, lineTotals);
      const stripe = deps.stripe(cfg.stripeSecretKey as string);
      const rateIds = await taxRateIds(stripe, cfg.stripeSecretKey as string, province, at.getTime());
      if (!rateIds) return CHECKOUT_FAIL('PAYMENT_PROVIDER_UNAVAILABLE', 'Checkout is temporarily unavailable.');

      const fingerprint = createHash('sha256')
        .update(JSON.stringify([lines.map((l) => [l.variantId, l.quantity, l.unitMinor]), record.buyerEmail, 'CAD', province]))
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
          province,
          taxLines: expectedTax,
          createdAt: iso,
          updatedAt: iso,
        };
        await repo.createCheckout(fresh);
        checkout = fresh;
      }

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
          // Fixed, exclusive tax rates for the chosen province: Stripe charges exactly what the bag showed.
          tax_rates: rateIds,
        })),
        metadata: { cart_id: checkout.cartRef, checkout_id: checkout.id, tax_province: province },
        shipping_address_collection: { allowed_countries: ['CA'] },
        phone_number_collection: { enabled: false },
        ...(checkout.buyerEmail ? { customer_email: checkout.buyerEmail } : {}),
        // Lands on /api/checkout/complete, which clears the shopper's cart cookie when the session is theirs
        // and then redirects to /checkout/success.
        success_url: `${cfg.siteUrl}/api/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${cfg.siteUrl}/cart?checkout=cancelled`,
        // Tax: fixed Tax Rates per line (docs/tax.md), not Stripe Tax. No shipping_options are configured yet
        // (owner decision pending), so no shipping is charged. Do not invent rates.
      };
      const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `crater-${checkout.id}` });

      if (!isStripeCheckoutUrl(session.url)) {
        logger.warn('checkout refused: Stripe returned a non-checkout.stripe.com url', { checkout: ref(checkout.id) });
        return CHECKOUT_FAIL('PAYMENT_PROVIDER_UNAVAILABLE', 'Checkout is temporarily unavailable.');
      }
      await repo.attachSession(checkout.id, session.id, at.toISOString());
      return { ok: true, redirectUrl: session.url };
    } catch (error) {
      rateCache = null; // a stale or archived rate id must not survive a Stripe failure
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

  /**
   * True only when Stripe confirms that this finished Checkout Session was started from THIS cart:
   * the session's metadata carries the one-way digest of the cart id (never the id), and it must equal
   * the digest of the cookie cart. Any doubt (malformed ids, fixture mode, an open or unfinished session,
   * a Stripe error, a different cart) answers false, so callers keep the cookie.
   */
  async function sessionBelongsToCart(sessionId: string, cartId: ID): Promise<boolean> {
    if (!isStripeSessionId(sessionId) || !isCartId(cartId)) return false;
    const cfg = config();
    if (!stripeUsable(cfg)) return false;
    try {
      const s = await deps.stripe(cfg.stripeSecretKey as string).checkout.sessions.retrieve(sessionId);
      if (s.status !== 'complete') return false;
      const theirs = s.metadata?.cart_id;
      if (typeof theirs !== 'string') return false;
      const a = Buffer.from(theirs);
      const b = Buffer.from(cartRefOf(cartId));
      return a.length === b.length && timingSafeEqual(a, b);
    } catch (error) {
      logger.error('session lookup for cart reconciliation failed', error, { session: redactSession(sessionId) });
      return false;
    }
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

    const at = now().toISOString();
    // Outcome log for the admin event log. Best effort: it must never change the HTTP answer.
    const track = async (outcome: WebhookOutcome) => {
      try {
        await repo.recordWebhookEvent({ eventId: event.id, eventType: event.type, outcome, at });
      } catch (error) {
        logger.error('webhook outcome log failed', error, { event: ref(event.id) });
      }
    };
    try {
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.payment_status !== 'paid') {
            // Delayed payment method: the money has not arrived yet. async_payment_succeeded follows.
            const checkoutId = session.metadata?.checkout_id;
            let outcome: WebhookOutcome = 'REJECTED';
            if (isCheckoutId(checkoutId) && session.payment_status === 'unpaid') {
              const r = await repo.recordCheckoutStatus({ eventId: event.id, eventType: event.type, checkoutId, status: 'awaiting_payment', now: at });
              outcome = r === 'duplicate_event' ? 'DUPLICATE' : 'PROCESSED';
            }
            await track(outcome);
            return { status: 200, body: { received: true } };
          }
          const done = await fulfil(event, session, at);
          await track(done.outcome);
          return { status: 200, body: { received: true, ...done.body } };
        }
        case 'checkout.session.async_payment_failed':
        case 'checkout.session.expired': {
          const session = event.data.object as Stripe.Checkout.Session;
          const checkoutId = session.metadata?.checkout_id;
          let outcome: WebhookOutcome = 'REJECTED';
          if (isCheckoutId(checkoutId)) {
            const r = await repo.recordCheckoutStatus({
              eventId: event.id,
              eventType: event.type,
              checkoutId,
              status: event.type === 'checkout.session.expired' ? 'expired' : 'payment_failed',
              now: at,
            });
            outcome = r === 'duplicate_event' ? 'DUPLICATE' : 'PROCESSED';
          }
          await track(outcome);
          return { status: 200, body: { received: true } };
        }
        default:
          return { status: 200, body: { received: true } };
      }
    } catch (error) {
      // 5xx makes Stripe retry later; the event id dedupe makes that safe.
      logger.error('webhook processing failed', error, { event: ref(event.id) });
      await track('FAILED');
      return { status: 500, body: { error: 'processing_failed' } };
    }
  }

  async function fulfil(
    event: Stripe.Event,
    session: Stripe.Checkout.Session,
    at: string,
  ): Promise<{ body: Record<string, unknown>; outcome: WebhookOutcome }> {
    const checkoutId = session.metadata?.checkout_id;
    const checkout = isCheckoutId(checkoutId) ? await repo.getCheckout(checkoutId) : await repo.getCheckoutBySessionId(session.id);
    if (!checkout) {
      logger.warn('paid session has no matching checkout', { event: ref(event.id), session: redactSession(session.id) });
      return { body: { handled: false }, outcome: 'REJECTED' };
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
    // Stripe's own tax is the authority. Webhook payloads omit the per-rate breakdown, so fetch it when tax was charged.
    // A failure here throws: the webhook answers 5xx and Stripe retries (the event id dedupe makes that safe).
    let taxLines: TaxLine[] = [];
    if (taxMinor > 0) {
      let taxes = session.total_details?.breakdown?.taxes;
      if (!taxes) {
        const full = await deps
          .stripe(config().stripeSecretKey as string)
          .checkout.sessions.retrieve(session.id, { expand: ['total_details.breakdown'] });
        taxes = full.total_details?.breakdown?.taxes;
      }
      if (!taxes) throw new Error('tax breakdown unavailable for a session that charged tax');
      taxLines = chargedTaxLines(taxes);
    }
    const address = shippingAddressFromSession(session);
    flags.push(...taxFlags(checkout, taxLines, taxMinor, normaliseProvince(address?.province)));
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
      taxLines,
      totalMinor,
      shippingAddress: address,
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
      return { body: { handled: true, order: outcome.order.number }, outcome: 'PROCESSED' };
    }
    if (outcome.kind === 'session_mismatch' || outcome.kind === 'unknown_checkout') {
      logger.warn('paid session rejected', { reason: outcome.kind, session: redactSession(session.id) });
      return { body: { handled: false, reason: outcome.kind }, outcome: 'REJECTED' };
    }
    return { body: { handled: false, reason: outcome.kind }, outcome: 'DUPLICATE' };
  }

  return { createCheckoutSession, getCheckoutResult, sessionBelongsToCart, handleStripeWebhook };
}

export type CheckoutService = ReturnType<typeof createCheckoutService>;
