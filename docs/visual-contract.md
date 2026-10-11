# Visual contract: Bright Atelier (preview)

Status: the customer chose the Elise template's editorial structure and asked for the brightness of the
Nuda template ("elise is ok but nuda is brighter"), 2026-10-11. This replaces the Phase 1/2 "Forest & Gilt"
palette (2026-10-09); grid, shopping conventions and composition rules carry over. No brand identity,
photography or label art has been supplied: all names, prices, copy and illustrations remain marked fixtures.
Contrast ratios are WCAG 2.x, computed with a script (`python3 -I contrast.py`, relative luminance formula).

Reference facts (extracted from the live templates, not copied): Elise uses a cream page (#FFFBF5), a warm
peach surface (#FFF4E3), deep ink (#1C1812), dark sage and near-black section bands, a soft old-style serif
with one italic word per heading, pill labels above headings, 01–04 numbered lists and "→" links. Nuda uses
a white page, an off-white alternate band (#F7F5EF), dark-grey text, a fresh green accent and one dark
strip only. Crater keeps Elise's devices and drops every dark band.

## 1. Palette and contrast

Tokens live in `apps/storefront/src/app/globals.css` (`@theme`).

| Token | Hex | Role |
| --- | --- | --- |
| `page` | `#FFFDF8` | Page background, header, hero, collection |
| `surface` | `#F7F4EC` | Image tiles, cards, footer, hover fills, packshot backdrop |
| `warm` | `#FFF3E4` | Peach-cream band ("Our story"), notices and summary panels |
| `sage` | `#E6F0E6` | Pale sage band (announcement bar, "Shop by ritual"), eyebrow pills, selected size tile, NPN note |
| `ink` | `#211D17` | Text and headings |
| `ink-soft` | `#5E5547` | Secondary text, captions, lead paragraphs |
| `moss` | `#226A49` | Links, primary button, active filter, focus ring |
| `moss-hover` | `#17583A` | Primary button hover |
| `moss-deep` | `#16452E` | Wordmark, text on sage, test-mode notice fill |
| `bronze` | `#8F6437` | The italic accent word, 01–04 numerals, footer column headings |
| `bronze-soft` | `#B5895E` | Ornament only (value-strip dots); never text |
| hairline | `ink` at 10–20% | Dividers (`border-ink/10`), control borders (`border-ink/20`) |

| Foreground on background | Ratio | Use |
| --- | --- | --- |
| ink on page / surface / warm / sage | 16.5 / 15.3 / 15.3 / 14.4 | Body, headings |
| ink-soft on page / surface / warm / sage | 7.2 / 6.7 / 6.7 / 6.3 | Captions, lead, hints |
| moss on page / surface / sage | 6.4 / 5.9 / 5.6 | Links, focus ring, secondary button |
| white on moss / moss-hover | 6.5 / 8.4 | Primary button label, active filter |
| moss-deep on sage | 9.3 | Announcement bar, eyebrow pills, NPN note |
| bronze on page / surface | 5.1 / 4.7 | Accent word (display size), numerals, footer headings |
| page vs surface / sage / warm | 1.08 / 1.15 / 1.08 | Tints are quiet steps, not contrast |

Forbidden: `bronze-soft` as text (3.1 on page); bronze on sage below 24px (4.4). There is no dark band on any
shop page; moss fills appear only on buttons, the active filter and the stripe-test notice.

## 2. Type roles

Fonts via `next/font/google` (both SIL Open Font Licence): `--font-display` Fraunces (variable, roman and
italic, `opsz` and `SOFT` axes, `'SOFT' 50` on headings); `--font-sans` Inter (variable, `opsz`).

| Role | Font | Size (clamp) | Line-height | Tracking |
| --- | --- | --- | --- | --- |
| h1 | display 400 | `clamp(2.5rem, 1.4rem + 4.2vw, 5.25rem)`; hero caps at 4.5rem | 1.04 | -0.02em |
| h2 | display 400 | `clamp(2rem, 1.35rem + 2.6vw, 3.5rem)` (32 / 42 / 56px) | 1.08 | -0.015em |
| h3 (card title) | display 500 | `clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem)`; cards 1.25rem | 1.2 | 0 |
| accent word | display italic, bronze, `'SOFT' 80` | inherits | | |
| eyebrow pill | sans 500 | `0.8125rem`, sentence case, sage pill, moss-deep text | 1.3 | 0.01em |
| numeral | display 400, tabular | `1.5rem`, bronze, `aria-hidden` | 1 | 0 |
| lead | sans 400, ink-soft | `clamp(1.125rem, 1.05rem + 0.3vw, 1.3125rem)` | 1.5 | 0 |
| body | sans 400 | `clamp(1rem, 0.97rem + 0.12vw, 1.0625rem)` (>=16px) | 1.6 | 0 |
| small | sans 400/500 | `clamp(0.875rem, 0.85rem + 0.1vw, 0.9375rem)` | 1.5 | 0.005em |
| price | sans 600, tabular-nums | `clamp(1.125rem, 1rem + 0.5vw, 1.5rem)` | 1.2 | 0 |
| button | sans 500 | `1rem`, sentence case | 1.2 | 0 |

Accent-word rule: exactly one word per h1 and per section h2, taken from the copy (`emphasis` fields in
`shop-copy.ts`), rendered by `<Emphasis>` as a `span.accent-word` so the heading's text content, and
therefore every region name the tests assert, is unchanged. Never on product names, h3, prices or buttons.

## 3. Spacing and grid

Scale (4px base): `--space-1..10` = 4, 8, 12, 16, 24, 32, 48, 64, 96, 128px. Section padding-block: 64 (390),
96 (768 and up). Radius: 10px images, cards and panels (`rounded-card`); 8px buttons, inputs, size tiles
(`rounded-lg`); 999px pills (eyebrows, filters, chips). No shadows on cards or buttons; the mega menu, mobile
menu and bag drawer carry one soft floating shadow.

| Viewport | Columns | Gutter | Side margin | Content width |
| --- | --- | --- | --- | --- |
| 390 | 4 | 16px | 20px | 350px |
| 768 | 8 | 24px | 32px | 704px |
| 1440 | 12 | 32px | 80px | max 1280px, centered (`--max-content: 80rem`) |

## 4. Focus, targets, buttons

- Focus: 3px moss outline, 3px offset, on every surface (at least 5.2:1 on sage). `forced-colors` uses `Highlight`.
- Targets at least 44px; buttons 48px tall, sentence case, 8px radius.
- `primary`: moss fill, white label, hover moss-hover. `secondary`: 1px moss border, moss label, hover sage.
  `ArrowLink`: moss text link with an `aria-hidden` "→" that nudges 4px on hover (none under reduced motion).
- Carousel buttons: 44px circles, hairline border, hover sage, `aria-disabled` at either end.

## 5. Composition

- Announcement bar: sage band, moss-deep text, hairline below ("Preview store: sample products, not for sale.").
- Header: page colour, hairline; "Shop" mega menu left, centred Fraunces CRATER wordmark (moss-deep, 0.22em
  tracking), "Bag (n)" right; "Menu" disclosure on small screens. Mega menu columns use display headings.
- Hero: page colour, no band. Formats line (true format names) above the h1; h1 with the accent word
  ("Liquid *herbal* extracts and body oils"); lead; primary button plus "Browse all products →". The packshot
  sits in a 10px surface tile (4:3 at 390, 5:4 at 768, 3:2 at 1440) with the product link, size, price and
  "Sample price" caption below. DOM order head, media, caption at every width; the h1 reserves 3 lines on
  small screens so font swap cannot shift it.
- Store information: hairline strip, three true facts with a bronze-soft dot each, no claims.
- Featured formulas: eyebrow "The collection", h2 with accent word, "View all products →" and carousel
  controls; a scroll-snap list of six cards where the first is a wider feature card (8:5 image at 768 and up).
- Shop by ritual: sage band; eyebrow "Four rituals"; four tiles numbered 01–04 (`aria-hidden`, bronze display
  numerals over the image) with an arrow after the label. Link names still start with the label.
- Shop all: eyebrow "Every sample product", h2 "Shop *all*", count in a live region, sort form on the right,
  pill filters (active: moss fill, white text, `aria-current="page"`), 2 / 3 / 3 column grid of flat tile
  cards (surface tile, serif name, price, sizes, "Sample product"). It sits before the story and values,
  which are still placeholders.
- Our story: warm band, eyebrow "About Crater", two columns, "Content pending" outline chip.
- What we care about: page colour, hairline rows numbered 01–03, display row titles, ink-soft placeholders.
- Footer: surface band with a hairline, Fraunces wordmark, three link columns with bronze headings, pending
  markers, and the preview note. No dark footer.
- Product page: breadcrumb; gallery about 7/12 in surface tiles (strip with "1 / 2" pills below lg); sticky
  buy box about 5/12: category line plus "Sample product" pill, h1, lead, price with "Sample price", size
  tiles (selected: 2px moss border and sage fill), NPN note in a sage panel, quantity stepper, full-width
  "Add to bag — price", tax note, display-type accordions, key facts. Sticky mobile add-to-bag bar after the
  main button scrolls away.
- Bag drawer and /cart: page colour, hairlines, warm notice panels, surface summary panel, moss Checkout.

## 6. Placeholder packshots

Generated by `apps/storefront/scripts/generate-placeholder-packshots.mjs` into
`public/products/<handle>/packshot.svg` and `detail.svg` (800×1000). Surface backdrop (#F7F4EC) with a
slightly deeper floor (#EDE7DA) and a soft contact shadow, so bottles sit on the same tone as the card tiles;
amber glass, gilt caps, ivory labels with a green or bronze band. Every image carries a corner "Placeholder
illustration" note and the page adds an HTML caption. Not approved packaging.

## 6a. Real-store conventions (user direction, 2026-10-09, amended 2026-10-11)

Follow common premium Shopify-theme and editorial skincare conventions; never copy a brand's assets, copy or
distinctive layout. Amended for the Elise structure:

- Allowed once per section: a sentence-case eyebrow pill above the h2, and one italic accent word in the
  h1/h2. Still avoided: centring every section, ornaments, glows behind content, uppercase-tracked labels,
  gold rings around images, description text on cards.
- Filters are pills (not underlined text links); buttons are sentence case, 8px radius, 48px tall.
- Numbered sequences (01–04) are decorative indices, never steps, durations or routines.
- Hairlines (ink at 10%) separate sections; tints (sage, warm, surface) replace dark bands.

## 7. Assets still needed from the brand

Product names, handles and real SKUs; packaging dimensions and materials; front/back/side photography;
approved label artwork; approved benefit copy and licensed claims; real sizes and prices; ingredient
records; logo/wordmark; ritual and ingredient photography; the owner's story and sourcing, making and
packaging facts; shipping and returns policy; usage rights for all of the above.

## Open decisions

1. Whether the customer wants one deep-green band (for example the footer) for gravity; the preview has none.
2. Whether real reviews, a journal and an FAQ exist to fill the Elise sections that were omitted.
3. Currency display ("$24.00 CAD" today) and whether sample prices stay visible.
