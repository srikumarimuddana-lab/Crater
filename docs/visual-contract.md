# Visual contract: Prairie Remedies (preview)

Status: the client's direction from the shared design session (2026-10-11), applied to the storefront on
2026-10-12. It replaces Bright Atelier (2026-10-11) and Forest & Gilt (2026-10-09); grid and shopping
conventions carry over. The brand is The Creator's Remedy (Saskatchewan, shipping across Canada). No
photography, product list or approved copy has been supplied: names, prices, copy and illustrations remain
marked fixtures. Contrast ratios are WCAG 2.x, computed with a script.

Sources: Nuda's palette as read from its live page (deep green, prairie green, mint, cream, ink, grey) with
the client's adjustments ("green is fine, a little pink is fine, gold writings", no orange; keep the
original logo colours, so the gold is the logo's amber). Structure borrows Nuda's hero, ticker and
navigation and Elise's footer. Nothing is copied from either template.

## 1. Palette and contrast

Tokens live in `apps/storefront/src/app/globals.css` (`@theme`).

| Token | Hex | Role |
| --- | --- | --- |
| `page` | `#FFFFFF` | Page background, inner-page header |
| `cream` | `#F7F5EF` | Footer, section tints, image tiles, cards, packshot backdrop |
| `mint-pale` | `#EAFBF1` | Section tint ("Shop by ritual"), eyebrow pills, selected size tile, NPN note |
| `mint` | `#B5FFD8` | Announcement bar, highlights, hero gradient end |
| `blush` | `#F8E1E7` | "A little pink": story band, notice panels |
| `rose` | `#E9A9BA` | Decorative only; never text |
| `ink` | `#242424` | Text, ticker band |
| `grey` | `#4D4D4D` | Secondary text |
| `deep` | `#226C5D` | Hero and home header, buttons, links, active filter, focus ring |
| `deep-hover` | `#1B5A4D` | Button hover |
| `prairie` | `#329258` | Gradient mid-stop and large accents only |
| `amber` | `#A8832F` | Gold lettering at display size on light (the accent word) |
| `amber-deep` | `#8A6A22` | Small gold labels (footer column headings, numerals) |
| `amber-light` | `#F3D58C` | Gold on deep green at display size (hero gradient, ticker marks) |
| `leaf` | `#FF0000` | Maple leaf |
| hairline | `ink` at 10–20% | Dividers and control borders |

| Foreground on background | Ratio | Use |
| --- | --- | --- |
| ink on page / cream / mint-pale / mint / blush | 15.5 / 14.2 / 14.5 / 13.5 / 12.5 | Body, headings, announcement |
| grey on page / cream / mint-pale / blush | 8.5 / 7.8 / 7.9 / 6.8 | Secondary text |
| deep on page / cream / mint-pale / mint | 6.2 / 5.7 / 5.8 / 5.4 | Links, eyebrow pills, focus ring |
| white on deep / deep-hover | 6.2 / 7.4 | Hero text, button labels, home header |
| amber on page (24px and above) | 3.5 | Accent word in headings |
| amber-deep on page / cream | 5.0 / 4.6 | Footer headings, numerals |
| amber-light on deep (display size) | 4.4 | Hero gradient end, ticker marks |
| mint on deep | 5.4 | Alternative gradient |

Forbidden: `prairie`, `amber` or `rose` as small text; white on `prairie` (3.9); orange anywhere. The logo's
exact amber will replace `amber`/`amber-light` once the file is supplied and sampled.

## 2. Type roles

Fonts via `next/font/google` (both SIL Open Font Licence): `--font-display` Bricolage Grotesque (variable,
`opsz` axis, weights 600–800 in use); `--font-sans` Public Sans (variable).

| Role | Font | Size (clamp) | Line-height | Tracking |
| --- | --- | --- | --- | --- |
| hero title | display 800 | `clamp(3.25rem, 1.6rem + 7.4vw, 7.5rem)` (52 / 84 / 120px), two stacked words | 0.94 | -0.035em |
| h1 | display 700 | `clamp(2.5rem, 1.6rem + 3.6vw, 4.5rem)`; product page caps at 3.25rem | 1 | -0.025em |
| h2 | display 700 | `clamp(2rem, 1.4rem + 2.4vw, 3.25rem)` | 1.05 | -0.02em |
| h3 / card title | display 600 | `clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem)`; cards 1.25rem | 1.2 | -0.01em |
| accent word | display, amber (amber-light gradient on green) | inherits | | |
| eyebrow pill | sans 600 | `0.8125rem`, sentence case, mint-pale pill, deep text | 1.3 | 0.01em |
| ticker | display 600 | `1.125rem`, white on ink | | |
| numeral | display 700, tabular | `1.5rem`, amber-deep, `aria-hidden` | 1 | 0 |
| lead | sans 400, grey | `clamp(1.125rem, 1.05rem + 0.3vw, 1.3125rem)` | 1.5 | 0 |
| body | sans 400 | `clamp(1rem, 0.97rem + 0.12vw, 1.0625rem)` (>=16px) | 1.6 | 0 |
| small | sans 400/600 | `clamp(0.875rem, 0.85rem + 0.1vw, 0.9375rem)` | 1.5 | 0.005em |
| price | sans 700, tabular-nums | `clamp(1.125rem, 1rem + 0.5vw, 1.5rem)` | 1.2 | 0 |
| button | sans 600 | `1rem`, sentence case, pill | 1.2 | 0 |

Accent-word rule ("gold writings"): one word per h1 and per section h2, taken from the copy (`emphasis`),
rendered by `<Emphasis>` as a span so heading text content, and every region name the tests assert, is
unchanged. On green bands the word uses the white-to-amber gradient. Never on product names or prices.

## 3. Spacing and grid

Scale (4px base): `--space-1..10` = 4, 8, 12, 16, 24, 32, 48, 64, 96, 128px. Section padding-block: 64 (390),
96 (768 and up). Radius: 24px cards, image tiles, panels and the quiz banner (`rounded-card`); 16px size
tiles and the phone-menu quiz card (`rounded-tile`); 8px inputs; 999px buttons, filters, tags and pills.
No card shadows; the hero packshot carries one soft drop shadow; the Shop menu, phone-menu panel and bag
drawer carry one floating shadow.

| Viewport | Columns | Gutter | Side margin | Content width |
| --- | --- | --- | --- | --- |
| 390 | 4 | 16px | 20px | 350px |
| 768 | 8 | 24px | 32px | 704px |
| 1440 | 12 | 32px | 80px | max 1280px, centered (`--max-content: 80rem`) |

## 4. Focus, targets, buttons and motion

- Focus: 3px deep-green outline, 3px offset; white on green bands (`.on-green`). `forced-colors` uses `Highlight`.
- Targets at least 44px; buttons 48px tall, pills, sentence case, Nuda wording ("Shop now", "Learn more",
  "View all products", "Take a quiz").
- `primary`: deep fill, white label. `secondary`: ink outline. `light` (on green): white fill, deep label,
  hover mint. `outline-light` (on green): white outline. `ArrowLink`: text link with an `aria-hidden` "→".
- Motion (CSS and one small observer; everything still under `prefers-reduced-motion: reduce` and complete
  without script): hero words slide in from left and right and the lead fades in on load; the ticker scrolls
  continuously (the duplicate row is `aria-hidden`); buttons lift 2px on hover; `.reveal` sections below
  the fold rise and fade in once when they enter (marked by `RevealObserver` after hydration only).
  Nothing animates the hero image, so layout stays stable while fonts and images load.

## 5. Composition

- Announcement bar: mint band, ink text ("Preview store: sample products, not for sale. Shipping within Canada.").
- Header: logo left (the supplied file, or the brand name as text), primary links on wide screens
  ("Home", "Shop" menu, "Coaching", "Education", "About", "Journal"), a "Take a quiz" pill, "Bag (n)",
  and on small screens "Menu". The home page's header sits on the green hero (white text, white quiz
  pill); inner pages use a white header with a hairline. The Shop menu is unchanged (three columns plus
  "Shop all →"). The phone menu slides in from the right over a dimmed page; the "Menu" control becomes the
  round close button in the panel's corner; it lists the primary links, the Shop columns and a quiz card.
- Hero: green gradient with a faint texture; Canadian tags ("Proudly Canadian" with a maple leaf,
  "Saskatchewan-born", "Coast to coast"); the stacked "Prairie / Remedies." headline; lead; white "Shop
  now" pill and "Learn more →"; the packshot in a 24px cream tile overlapping the headline column on wide
  screens, with the product link, size, price and "Sample price" caption below. DOM order head, media,
  caption at every width; the h1 reserves two lines on small screens.
- Ticker: ink band with the client's offerings and Canadian lines, separated by amber marks.
- Store information: hairline strip with the three true facts.
- Featured formulas: eyebrow "Product range", gold "formulas", "View all products →", carousel with a
  wider feature card first.
- Shop by ritual: pale mint band; eyebrow "Four rituals"; tiles numbered 01–04 with an arrow after the label.
- Shop all: eyebrow, gold "all", count, sort, pill filters (active deep fill), 2 / 3 / 3 grid of flat cream
  tile cards. Before the story and values, which are placeholders.
- Care beyond the jar: two cream cards (Holistic coaching, Herbal education, both "Learn more →" to pending
  pages) and a deep-green quiz banner ("Not sure where to start?", white "Take a quiz" pill).
- Our story: blush band, eyebrow "About the founder", "Content pending" chip.
- What we care about: hairline rows numbered 01–03.
- Footer: cream; logo, tagline "Rooted on the Prairies.", Canadian tags, "Get in touch" (details pending),
  Shop / About / Help columns with amber-deep headings, the brand name set very large at 15% deep green,
  then the preview note and copyright.
- Product page: category line plus "Sample product" pill, heavy h1, lead, price, size tiles (selected: deep
  border, pale mint fill), pale mint NPN note, stepper, full-width pill "Add to bag — price", accordions,
  key facts; sticky phone bar. Bag drawer and /cart: white, hairlines, blush notices, cream summary panel.

## 6. Placeholder packshots

Generated by `apps/storefront/scripts/generate-placeholder-packshots.mjs` into
`public/products/<handle>/packshot.svg` and `detail.svg` (800×1000): cream backdrop (#F7F5EF) with a
deeper floor (#EFEDE6), amber glass, gilt caps, white labels reading "THE CREATOR'S REMEDY" with a green or
amber band, and a corner "Placeholder illustration" note. Not approved packaging; replaced by photography.

## 6a. Real-store conventions (user direction, 2026-10-09, amended 2026-10-12)

Follow common premium Shopify-theme conventions; never copy a template's assets, copy or distinctive
layout. Amended for the Nuda direction: pills for buttons, filters and tags; one sentence-case eyebrow
pill and one gold word per section heading; numbered 01–04 tiles are indices, never steps or durations;
the hero, header and quiz banner are the only deep-green surfaces; the ticker is the only dark band.

## 7. Inputs still needed from the client

The logo file (placed in `apps/storefront/public/brand/`); the product list for the three collections
(herbal remedies, Glow Getter™ skincare, Little Sprout Baby™) with sizes, prices and photography; the
founder's story and credentials; coaching programmes and the education library; the quiz questions and
logic; contact details, business numbers and policies; NPN numbers and approved claims; usage rights.

## Open decisions

1. Reseeding the sample catalogue with the client's three collections once the product list exists.
2. Whether real photography replaces the hero texture (the design intends a photo behind the headline).
3. Journal, reviews and FAQ sections stay absent until real content exists.
