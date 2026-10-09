# Crater: cinematic skincare storefront

## Intent and assumptions

The requested outcome is a premium cosmetics/skincare ecommerce experience with
3D scrolling and polished effects, developed through Claude Code. The present
deliverable is the reusable development setup and the plan for that storefront.

No brand identity, product catalog, packaging, store credentials, market, or asset
library has been supplied. Use the working direction below to build a preview;
replace fixture content with verified brand material before launch. Canada/CAD
is a preview assumption, not a restriction on the eventual selling markets.

## Catalogue and layout (user decisions, 2026-10-09)

- The sample catalogue is herbal: liquid herbal extracts (tinctures), single-herb
  extracts, body oils and kits (`catalogue.md`). All names and copy are original
  samples; no health claims until licensed (NPN) claims are supplied.
- The storefront layout follows patterns common to established herbal stores
  (announcement bar, mega menu, hero with two actions, value tiles, featured
  carousel, shop-by-ritual tiles, story and values sections, rich footer). Patterns
  only: no copied text, images, names, certifications or reviews.
- The 3D hero (Phase 3) now features an amber glass dropper bottle instead of a
  serum bottle.

## Working direction: Forest & Gilt (user decision, 2026-10-09)

The user asked for a premium luxury look in green, brown and gold. Deep forest
bands, espresso brown and antique gold replace the original Mineral Atelier
palette; `visual-contract.md` holds the current tokens and contrast data. The
table below records the original Mineral Atelier direction for reference.

Present skincare as carefully formulated objects in a quiet studio. Make one
serum bottle, its actual label, and the light passing through it the memorable
element. Use ingredient photography and a stone plinth to connect the scene
to materials. Keep shopping controls familiar and immediate.

| Token | Value | Use |
| --- | --- | --- |
| Porcelain | `#F3F4EE` | Main page background |
| Mineral | `#D8E6D7` | Ingredient and formulation surfaces |
| Pine ink | `#202C25` | Text and primary actions |
| Sage | `#738979` | Supporting graphics, subject to contrast checks |
| Chalk | `#FFFFFF` | Product photography backdrop |
| Bronze | `#917254` | Small packaging details; avoid small text |
| Display | Bodoni Moda, self-hosted through Next.js fonts | Editorial headings |
| Body/UI | Manrope, self-hosted through Next.js fonts | Controls and product details |

Confirm font licenses and real packaging compatibility when preparing the brand
assets. Keep body text at least 16px, visible focus indicators, and comfortably
sized touch controls. Test every foreground/background pairing; palette membership
alone does not establish accessible contrast.

## Page sequence

1. **Hero:** a responsive packshot appears immediately. Show product name, an
   approved benefit, size, price, and a direct product or shopping action. Upgrade
   the picture to a softly lit bottle scene when the device and assets are ready.
2. **Formula story:** use one bounded desktop pin with three chapters: ingredient,
   texture, and daily ritual. Keep the chapter copy as ordinary HTML.
3. **Shop the collection:** clear product cards, prices, product sizes, and a useful
   filter. Present six marked sample products only during fixture development.
4. **Ritual:** demonstrate application with approved photography and concise
   instructions. Use a simple vertical section on mobile.
5. **Evidence and footer:** ingredient detail, verified claims, genuine reviews
   when available, shipping/returns links, contact, and newsletter consent.

## Motion specification

| Area | Desktop | Mobile / reduced motion |
| --- | --- | --- |
| Hero entrance | One 600–900ms bottle/light entrance | Packshot; brief opacity change or immediate display |
| Formula story | One pin spanning at most 2.5 viewport heights | Normal vertical document flow; all chapters readable |
| Bottle pose | Progress 0–1 maps to three authored camera/bottle poses | Static composition; optional direct user rotation |
| Product cards | Subtle scale or image change on hover/focus | Clear tap target; no hover dependency |
| Cart drawer | 180–260ms transition preserving focus | Respect reduced motion; immediate if requested |

These are project decisions, not measurements. Start with native scrolling.
Avoid scroll hijacking, a mandatory loading screen, camera shake, cursor effects
over shopping controls, and animations on every element. Consider Lenis only
after measuring a demonstrated need, with one shared animation ticker and the
same accessible fallback paths.

## Acceptance criteria

- The initial viewport communicates what is sold and how to shop.
- Product, collection, and cart content remain usable if WebGL fails or motion is
  disabled. The 3D scene is an enhancement to a complete HTML/image layout.
- At 390px width, the product and shopping action remain legible without a
  compulsory cinematic sequence. Check 768px and 1440px layouts separately.
- A missing asset leaves a useful packshot and page layout rather than a blank
  hero. Returning via browser history restores normal scrolling and page state.
- Placeholder prices, reviews, claims, and policies never masquerade as live
  business facts. Remove fixture labels only after connecting verified data.
- Capture and inspect screenshots for the hero, product page, and cart in each
  target layout when browser tooling becomes available.

Read `asset-brief.md` for deliverables and `architecture.md` for budgets and
application boundaries.
