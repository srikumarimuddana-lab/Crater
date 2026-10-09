# Visual contract: Mineral Atelier (preview), Phase 1

Status: working direction from `design-brief.md`; no brand identity, photography or label art supplied.
Everything below (names, prices, copy, illustrations) is fixture/placeholder until replaced.
Contrast ratios are WCAG 2.x, computed from sRGB relative luminance (L) by hand; re-verify with a tool when tokens change.

## 1. Palette and contrast

```css
:root {
  --color-porcelain: #F3F4EE; /* L 0.899 page bg */
  --color-mineral:   #D8E6D7; /* L 0.761 surfaces, banner, chips, hover fill */
  --color-chalk:     #FFFFFF; /* L 1.000 packshot backdrop, card media */
  --color-pine:      #202C25; /* L 0.022 text, primary action, focus ring */
  --color-pine-hover:#34473C; /* L 0.056 primary hover (derived) */
  --color-pine-muted:#4A5A4F; /* L 0.093 secondary text (derived) */
  --color-sage:      #738979; /* L 0.229 graphics only */
  --color-bronze:    #917254; /* L 0.187 packaging detail only */
  --color-limestone-top:#E4E5DB; --color-limestone-face:#CFD1C4; --color-limestone-side:#BFC2B3; /* illustration only */
}
```

| Foreground on background | Ratio | Use |
| --- | --- | --- |
| pine on porcelain | 13.11:1 | body, headings, secondary button, focus ring |
| pine on mineral | 11.20:1 | banner, chips, hover fill, ring on mineral |
| pine on chalk | 14.50:1 | card text on media, ring on chalk |
| porcelain on pine | 13.11:1 | primary button label, ring on dark bands |
| porcelain on pine-hover | 8.99:1 | primary hover label |
| pine-muted on porcelain / mineral / chalk | 6.62 / 5.66 / 7.33:1 | captions, eyebrow, size line, "Illustration placeholder" |
| sage on porcelain / chalk (graphics) | 3.40 / 3.76:1 | borders, icons, bottle outlines (>=3:1 only) |
| bronze on porcelain / chalk | 4.01 / 4.43:1 | decorative detail; large text (>=24px or 19px bold) at most |

Forbidden for any text: sage on any background (porcelain 3.40, mineral 2.91, chalk 3.76, pine 3.86); porcelain/chalk text on sage (3.40/3.76); bronze text below 24px (fails 4.5:1 everywhere: mineral 3.42, pine 3.27); sage on mineral even as a meaningful graphic (2.91 < 3). Mineral vs porcelain (1.17:1) is a decorative surface change only, never the sole cue for a boundary; interactive boundaries use pine borders.

## 2. Type roles

Fonts via `next/font`: `--font-display` Bodoni Moda (weight 400/500), `--font-body` Manrope (400/600/700).

| Role | Font | Size (clamp) | Line-height | Tracking |
| --- | --- | --- | --- | --- |
| h1 | display 500 | `clamp(2.5rem, 1.6rem + 3.6vw, 4.75rem)` (40px at 390, 53 at 768, 76 at 1440) | 1.05 | -0.01em |
| h2 | display 500 | `clamp(1.875rem, 1.3rem + 2.2vw, 3rem)` | 1.1 | -0.005em |
| h3 (card title) | display 500 | `clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem)` | 1.2 | 0 |
| body | body 400 | `clamp(1rem, 0.96rem + 0.15vw, 1.0625rem)` (>=16px) | 1.6 | 0 |
| small | body 400/600 | `clamp(0.875rem, 0.85rem + 0.1vw, 0.9375rem)` | 1.5 | 0.005em |
| eyebrow | body 600 uppercase | `0.8125rem` | 1.3 | 0.14em |
| price | body 600, tabular-nums | `clamp(1.125rem, 1rem + 0.5vw, 1.5rem)` | 1.2 | 0 |
| button/chip | body 600 | `1rem` / chip `0.9375rem` | 1.2 | 0.02em |

Never set display type below 20px (Bodoni hairlines). Body text color pine; eyebrow/captions pine-muted.

## 3. Spacing and grid

Scale (4px base): `--space-1..10` = 4, 8, 12, 16, 24, 32, 48, 64, 96, 128px. Section padding-block: 48 (390), 64 (768), 96 (1440). Radius: 2px images/cards/buttons, 999px chips.

| Viewport | Columns | Gutter | Side margin | Content width |
| --- | --- | --- | --- | --- |
| 390 | 4 | 16px | 20px | 350px |
| 768 | 8 | 24px | 32px | 704px |
| 1440 | 12 | 32px | 80px | max 1280px, centered (`--max-content: 80rem`) |

## 4. Focus, targets, buttons

- Focus (all interactive): `:focus-visible { outline: 3px solid var(--color-pine); outline-offset: 3px; }` Never `outline:none`. The offset gap exposes the surface, so the ring reads against it: 13.11 on porcelain, 11.20 on mineral, 14.50 on chalk; this holds for pine-ink buttons because the ring sits outside the button. On pine-ink bands use `outline-color: var(--color-porcelain)` (13.11). Under `forced-colors` use `outline-color: Highlight`.
- Touch target >= 44x44px for every link, chip, and button (primary 52px high; inline text links get padding-block to reach 44px).
- Primary: bg pine, label porcelain, padding 0 28px, min-height 52px. Hover: bg pine-hover (8.99:1), arrow glyph shifts 2px (only under `prefers-reduced-motion: no-preference`). Transition 180ms background-color.
- Secondary: transparent, 2px pine border, label pine. Hover: bg mineral (11.20:1). Min-height 52px (44px in cards/chips).
- Text links: pine, underline 1px offset 0.25em, 2px on hover/focus. CSS only; no JS state in Phase 1.

## 5. Hero composition

DOM order (three grid items): `head` (eyebrow "Serum", h1 "Serum No. 1"), `media` (packshot figure + figcaption), `buy` (benefit line, size, price, actions). Same DOM order everywhere, so tab/reading order matches.

- Packshot: reserved `aspect-ratio` so there is no layout shift. 1:1 at 390 (SVG art kept inside a central safe square), 4:5 at 768 and 1440 (SVG viewBox 800x1000). Chalk backdrop, limestone plinth, `figcaption` "Illustration placeholder" in pine-muted small text.
- Preview benefit line (body, pine-muted): "Preview copy: a lightweight daily serum. Final benefit wording pending brand approval." No efficacy, clinical, or ingredient claims.
- Size and price: "30 ml" (small, pine-muted) then "C$64.00" (price role) with "Sample price" small label. Fixture CAD.
- Actions: primary "Shop the serum" (to the product route when it exists; until Phase 2 it targets `#collection`), secondary link "View the collection" (`#collection`).

| Viewport | Layout |
| --- | --- |
| 1440 | 12-col. Copy `head`+`buy` stacked in cols 1-5, vertically centered; media cols 7-12, max-width 520px, end-aligned (520x650). Actions side by side. Banner 44 + header 72 + hero fits within 900px. |
| 768 | 8-col, two columns: copy cols 1-4 (about 340px), media cols 5-8 (about 340x425). h1 wraps to two lines. Actions stacked, full width of column. |
| 390 | Single column order: eyebrow, h1, media (1:1, 350px), size + price, primary button (full width), benefit line, secondary link. Price and primary action sit before the benefit so they are visible at 390x844 (about y 560-700); at 667px height the button may sit just below the fold, which is accepted. |

## 6. Collection (`id="collection"`)

h2 "Shop the collection" plus small line "Six sample products." Filter chips (links, no client JS): All, Serums, Moisturizers, Cleansers, Toners and mists, Balms. Chip: min-height 44px, padding 0 16px, 1px pine border, pill. Current chip: bg pine, text porcelain, `aria-current="page"`. Hover: bg mineral. Wrap in `<nav aria-label="Filter products">`; chips target `/?category=<slug>#collection` and the server may filter; unfiltered "All" is the default.

Grid: 2 columns at 390 (167px cards, 16px gap), 3 columns at 768 (about 218px, 24px gap) and 1440 (about 405px, 32px gap). Six cards = 3x2 at 768/1440, 2x3 at 390.

Card anatomy (top to bottom): media link, 4:5, chalk, 2px radius, "Illustration placeholder" overlay bottom-center (small 12px min, 600, pine-muted on chalk 7.33:1); chip "Sample product" (mineral bg, pine text, 1px pine border, 11.20:1, 0.8125rem 600); title h3 (link, whole card hit area via stretched link); size (small, pine-muted); price (price role, with "C$" and CAD fixture). Hover/focus: image `scale(1.03)` over 240ms (reduced-motion: none) and underline title; no hover dependency.

Fixtures: the coordinator kept the names, sizes and CAD prices in `apps/storefront/src/lib/content/fixtures.ts` (Mineral Serum 30 mL $68.00 CAD … Lip & Cheek Balm 15 g $24.00 CAD) as the single source; the "No. N" names proposed here were not adopted.

## 7. Sample marker

Banner at top of every page, above header, in flow (not sticky), bg mineral, 1px pine bottom border, pine text (11.20:1), small size, min-height 44px, padding-block 8px, centered or left aligned with a leading "Preview" in 700: "Preview — sample products, not for sale." followed by "Names, prices, images and copy are placeholders." Text wraps to two lines at 390. Role: a plain `<p>` in a region labelled "Preview notice"; not `role=alert`. Repeat a compact chip beside every price in cards, plus "Sample price" in the hero. Remove only after verified commerce data replaces the fixtures.

## 8. Placeholder packshots (SVG, drawn by the coordinator)

Canvas 800x1000 units. Backdrop chalk `#FFFFFF`, fading to `#EEF2EA` in the bottom 20%; soft mineral glow (radial `#D8E6D7`, 35% opacity, r 300) behind the bottle. Keep all products inside the central 560x520 safe box so the 1:1 mobile crop works.

- Limestone plinth: slab centered x 400; top face ellipse/parallelogram `#E4E5DB`, rx 230, ry 34 at y 760; front face rect x 170-630, y 760-880, `#CFD1C4`; right side shade `#BFC2B3` (a 60-unit strip) ; faint horizontal strata lines `#BFC2B3` 1.5px; contact shadow ellipse pine at 18% opacity under the bottle base at y 764.
- Bottle styling: glass body mineral `#D8E6D7` (85%) with 3px sage `#738979` outline (graphic, 3.76:1 on chalk); white highlight stripe 60%; caps/droppers pine `#202C25`; collar bronze `#917254` 8-12 units high; label chalk panel with pine bars and a tiny "No. N" (decorative, not a claim). No ingredient names, percentages, or certifications on illustrations.
- Forms (approx. units): serum dropper bottle 150x380 plus 70x110 bulb; cream jar 300x170 with pine lid 300x60; cleanser tube 130x400 standing on cap; toner bottle 190x380 with 90x70 cap; mist 150x400 with nozzle 60x80; balm tin 280x90 flat, pine lid.
- Marker: every packshot shows "Illustration placeholder" as HTML overlay or caption (hero `figcaption`; cards overlay), pine-muted on chalk 7.33:1. Alt text: "Illustration of <name>, placeholder packshot". Treat all as marked previews, not approved art.

## 9. Assets still needed from the brand

Product names, handles and real SKUs; packaging dimensions and materials; front/back/side photography; approved label artwork and fonts with license; approved benefit copy; real sizes and prices; ingredient records and claims evidence; logo/wordmark; ingredient and ritual photography; usage rights for all of the above. Later (not Phase 1): measured references for the GLB and a matching scene poster.

## Phase 1 implementation notes (coordinator)

- Token names are used as written (`pine`, `pine-hover`, `pine-muted`); prices render as "$68.00 CAD".
- Hero "Shop the serum" targets the serum card (`#product-mineral-serum`) until the Phase 2 product route exists; "View the collection" targets `#collection`.
- Hero copy is top-aligned beside the packshot, not vertically centered: centering moved the heading 28–40px when web fonts swapped (caught by the layout-shift test).
- Placeholder SVGs are generated by `apps/storefront/scripts/generate-placeholder-packshots.cjs` with their marker at the top of the canvas so it does not collide with the card overlay; plinth colors differ slightly from section 8.

## Open decisions

1. Hero "Shop the serum" target in Phase 1 (`#collection` anchor vs. product route stub).
2. Currency display (C$ vs. CAD) and whether sample prices should remain visible.
3. Whether the sample banner should also stick on scroll once cart or checkout UI exists.
