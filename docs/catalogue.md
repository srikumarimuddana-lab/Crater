# Sample catalogue: herbal extracts (preview)

Status: draft for the architect and frontend, 2026-10-09. Replaces the skincare seed. Everything here is
ORIGINAL sample content: names, prices, sizes, SKUs and stock are placeholders, not business facts. No
health, efficacy or disease claims, reviews, ratings, "best seller" labels, discounts, certifications or
free-shipping thresholds appear anywhere. Copy lives in `apps/storefront/src/lib/content/shop-copy.ts`
(`nav`, `home`, `footer`, `productPage.npnNotice`). Mark anything not yet supplied "OWNER".

## 1. Navigation and collections

Mega menu "Shop" (links go to `/?category=<handle>#collection` until collection routes exist):

| Column | Items (collection handle) |
| --- | --- |
| Formats | Tinctures (`tinctures`), Body oils (`body-oils`), Single herbs (`single-herbs`), Kits & gifts (`kits-gifts`) |
| Rituals | Daily (`daily-ritual`), Evening (`evening-ritual`), Seasonal (`seasonal`), Body care (`body-care`) |
| Explore | About, Ingredients & sourcing, Journal: placeholder pages, each marked "content pending" |

Collections (titles are neutral format or routine labels; description for all: "Sample collection. Preview copy."):

| Handle | Title | Kind |
| --- | --- | --- |
| `tinctures` | Tinctures | Format |
| `body-oils` | Body oils | Format |
| `single-herbs` | Single herbs | Format |
| `kits-gifts` | Kits & gifts | Format |
| `daily-ritual` | Daily ritual | Routine |
| `evening-ritual` | Evening ritual | Routine |
| `seasonal` | Seasonal | Routine |
| `body-care` | Body care | Routine |

No children's, pregnancy or medical-condition collections. Avoid: calm, relief, immune, detox, cleanse, boost, sleep, stress.

## 2. Sample products

Option name is "Size" for every product. Prices are SAMPLE prices in CAD (minor units in brackets). No compare-at prices.
Order = seed order (product 1 is the homepage hero). First variant listed is the default.

| # | Handle | Title | Format | Collections | Variants: price (stock) |
| --- | --- | --- | --- | --- | --- |
| 1 | `lemon-balm-oat-extract` | Lemon Balm & Oat Extract | Tincture | tinctures, evening-ritual | 30 mL $24.00 (40); 60 mL $38.00 (25) |
| 2 | `peppermint-ginger-extract` | Peppermint & Ginger Extract | Tincture | tinctures, daily-ritual | 30 mL $22.00 (35); 60 mL $36.00 (20) |
| 3 | `chamomile-linden-extract` | Chamomile & Linden Extract | Tincture | tinctures, evening-ritual | 30 mL $24.00 (30); **60 mL $38.00 (0, SOLD OUT)** |
| 4 | `hawthorn-rose-hip-extract` | Hawthorn & Rose Hip Extract | Tincture | tinctures, seasonal | **30 mL $26.00 (2, LOW STOCK)**; 60 mL $42.00 (15) |
| 5 | `dandelion-root-extract` | Dandelion Root Extract | Single herb | single-herbs, tinctures, daily-ritual | 30 mL $22.00 (30); 60 mL $36.00 (18) |
| 6 | `nettle-leaf-extract` | Nettle Leaf Extract | Single herb | single-herbs, tinctures, seasonal | 30 mL $22.00 (28); 60 mL $36.00 (16) |
| 7 | `calendula-almond-body-oil` | Calendula & Almond Body Oil | Body oil | body-oils, body-care | 100 mL $30.00 (22) |
| 8 | `lavender-jojoba-body-oil` | Lavender & Jojoba Body Oil | Body oil | body-oils, body-care, evening-ritual | 100 mL $32.00 (20) |
| 9 | `evening-ritual-kit` | Evening Ritual Kit | Kit | kits-gifts, evening-ritual | Set of 3 $74.00 (12) |

Exactly one sold-out variant (product 3, 60 mL, quantity 0) and exactly one low-stock variant (product 4, 30 mL, quantity 2).
SKU pattern: `SAMPLE-<INITIALS>-<SIZE>` (e.g. `SAMPLE-LBO-30`). Vendor "Crater". Tags: `sample`, format in lower case.
Kit 9 (sample contents, owner to confirm): one 30 mL product 1, one 30 mL product 3, one 100 mL product 8, in a kit box.

Descriptions (one neutral sentence each; also used as "What it is"):

1. A liquid herbal extract in a 30 mL or 60 mL amber glass dropper bottle, with a gentle herbal taste.
2. A liquid herbal extract in an amber glass dropper bottle, with a warm, minty taste.
3. A liquid herbal extract in an amber glass dropper bottle, with a floral, lightly sweet taste.
4. A liquid herbal extract in an amber glass dropper bottle, with a tart, fruity taste.
5. A single-herb liquid extract in an amber glass dropper bottle, with an earthy, bitter taste.
6. A single-herb liquid extract in an amber glass dropper bottle, with a green, grassy taste.
7. A light body oil with a soft floral scent, in a 100 mL amber glass bottle with a pump.
8. A light body oil with a lavender scent, in a 100 mL amber glass bottle with a pump.
9. Three sample bottles packed together in a kit box, for gifting or trying the range.

Details fields (all sample; seed field `benefits` holds "What it is", and the UI heading should read "What it is", see section 7):

| Field | Sample value (every product) |
| --- | --- |
| What it is | The description sentence above |
| Ingredients | Botanical names per product (below) + "(sample list, pending licensed formula)" |
| How to use | "Placeholder; follow the licensed label." |
| Precautions | "Placeholder. Precautions will be added once the product is licensed. Do not rely on this text." |

Ingredients (botanical names only): 1 Melissa officinalis leaf, Avena sativa milky seed. 2 Mentha x piperita leaf, Zingiber officinale root.
3 Matricaria chamomilla flower, Tilia cordata flower. 4 Crataegus monogyna berry, Rosa canina fruit. 5 Taraxacum officinale root.
6 Urtica dioica leaf. 7 Calendula officinalis flower, Prunus dulcis oil. 8 Lavandula angustifolia flower, Simmondsia chinensis seed oil.
9 Lists its three contents. Tinctures also list the extraction base (OWNER: confirm alcohol and water base; do not publish until confirmed).

## 3. Homepage sections (copy in `home`)

| Section | Placeholder copy | OWNER input |
| --- | --- | --- |
| Announcement bar | "Preview store. Sample products only. Shipping within Canada." | Final wording |
| Hero | Headline "Liquid herbal extracts and body oils"; subline "Tinctures, single herbs, body oils and kits, shown here as sample products."; actions "Shop tinctures" and "Browse all products"; featured product = product 1 | Brand voice, photography |
| Value tiles (3) | "Secure checkout with Stripe"; "Ships within Canada"; "Prices in Canadian dollars" | Any other tile (origin, packaging, returns) |
| Featured carousel | Title "Featured formulas"; items = products 1 to 6 in order; never "best sellers" | Which products |
| Shop by ritual | Tiles for Daily, Evening, Seasonal, Body care, with one neutral line each | Imagery |
| Story block | "Placeholder. The owner's story will be added before launch." | Whole story (who, why, where) |
| Values rows (3) | Sourcing, Making, Packaging: each "Placeholder. Owner to confirm ..." | Every factual statement |
| Journal teaser | Hidden (`enabled: false`) until at least one real article exists | Articles |

## 4. Footer

| Column | Items |
| --- | --- |
| Shop | Tinctures, Body oils, Single herbs, Kits & gifts, Shop all |
| About (pending) | About, Ingredients & sourcing, Journal, each "content pending" |
| Help | Shipping & returns (policy pending), Contact (email pending); no address or policy is invented |

Newsletter sign-up is hidden (`footer.newsletter.enabled: false`) until an email provider and CASL-compliant consent text are chosen.
Footer note: "Preview store. All products are samples." Privacy and terms links: add when the owner supplies them.

## 5. Regulatory note for the owner (confirm with a regulatory adviser; not legal advice)

- Herbal tinctures sold in Canada are generally natural health products. Selling them usually needs a Health Canada
  product licence (NPN) per product, and a site licence for the manufacturer/importer. Confirm which apply to you.
- Claims (including words like "supports") are limited to what the licence approves. Until then, the site makes none.
- Labels are generally required in English and French; confirm bilingual label and website content rules.
- Confirm ingredient and allergen disclosure, alcohol-base declaration, and cautions/contraindications wording.
- Body oils may be regulated as cosmetics (ingredient list, notification). Confirm per product.
- Marketing emails need CASL-compliant consent. Organic or similar labels need certification; none are claimed.

## 6. Image needs per format (originals or licensed only; each needs alt text and a provenance note)

| Format | Shots needed |
| --- | --- |
| Tincture | Amber glass dropper bottle 30 mL and 60 mL, front on neutral ground; cap and dropper detail; label area left blank until licensed |
| Single herb | Same bottles; optional dried-herb still life (OWNER: confirm the plant matches the product) |
| Body oil | 100 mL amber pump bottle, front and pump detail; oil texture |
| Kit | Kit box closed and open, contents laid out |
| Hero/tiles | Wide hero (product 1 in context); four ritual tile images |

Until photography exists the UI keeps marked illustration placeholders (`previewCopy.imagePlaceholderCaption`).

## 7. Acceptance criteria

- C1 Seed has 9 products and 8 collections with the handles above; every `productHandles` entry resolves; no duplicate handles or SKUs.
- C2 Product 1 is first in the default order, its default variant is 30 mL at $24.00 CAD, and it is the homepage hero.
- C3 Exactly one variant has quantity 0 (product 3, 60 mL) and exactly one has quantity 2 (product 4, 30 mL). The other 30 mL variant of product 3 stays purchasable.
- C4 Single-variant products (7 to 9) render without an empty selector; kit option reads "Set of 3".
- C5 Every product page shows `productPage.npnNotice` and the sample chip. Search all seed and copy text for the avoided words (calm, relief, immune, detox, cleanse, boost, sleep, stress, best seller, free shipping, organic, review) and find none, other than in these rules.
- C6 Hidden items (journal teaser, newsletter) are not rendered or focusable. "Content pending" pages are labelled and do not 404.
- C7 Value tiles state only: Stripe-hosted checkout, Canada-only shipping, CAD prices. Anything else is absent.
- C8 Error paths from `docs/shop-requirements.md` (J2.3 to J2.5, J6.x) still pass using the new handles: sold-out 60 mL announces unavailable; low stock shows "Low stock: 2 available"; unknown `?size=` falls back to 30 mL.
- Engineer note: `ProductDetails.benefits` keeps its type; store the "What it is" sentence as the single array item. Rename the visible heading in `detailsSections.benefits` to "What it is" (architect to approve; the existing key stays).

## 8. Open owner questions

1. Brand name, real product names, formulas, sizes, SKUs, prices, photography.
2. Licence status (NPN, site licence) per product, and the launch claims and label text approved.
3. Alcohol base and any allergens; bilingual (English/French) content timing.
4. Shipping rates, carriers, times, returns policy, tax handling, contact email, privacy and terms.
5. Sourcing, making and packaging facts for the values rows; the owner's story; any certification (only if held).
6. Email provider and CASL consent text; whether a journal will launch.
