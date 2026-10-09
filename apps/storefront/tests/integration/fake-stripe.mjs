#!/usr/bin/env node
// A tiny fake of the Stripe API, for the integration suite ONLY. It implements just the
// endpoints Crater calls:
//   POST /v1/checkout/sessions        create (honours Idempotency-Key)
//   GET  /v1/checkout/sessions/:id    retrieve (expand[]=total_details.breakdown adds per-rate tax, like Stripe)
//   GET/POST /v1/tax_rates, POST /v1/tax_rates/:id   list (active filter, paging), create, archive
// and test helpers under /__test/:
//   GET  /__test/health                      liveness (used by Playwright's webServer)
//   GET  /__test/sessions                    all sessions, oldest first
//   GET  /__test/sessions/:id                one session
//   POST /__test/sessions/:id/pay            mark paid/complete (like a buyer finishing payment). Optional JSON
//                                            body { state: "AB" } sets the province of the shipping address the
//                                            buyer typed; default is the bag's province (metadata.tax_province).
//   POST /__test/reset                       forget all sessions (tax rates are kept, like a real Stripe account)
// It listens on 127.0.0.1 only, keeps everything in memory, and never contacts anyone.
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = Number(process.env.FAKE_STRIPE_PORT ?? 12111);
const sessions = new Map(); // id -> session
const byIdempotencyKey = new Map(); // key -> id
const requests = []; // minimal request log, for assertions
const taxRates = new Map(); // id -> tax rate object (survives /__test/reset)
const taxRateKeys = new Map(); // idempotency key -> id

/** Parses Stripe's bracketed form encoding (a[0][b]=c) into nested objects/arrays. */
export function parseForm(body) {
  const root = {};
  for (const [rawKey, value] of new URLSearchParams(body)) {
    const parts = rawKey.replace(/\]/g, '').split('[');
    let node = root;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) node[part] = value;
      else node = node[part] ??= /^\d+$/.test(parts[i + 1]) ? [] : {};
    });
  }
  return root;
}

const asArray = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);

/** Tax like Stripe: each line's exclusive rates applied to the line total, rounded half up, summed per rate. */
function computeTax(items) {
  const byRate = new Map();
  for (const item of items) {
    const lineTotal = Number(item.quantity) * Number(item.price_data?.unit_amount);
    for (const id of asArray(item.tax_rates)) {
      const rate = taxRates.get(id);
      if (!rate || !rate.active) throw new Error(`No such tax rate: '${id}'`);
      const milli = Math.round(Number(rate.percentage) * 1000);
      byRate.set(id, (byRate.get(id) ?? 0) + Math.floor((lineTotal * milli + 50_000) / 100_000));
    }
  }
  return byRate;
}

function createSession(params, headers) {
  const items = asArray(params.line_items);
  const taxByRate = computeTax(items);
  const taxTotal = [...taxByRate.values()].reduce((a, b) => a + b, 0);
  const subtotal = items.reduce((sum, item) => {
    const qty = Number(item.quantity);
    const unit = Number(item.price_data?.unit_amount);
    if (!Number.isInteger(qty) || qty < 1 || !Number.isInteger(unit) || unit < 0) throw new Error('invalid line item');
    return sum + qty * unit;
  }, 0);
  const id = `cs_test_${randomBytes(12).toString('hex')}`;
  const session = {
    id,
    object: 'checkout.session',
    mode: params.mode ?? 'payment',
    status: 'open',
    payment_status: 'unpaid',
    currency: items[0]?.price_data?.currency ?? 'cad',
    amount_subtotal: subtotal,
    amount_total: subtotal + taxTotal,
    total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: taxTotal },
    client_reference_id: params.client_reference_id ?? null,
    customer_email: params.customer_email ?? null,
    customer_details: null,
    // Real sessions (API 2026-08-26.dahlia) carry the address Checkout collected here once the buyer has paid.
    collected_information: null,
    metadata: params.metadata ?? {},
    success_url: params.success_url ?? null,
    cancel_url: params.cancel_url ?? null,
    url: `https://checkout.stripe.com/c/pay/${id}`,
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    // Test-only extras (not part of the real object) to let specs inspect what was sent.
    line_items_requested: items.map((i) => ({
      quantity: Number(i.quantity),
      unit_amount: Number(i.price_data.unit_amount),
      name: i.price_data.product_data?.name ?? null,
      tax_rates: asArray(i.tax_rates),
    })),
    shipping_address_collection: params.shipping_address_collection ?? null,
    _tax_by_rate: [...taxByRate],
  };
  sessions.set(id, session);
  const key = headers['idempotency-key'];
  if (key) byIdempotencyKey.set(String(key), id);
  return session;
}

/** The session as the API returns it: internal fields removed, the per-rate breakdown only when expanded. */
function present(session, expand = []) {
  const { _tax_by_rate: taxByRate, ...rest } = session;
  if (!expand.includes('total_details.breakdown')) return rest;
  return {
    ...rest,
    total_details: {
      ...rest.total_details,
      breakdown: {
        discounts: [],
        taxes: taxByRate.map(([id, amount]) => ({ amount, rate: taxRates.get(id), taxability_reason: 'standard_rated', taxable_amount: rest.amount_subtotal })),
      },
    },
  };
}

const stripeError = (res, status, message, type = 'invalid_request_error') =>
  send(res, status, { error: { type, message } });

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' });
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://fake-stripe.local');
    const route = `${req.method} ${url.pathname}`;
    let m;

    if (route === 'GET /__test/health') return send(res, 200, { ok: true });
    if (route === 'GET /__test/sessions') return send(res, 200, { data: [...sessions.values()].map((s) => present(s)) });
    if (route === 'POST /__test/reset') {
      sessions.clear();
      byIdempotencyKey.clear();
      requests.length = 0;
      return send(res, 200, { ok: true });
    }
    if (route === 'GET /__test/requests') return send(res, 200, { data: requests });
    if ((m = url.pathname.match(/^\/__test\/sessions\/([\w]+)(\/pay)?$/))) {
      const s = sessions.get(m[1]);
      if (!s) return send(res, 404, { error: 'unknown session' });
      if (req.method === 'GET' && !m[2]) return send(res, 200, present(s));
      if (req.method === 'POST' && m[2]) {
        let body = {};
        try {
          const text = await readBody(req);
          body = text ? JSON.parse(text) : {};
        } catch {
          return send(res, 400, { error: 'bad json' });
        }
        s.status = 'complete';
        s.payment_status = 'paid';
        s.customer_details = { email: s.customer_email ?? 'buyer@example.test', name: 'Test Buyer' };
        s.collected_information = {
          shipping_details: {
            name: 'Test Buyer',
            address: { line1: '100 Sample Street', line2: null, city: 'Toronto', state: body.state ?? s.metadata?.tax_province ?? 'ON', postal_code: 'M5V 2T6', country: 'CA' },
          },
        };
        return send(res, 200, present(s));
      }
    }

    // Stripe API: require a test secret key like the real thing requires a key at all.
    const auth = req.headers.authorization ?? '';
    if (!/^Bearer sk_test_/.test(auth)) return stripeError(res, 401, 'Invalid API Key provided', 'authentication_error');

    if (route === 'POST /v1/checkout/sessions') {
      const raw = await readBody(req);
      requests.push({ method: 'POST', path: url.pathname, idempotencyKey: req.headers['idempotency-key'] ?? null });
      const key = req.headers['idempotency-key'];
      if (key && byIdempotencyKey.has(String(key))) return send(res, 200, present(sessions.get(byIdempotencyKey.get(String(key)))));
      let session;
      try {
        session = createSession(parseForm(raw), req.headers);
      } catch (error) {
        return stripeError(res, 400, error instanceof Error ? error.message : 'invalid request');
      }
      return send(res, 200, present(session));
    }
    if (route === 'GET /v1/tax_rates') {
      requests.push({ method: 'GET', path: url.pathname, idempotencyKey: null });
      const active = url.searchParams.get('active');
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 10), 100);
      const after = url.searchParams.get('starting_after');
      const all = [...taxRates.values()].filter((r) => active === null || String(r.active) === active).reverse();
      const start = after ? all.findIndex((r) => r.id === after) + 1 : 0;
      return send(res, 200, { object: 'list', url: '/v1/tax_rates', data: all.slice(start, start + limit), has_more: start + limit < all.length });
    }
    if (route === 'POST /v1/tax_rates') {
      const p = parseForm(await readBody(req));
      requests.push({ method: 'POST', path: url.pathname, idempotencyKey: req.headers['idempotency-key'] ?? null });
      const key = req.headers['idempotency-key'];
      if (key && taxRateKeys.has(String(key))) return send(res, 200, taxRates.get(taxRateKeys.get(String(key))));
      if (!p.display_name || !Number.isFinite(Number(p.percentage)) || p.inclusive === undefined) return stripeError(res, 400, 'Missing required param');
      const rate = {
        id: `txr_${randomBytes(8).toString('hex')}`, object: 'tax_rate', active: p.active !== 'false', display_name: p.display_name,
        percentage: Number(p.percentage), inclusive: p.inclusive === 'true', country: p.country ?? null, state: p.state ?? null,
        jurisdiction: p.jurisdiction ?? null, tax_type: p.tax_type ?? null, description: null, metadata: p.metadata ?? {}, livemode: false,
        created: Math.floor(Date.now() / 1000),
      };
      taxRates.set(rate.id, rate);
      if (key) taxRateKeys.set(String(key), rate.id);
      return send(res, 200, rate);
    }
    if ((m = url.pathname.match(/^\/v1\/tax_rates\/(txr_\w+)$/)) && req.method === 'POST') {
      const rate = taxRates.get(m[1]);
      if (!rate) return stripeError(res, 404, `No such tax rate: '${m[1]}'`);
      const p = parseForm(await readBody(req));
      if (p.active !== undefined) rate.active = p.active === 'true'; // Stripe: only active/display fields are mutable
      return send(res, 200, rate);
    }
    if ((m = url.pathname.match(/^\/v1\/checkout\/sessions\/([\w]+)$/)) && req.method === 'GET') {
      requests.push({ method: 'GET', path: url.pathname, idempotencyKey: null });
      const s = sessions.get(m[1]);
      const expand = [...url.searchParams].filter(([k]) => k === 'expand' || k.startsWith('expand[')).map(([, v]) => v);
      return s ? send(res, 200, present(s, expand)) : stripeError(res, 404, `No such checkout.session: '${m[1]}'`);
    }
    return stripeError(res, 404, `Unrecognized request URL (${req.method}: ${url.pathname}).`);
  } catch (error) {
    console.error('[fake-stripe]', error instanceof Error ? error.message : error);
    if (!res.headersSent) send(res, 500, { error: { type: 'api_error', message: 'fake stripe failure' } });
  }
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, '127.0.0.1', () => console.log(`[fake-stripe] listening on http://127.0.0.1:${PORT}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
