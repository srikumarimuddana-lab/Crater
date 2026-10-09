# Crater storefront implementation plan

**Goal:** Build a premium skincare preview, then connect verified commerce data
and complete a working purchase journey.

**Architecture:** Server-rendered Next.js content with a typed commerce adapter;
small client islands for UI and a lazy 3D/GSAP story; Crater's own
Storefront-API-shaped commerce service with Stripe hosted Checkout.

**Specifications:** `design-brief.md`, `architecture.md`, and `asset-brief.md`.

**Execution:** Use `/crater-kickoff` for the requested phase. The main coordinator
owns integration. Use one worker for small work or at most two independent
workers initially, with explicit file ownership. The following phases are future
application work; this toolkit does not mark them as implemented.

## Global constraints

- Keep essential content outside canvas and retain a useful packshot fallback.
- Native scrolling, keyboard access, reduced motion, and mobile normal flow are
  required from the first visual milestone.
- Keep the server authoritative for variants, availability, and totals; Stripe
  Checkout takes payment.
- Fixture mode must be clearly visible in the preview and cannot create orders.
- Use scoped verification. Never report an unrun app/browser check as passed.
- Never install Git hooks or change `core.hooksPath` as part of these phases.

## Review focus

Verify the following conditions in their owning phases: missing/failed model
loads (Phase 3); late fonts/images and mobile layout (Phases 1/2); navigation
back into a pinned story (Phase 4); stale stock, concurrent mutations, and an
expired cart (Phase 5); fixture content or unsupported claims reaching a live
preview (Phases 2/6). The tests named below cover those concrete conditions.

## Phase 1: accessible static foundation

**Owner:** Frontend engineer; art director supplies the composition and tokens.

**Files:** Create `apps/storefront/package.json`, the chosen package-manager
lockfile, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`,
`src/components/ui/button.tsx`, `src/lib/content/fixtures.ts`, and
`tests/e2e/home.spec.ts` under `apps/storefront`.

**Contract:** Define typed fixture products with a handle, title, approved-preview
copy, image, variants, size, and `{amount: string, currencyCode: string}` money.
Create a rendered hero and collection without WebGL or live credentials.

- [x] Select compatible stable versions and record the selected versions in the
  lockfile. Keep root toolkit commands available.
- [x] Add `home renders shopping content without WebGL` and `home preserves layout
  during delayed image and font loading` in the Playwright home spec. Assert the
  hero heading, product image, shopping action, and collection links are usable.
- [x] Implement the static design at 390px, 768px, and 1440px with marked fixtures,
  semantic headings, focus states, and responsive images.
- [x] Run app typecheck/lint/build and the scoped home spec. Inspect screenshots
  at each width; record the result and commit the phase.

**Exit:** The site is useful and visually coherent before animation is added.

**Phase 1 record (2026-10-09).** Goal met in fixture mode. Owned files:
`apps/storefront/**` (coordinator) and `docs/visual-contract.md` (art director).
Pinned: Next.js 16.3.8, React 19.2.8, TypeScript 5.9.3, Tailwind 4.3.3, ESLint
9.39.5, Playwright 1.56.1 (matches the preinstalled Chromium), axe 4.11.3; exact
`package-lock.json` committed. Evidence: typecheck, lint, and build pass; the home
spec passes 4 tests × 3 viewports (390/768/1440): no-WebGL shopping content and
filter, skip link/focus, axe serious/critical = 0, and delayed image/font loading
with stable hero box and CLS < 0.1. Screenshots inspected at each width; they
caught and fixed an unreserved desktop hero, a font-swap heading shift, and an
invalid balm SVG. Known: `npm audit` reports 5 high advisories in dev-only lint
tooling (micromatch via `@next/eslint-plugin-next`); production deps report 0.
Shared commerce types live in `fixtures.ts` until Phase 2 moves them to
`src/lib/commerce/types.ts`. Remaining inputs: real brand name, product records,
photography, approved copy, and font licence confirmation.

**Update (2026-10-09).** At the user's request the preview now uses the Forest &
Gilt palette (green, brown, gold); see `visual-contract.md`. Correction: the
earlier "lint passes" was masked by a pipe; the packshot generator's `require()`
calls failed lint. It is now an ES module and lint exits 0.

## Phase 2: product page, cart, and commerce backend (fixture/test mode)

**Owner:** Commerce engineer (backend), then frontend engineer (UI); coordinator
owns `types.ts`, manifests, and integration. Merged with the former Phase 5 at the
user's request (2026-10-09): own backend + Stripe instead of Shopify.

**Files:** `src/lib/commerce/**` (contract, catalog seed, cart service,
repositories, Stripe checkout, cookie helpers), `src/app/api/{storefront,checkout,
webhooks/stripe}/**`, `db/migrations`, `tests/unit/**`; then
`src/app/products/[handle]/page.tsx`, `src/app/cart/page.tsx`,
`src/app/checkout/success/page.tsx`, `src/app/actions/cart.ts`, commerce components,
and `tests/e2e/product-cart.spec.ts`.

**Contract:** `Storefront` in `types.ts` mirrors Storefront API operations
(`products`, `product`, `variantBySelectedOptions`, `cart`, `cartCreate`,
`cartLinesAdd/Update/Remove`) with `userErrors`/`warnings`. Fixture mode shows a
clear demo message at checkout; Stripe test mode redirects to Stripe Checkout.

- [x] Backend: unit tests for every cart userError/warning, repricing, expiry,
  checkout refusals (fixture, live key, empty/invalid cart, foreign redirect host),
  webhook signature, duplicate delivery, subtotal mismatch, and inventory; Postgres
  parity tests against a local cluster.
  Evidence (2026-10-09): typecheck/lint/build pass; Vitest 145/145 against a fresh
  local Postgres 16 (98 pass + 47 Postgres skips without it), re-run by the
  coordinator; migrate/seed idempotent; `commerce` schema with RLS on all 12
  tables; homepage e2e 12/12. Open: tax, shipping rates, admin UI, order emails,
  rate limiting, scheduled `purgeExpiredCarts()`.
- [ ] UI: e2e for variant selection, unavailable variants, add/update/remove,
  drawer focus/Escape/return-focus, no-JS cart page, fixture checkout message.
- [ ] Inspect product, cart, and checkout-result screens at 390/768/1440. Confirm
  no fabricated claims, reviews, or stock. Commit the phase.

**Exit:** A shopper can browse, choose a variant, manage a cart, and reach Stripe
test Checkout; a paid test session creates an order through the webhook.

## Phase 3: one progressive 3D hero

**Owner:** Experience engineer; art director/product strategist supply assets.

**Files:** Create `src/components/experience/product-experience.tsx`,
`bottle-scene.tsx`, `scene-poster.tsx`, `motion-policy.ts`,
`src/lib/content/product-assets.ts`, approved files in `public/products/`, and
`tests/e2e/experience-fallbacks.spec.ts`.

**Contract:** `ProductExperience` receives a product asset record and a stable
progress ref. It exposes `poster/loading/ready/failed` states without changing
the purchase component tree. `motion-policy` derives safe static/enhanced modes
from browser capability, reduced motion, and measured constraints.

- [ ] Add tests for disabled WebGL, model 404/slow loading, context loss, reduced
  motion, and route unmount/remount. Assert the poster and shopping action remain.
- [ ] Implement the lazy client wrapper, correctly placed `ssr: false`, scene
  error boundary, matching poster, fixed dimensions, DPR cap, and render policy.
- [ ] Inspect the bottle label and materials; record model/map sizes, triangles,
  draw calls, and performance on the chosen representative devices.
- [ ] Check listener/resource cleanup and that a failed scene cannot fail the
  product page. Commit the phase.

**Exit:** One convincing scene upgrades an already complete shopping page.

## Phase 4: cinematic story and interface polish

**Owner:** Experience engineer; frontend owns shopping UI interactions.

**Files:** Create `src/components/experience/formula-story.tsx`,
`story-timeline.ts`, and `tests/e2e/story-navigation.spec.ts`; update the homepage
and experience progress contract through coordinator review.

**Contract:** One GSAP timeline maps normalized progress to three authored poses.
Invalidate R3F demand frames when that timeline mutates the scene. Keep chapter
content rendered and accessible in every policy mode.

- [ ] Add tests for mobile normal flow, reduced-motion changes at runtime,
  resize, browser back/forward, and remount without duplicate ScrollTriggers.
- [ ] Implement one desktop pin of at most 2.5 viewport heights with `useGSAP`
  cleanup and `gsap.matchMedia`. Keep native scrolling and a static path.
- [ ] Add restrained cart/card transitions using CSS. Do not let multiple
  animation systems own the same property or camera transform.
- [ ] Verify the changed flow in a browser and profile active motion. Reduce
  quality or use poster mode if the targets are missed. Commit the phase.

**Exit:** Motion reinforces product understanding without obstructing shopping.

## Phase 5: payments go-live readiness

**Owner:** Commerce engineer; coordinator handles environment and integration.
(Backend build moved into Phase 2.)

- [ ] With the owner: Stripe account and test keys in ignored `.env.local`, webhook
  endpoint via the Stripe CLI, a free hosted Postgres if wanted, tax approach,
  shipping rates, returns policy, and order notification emails.
- [ ] Run a full test-card purchase (success, decline, 3DS, async) and confirm the
  order, inventory decrement, and success page. Record evidence.
- [ ] Live keys, a live domain, and paid hosting only on the owner's explicit
  request. Commit the phase.

**Exit:** The store has an evidence-backed, recoverable purchase journey in Stripe
test mode, and a written checklist for going live.

## Phase 6: content, performance, and preview review

**Owner:** Product strategist and quality engineer; release reviewer reads the
completed diff. The coordinator owns the preview deployment.

**Files:** Create/update product metadata, JSON-LD, sitemap/robots, consent UI,
policy pages, and `tests/e2e/release-critical.spec.ts`; add only the CI checks
appropriate to the resulting app, with version-pinned Actions where used.

- [ ] Test missing products, duplicate event emission, fixture visibility,
  invalid structured data, private-data caching, and policy links. Use verified
  prices/availability and genuine review data only.
- [ ] Add approved canonical metadata and structured data from the same commerce
  record. Define analytics events for view, add-to-cart, and begin-checkout;
  respect the selected market's approved consent policy.
- [ ] Run the critical app checks and browser journey once after final changes;
  inspect representative mobile/desktop screens and measure the budgets.
- [ ] Request a scoped read-only release review. Resolve blockers, record any
  unrun checks or missing business inputs, and present the preview and diff.

**Exit:** A reviewable preview with honest validation results. Live publishing,
paid services, and production orders remain separate owner-directed actions.
