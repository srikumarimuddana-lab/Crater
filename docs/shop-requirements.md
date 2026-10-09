# Shop requirements (Phase 2, preview)

Status: draft for the frontend developer, 2026-10-09. Scope: product page, bag, checkout hand-off,
confirmation, recovery. All products are SAMPLE fixtures; the store runs in `fixture` mode (no
payment) or `stripe-test` mode (test cards, no real charge). Contract: `src/lib/commerce/types.ts`.
Copy: `src/lib/content/shop-copy.ts` (map error CODES to copy; never render the server `message`).
Brand, prices, policies and claims are owner inputs (section 9).

## 0. Conventions

- Items are numbered `J<journey>.<n>` and are checkable in Playwright. **banner** = page-level
  `role=status` (polite) or `role=alert` (blocking). **inline** = text tied to its control with
  `aria-describedby` and `aria-invalid`. **live region** = a polite `aria-live` node present before
  its text changes.
- NEVER on any page: invented reviews, ratings, "bestseller", testimonials, clinical or dermatologist
  claims, certifications, fake urgency (countdowns, "selling fast", "X viewing"), discount or "free
  shipping" wording, or stock numbers other than the backend's real `quantityAvailable`. Sample
  content stays labelled (`previewCopy`).
- `/cart`, `/checkout/*`, `/api/*`: `noindex` and `Cache-Control: private, no-store`.
- Mobile (390): one column, no horizontal scroll, targets 44px or more, body 16px or more, every
  journey completable with the 3D scene absent and motion reduced.

## 1. Browse, filter, open a product

- J1.1 Given the homepage, when I choose "Serums", then only serum products show, the chip has
  `aria-pressed=true`, and the count updates in a live region (`browse.count`).
- J1.2 Given a filter with no products, then `browse.emptyCollection` shows and focus is kept.
- J1.3 Given a card, when I press Enter on its link, then `/products/<handle>` opens.
- J1.4 Given an unknown handle, then a 404 page shows `productPage.notFound*` and a link back.
- Mobile: two-column grid; chips wrap with visible focus. Keyboard/SR: chips are buttons in one tab
  sequence; link names use `browse.viewProduct(title)`.

## 2. Product page

Content: packshot (caption `previewCopy.imagePlaceholderCaption`), `h1`, "Sample product" chip,
price ("$68.00 CAD"), size/shade selector, availability, quantity, Add to bag, then Benefits /
Ingredients / How to use / Precautions (`detailsSections`).
- J2.1 Given `/products/mineral-serum`, then title, price and packshot are in the server HTML (no JS,
  no WebGL) and 30 mL is selected by default.
- J2.2 Given I pick 15 mL, then the URL becomes `?size=15+mL`, the price shows $42.00 CAD, Back
  restores the earlier selection, and reloading keeps it.
- J2.3 Given `?size=bogus`, then the default variant shows with `productPage.variantNotFound`.
- J2.4 Given `lip-cheek-balm` Shade 01 (quantityAvailable 0), then the option is announced unavailable
  (`optionValueLabel`), choosing it shows `variantUnavailable`, and Add is disabled with
  `addToBag.unavailable`. Shade 02 stays purchasable.
- J2.5 Given `cloud-cream` Refill 50 mL (quantityAvailable 2), then "Low stock: 2 available" shows
  (`lowStockText`). Above the threshold, or null, nothing shows.
- J2.6 Quantity accepts 1 to 10 (and at most `quantityAvailable` when known); steppers are named by
  `quantity.increase/decrease`; invalid entry shows `cartErrors` inline.
- J2.7 Given I press Add, then it shows `addToBag.pending` (disabled, `aria-busy`), then `added` for
  about 2s, the header badge updates, and `announceAdded` is announced once.
- J2.8 Each details section is readable HTML (no tabs needed) with its `disclaimer` visible; the
  ingredient list reads "not yet supplied" until the brand supplies INCI.
- Mobile: packshot above title; option chips 44px or more; Add full width, nothing sticky covering
  content. Keyboard: options are a fieldset/radiogroup with `optionLegend`; focus stays on Add. SR:
  the price change on variant switch is announced.
- Metadata: `noindex` while sample; canonical and Product JSON-LD only with real data.

## 3. Bag (drawer and `/cart`)
- J3.1 The header "Bag" shows a count badge (hidden at 0) named by `bag.openLabel(n)`.
- J3.2 Opening the drawer moves focus in, traps Tab, closes on Escape and returns focus to the
  trigger; the page behind is inert. Transition 180 to 260ms, none under reduced motion.
- J3.3 Each line shows title, option, unit price, quantity control, line total, remove. Subtotal is the
  server's `cost.subtotalAmount`, with `bag.taxShippingNote` beside it.
- J3.4 On quantity change or remove, controls disable while pending, subtotal and badge update,
  `quantity.announce*` is spoken, and focus lands on a sensible control (never `body`).
- J3.5 Empty bag: `bag.emptyHeading/Body` and "Continue shopping"; no checkout button.
- J3.6 With JavaScript disabled, `/cart` renders the same lines with per-line forms (Update quantity,
  Remove) and a Checkout form that POSTs to `/api/checkout`; each is a full page load.
- J3.7 At the real `quantityAvailable` or 10, Increase is disabled and `quantity.atMaximum(10)` shows.
- Mobile: full-width sheet; subtotal and Checkout stay visible in a footer while lines scroll.
  Never: upsells with invented popularity, promo codes.

## 4. Checkout
- J4.1 Fixture mode: pressing Checkout keeps me on the site at `/cart?checkout_error=FIXTURE_MODE`
  with `fixtureCheckout` in a blocking banner, no Stripe call, bag unchanged.
- J4.2 Stripe test mode: bag and checkout surfaces show `stripeTestModeBanner`; Checkout navigates to
  `checkout.stripe.com` (303 from `/api/checkout`); the bag is not cleared before the webhook.
- J4.3 Cancelling at Stripe returns to `/cart?checkout=cancelled` with `checkoutCancelled` and the
  same lines.
- J4.4 An empty/expired bag, unavailable item or provider failure returns to
  `/cart?checkout_error=<CODE>` showing `checkoutErrors[CODE]`; unknown codes show
  `checkoutErrorFallback`. The query value is never echoed.
- J4.5 Two quick presses make one request (`bag.checkoutPending`); the backend reuses the session.
- Keyboard/SR: the banner is `role=alert` and links back to the lines. Never: card fields on our site, or
  a demo "Pay" button implying payment.

## 5. Confirmation `/checkout/success?session_id=...`

Statuses from `getCheckoutResult`: `paid`, `processing`, `unpaid`, `not_found`.
- J5.1 `paid`: `confirmation.paid.heading`, order number (`#1001`), lines, subtotal, shipping, taxes,
  total, `keepNumber`. Test mode adds `testOrderNote`; fixture adds `fixtureOrderNote`. Never show the
  Stripe session ID, and show no email unless the owner asks.
- J5.2 `processing`: `confirmation.processing`, a Refresh link to the same URL (works without JS),
  `contactLine`, and "do not pay again". No order number.
- J5.3 `unpaid`: `confirmation.unpaid` with a link to `/cart`; no order language.
- J5.4 `not_found` (missing, malformed or foreign `session_id`): `confirmation.not_found`; do not reveal
  whether other sessions exist.
- J5.5 The `h1` takes focus on load; `noindex`; no purchase event from any status but `paid`.
  Mobile: totals as a definition list, nothing wider than 350px.

## 6. Recovery

- J6.1 Expired cart (`MISSING_CART` or a dead cookie cart): `recovery.cartExpired*` and the empty state;
  the next add creates a new cart.
- J6.2 Price changed: when the refreshed unit price differs from what was shown, `recovery.priceChanged`
  (or `priceChangedGeneric`) appears in the bag banner with the new subtotal.
- J6.3 Out of stock: the warning shows `cartWarnings[code](title)` in the bag banner and near Add;
  quantities shown are the server's; checkout returns `CART_INVALID` if still short.
- J6.4 Network failure: controls re-enable, `recovery.networkError` is announced with Try again. A timed-out
  add is never replayed silently: refetch the bag, then show `recovery.addUncertain` if unconfirmed.
- J6.5 5xx: `recovery.serverError`; no stack, IDs or cart cookie on the page or in logs. Route
  `error.tsx` uses `recovery.errorPageHeading/Body` with a link home.
- J6.6 Double click on Add raises quantity by 1 only; the second click is ignored. Known limit: without
  JavaScript a repeated submit adds again; the bag shows the true quantity.

## 7. Message map (code, copy key, where it shows)

| Source code | Copy key | Shows |
| --- | --- | --- |
| `CartUserError` INVALID | `cartErrors.INVALID` | Inline at `field`; else bag banner |
| LESS_THAN, GREATER_THAN, INVALID_QUANTITY | `cartErrors.<code>` | Inline beside quantity |
| INVALID_MERCHANDISE_LINE | `cartErrors.INVALID_MERCHANDISE_LINE` | Bag banner (status), then refetch |
| MERCHANDISE_NOT_FOUND | `cartErrors.MERCHANDISE_NOT_FOUND` | Product: inline near Add; bag: banner |
| MISSING_CART | `cartErrors.MISSING_CART` | Bag banner plus expired empty state |
| `CartWarning` NOT_ENOUGH_STOCK | `cartWarnings.<code>(title)` | Live region plus bag banner (target is a line ID) |
| `CartWarning` OUT_OF_STOCK | `cartWarnings.<code>(title)` | Live region plus bag banner (target is a variant ID) |
| Checkout FIXTURE_MODE | `checkoutErrors.FIXTURE_MODE` | `/cart` blocking banner (alert) |
| EMPTY_CART, CART_INVALID, PAYMENT_PROVIDER_UNAVAILABLE | `checkoutErrors.<code>` | `/cart` banner |
| FORBIDDEN (route only) | `checkoutErrors.FORBIDDEN` | `/cart` banner |
| `?checkout=cancelled` | `checkoutCancelled` | `/cart` status banner |
| Result paid, processing, unpaid, not_found | `confirmation.<status>` | `/checkout/success` body |
| Network / 5xx | `recovery.networkError` / `serverError` | Live region plus Try again |

An out-of-stock add with no existing line returns a warning and no line: show the warning, not "Added".

## 8. Analytics (not implemented; requires approved consent policy)

| Event | Fires once when | Payload (no personal data) |
| --- | --- | --- |
| `view_item` | product page shows a resolved variant | variant ID, SKU, price, `CAD` |
| `add_to_cart` | add returned no userErrors and the line exists | variant ID, quantity, price |
| `begin_checkout` | `/api/checkout` returned a real Stripe redirect (never fixture or failure) | variant IDs, quantities, subtotal |
| `purchase` | success page status `paid`, deduplicated by order name | order number, value, lines |

No tracker loads before the owner approves a consent policy. Never infer a purchase from a redirect.

## 9. Open owner questions and missing inputs

1. Brand name, product names, real SKUs, prices, sizes, photography (all currently samples).
2. Sales tax: collect or not, which regions, Stripe Tax (paid add-on) or manual. None is charged today.
3. Shipping: markets, rates, carriers, times. Stripe collects a Canadian address but sets no rate, so
   orders show $0.00 shipping. Review `bag.taxShippingNote` against the final decision.
4. Returns and refund policy, terms, privacy: not drafted here.
5. Support contact email (`contactLine` shows a placeholder until supplied).
6. Low-stock display: show it at all, and the threshold (code proposes 5).
7. Maximum quantity per line: backend enforces 10; confirm.
8. Approved benefits, INCI lists, usage, precautions, claim evidence, selling markets.
9. Consent policy, analytics provider, newsletter consent wording.
10. Whether test and fixture banners show on every page or only on bag and checkout.
