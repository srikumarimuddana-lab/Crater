---
name: crater-commerce-backend
description: "Use when building, changing, debugging, or reviewing Crater's own commerce backend: the Shopify-Storefront-API-shaped catalog and cart service, cart cookies, Stripe Checkout sessions, Stripe webhooks, orders, inventory, Postgres/memory repositories, or the /api/storefront, /api/checkout and /api/webhooks routes. Use it even when the request only says 'cart', 'checkout', 'payments', 'orders', 'stock', 'Stripe', or 'Shopify-like API', and before touching apps/storefront/src/lib/commerce or src/app/api."
---

# Crater commerce backend

Crater does not use Shopify. It runs its own commerce layer whose objects, operation
names, and error semantics deliberately mirror the Shopify Storefront API, so the UI
is written against well-documented behaviour and a future move to Shopify (or back)
stays a transport swap. Stripe hosted Checkout takes payment; Crater owns catalog,
carts, orders, and inventory.

Read `docs/architecture.md` (commerce section), the current phase in
`docs/implementation-plan.md`, and `apps/storefront/src/lib/commerce/types.ts` first.
`types.ts` is the shared contract and is coordinator-owned: propose changes rather
than editing it during parallel work. `references/storefront-api-mapping.md` maps
each Storefront API concept to Crater's implementation; read it when adding an
operation or error code.

## Shape of the layer

| Concern | Where | Notes |
| --- | --- | --- |
| Contract | `src/lib/commerce/types.ts` | `Storefront` interface, `MoneyV2`, `Cart`, `CartMutationPayload` |
| Service facade | `src/lib/commerce/index.ts` | `getStorefront()`, `commerceMode()`, `createCheckoutSession()`, `getCheckoutResult()`, `formatMoney()` |
| Cart cookie | `src/lib/commerce/cart-cookie.ts` | HTTP-only, SameSite=Lax, Secure in production |
| Persistence | repository interface; `memory` and `postgres` | `COMMERCE_DB`, `DATABASE_URL`; SQL in `db/migrations` |
| HTTP | `src/app/api/storefront/**`, `api/checkout`, `api/webhooks/stripe` | UI uses Server Actions, not these routes |

## Principles, and why they matter

- **The server is the price authority.** Clients send variant IDs and quantities
  only. Reprice every cart read and every checkout from the catalog, in integer
  minor units, exposing `MoneyV2` decimal strings. Float math or client-sent prices
  eventually charge someone the wrong amount.
- **Mirror Storefront semantics exactly.** Mutations return `{cart, userErrors,
  warnings}`; validation failures are `userErrors` with a `field` path, not thrown
  exceptions; stock adjustments are `warnings` on a successful mutation. Shoppers
  and UI code rely on the difference between "rejected" and "adjusted".
- **Carts are private and unguessable.** Cart IDs carry ≥128 random bits, live in an
  HTTP-only cookie, and are never logged in full. Cart responses use
  `Cache-Control: private, no-store`; catalog reads may be cached publicly.
- **Fixture mode is the default and is safe.** `COMMERCE_PROVIDER=fixture` never
  calls Stripe and never creates orders. Stripe mode refuses `sk_live_` keys unless
  `STRIPE_ALLOW_LIVE=true`, because a preview with live keys can take real money.
- **Snapshot before you charge.** Persist the checkout snapshot (frozen lines and
  unit prices) before creating the Stripe session; build `line_items` with
  `price_data` from our prices; pass an idempotency key derived from the checkout
  ID; validate that the returned URL host is `checkout.stripe.com` before
  redirecting.
- **Webhooks are the source of truth for orders.** Verify the signature over the raw
  body (`await request.text()`), return 400 without detail on failure, dedupe by
  event ID and by session ID, compare `amount_subtotal` with the snapshot, then
  create the order, decrement inventory, and complete the cart in one transaction.
  The success page only displays what the webhook recorded (or "processing").
- **Do not invent business settings.** Tax (Stripe Tax is a paid add-on), shipping
  rates, return policy, and markets are owner decisions; leave documented TODOs
  rather than plausible-looking numbers.

## Workflow

1. Inspect the existing commerce modules and installed versions (`stripe`, `pg`,
   Next.js docs in `node_modules/next/dist/docs/`) before editing.
2. Write or extend unit tests first for the behaviour you change (Vitest in
   `tests/unit/`). Mock the Stripe client through its factory; generate webhook
   signatures with `stripe.webhooks.generateTestHeaderString`. Never hit the
   network in tests.
3. Implement in the repository and service layers; keep route handlers thin
   (parse, validate, call the service, map to HTTP).
4. Run the Postgres parity tests against a throwaway local cluster when
   persistence changes (`TEST_DATABASE_URL`); they must skip cleanly without it.
5. Run `npm run typecheck`, `npm run lint`, `npm run test:unit`, and `npm run build`
   in `apps/storefront`, checking real exit codes (a pipe through `tail` hides
   failures).

## Failure paths to cover

Unknown or malformed merchandise ID; quantity 0, negative, fractional, or above the
per-line limit; unknown line ID; missing or expired cart; out-of-stock and
not-enough-stock adjustments; price changed since the item was added; empty or
invalid cart at checkout; fixture mode and live-key refusal; non-Stripe redirect
host; bad webhook signature; duplicate webhook delivery; subtotal mismatch; a
completed cart being reused.

## Handoff

Return changed paths, the exported contract as implemented, environment variables,
npm scripts, exact test counts (including whether Postgres tests ran), deviations
from the brief, and open business inputs (tax, shipping, policies, live keys).
