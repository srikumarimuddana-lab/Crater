# Visual contract: Forest & Gilt (preview)

Status: the user chose a premium luxury look in green, brown and gold (2026-10-09). This
replaces the Phase 1 "Mineral Atelier" palette; type roles, grid and composition carry over.
No brand identity, photography or label art has been supplied: all names, prices, copy and
illustrations remain marked fixtures. Contrast ratios are WCAG 2.x, computed with a script.

## 1. Palette and contrast

Tokens live in `apps/storefront/src/app/globals.css` (`@theme`).

| Token | Hex | Role |
| --- | --- | --- |
| `ivory` | `#F7F2E8` | Page background |
| `parchment` | `#EDE3D1` | Light surfaces, chips, hover fills |
| `forest` | `#14301F` | Hero band, primary action on light |
| `forest-hover` | `#1F4430` | Hover on forest; gradient highlight |
| `forest-deep` | `#0E2417` | Header band, image backdrops |
| `espresso` | `#2A1D15` | Body text on light; banner and footer bands |
| `walnut` | `#5C4330` | Secondary text and chip borders on light |
| `gold` | `#C9A86A` | Gold button fill; text on dark; rules/ornaments |
| `gold-light` | `#E2CB97` | Text and focus ring on dark bands |
| `gold-deep` | `#8C6A2F` | Hairlines on light; text only at 24px and above |

| Foreground on background | Ratio | Use |
| --- | --- | --- |
| espresso on ivory / parchment | 14.65 / 12.85 | Body, headings, chips |
| walnut on ivory / parchment | 8.18 / 7.18 | Captions, size, eyebrow, chip borders |
| forest on ivory | 12.78 | Focus ring on light, active chip fill |
| ivory on forest / forest-hover | 12.78 / 9.76 | Hero text |
| gold on forest / espresso | 6.31 / 7.23 | Eyebrows on dark |
| gold-light on forest / espresso | 8.98 / 10.29 | Captions, price labels, focus ring on dark |
| forest-deep on gold | 7.24 | Gold primary button label |

Forbidden: gold on ivory as text (2.03); gold-deep text below 24px (4.46 on ivory, 3.91 on
parchment). On light surfaces, gold appears only as hairlines, ornaments and image frames.

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

Never set display type below 20px (Bodoni hairlines). Body text espresso on light, ivory on dark; eyebrow/captions walnut on light, gold on dark.

## 3. Spacing and grid

Scale (4px base): `--space-1..10` = 4, 8, 12, 16, 24, 32, 48, 64, 96, 128px. Section padding-block: 48 (390), 64 (768), 96 (1440). Radius: 2px images/cards/buttons, 999px chips.

| Viewport | Columns | Gutter | Side margin | Content width |
| --- | --- | --- | --- | --- |
| 390 | 4 | 16px | 20px | 350px |
| 768 | 8 | 24px | 32px | 704px |
| 1440 | 12 | 32px | 80px | max 1280px, centered (`--max-content: 80rem`) |

## 4. Focus, targets, buttons

- Focus: 3px outline, 3px offset. Forest on light surfaces; `.on-dark` bands (banner, header,
  hero, footer) switch to gold-light. `forced-colors` uses `Highlight`.
- Targets at least 44px; buttons 52px tall, uppercase, 0.12em tracking, 2px radius.
- `gold` (dark bands): gold fill, forest-deep label, hover gold-light.
  `outline-light` (dark bands): 1px gold-light border, ivory label, hover forest-hover.
  `primary` (light): forest fill, gold-light label. `secondary` (light): 1px espresso border.
- Ornament: a gold hairline with a centered lozenge (`ornament` utility), decorative only.

## 5. Composition

- Banner: espresso band, centered, gold-light "Preview — sample products, not for sale."
- Header: forest-deep band with a gold hairline; centered gold-light Bodoni wordmark with
  0.32em tracking; "Skincare atelier" (decorative, desktop only) left; "Shop" right.
- Hero: full-bleed forest band with a soft radial highlight. DOM order head, media, buy at
  every width. The copy is top-aligned beside the packshot (centering it shifted the heading
  when fonts swapped). The packshot sits in a gold hairline frame offset 6px; 1:1 at 390,
  4:5 from 768. Gold eyebrow, ivory h1, ornament, ivory preview copy, price with gold-light
  "Sample price", then gold and outline-light actions.
- Collection: ivory section with a centered walnut eyebrow, h2, ornament and count line;
  centered filter chips (walnut border; active chip forest with gold-light). Cards use a
  forest-deep image frame with a gold-deep hairline, a parchment "Sample product" chip, a
  Bodoni title and a gold-deep rule above size and price. Grid 2 / 3 / 3 columns.
- Footer: espresso band, centered gold wordmark, ornament, preview notice.

## 6. Placeholder packshots

Generated by `apps/storefront/scripts/generate-placeholder-packshots.mjs` into
`public/products/<handle>/packshot.svg` (800×1000). Forest gradient backdrop with a warm gold
glow, a walnut-stone plinth with a gilt rim, green or amber glass with gilt caps and collars,
and ivory labels with a gold inner rule. Every image carries a top "ILLUSTRATION PLACEHOLDER —
NOT A PRODUCT PHOTO" band, and the page adds an HTML caption or overlay. These are not
approved packaging. Fixture names, sizes and prices come from `src/lib/content/fixtures.ts`.

## 7. Assets still needed from the brand

Product names, handles and real SKUs; packaging dimensions and materials; front/back/side
photography; approved label artwork and fonts with licence; approved benefit copy; real
sizes and prices; ingredient records and claims evidence; logo/wordmark; ingredient and
ritual photography; usage rights for all of the above. Later: measured references for the
GLB and a matching scene poster.

## Open decisions

1. Whether the real brand packaging is green glass, amber glass or opaque, which decides how
   far the 3D scene in Phase 3 can carry this palette.
2. Currency display ("$68.00 CAD" today) and whether sample prices stay visible.
3. Whether the preview banner should stick once cart or checkout UI exists.
