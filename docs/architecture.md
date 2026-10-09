# Application architecture

## Recommended starting stack

| Concern | Choice | Boundary |
| --- | --- | --- |
| Storefront | Next.js App Router + TypeScript | Server-render product/editorial content |
| Styling | Tailwind + CSS custom properties | Shared design tokens and semantic components |
| 3D | Three.js + React Three Fiber + Drei | One lazy client-side experience island |
| Cinematic timeline | GSAP + ScrollTrigger + `@gsap/react` | Own the story's progress and scene poses |
| Ordinary motion | CSS transitions first | Drawers, hover/focus, and state changes |
| Commerce | Crater commerce service shaped like the Shopify Storefront API | Catalog, variants, prices, cart, orders, inventory |
| Payments | Stripe hosted Checkout (test mode until the owner asks) | Card payment, receipts; no monthly fee |
| Database | Postgres (`pg`); in-memory store for development | Carts, checkouts, orders, inventory |
| Preview data | Sample catalog seed, `COMMERCE_PROVIDER=fixture` | Develop without keys or live orders |
| Verification | Vitest + Playwright + axe integration | Add at the app milestone, not to every edit |
| Deployment | Vercel preview as the initial option | Decide accounts and live domains separately |

Pin compatible stable releases in the app lockfile during scaffolding; check
Next.js/React/R3F peer compatibility and current security guidance then. Do not
copy a floating `latest` dependency set into a committed application manifest.
The current root `package.json` is a dependency-free toolkit manifest, not the
storefront. Add the app under `apps/storefront` without replacing the toolkit.

## Planned modules

| Planned path | Responsibility | Owner |
| --- | --- | --- |
| `apps/storefront/src/app/` | Routes, layouts, metadata, loading/error boundaries | Frontend |
| `apps/storefront/src/components/ui/` | Buttons, selectors, drawers, tokens | Frontend |
| `apps/storefront/src/components/commerce/` | Product cards, variant controls, cart UI | Frontend |
| `apps/storefront/src/components/experience/` | Scene, poster, scroll story, motion policy | Experience |
| `apps/storefront/src/lib/commerce/` | Storefront contract, catalog/cart service, Stripe, repositories | Commerce |
| `apps/storefront/src/lib/content/` | Approved claims, ingredient and SEO records | Product/frontend |
| `apps/storefront/src/app/api/storefront/` | Storefront-shaped JSON API (products, cart) | Commerce |
| `apps/storefront/src/app/api/checkout/` | Creates the Stripe Checkout Session from the cart | Commerce |
| `apps/storefront/src/app/api/webhooks/stripe/` | Verified payment events → orders, inventory | Commerce |
| `apps/storefront/db/` | SQL migrations and seed | Commerce |
| `apps/storefront/public/products/` | Approved optimized images and lightweight models | Art/experience |

The coordinator owns app manifests, dependency changes, shared types, and cross-
module integration. Multiple workers must not edit those shared files concurrently.

## Rendering and motion contracts

The page's product name, approved copy, price, and image render on the server.
Variant selection, cart controls, and motion are narrow client islands. The
client experience wrapper uses `next/dynamic` with `ssr: false` inside that client
wrapper, not inside a Server Component. Reserve the poster's dimensions so the
scene cannot change layout when it becomes ready.

Use an explicit experience state: `poster`, `loading`, `ready`, or `failed`.
Keep the poster until a frame is ready; revert to it on asset failure or WebGL
context loss. Reduced motion and constrained-device policy select the static
path. Browser APIs and device hints are advisory; lack of a hint must not crash
the render or prevent purchases.

GSAP owns scroll progress. Pass a stable progress ref to the scene; mutate the
Three.js object's transforms rather than setting React state every frame. Use
`useGSAP` cleanup and `gsap.matchMedia` for media conditions. R3F demand rendering
requires `invalidate()` whenever external timeline changes mutate objects; it
does not animate automatically. Pause offscreen and when the document is hidden.
Unmount observers, listeners, timelines, and owned GPU resources correctly.

## Commerce contracts

**Decision (user, 2026-10-09):** no Shopify subscription. Crater runs its own
commerce layer, and Stripe hosted Checkout takes payment (no monthly fee; Stripe
charges per successful card payment). The layer's objects, operation names, and
error semantics mirror the Shopify Storefront API so the UI codes against
documented behaviour; the mapping lives in
`.claude/skills/crater-commerce-backend/references/storefront-api-mapping.md`.

The contract is `apps/storefront/src/lib/commerce/types.ts` (`Storefront`,
`Product`, `ProductVariant`, `MoneyV2`, `Cart`, `CartMutationPayload`). UI code calls
`getStorefront()` from Server Components and Server Actions; the JSON routes under
`/api/storefront` expose the same operations to other clients.

- **Money:** integer minor units internally; `MoneyV2` decimal strings outward.
  The server reprices every cart read and checkout; clients send only variant IDs
  and quantities.
- **Cart:** unguessable ID in a secure, HTTP-only, SameSite=Lax cookie; never
  logged in full; responses `private, no-store`. Mutations return
  `{cart, userErrors, warnings}`: invalid input is a `userError`, stock
  adjustments are `warnings`. Carts expire after 14 days; completed carts close.
- **Checkout:** `POST /api/checkout` snapshots the cart, creates a Stripe Checkout
  Session with `price_data` from our prices and an idempotency key, validates that
  the redirect host is `checkout.stripe.com`, then redirects. Fixture mode refuses
  without calling Stripe; live keys are refused unless `STRIPE_ALLOW_LIVE=true`.
- **Orders and inventory:** created only by the verified Stripe webhook
  (signature over the raw body, deduplicated by event and session, subtotal
  compared with the snapshot), with inventory decremented in the same
  transaction. The success page shows the recorded order or "processing".
- **Persistence:** repository interface with `memory` (development, tests) and
  `postgres` implementations (`COMMERCE_DB`, `DATABASE_URL`); migrations in
  `apps/storefront/db/migrations`. **Owner plan: Supabase Postgres** (connected
  only when the owner asks). Tables live in a dedicated `commerce` schema with row
  level security enabled and no policies, so Supabase's public REST API cannot read
  carts or orders. The app connects through the transaction pooler with a small
  pool, and migrations use `DIRECT_DATABASE_URL`.
- **Business settings are owner decisions:** sales tax (Stripe Tax is a paid
  add-on), shipping rates, returns policy, markets, and live keys. Do not invent
  them. Order management starts in the Stripe dashboard; an admin UI is a later
  scoped decision.
- **Hosting:** Vercel Hobby is free but limited to non-commercial use; a live store
  needs a paid tier or another host, decided by the owner.

## Initial project budgets

These are proposed acceptance targets. Measure them on representative devices
and revise with evidence; toolkit checks cannot establish production performance.

| Metric | Initial target | Check |
| --- | --- | --- |
| LCP | ≤2.5s | Mobile lab profile first; field p75 after launch |
| INP | ≤200ms | Inspect interaction responsiveness; field p75 after launch |
| CLS | ≤0.1 | Layout trace during image/font/scene loading |
| Hero packshot | ≤250 KiB per delivered mobile image | Responsive image/network inspection |
| Compressed hero GLB | ≤2 MiB | Asset export check; textures included |
| Environment map | ≤1 MiB | Network inspection |
| Texture resolution | 1024 default, 2048 maximum where justified | Asset audit |
| Visible triangles | ≤50,000 initially | Renderer inspection |
| Draw calls | ≤80 initially | Renderer inspection |
| Device pixel ratio | 1–1.5 initial cap, adaptive downwards | Device profile |
| Frame rate during motion | Desktop aim 60fps; mobile minimum 30fps | Real device profile |

A budget miss triggers a smaller asset, reduced effect quality, or poster mode.
Adding effects must not delay the product information or purchase controls.

## Explicit first-release exclusions

Exclude a custom payment service, a new account system, AI skin diagnosis,
subscriptions, multi-currency rules written in the browser, and a canvas-driven
catalog. Add any of these through a separate product decision and scoped plan.

Sources and current documentation are listed in `sources.md`.
