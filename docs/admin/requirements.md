# Admin dashboard requirements (brainstorm draft, cross-reviewed against `docs/admin/ux.md`)

Status: draft for architect synthesis, 2026-10-09. Market: Canada, CAD. All data is SAMPLE; Stripe stays in test mode.
Vocabulary follows Shopify Admin. IA, module names and `/admin/...` URLs are adopted from `docs/admin/ux.md` (section 2 there).
Stripe is authoritative for money movement; our database is authoritative for catalog, stock, fulfilment, consent.
**Not tax, legal or accounting advice.** OWNER INPUT marks a business decision, not a fact. Ledger account mapping, tax treatment, retention
and consent wording must be confirmed by the owner's accountant or counsel before live use.

## 0. Gaps in today's schema that shape this plan

- No customers, shipping address, fulfilment, refunds, payment/fee/payout records, cost price, stock history, staff or audit tables. `orders` holds only email and money.
- A packing slip needs a shipping address: Checkout must collect it (Canada only until the owner sets markets) and the webhook must snapshot it.
- Only `checkout.session.completed` is handled. Refunds, fees, payouts and disputes need `charge.refunded`/`refund.updated`, `payout.paid`, the charge's balance transaction
  (fee) and `charge.dispute.*`. Subscribing to them is an owner action in Stripe.
- `variants.inventory_quantity` is a bare counter (null = untracked): all changes must go through movement rows (section 3). `products.id`/`variants.id` have no generator.
  `orders.review_flags` has undefined values; the commerce engineer must enumerate them for the "Needs attention" list.
- Admin types live in `lib/admin/`, not `lib/commerce/types.ts`. Storefront-visible changes (active-only catalog filter, low-stock threshold source) go through the architect.

## 1. Roles and permissions

Least privilege: deny by default; roles are fixed permission sets defined in code (the Roles page in `ux.md` is a read-only matrix in MVP; custom roles LATER); one role per staff row.
R = view, W = edit, A = special action. UX's starter set differs: it says Manager (we keep **Admin**, the owner's term) and adds Read-only (dropped: Bookkeeper already is read-mostly).

| Module (sidebar) | Owner | Admin | Fulfilment | Bookkeeper | Support |
| --- | --- | --- | --- | --- | --- |
| Overview | R | R | R (orders, stock tiles) | R (money tiles) | R (orders tile) |
| Orders | R W | R W | R own fields (items, address, notes), A fulfil | R (no customer notes) | R (no payment IDs) |
| Refunds | A | A (limit LATER) | none | none | none (request LATER) |
| Payments, payouts | R | R | none | R | none |
| Customers, consent | R W | R W | none | R aggregates only | R W notes/tags, A log request |
| Products (price, cost) | R W | R W | R (no price, no cost) | R incl. cost | R (no cost) |
| Inventory | R W | R W | R, W limited reasons (received, count, damaged) | R | R |
| Ledger (Journal, Accounts, Trial balance, Exports) | R W, A close period, A reverse entry | R | none | R, A export | none |
| Discounts (LATER) | R W | R W | none | R | none |
| Settings (store, tax, shipping, policies, payments) | R W | R, W policies | none | R | R policies |
| Staff and roles | R W | none | none | none | none |
| Event log: Webhooks tab | R | R | none | none | none |
| Event log: Audit tab | R | none | none | R (financial actions) | none |
| Data exports | A all | A orders, products | none | A ledger, orders | none |

- Only Owner changes roles, tax/shipping settings, closes periods, reverses ledger entries or exports customer PII. Nobody sees card data: we hold none.
- Step-up MFA: refunds, PII exports, period close, staff changes. Refund approval limit and recent-sign-in rule: OWNER INPUT.
- **Audit log (MVP):** append-only `audit_log`: actor, role at the time, action, entity, before/after (non-PII only: ids, status, money, quantity), request id, outcome
  (success/denied/error), truncated IP, time. Logged: sign-in, failed MFA, role change, every write, export, refund attempt, data-request step, setting change, denial.
  No update/delete for any role (trigger plus revoked grants). Retention: OWNER INPUT.

## 2. Modules (grouped as the sidebar)
Story-to-screen coverage is checked in the Cross-review section. "Sign in" story: As staff I can sign in with email and MFA and see only my role's modules, so that nothing is exposed.
### 2.1 Overview (`/admin`)
Purpose: "is the shop healthy today". Store timezone (OWNER INPUT), CAD. "Paid order" = `financial_status` PAID, PARTIALLY_REFUNDED or REFUNDED, by `processed_at`.

| Metric | Definition |
| --- | --- |
| Gross sales | Sum of `subtotal_minor` of paid orders in period (before refunds; excludes tax and shipping) |
| Orders | Count of paid orders |
| AOV | Gross sales / orders, decimal string; "-" when no orders |
| Refunds | Sum of succeeded refunds dated in the period (by refund date) and their count |
| Net sales | Gross sales minus refunded item value in the period; shipping and tax shown separately |
| Low stock | Tracked, active variants with quantity <= threshold (0 first) |
| Webhook health | Last processed Stripe event time; events failed/unprocessed in 24 h; orders with `review_flags`; checkouts in `awaiting_payment` over 24 h |

Ranges: today, 7, 30 days vs previous equal period (no delta when the prior is empty). Stat cards: Gross sales, Orders, AOV, To fulfil (with oldest age), Refunds; "Needs attention" list:
webhook failures, low stock, review flags, open data requests. Chart default: gross sales per day (by order date); net and refunds in the Chart | Table view. Gross vs net is an OWNER INPUT.
Stories: As Owner I see sales, orders, AOV, refunds for 7 and 30 days so I know trading is normal. As Fulfilment I see unfulfilled count and oldest age so I pack in order.
As Admin I see a failed webhook, low stock and flagged orders so I notice problems. LATER: conversion (needs consent-approved analytics), traffic, saved reports.

### 2.2 Sales: Orders (`/admin/orders`)
Fields: number, processed_at, email, financial status (existing enum), **fulfilment status** (new: UNFULFILLED, PARTIALLY_FULFILLED, FULFILLED), lines, shipping address, totals, review flags, timeline, notes.
- As Fulfilment I open the Unfulfilled view (oldest first) and print packing slips, single or batch (no prices; items, SKU, quantity, address, number), so I can pack.
- As Fulfilment I mark some or all lines fulfilled with carrier, tracking number and optional https URL so the order shows shipped.
- As Admin I add an internal note and read a timeline (paid, fulfilled, refunded, note, flag) so history is clear; I filter by status, date, number or email.
Rules: fulfilling is idempotent per line; fulfilling a refunded order warns; a stale page shows current state instead of duplicating.
LATER: "Mark packed" (UX bulk action; proposed as a timeline event only), customer "Notify customer" email (needs an email provider, OWNER INPUT; hide the checkbox until then), labels, returns/RMA, cancel/edit, archive.

### 2.3 Sales: Payments (`/admin/payments`)
Purpose: reconcile orders with Stripe. We store Stripe IDs, amount, fee, net; we never recompute what Stripe holds. Tabs: Payments (order, amount, refunded, fee, net, status), **Payouts**
(arrival date, amount, status; UX has no payouts screen, so add a tab), Refunds shown on payment detail. Views: All, Needs attention (failed checkouts, unmatched events), Refunded.
**Refund (full or partial), Admin/Owner:** (1) pick lines or amount <= paid - already refunded, capped server-side; (2) Stripe reason (duplicate, fraudulent, requested_by_customer) plus internal reason and note;
restock yes/no per line, never silent; (3) typed confirmation of the amount (UX pattern, adopted); (4) one Stripe refund, idempotency key from our `refunds` row id. Status `pending` ("waiting for Stripe")
until the webhook confirms; only then do order status, ledger entry and optional restock post.
Error paths: over the cap (inline); already refunded; Stripe error (row `failed`, code mapped, nothing posted); timeout (stays `pending`; "check status" re-fetches, never resends); double submit (same key);
webhook never arrives (shown in webhook health). Needs a restricted Stripe key (refunds write; payments/payouts read): OWNER INPUT.
Disputes: hidden until the owner decides; if on, a read-only list from `charge.dispute.*` with evidence submission left in Stripe. LATER: payment links, multi-currency.

### 2.4 Sales: Customers (`/admin/customers`)
Customer = order email (normalised), since there are no shopper accounts. Fields: email, name/phone if Checkout provides them, orders, lifetime value (paid totals minus refunds), first/last order, tags, notes, consent.
- As Support I find a customer by email or order number, see their orders, and add notes and tags (on the customer record, not only on orders).
- As Owner I see who consented to marketing, by which wording and when, so I only email permitted people.
Consent (CASL; wording and retention by counsel, OWNER INPUT): append-only `consent_events` (state express/implied/none/unsubscribed, source, wording version, time, implied expiry). No pre-ticked box; unsubscribe
is immediate. Staff may record an unsubscribe freely; recording consent needs a source note. No marketing email is sent from admin in MVP.
Privacy requests (PIPEDA): request types **access** (includes export) and **deletion** (UX lists export separately; we merge). Logged with received and due dates (target: OWNER INPUT), Owner approves; deletion anonymises PII
but keeps the financial record (retention is an accountant matter). Queue at `/admin/customers/data-requests`. LATER: segments, campaigns, abandoned carts, merge, reviews (genuine data only).

### 2.5 Catalog: Products (`/admin/products`)
Status draft, active, archived (storefront lists active only). Variant: title, SKU (locked after first order), options, price, compare-at, **cost (optional)**, image, tracked, low-stock threshold. Image: path/URL, alt text and
provenance required; upload drop zone is LATER (storage is an OWNER INPUT). Collections are read-only in MVP. Duplicate product LATER.
- As Admin I create/edit a product and variants as draft, preview, then activate so nothing half-finished goes live.
- **Publish gate** (a checklist panel blocks Activate and names each missing item): `sample = true` in live mode; INCI, precautions or benefits empty or without reviewer, review date and evidence reference; image without alt/provenance; no price.
  The admin never fills these with generated text.
- As Admin I change a price; the confirm step shows old/new price and the count of open carts holding the variant (they will see the price-change banner). Audited.
Rules: no delete once ordered (archive); handle change warns that URLs change; concurrent edits return a conflict (UX `updatedAt` pattern, adopted). UX's variants table lacks cost and threshold columns: add them.
LATER: bulk CSV import, collections editor, multiple locations, purchase orders, bundles, SEO editor.

### 2.6 Catalog: Inventory (`/admin/inventory`, `/admin/inventory/movements`)
- As Fulfilment I adjust stock by delta or set-to-count with a mandatory reason (received, cycle_count, damaged, lost, returned_restock, correction; `sale` and `refund_restock` are system-written), never below zero. Reason list: OWNER INPUT.
- As Admin I read a variant's movement history (who, when, delta, balance after, reason, linked order/refund).
**On hand vs committed (proposal):** stock is decremented when payment is confirmed, so `quantity` means *available to sell*. Committed = units on paid, unfulfilled order lines (derived, no column);
On hand = available + committed. A staff count entered as "on hand" is converted to available by subtracting committed. Fulfilment does not move stock. Alternative: decrement at fulfilment. OWNER/ARCHITECT decision.
Stock writes are one transaction (`quantity + delta >= 0` guard plus movement insert); the webhook writes `sale` movements in its transaction. Untracked (null) variants show "not tracked".

### 2.7 Finance: Ledger (`/admin/ledger`: Journal, Accounts, Trial balance, Exports)
Purpose: operational bookkeeping support generated from commerce events for an accountant. **Not tax or legal advice; the accountant must confirm chart, tax treatment and cash/accrual basis.**
Design: append-only double entry; `journal_lines` in bigint minor units, balanced per entry by DB check; posting is idempotent (unique source_type, source_id, kind). Mistakes are fixed by **Reverse entry** (Owner), never edits.
Closed periods reject entries dated inside them. Test-mode orders post to `mode = test` and are never exported as real.

| Account (illustrative; accountant to confirm) | Type | Notes |
| --- | --- | --- |
| Stripe clearing | Asset | Held by Stripe before payout |
| Bank / Cash | Asset | Receives payouts |
| Sales revenue | Revenue | Item subtotal |
| Shipping income | Revenue | Only once shipping is charged (OWNER INPUT) |
| Sales returns | Contra-revenue | Refunded item value |
| GST/HST payable | Liability | Only once tax is configured; provincial treatment is an accountant matter |
| Payment processing fees | Expense | From Stripe balance transactions |
| Inventory, COGS | Asset, expense | Only if cost price is tracked |
| Chargebacks and disputes | Expense | LATER |

| Event | Debit | Credit |
| --- | --- | --- |
| Sale | Stripe clearing (total) | Sales revenue, Shipping income, GST/HST payable (zero lines omitted) |
| Refund succeeded | Sales returns, GST/HST payable (tax part) | Stripe clearing |
| Stripe fee | Payment processing fees | Stripe clearing |
| Payout paid | Bank / Cash | Stripe clearing |
| Fulfilment with cost (LATER) | COGS | Inventory |

Stories: As Bookkeeper I view the ledger by account and date and drill from a line to its order, refund or payout. I see a trial balance as at a date (debits = credits, else flagged) and a **reconciliation tile**
(Stripe clearing = payments - fees - payouts, else shows the difference). As Owner I close a period (control on the Exports tab, labelled "Exports and periods") so exported figures do not change.
As Bookkeeper I export CSV (journal lines; trial balance; sales by day with tax columns): decimal-string amounts, UTF-8, one header row, formula-safe (leading `= + - @` neutralised).
Acceptance: each paid order, succeeded refund, fee and payout has exactly one entry; a replayed webhook creates none.
LATER: manual entries (UX has a form; here Owner-approved only, so not in Slice 2), bank-feed matching, accounts payable, accountant-system formats, tax-return reports.

### 2.8 System: Event log, Staff and roles, Settings
| Module | Why | Cut |
| --- | --- | --- |
| Event log (`/admin/events`, tabs Webhooks, Audit) | Orders arrive only by webhook; shows status, attempts, signature result, redacted payload, idempotent Reprocess (Owner/Admin) | MVP |
| Staff and roles | Owner invites, assigns role, disables; no shared logins; last Owner cannot be removed | MVP |
| Settings: General | Legal name, timezone, support email (feeds `contactLine`), default low-stock threshold | MVP |
| Settings: Tax, Shipping | Today $0.00 shipping, no tax: read-only "decided at Stripe Checkout"; no invented rates | Edit LATER |
| Settings: Payments | Stripe mode and last webhook time; no secrets rendered | MVP |
| Settings: Policies | Owner-supplied text, versioned; "not supplied" until entered; admin writes no legal text | Slice 3 |
| Data exports | Orders (Orders index), ledger (Exports), customers (Owner only); CSV, audited | Slice 2 |
| Discounts | Storefront spec forbids promo codes and discount wording; needs storefront decision, Stripe coupon mapping, ledger treatment; hidden in nav | LATER |
| Alerts, Returns/RMA, Reports, command palette, saved views | Convenience; needs email provider or more states | LATER |

## 3. Data model deltas (entity: key fields, relations)

New tables in schema `commerce`, RLS on, no policies. Ledger and audit amounts are bigint.
- `staff_users`: id, auth_user_id, email, name, role, status (invited/active/disabled), mfa_enrolled_at, last_login_at. `audit_log` (append-only): at, staff_id, role, action, entity, before, after, outcome, request_id, ip_trunc.
- `store_settings`: key, value jsonb, updated_by. `policy_pages` (LATER): slug, body, version, published_at.
- `customers`: id, email_normalised (unique), name, phone, first/last_order_at, anonymised_at; `orders.customer_id` fk. `customer_notes`: customer_id, staff_id, body. `customer_tags`: customer_id, tag.
  `consent_events` (append-only): customer_id, channel, state, basis, source, wording_version, at, expires_at. `data_requests`: customer_id, type (access/deletion), received_at, due_at, status, handled_by.
- `orders` add: `fulfillment_status`, `shipping_address jsonb` (snapshot), `stripe_payment_intent_id`, `mode` (test/live), `dispute_status` (nullable), `anonymised_at`.
  `order_events` (append-only timeline): order_id, type, staff_id, data, at. `order_notes`: order_id, staff_id, body.
  `fulfillments`: order_id, carrier, tracking_number, tracking_url, shipped_at, staff_id; `fulfillment_lines`: fulfillment_id, order_line_id, quantity (sum <= ordered).
- `payments`: order_id, stripe_charge_id, amount_minor, fee_minor, net_minor, status, balance_txn_id. `payouts`: stripe_payout_id, amount_minor, arrival_date, status.
  `refunds`: order_id, stripe_refund_id (unique, null until created), amount_minor, status (pending/succeeded/failed), stripe_reason, internal_reason, note, restock, staff_id.
- `stripe_events` (extends `processed_webhook_events`): status, attempts, error_code, received_at, metadata only (no raw PII payload).
- `ledger_accounts`: code, name, type, active. `journal_entries`: entry_date, memo, source_type, source_id, kind, mode, reverses_id, unique (source_type, source_id, kind).
  `journal_lines`: entry_id, account_id, debit_minor, credit_minor (one non-zero). `accounting_periods`: start, end, closed_at, closed_by.
- `inventory_movements` (append-only): variant_id, delta, quantity_after (available), reason_code, order_id, refund_id, staff_id, note, at. `variants.inventory_quantity` stays the fast read model, written by one stock function.
- `products` add: `status`, `content_review` (reviewed_by, reviewed_at, evidence_ref). `variants` add: `cost_minor` nullable, `low_stock_threshold` nullable, `status`. Images need `alt`, `provenance`, `placeholder`.

**Coverage of the UX backend-gap list:** fulfilment (`fulfillment_status`, `fulfillments`), address (`shipping_address`), customer link (`customers`, `orders.customer_id`), refunds (`refunds`), notes (`order_notes`,
`customer_notes`), on hand/committed/movements (`inventory_movements`; committed derived, section 2.6), product status and cost (`products.status`, `variants.cost_minor`): all covered.
**Failed/disputed financial status: covered differently.** We do not extend `OrderFinancialStatus` (shared with the storefront; the DB check would also change). Orders exist only after payment succeeds, so failed
payments live on `checkouts.status = payment_failed` (already stored) and `payments.status`; disputes are `orders.dispute_status`. If the architect prefers new enum values, it needs a migration and a `types.ts` change.

## 4. Non-functional

| Auth option | Pros | Cons |
| --- | --- | --- |
| A. Supabase Auth, email + TOTP MFA, invite-only | Free tier, same project, MFA built in | Verify current MFA/rate-limit behaviour on our plan; separate from `staff_users` |
| B. Passkeys (WebAuthn) | Phishing-resistant | Verify Supabase support, else a library and recovery flow |
| C. Edge gate (e.g. Cloudflare Access free tier, verify limits) | Blocks before app code | Extra vendor and domain; still needs in-app roles |
| D. Hand-rolled passwords | None | Highest risk; reject |

Recommend **A** for MVP: public sign-up disabled, a `staff_users` allow-list (a valid user not on it is denied), MFA required before any admin page, passkeys later. Authorisation is checked in every server action and
route handler, not only middleware. Session idle/absolute timeouts: OWNER INPUT (UX keeps drafts locally across re-sign-in).
- **Separation:** `/admin` and `/api/admin`, own layout, no storefront cart cookie, `noindex`, `Cache-Control: private, no-store`, out of the sitemap; subdomain later. Cookies HTTP-only, Secure, SameSite Lax or Strict.
- **CSRF:** mutations via POST/PATCH/DELETE only; check Origin/Host in every route handler (Server Actions add their own check). **Rate limits:** sign-in, MFA, exports, refunds, requests; a Postgres counter suffices.
- **Secrets/DB:** Stripe restricted key server-side only, never `NEXT_PUBLIC_*`. Prefer separate DB roles for admin and storefront. Revoke UPDATE/DELETE on ledger, audit and movement tables and add a trigger.
- **PII:** collect email, shipping address, optional phone; no card data; mask email in lists where unneeded; no PII in logs, audit diffs or URLs; PII exports Owner-only; retention OWNER INPUT.
- **Money:** integer minor units in storage, decimal strings in API and CSV, ledger bigint, CAD only, no floats; partial-refund tax rounding is an accountant matter.
- **Devices:** phone must support fulfilling an order, order/customer/stock lookup and quick adjust (UX section 6). Keyboard-complete tables and dialogs; errors mapped from codes; "Test mode" and "Sample data" badges on every page.
- **Tests:** posting rules (balanced, idempotent), stock function (never negative, concurrent), refund caps; e2e for sign-in denial, role denial, fulfil, refund error paths.

## 5. MVP cut

**Slice 1 (about two weeks): foundation, catalog, fulfilment.** Auth + MFA, `staff_users`, roles, audit log; Orders list/detail with address snapshot, fulfil with tracking, notes, packing slip; Products/variants with publish gate;
Inventory adjust + movements + threshold; Overview (sales, orders, AOV, To fulfil, low stock, webhook health); Event log (read-only); Staff; Settings General. Roles live: Owner, Admin, Fulfilment.
**Slice 2: money.** Payments/Payouts store, refunds, ledger posting (test/live), Journal, Accounts, Trial balance, Reverse entry, period close, CSV exports. Bookkeeper live. Needs accountant sign-off first.
**Slice 3: people and policy.** Customers, notes/tags, consent, data requests, Policies, Support live. **Later:** discounts, segments, RMA, disputes workflow, alerts, bank matching, tax automation, manual journals, reports, passkeys. The UX wireframes label every screen "MVP"; this plan treats them as the first-release screen set, shipped in these slices.

## 6. Open owner decisions

1. Store timezone, fiscal year start, and cash vs accrual basis (drives Overview, ledger cut-offs, exports).
2. What "sales" means on Overview and the chart: gross (proposed) or net of refunds; tax and shipping shown separately or included.
3. Sales tax: register or not, which provinces, Stripe Tax (paid add-on) or manual; decides whether GST/HST payable exists.
4. Shipping: markets, rates, carriers, who packs; whether shipping income is charged.
5. Is cost price tracked (turns on Inventory/COGS)? Will the accountant confirm the chart and which export formats (CSV only for MVP)?
6. Inventory model: derived committed with decrement at payment (proposed) or decrement at fulfilment; low-stock default threshold and whether the storefront shows low stock; stock adjustment reason list.
7. First staff, their roles, and whether a single-owner launch is acceptable; role names (Admin vs Manager) and whether a Read-only role is wanted.
8. Auth choice (A recommended), mandatory MFA for every role, idle and absolute session timeouts, recent-sign-in rule for money actions.
9. Refund policy: reasons list, approval limit/second approver, restock default.
10. Retention for orders, ledger, audit log, consent records; erasure rule for accounting records after a deletion request (accountant/counsel).
11. CASL wording and implied-consent handling; whether marketing email is planned (needs provider and unsubscribe flow).
12. Privacy requests: response deadline and named privacy contact.
13. Email provider for shipping confirmation and alerts (and the "Notify customer" checkbox), or Stripe receipts and tracking only.
14. Image storage (repo `public/products`, Supabase Storage, CDN) and who supplies alt text and provenance; who reviews claims and what evidence reference is required.
15. Policy texts (returns, privacy, terms, shipping) supplied by owner or counsel.
16. Scope: Discounts (storefront currently forbids promo codes) and disputes in or out of the first release.
17. Hosting/database tier: backups, point-in-time recovery, inactivity pause (verify on the chosen Supabase plan); admin host must permit commercial use.
18. Stripe: create the restricted key and subscribe the extra webhook events; stay in test mode until told otherwise. Admin on its own subdomain or IP allow-list?
19. Priority: fulfilment/inventory first (Slice 1) or refunds/ledger first?

## 7. Cross-review (against `docs/admin/ux.md`)

**Adopted:** sidebar groups and names (Event log, Staff and roles, Ledger sub-tabs), the URL map, typed-amount refund confirmation, optimistic-concurrency saves, the Event log Webhooks/Audit tabs,
phone-must-work list, "Sample data"/"Test mode" badges, cursor pagination. Module order and numbering now follow the sidebar.
**Changed here because of the review:** added AOV, To fulfil age, low stock and webhook health to the Overview spec; added Payouts tab, reconciliation tile and period-close placement; added Reverse entry, customer notes/tags,
sign-in story, batch packing slips, cost/threshold fields, publish-gate panel and open-cart count; defined committed stock; handled failed/disputed status; merged and extended owner decisions (UX items: timezone, gross/net,
session timeouts, on hand vs committed, refund reasons/threshold, roles/2FA, chart/export formats, data-request deadlines, erasure rule, thresholds, discounts/disputes).
**Stories with no screen (or a partial one) in the UX wireframes:** (1) sign-in with MFA (only `/admin/login`, no flow); (2) AOV and low-stock tiles; (3) webhook "last event" on Overview (only in Settings > Payments);
(4) packing-slip layout and single-order print; (5) add-note action on orders; (6) Payouts; (7) period close; (8) reconciliation tile; (9) "sales by day" export; (10) customer notes/tags; (11) publish-gate checklist;
(12) open-cart count in the price confirm; (13) cost and threshold fields; (14) fee and net columns on Payments. Each needs a wireframe addition or an explicit cut.
**Screens or controls with no MVP story here:** global search/command palette, keyboard shortcuts, saved views, column chooser and density toggle, "Mark packed", "Notify customer" toggles, manual journal entry form,
async export download rows, product Duplicate and media upload/reorder, editable Roles matrix, Discounts. I treat all as LATER, except shortcuts and density which are harmless polish.
**Unresolved disagreements:** (a) role names (Admin vs Manager) and the extra Read-only role; (b) manual journal entries and refunds shown as MVP in UX versus Slice 3/Slice 2 here; (c) "Notify customer" needs a mail provider
the owner has not chosen; (d) data-request types (UX: access, export, erasure; here: access, deletion); (e) whether failed/disputed become `OrderFinancialStatus` values (architect to settle); (f) committed stock model.
