# Client design direction, extracted from the shared design session (2026-10-11)

Source: the shared Claude conversation "Mobile-friendly website redesign" (claude.ai/share/e110b3f2…),
a Design-canvas session run in parallel to this repository. Extracted from its transcript and the
design files it wrote. Attachments (the client's logo, screenshots) were hidden in the share, so
values that lived only in attachments are marked "not recoverable".

## 1. Who the client is (changed during the session)

- Brand: **The Creator's Remedy** (renamed from the WishGarden Herbs reference site early on).
  Founder is a registered nurse. Based in **Saskatchewan**, shipping across Canada; prices in CAD;
  bottle sizes 30 mL / 60 mL; NPN (Health Canada licence) placeholders instead of a US disclaimer.
- Offerings the client listed (each got its own page): Shop Herbal Remedies (balms, salves,
  botanical preparations); Glow Getter™ Skincare (serums, scrubs, facial products); Little Sprout
  Baby™ (baby care); Herbal Education (downloadable PDFs, future courses); Holistic Coaching
  (health, wellness) and Menopause coaching; About the Founder (nursing experience, credentials,
  herbal education, why she started); Contact (customer inquiries, business information).
- Canadian identity: "Proudly Canadian" maple-leaf tag plus "Saskatchewan-born" and "Coast to
  coast"; headline "Prairie Remedies." (earlier "Remedies, rooted on the Prairies."); "Find us
  across Canada" stockists by province with "Become a stockist"; EN | FR switch was added, then
  removed on the client's request.
- "Take a quiz" is a menu item styled as a solid green button like "Shop now"; a quiz page
  recommends a product, a PDF guide or a coaching programme.

## 2. How the visual direction moved (in order)

1. Elise structure, Nuda brightness (same brief as this repository).
2. "Not elite like Elise" → more upscale: ivory and white, sharp edges, hairlines, small-caps labels.
3. Desktop added; headline font switcher (Cormorant Garamond default; Playfair, Bodoni Moda,
   Instrument Serif, EB Garamond). Elise's real font is Gambetta (known from its CSS; not on Google
   Fonts). Footer like Elise; navigation and wording from Nuda.
4. Client: "bright colours like the hero section of Nuda" → apricot/sunflower attempt, rejected.
5. Client: "use the colours like it is in Nuda" → Nuda's exact palette applied (section 3).
6. Client: "it has some scrolling motion as well" → Nuda-style scroll motion (section 5).
7. Client: "didn't like orange; green is fine, a little pink is fine, and gold writings".
8. Client keeps the **original logo colours** (amber gold and dark brown, heavy slab lettering,
   lotus, TCR molecule, bee, honeycomb, ™, tagline); the website's gold was changed to the logo's
   amber, slightly deeper on white for readability.
9. The user's own Framer site (optimistic-tours-585899.framer.app) is a copy of the Nuda template;
   the final home page ("00 · Home — Framer layout") follows it section by section.

## 3. Final palette (Nuda's values, as adjusted by the client's feedback)

| Role | Value | Notes |
| --- | --- | --- |
| Deep green: hero, header on the Framer home, buttons | `#226C5D` | Nuda's "Order" green |
| Prairie green: accents, step titles, links, gradient mid-stop | `#329258` | |
| Mint: top banner, highlights, gradient start | `#B5FFD8` | hero gradient `293deg #B5FFD8 → #FFFFFF 54%` |
| Pale mint section tint | `#EAFBF1` | |
| Cream: footer and section backgrounds | `#F7F5EF` | footer text dark |
| Ink / grey text | `#242424` / `#4D4D4D` | |
| Blush pink (replaced Nuda peach `#FFE1C1` and coral `#FFB4A8`) | `#F8E1E7`, dusty rose `#E9A9BA` | "a little pink is fine" |
| Gold lettering | logo amber (exact value not recoverable; redrawn-logo set used `#A8832F`, light `#F3D58C`, deep `#8A6A22`, brown `#5A4416`) | accent word in headings; big green-section headlines fade white → amber |
| Maple leaf | Canadian flag red | |
| Removed | all orange, apricot, sunflower, peach | client rejected |
| Hero background | green gradient `135deg #226C5D → #329258 → #B5FFD8` with a faint paint-texture image at low opacity | photo goes behind once supplied |

## 4. Type

- Framer-layout home: **Bricolage Grotesque** 400–800 (Nuda's heavy headline face) for display,
  **Public Sans** 400–600 for body. Big stacked two-line hero word ("Prairie / Remedies.").
- Elise-layout pages: Cormorant Garamond display (switchable), Jost body, Instrument Serif for
  italic words; one italic word per heading, now in gold.
- Logo: original heavy slab lettering kept; tagline in Cormorant italic in the redrawn version.

## 5. Layout, components and motion

- Header: logo left, menu right (Home / About / Products / Blog / Take a quiz button), Cart.
  Phone: Menu button; a panel slides in from the right over a dimmed page; Products expands;
  "Not sure where to start? Find your remedy" card.
- Buttons: pill (999px), deep green with white text; wording "Shop now", "Learn more",
  "View all products"; outlined "Learn more"; buttons lift on hover. Cards 24–32px radius.
- Home (Nuda order with the client's content): hero → ticker band ("Nourishment / Immunity /
  Calm / Rest / Rooted on the Prairies / Proudly Canadian / …") → "Curated with care, made by a
  nurse" (round product photo overlapping the big photo, drifts up on scroll) → "Easy steps, for
  happy skin" with Choose / Apply / Restore steps that highlight in turn on scroll and switch the
  image → feature banner → Product Range (three collections) → "Care beyond the jar" (coaching,
  education cards) → Customer Reviews (placeholders) → Why (five openable points) → Join The
  Movement (#thecreatorsremedy) → Find your fit (quiz) + newsletter "Stay updated with offers!"
  → Get in touch → footer.
- Footer (Elise style): wordmark, social icons, "Get in touch", Shop / Links / Legal columns, a
  very large brand name across the bottom, closing line; cream background with dark text.
- Motion: sections rise and fade in; images scale in; hero words slide in from left and right;
  ticker scrolls; still page under reduced motion.
- Inner pages: Products (filter by need: side panel on desktop, scrolling tabs on phone; sort;
  quiz banner), Product (gallery, 30/60 mL, one-time or Subscribe & Save, quantity, add to cart,
  details, how to use, pairs well, reviews), Coaching, Education, About the Founder, Blog,
  Article, Quiz, Contact & stockists, Cart (free-shipping bar, GST/HST/PST at checkout).

## 6. Still open in that session

Real logo files in original colours (attached there, not here); product names, prices, story,
team, address, business and GST/HST numbers, NPN numbers, real reviews, photos; policies; the
tagline's "is the cure" wording against Health Canada advertising rules; coaching disclaimer
against the nursing college's rules.

## 7. Realignment status (2026-10-12)

The storefront was realigned to this direction on 2026-10-12 (commit on `claude/zen-lovelace-3mi1ro`;
record in `implementation-plan.md`). Done: palette, fonts, hero, ticker, navigation and phone menu, quiz
button, pill buttons and wording, section tints, footer, scroll motion, coaching/education/quiz pending
pages, brand name and metadata, packshot labels. Not done, by design: the sample catalogue is unchanged
until the client's product list exists; the quiz, coaching and education pages carry no content yet; the
logo file still has to be added to `apps/storefront/public/brand/` (it was hidden in the share link).

### Original gap table (before realignment)

| Topic | This repository today | Client's latest direction |
| --- | --- | --- |
| Hero | near-white page, serif headline, packshot tile | deep-green gradient hero, mint → amber gradient headline, heavy sans |
| Accent | moss `#226A49` for actions only; bronze italic word | Nuda `#226C5D` / `#329258`; gold (logo amber) lettering; a little blush pink |
| Dark bands | none | green hero band and green header on the home page; cream footer |
| Display font | Fraunces | Bricolage Grotesque (home), Cormorant Garamond (inner pages) |
| Buttons | 8px radius, sentence case | pills, Nuda wording |
| Motion | none yet (Phase 4) | scroll rise/fade, image scale, ticker, step highlighting |
| Catalogue | tinctures, body oils, kits | balms/salves, skincare, baby care, education, coaching |
| Navigation | Shop mega menu, centred wordmark | logo left, menu right, slide-out panel, quiz button |

Aligning the storefront with this direction is a separate, owner-approved change: it touches the
palette, fonts, hero, navigation, the catalogue model and the motion plan.
