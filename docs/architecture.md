# Application architecture

## Recommended starting stack

| Concern | Choice | Boundary |
| --- | --- | --- |
| Storefront | Next.js App Router + TypeScript | Server-render product/editorial content |
| Styling | Tailwind + CSS custom properties | Shared design tokens and semantic components |
| 3D | Three.js + React Three Fiber + Drei | One lazy client-side experience island |
| Cinematic timeline | GSAP + ScrollTrigger + `@gsap/react` | Own the story's progress and scene poses |
| Ordinary motion | CSS transitions first | Drawers, hover/focus, and state changes |
| Commerce | Shopify Storefront Cart API | Catalog, variants, prices, cart, hosted checkout |
| Preview data | Typed fixture commerce adapter | Develop without credentials or live orders |
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
| `apps/storefront/src/lib/commerce/` | Typed provider contract, fixtures, Shopify transport | Commerce |
| `apps/storefront/src/lib/content/` | Approved claims, ingredient and SEO records | Product/frontend |
| `apps/storefront/src/app/api/cart/` | Validated private cart requests | Commerce |
| `apps/storefront/src/app/api/webhooks/shopify/` | Verified invalidation notifications | Commerce |
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

Use a provider interface shared by fixture and Shopify implementations. Normalize
Shopify data once; do not couple canvas or UI components directly to GraphQL.
Represent money as a decimal string and currency code, never a JavaScript float
used as the checkout authority. Product options resolve to Shopify variant IDs.

Keep private Storefront tokens server-side with the appropriate private-token
header. Validate every incoming variant and quantity, restrict the store domain
to the configured Shopify domain, and surface GraphQL transport errors and
mutation `userErrors` separately. Public Storefront tokens, if selected later,
have different scopes and must not be confused with private or Admin tokens.

Create an anonymous cart and store its full opaque identifier in a secure,
HTTP-only, SameSite cookie where the application design allows it. Treat any
checkout-capable cart identifier as sensitive; do not log it. Serialize dependent
cart mutations, reconcile with Shopify's returned lines and totals, and handle
expired carts, unavailable variants, quantity changes, and network failures.
Request a fresh `checkoutUrl` when the customer starts checkout and validate its
destination against configured store checkout hosts before redirecting.

Catalog reads may be cached using public product tags. Cart, buyer identity, and
checkout responses must be private and uncached. Verify webhook HMAC signatures
over the raw request body, handle duplicate notifications, and invalidate only
the relevant product/collection tags. Define version-specific Next.js cache APIs
when scaffolding instead of guessing their signatures from an older release.

Use Shopify-hosted checkout for payment, shipping, and tax configuration. This
does not by itself configure those business settings or make the store ready for
sales. Do not implement a competing payment backend for the first release.

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
