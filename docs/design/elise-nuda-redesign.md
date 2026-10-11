# Bright Atelier: the Elise-structure, Nuda-brightness redesign

Date: 2026-10-11. Owner: design architect (this session). Status: implemented in `apps/storefront`
on branch `claude/zen-lovelace-3mi1ro`; preview on sample data. Screenshots in `screens/`.

## 1. What the customer asked for

Verbatim (relayed by the owner): the customer is fine with two templates, Nuda
(https://nuda.framer.website/) and Elise (https://elise.framer.media/). She wants Elise, and
said: "i feel like elise is ok but nuda is brighter ya i like the brightness of nuda".

Reading we built to: **Elise's structure, tone and typography, lifted to Nuda's brightness.**
"Brighter" means a near-white page, light tinted surfaces instead of dark bands, and one fresh
accent; it does not mean Nuda's giant sans-serif hero or its pastel card colours.

Readings rejected: "switch to Nuda" (she said she wants Elise); "just recolour the old layout"
(she chose Elise's structure over ours); "copy Nuda's multi-pastel cards and giant type"
(brightness is not saturation, and several tints would fight an amber-glass herbal catalogue).

## 2. What the two templates actually are (measured from the live pages)

| | Elise (preferred) | Nuda (brightness) |
| --- | --- | --- |
| Page | cream `#FFFBF5`, peach `#FFF4E3` | white `#FFFFFF`, off-white `#F7F5EF` |
| Text | ink `#1C1812`, taupe `#6B6253` | greys `#242424`–`#4D4D4D` |
| Accent | bronze `#B5895E`, dark sage `#2C3528` | greens `#226C5D`, `#329258`; pastel tints |
| Dark bands | several (ink, black, sage) | one strip near the footer |
| Type | Gambetta serif with an italic word; Inter | Instrument Sans and other sans; giant word |
| Devices | pill eyebrow above h2, 01–04 lists, "→" links, feature card | benefit-word marquee, numbered "Why" list, lowercase links |
| Radius | 10px cards, pill badges | 10px cards, 4px buttons |

## 3. Brainstorm: four lenses, what each decided

- **Business analyst, customer requirement.** Keep from Elise, ranked: soft serif with one italic
  word; eyebrow above every section h2; warm cream page and peach surfaces; 01–04 numerals; arrow
  CTAs; feature card in the collection; whitespace and 10px radius. Take from Nuda: no dark bands
  at all (announcement bar, story band and footer included); a green accent only for actions and
  links; light footer; format names as the "benefit words" row. Sections we cannot reproduce
  honestly: trust badges, "Watch the film", ritual durations, ingredient origins, testimonials,
  journal, FAQ, footer address and hours. Each is omitted or kept as "Content pending".
- **Business analyst, shopper journey.** Hero must still show product, price and a shopping
  action in the first viewport. Move the full collection grid above the placeholder story and
  values so shoppers never cross "Content pending" to reach filters. Number the four ritual tiles
  01–04 as a set, never as steps or with durations. Feature product 1 as a wider card inside the
  same six-item carousel. Product page: keep the sticky buy box, size tiles with prices, quantity,
  "Add to bag — price", accordions and the NPN notice. Mobile rules: clamp headings, keep the hero
  CTA and price in the first screen, reserve heading height for font swap, 44px targets.
- **UI/UX, art direction.** A measured palette (ratios below), Fraunces for display (closest open
  licence match to Elise's soft serif, with true italics) and Inter for body, 10/8/999px radius
  scale, no card shadows, surface-toned packshot backdrops so bottles sit on the same tone as the
  tiles. Recommended one deep-green footer for gravity; the customer's words tipped the decision
  to no dark band at all (open question 1).
- **UI/UX, layout and accessibility.** A `SectionHeading` component whose eyebrow is a sibling of
  the h2 and whose italic word is a span, so every `aria-labelledby` region name stays the plain
  heading text; numerals and arrows are `aria-hidden`, so link names such as "Body care …" still
  start with the label; the feature card stays inside the six-item list; the e2e background-colour
  assertion moves to the new page colour; focus ring, reduced motion and 44px targets re-checked.

## 4. Decisions

| Area | Decision | Source |
| --- | --- | --- |
| Page and surfaces | `page #FFFDF8`, `surface #F7F4EC`, `warm #FFF3E4`, `sage #E6F0E6`; no dark bands | Nuda brightness, Elise warmth |
| Text | `ink #211D17` (16.5:1), `ink-soft #5E5547` (7.2:1) | Elise ink, AAA secondary |
| Accent | `moss #226A49` for links, buttons, focus (white on it 6.5:1); `bronze #8F6437` for the italic word and numerals (5.1:1) | Nuda green lightness, Elise bronze |
| Type | Fraunces (display, italic accent word) + Inter (body) | Elise |
| Section heading | sentence-case sage pill eyebrow + serif h2 with one accent word | Elise, amended by 6a |
| Sequences | 01–04 bronze display numerals, decorative | Elise |
| CTAs | moss primary button; "Label →" text links with a 4px hover nudge | Elise and Nuda |
| Hero | formats line, accent-word h1, lead, button + arrow link, surface packshot tile with price caption | both |
| Order | hero, facts strip, featured (feature card), rituals (sage), shop all, story (warm), values, footer (surface) | BA 2 |
| Cards | flat surface tiles, 10px radius, serif names, no borders or shadows | Nuda cards, Elise names |
| Filters | pills; active moss | Nuda |
| Product page | category line + "Sample product" pill, larger serif h1, lead, sage selected tile, sage NPN note, serif accordions | Elise calm |
| Packshots | regenerated on the surface tone with a lighter floor | art direction |
| Omitted | testimonials, trust badges, durations, origins, FAQ, journal, film link, address and hours | content rules |

## 5. Acceptance criteria and result

Checked on the screenshots in `screens/` at 390 and 1440 and on the rendered DOM.

| # | Criterion | Result |
| --- | --- | --- |
| AC1 | No full-width band darker than the sage tint; only buttons and chips are filled | Pass |
| AC2 | Page is `#FFFDF8`; alternate surfaces only surface, warm, sage; at most one tint per viewport | Pass |
| AC3 | Every homepage h2 has a left-aligned sentence-case eyebrow pill, no ornaments | Pass |
| AC4 | h1 and every homepage h2 contain exactly one italic serif word; body is sans | Pass |
| AC5 | Hero shows h1, lead, primary button, arrow link and the captioned packshot; at 390 the h1 and button sit in the first screen | Pass |
| AC6 | Rituals show 01–04 with the same four hrefs; arrows and numerals `aria-hidden`; existing e2e names unchanged | Pass (e2e) |
| AC7 | Facts strip states only Stripe checkout, Canada shipping, CAD prices | Pass |
| AC8 | No reviews, ratings, certifications, durations, origins, address or hours anywhere | Pass (claim-word e2e) |
| AC9 | Preview announcement, "Sample product" chips, placeholder notes and "Content pending" stay visible | Pass |
| AC10 | Text contrast at least 4.5:1 (3:1 at 24px and above); bronze-soft never as text | Pass (script) |
| AC11 | Product page keeps 7/12 gallery, sticky 5/12 buy box, size tiles with prices, stepper, full-width add | Pass |
| AC12 | No horizontal scroll at 390; keyboard, reduced motion and no-JS paths unchanged | Pass (e2e) |

Evidence: see "Verification" below.

## 6. Before and after

| Screen | Before (Forest & Gilt) | After (Bright Atelier) |
| --- | --- | --- |
| Home, 1440 | `screens/home-desktop-before.png` | `screens/home-desktop-after.png` |
| Home, 390 | `screens/home-mobile-before.png` | `screens/home-mobile-after.png` |
| Product, 1440 | `screens/product-desktop-before.png` | `screens/product-desktop-after.png` |
| Product, 390 | | `screens/product-mobile-after.png` |
| Bag drawer, 390 | | `screens/bag-drawer-mobile-after.png` |
| Cart page, 1440 | | `screens/cart-desktop-after.png` |
| Mega menu, 1440 | | `screens/mega-menu-after.png` |

## 7. Questions for the customer (and the default we built with)

1. Is one deep-green band (for example the footer) welcome for gravity? Default: no, the whole
   site is light.
2. Did she buy the Elise template or its fonts? Default: no; we reproduce structure and feel
   only, with original copy and open-licence fonts (Fraunces, Inter).
3. Does she have real reviews, a story, sourcing facts, a shipping and returns policy, or
   photography with usage rights? Default: none yet, so those sections stay omitted or pending.

## 8. Verification (2026-10-11)

- `npm run typecheck`, `npm run lint`, `npm run build`: pass.
- `npm run test:unit`: 322 passed, 127 skipped (Postgres-only suites without a database).
- Playwright `home.spec.ts`, `product-cart.spec.ts`, `tax.spec.ts` at 390, 768 and 1440 against
  the production build (`COMMERCE_DB=memory`): 161 passed, 10 skipped (mobile-only sticky bar,
  desktop-only mega menu), 0 failed. These include the axe scans of home, product, drawer and
  cart, the no-JavaScript cart and menu paths, the reduced-motion carousel, the delayed font and
  image layout check (CLS < 0.1, hero heading stable) and the claim-word scans.
- Image decode check: all 20 product images on the homepage decode once scrolled into view.
- Screens inspected by eye at 390 and 1440: home, product, cart page, bag drawer, mega menu,
  mobile menu (`screens/`). Not inspected visually at 768 (tests ran there).
- Contrast ratios computed with the WCAG 2.x formula for every pairing in `visual-contract.md`.
