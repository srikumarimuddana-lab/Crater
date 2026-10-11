---
name: crater-nextjs-storefront
description: "Use when building, changing, or reviewing Crater's Next.js 16 storefront UI: routes and layouts, the homepage, product pages, variant selectors, add-to-bag forms, the cart drawer or cart page, Server Actions, checkout success/cancel pages, metadata, loading/error states, or shared components. Use it whenever a task touches apps/storefront/src/app or src/components, even if the request only says 'page', 'button', 'cart UI', 'product page', or 'make it look/behave like a real shop'."
---

# Crater Next.js storefront

The storefront is a server-rendered Next.js 16 App Router app in `apps/storefront`.
Shopping must work with JavaScript slow or failing, motion off, and WebGL absent;
interactivity is an enhancement layered on server-rendered HTML.

Read `docs/architecture.md`, `docs/visual-contract.md` (Forest & Gilt tokens and
contrast rules), and the current phase in `docs/implementation-plan.md`. The commerce
contract lives in `src/lib/commerce/types.ts`; call the backend only through the
exports of `src/lib/commerce/index.ts` and `cart-cookie.ts`. Version-specific
framework behaviour: check `node_modules/next/dist/docs/` rather than memory.
`references/patterns.md` has the cart Server Action and drawer patterns.

## Boundaries, and why

- **Server Components by default.** Product facts, prices, images, and metadata
  render on the server from `getStorefront()`, so they are present in the first
  HTML and indexable. Client components are small islands: variant selector,
  quantity controls, cart drawer, and the 3D wrapper.
- **Mutations go through Server Actions and `<form action>`.** Forms post even
  before hydration, which keeps add-to-bag working on slow devices. Actions read
  the cart ID from the cookie helpers, call the Storefront-shaped mutation, then
  revalidate. Never send prices from the client; send variant IDs and quantities.
- **Show userErrors and warnings in the UI.** The backend returns
  `{cart, userErrors, warnings}`. Rejections ("This size is unavailable") and
  adjustments ("Only 2 left — quantity updated") need different, polite messages
  announced through a polite live region.
- **Cart state is private.** Pages that read the cart cookie are dynamic and
  uncached; don't cache cart HTML or put cart IDs in URLs.
- **Variant selection is URL state.** Encode selected options in search params
  (`?Size=30+mL`) so the page renders the right variant server-side and links are
  shareable; the client selector only updates the URL. Disable or mark unavailable
  combinations instead of hiding them.
- **Checkout is a POST** to the cart's `checkoutUrl` (`/api/checkout`). In fixture
  mode the backend refuses; show a clear demo message instead of a broken
  redirect. Return pages: `/checkout/success?session_id=…` (shows only what
  `getCheckoutResult` returns; "processing" until the webhook lands) and
  `/cart?checkout=cancelled`.
- **Sample status stays visible.** While `commerceMode()` is `fixture` or any product
  has `sample: true`, keep the preview banner and per-product markers. In
  `stripe-test` mode say that test cards are required and no real charge occurs.

## Accessibility and layout contract

Semantic headings and landmarks; every control has a visible label and a 44px
target; focus is always visible (forest ring on light, gold-light on `.on-dark`
bands). The cart drawer is a modal dialog: move focus in on open, trap it, close on
Escape and on the close button, return focus to the trigger, respect reduced
motion (180–260ms transition otherwise). Reserve image dimensions so nothing
shifts while images or fonts load. Body text ≥16px. Never use gold as text on
light surfaces.

## Workflow

1. Inspect the existing routes, components, and the commerce exports you will use.
2. Add or extend Playwright specs in `tests/e2e/` for the journey you change (they
   run at 390, 768, and 1440px against a production build). Cover the failure
   path, not only the happy path.
3. Implement server-first; add a client island only where interaction requires it.
4. Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e`
   in `apps/storefront`, checking real exit codes. Inspect screenshots at all three
   widths; tests do not judge composition.

## Handoff

Return changed paths, new routes and their caching behaviour, the client islands
added, observed checks (with counts), screenshots inspected, and any backend or
content dependency. Never invent reviews, clinical claims, stock levels, or
policies to fill a layout.
