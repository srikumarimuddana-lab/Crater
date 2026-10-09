#!/usr/bin/env node
// A tiny fake of the Stripe API, for the integration suite ONLY. It implements just the
// endpoints Crater calls:
//   POST /v1/checkout/sessions        create (honours Idempotency-Key)
//   GET  /v1/checkout/sessions/:id    retrieve
// and test helpers under /__test/:
//   GET  /__test/health                      liveness (used by Playwright's webServer)
//   GET  /__test/sessions                    all sessions, oldest first
//   GET  /__test/sessions/:id                one session
//   POST /__test/sessions/:id/pay            mark paid/complete (like a buyer finishing payment)
//   POST /__test/reset                       forget all sessions
// It listens on 127.0.0.1 only, keeps everything in memory, and never contacts anyone.
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = Number(process.env.FAKE_STRIPE_PORT ?? 12111);
const sessions = new Map(); // id -> session
const byIdempotencyKey = new Map(); // key -> id
const requests = []; // minimal request log, for assertions

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

function createSession(params, headers) {
  const items = asArray(params.line_items);
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
    amount_total: subtotal,
    total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
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
    })),
  };
  sessions.set(id, session);
  const key = headers['idempotency-key'];
  if (key) byIdempotencyKey.set(String(key), id);
  return session;
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
    if (route === 'GET /__test/sessions') return send(res, 200, { data: [...sessions.values()] });
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
      if (req.method === 'GET' && !m[2]) return send(res, 200, s);
      if (req.method === 'POST' && m[2]) {
        s.status = 'complete';
        s.payment_status = 'paid';
        s.customer_details = { email: s.customer_email ?? 'buyer@example.test', name: 'Test Buyer' };
        s.collected_information = {
          shipping_details: {
            name: 'Test Buyer',
            address: { line1: '100 Sample Street', line2: null, city: 'Toronto', state: 'ON', postal_code: 'M5V 2T6', country: 'CA' },
          },
        };
        return send(res, 200, s);
      }
    }

    // Stripe API: require a test secret key like the real thing requires a key at all.
    const auth = req.headers.authorization ?? '';
    if (!/^Bearer sk_test_/.test(auth)) return stripeError(res, 401, 'Invalid API Key provided', 'authentication_error');

    if (route === 'POST /v1/checkout/sessions') {
      const raw = await readBody(req);
      requests.push({ method: 'POST', path: url.pathname, idempotencyKey: req.headers['idempotency-key'] ?? null });
      const key = req.headers['idempotency-key'];
      if (key && byIdempotencyKey.has(String(key))) return send(res, 200, sessions.get(byIdempotencyKey.get(String(key))));
      let session;
      try {
        session = createSession(parseForm(raw), req.headers);
      } catch (error) {
        return stripeError(res, 400, error instanceof Error ? error.message : 'invalid request');
      }
      return send(res, 200, session);
    }
    if ((m = url.pathname.match(/^\/v1\/checkout\/sessions\/([\w]+)$/)) && req.method === 'GET') {
      requests.push({ method: 'GET', path: url.pathname, idempotencyKey: null });
      const s = sessions.get(m[1]);
      return s ? send(res, 200, s) : stripeError(res, 404, `No such checkout.session: '${m[1]}'`);
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
