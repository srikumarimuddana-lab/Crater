# Admin dashboard requirements (brainstorm draft)

Status: draft for architect synthesis, 2026-10-09. Market: Canada, CAD. All data is SAMPLE; Stripe stays in test mode.
Vocabulary follows Shopify Admin (Orders, Products, Inventory, Customers, Discounts, Settings, staff permissions).
Rule: Stripe is authoritative for money movement; our database is authoritative for catalog, stock, fulfilment, consent.
**Not tax, legal or accounting advice.** Anything marked OWNER INPUT is a business decision, not a fact. Ledger account mapping, tax
treatment, retention periods and consent wording must be confirmed by the owner's accountant or counsel before live use.

## 0. Gaps in today's schema that shape this plan

- No customers, shipping address, fulfilment, refunds, payment/fee/payout records, cost price, stock history, staff or audit tables.
- `orders` holds only email and money columns. A packing slip needs a shipping address, so Checkout must collect and the webhook must
  snapshot one (Canada only until the owner sets markets). Architecture already says Stripe collects it; we do not store it yet.
- Only `checkout.session.completed` is handled. Refunds, fees and payouts need further events (`charge.refunded`/`refund.updated`,
  `payout.paid`, fee data from the charge's balance transaction; `charge.dispute.*` for logging). Subscribing is an owner action in Stripe.
- `variants.inventory_quantity` is a bare counter (null = untracked). Every change must go through a movement row (section 3).
- `products.id` / `variants.id` have no generator; admin create needs a sequence or identity. `orders.review_flags` exists but its values are
  undefined; the admin "Needs attention" queue needs them enumerated by the commerce engineer.
- Admin types live in their own module (`lib/admin/`), not `lib/commerce/types.ts`. Storefront-visible changes (product status filter,
  low-stock threshold source) go through the architect.

## 1. Roles and permissions

Least privilege: deny by default; a role is a fixed set of permissions defined in code; a staff row holds exactly one role.
R = view, W = create/edit, A = special action listed. "Own" = limited fields.

| Module | Owner | Admin | Fulfilment | Bookkeeper | Support |
| --- | --- | --- | --- | --- | --- |
| Overview | R | R | R (orders/stock tiles only) | R (money tiles only) | R (orders tile only) |
| Orders | R W | R W | R own: items, address, notes; A mark fulfilled | R (no customer notes) | R (no payment IDs) |
| Refunds | A | A (up to owner-set limit, LATER) | none | none | none (request refund LATER) |
| Payments, payouts | R | R | none | R | none |
| Ledger, periods | R W, A close period | R | none | R, A export CSV | none |
| Customers, consent | R W | R W | none | R (aggregates only) | R W notes/tags, A log data request |
| Products, prices, cost | R W | R W | R (no price, no cost) | R (incl. cost) | R (no cost) |
| Inventory | R W | R W | R, W limited reasons (received, count, damaged) | R | R |
| Discounts (LATER) | R W | R W | none | R | none |
| Settings (tax, shipping, store, policies) | R W | R policies W | none | R | R policies |
| Staff, roles | R W | none | none | none | none |
| Audit log, webhook log | R | R webhook log only | none | R audit (financial actions) | none |
| Data exports | A all | A orders, products | none | A ledger, orders | none |

- Fulfilment and Support never see card or payment identifiers (there is no card data in our system at all).
- Only Owner can change roles, disable staff, change tax/shipping settings, close periods, or export customer PII.
- Step-up: re-enter MFA for refunds, exports containing PII, period close, staff changes, price changes over an owner-set percentage (LATER).
- **Staff audit log (MVP):** append-only `audit_log`: actor, role at the time, action code, entity type/id, before/after for non-PII fields only
  (ids, status, money, quantity), request id, outcome (success/denied/error), truncated IP, time. Logged: sign-in, failed MFA, role change,
  every write, every export, refund attempts, data-request actions, setting changes, permission denials. Customer PII never goes in before/after.
  No update or delete for any role, enforced by trigger and revoked grants. Retention: OWNER INPUT.

## 2. Modules

### 2.1 Overview dashboard
Purpose: answer "is the shop healthy today" in one screen. All periods use the store timezone (OWNER INPUT) and CAD. Counts "paid orders" =
`financial_status` in PAID, PARTIALLY_REFUNDED, REFUNDED, by `processed_at`.

| Metric | Definition |
| --- | --- |
| Gross sales | Sum of `subtotal_minor` of paid orders in period (before refunds; excludes tax and shipping) |
| Orders | Count of paid orders in period |
| AOV | Gross sales / orders, shown as a decimal string; "-" when orders = 0 (never 0.00) |
| Refunds | Sum of succeeded refunds dated in the period (by refund date, not order date); count shown beside it |
| Net sales | Gross sales minus refunded item value in period; shipping and tax shown separately |
| Low stock | Tracked, active variants with quantity <= their threshold; quantity 0 listed first |
| Webhook health | Time of last processed Stripe event; events failed or unprocessed in 24 h; orders with `review_flags`; checkouts in `awaiting_payment` over 24 h |

Periods: today, last 7 days, last 30 days (rolling, compared with the previous equal period; no comparison arrow when the prior is empty).
Stories: As an Owner I can see sales, orders, AOV and refunds for 7 and 30 days so that I know trading is normal. As Fulfilment I can see the
unfulfilled count and oldest unfulfilled order age so that I pack in order. As an Admin I can see a red webhook status so that I notice lost orders.
LATER: charts, conversion (needs consent-approved analytics), traffic, saved reports.

### 2.2 Orders and fulfilment
Purpose: process paid orders to the door. Fields: order number, processed_at, email, financial status (existing enum), **fulfilment status**
(new: UNFULFILLED, PARTIALLY_FULFILLED, FULFILLED), lines, shipping address, totals, review flags, timeline, internal notes.
Stories:
- As Fulfilment I can open an unfulfilled queue (oldest first) and print a packing slip (no prices; items, SKU, quantity, address, order number) so that I can pack.
- As Fulfilment I can mark all or some lines fulfilled with carrier, tracking number and optional URL so that the order shows shipped.
- As an Admin I can add an internal note and see a timeline (paid, fulfilled, refunded, note, flag raised) so that history is clear.
- As an Admin I can filter by financial status, fulfilment status, date and search by number or email.
Rules: fulfilling twice is blocked (idempotent per line); fulfilling a refunded order warns; tracking number trimmed and length-checked; URL must be https.
Error paths: stale page (already fulfilled elsewhere) shows the current state, no duplicate; DB failure keeps the form values.
LATER: customer shipping email (needs email provider, OWNER INPUT), label purchase, returns/RMA, cancel/edit order, archive, bulk actions, split shipments by location.

### 2.3 Payments (Stripe-backed)
Purpose: reconcile orders with Stripe without opening the Stripe dashboard for routine work. We store Stripe IDs, amounts, fee and net; we never
recompute what Stripe holds. Views: payments list (order, amount, fee, net, status, charge date), payouts list (arrival date, amount, status,
orders covered when Stripe provides it), refund list.
**Refund (full or partial) - Admin/Owner:**
1. Pick lines or enter an amount <= (paid - already refunded); server recomputes the cap, never trusts the form.
2. Choose Stripe reason (duplicate, fraudulent, requested_by_customer) plus internal reason code and optional note; choose restock yes/no per line (no silent restock).
3. Confirmation dialog states the amount in CAD, the order, and that it cannot be undone.
4. Server creates one Stripe refund with an idempotency key derived from our `refunds` row id. Status is `pending` until Stripe confirms by webhook; only then
   do order status, ledger entry and (optional) restock movement post.
Error paths: amount over cap (inline error); already fully refunded; Stripe error (row `failed`, message mapped to a code, nothing posted); timeout (row stays
`pending`, "check status" re-fetches from Stripe, never re-sent blindly); double submit (same key, one refund); webhook never arrives (shown in webhook health).
Needs a restricted Stripe key limited to refunds write and payments/payouts read; OWNER INPUT to create it.
LATER: disputes (log `charge.dispute.*` in MVP-2 as read-only list; evidence submission stays in Stripe), manual payment links, multi-currency, saved payment methods.

### 2.4 Ledger and bookkeeping
Purpose: operational bookkeeping support generated from commerce events so an accountant receives clean, balanced data. **Not tax or legal advice; the
owner's accountant must confirm the chart of accounts, tax treatment and basis (cash vs accrual) before it is relied on.**
Design: append-only double-entry. `journal_entries` + `journal_lines` (bigint minor units, debit/credit, balanced per entry by DB check). Posting is
deterministic and idempotent: unique (source_type, source_id, kind). No edits; mistakes are fixed by a reversing entry and a new one. Closed periods reject new
entries dated inside them (corrections post to the open period with a memo). Orders in the sample/test mode post to a separate `mode = test` ledger that is
never exported as real.

Proposed chart (codes illustrative; accountant to confirm):

| Account | Type | Notes |
| --- | --- | --- |
| Stripe clearing | Asset | Money Stripe holds for us, before payout |
| Bank / Cash | Asset | Receives payouts; reconciled to statements LATER |
| Sales revenue | Revenue | Item subtotal |
| Shipping income | Revenue | Only once shipping is charged (OWNER INPUT) |
| Sales returns | Contra-revenue | Refunded item value |
| GST/HST payable | Liability | Only once tax is configured and collected; provincial treatment is an accountant matter |
| Payment processing fees | Expense | From Stripe balance transactions |
| Inventory, COGS | Asset, expense | Only if cost price is tracked; otherwise omitted |
| Chargebacks and disputes | Expense | LATER with disputes |

Journal entries (amounts from recorded facts, never recalculated rates):

| Event | Debit | Credit |
| --- | --- | --- |
| Sale (order paid) | Stripe clearing (total) | Sales revenue (subtotal), Shipping income, GST/HST payable (tax; zero lines omitted) |
| Refund succeeded | Sales returns (item part), GST/HST payable (tax part), Shipping income if refunded | Stripe clearing |
| Stripe fee | Payment processing fees | Stripe clearing |
| Payout paid | Bank / Cash | Stripe clearing |
| Fulfilment with cost price (LATER if cost not tracked) | COGS | Inventory |
| Stock receipt with cost (LATER) | Inventory | Accounts payable or Bank |

Stories: As a Bookkeeper I can view the ledger by account and date, drill from a line to its order/refund/payout, so that I can trace any figure. As a Bookkeeper
I can see a trial balance as at a date (debits = credits, else a red flag) so that I trust the books. As an Owner I can close a period so that figures
exported to the accountant do not change. As a Bookkeeper I can export CSV (journal lines; trial balance; sales by day with tax columns) with decimal-string
amounts, UTF-8, one header row, and formula-safe cells (leading `= + - @` neutralised).
Acceptance: every paid order, succeeded refund, fee and payout has exactly one entry; replaying a webhook creates none; sum of Stripe clearing equals
payments - fees - payouts for the period, otherwise the reconciliation tile shows the difference.
LATER: manual adjusting entries with Owner approval, bank feed matching, accounts payable, multi-currency, accountant-system export formats, tax-return reports.

### 2.5 CRM / customers
Purpose: support and consent record. There is no shopper account system (architecture exclusion), so a customer is derived from order email
(lower-cased, trimmed, one row per address). Fields: email, name and phone only if Checkout provides them, orders, lifetime value (sum of paid
order totals minus refunds), first/last order dates, tags, internal notes, marketing consent state.
Stories: As Support I can find a customer by email or order number and see their orders so that I can answer a query. As Support I can add notes and
tags so that context is shared. As an Owner I can see who has consented to marketing, by which wording and when, so that I only email permitted people.
Consent (CASL, Canada; wording and retention by counsel, OWNER INPUT): store state (`express`, `implied`, `none`, `unsubscribed`), source, exact wording
version shown, timestamp, and expiry for implied consent; append-only `consent_events`. No pre-ticked box. Unsubscribe is honoured immediately and
survives re-import. No marketing email is sent from the admin in MVP; this records consent only.
Privacy requests (PIPEDA): Support logs an access or deletion request with date received and due date (OWNER INPUT for the target period); Owner
approves. Access: export that customer's data. Deletion: anonymise PII on customer and order rows but keep the financial record (retention periods for
tax records are an accountant matter). Every step is audited.
LATER: segments, bulk tags, email campaigns, abandoned carts (needs consent), customer merge, loyalty, reviews (only genuine data).

### 2.6 Products and inventory
Purpose: let staff maintain the catalog without SQL. Product status: draft, active, archived (storefront lists only active; archived
keeps order history). Variant fields: title, SKU (unique, locked after first order), options, price, compare-at, cost (optional), image, tracked yes/no,
quantity, low-stock threshold (default is an OWNER INPUT; the storefront low-stock text, now proposed as 5, must read the same setting).
Stories:
- As an Admin I can create/edit a product and variants as draft, preview it, then set active so that nothing half-finished goes live.
- **Publish gate:** activation is blocked while `sample = true` in live mode, when ingredients (INCI), precautions or approved benefits are empty or
  lack a reviewer, review date and evidence reference, when an image lacks alt text or provenance, or when price is missing. The admin never fills these with
  generated text.
- As an Admin I can change a price; the confirm step shows old/new price and how many open carts hold that variant, since shoppers will see the price-change
  banner (`priceAtAdd` vs current). The change is audited.
- As Fulfilment I can adjust stock: delta or set-to-count, with a mandatory reason code (received, cycle_count, damaged, lost, returned_restock, correction,
  sale, refund_restock) and optional note; the result cannot go below zero.
- As an Admin I can see a variant's movement history (who, when, delta, reason, quantity after, linked order).
Rules: stock writes are one transaction (update guarded by `quantity + delta >= 0` plus a movement insert); the Stripe webhook writes a `sale` movement in
its existing transaction; concurrent edits return a conflict, not a silent overwrite. Deleting a product that has orders is refused; archive instead.
Handle changes warn that URLs change. Untracked (null quantity) variants show "not tracked" and no movements.
LATER: bulk CSV import, collections editor, variant images gallery upload (storage choice is an OWNER INPUT), multiple locations, purchase orders, bundles,
cost-of-goods valuation reports, SEO fields editor.

### 2.7 Other modules judged necessary
| Module | Why | Cut |
| --- | --- | --- |
| Staff management | Owner invites, assigns role, disables; no shared logins | MVP |
| Webhook/event log | Orders only arrive by webhook; operators need failures, retries, duplicate counts | MVP (read-only, retry for failed events by Owner/Admin) |
| Settings: store profile | Legal name, timezone, support email (feeds `contactLine`), default threshold | MVP |
| Settings: shipping and tax | Currently $0.00 shipping, no tax. Admin shows read-only "decided at Stripe Checkout" until the owner decides; no invented rates | Display MVP; edit LATER |
| Data exports | Accountant, backups, privacy requests; CSV with formula-safe cells | Orders and ledger in MVP-2; others LATER |
| Policy pages (returns, privacy, terms, shipping) | Store owner-supplied text, versioned, with published date; shows "not supplied" until entered | MVP-3; the admin writes no legal text |
| Discounts | Storefront spec currently forbids promo codes and discount wording; needs a storefront decision, Stripe coupon mapping, and ledger treatment | LATER |
| Notifications/alerts | Email on webhook failure or low stock; needs email provider | LATER |
| Returns/RMA | Refund covers MVP; RMA workflow adds states | LATER |
| Reports (product, customer, tax summary) | Accountant gets CSV first | LATER |
| Backups/restore | Verify the Supabase plan's backup and pause behaviour before live | Owner decision |

## 3. Data model deltas (entity: key fields, relations)

New tables in schema `commerce`, RLS on, no policies (as today). Ledger and audit amounts are bigint.
- `staff_users`: id, auth_user_id (unique, from the auth provider), email, name, role (enum of 5), status (invited/active/disabled), mfa_enrolled_at, last_login_at, created_by.
- `audit_log` (append-only): id, at, staff_id, role, action, entity_type, entity_id, before jsonb, after jsonb, outcome, request_id, ip_trunc.
- `store_settings`: key, value jsonb, updated_by (timezone, support email, default low-stock threshold, fiscal year start, shipping/tax mode).
- `customers`: id, email_normalised (unique), name, phone, first_order_at, last_order_at, anonymised_at; `orders.customer_id` fk (nullable).
- `customer_notes`: customer_id, staff_id, body, at. `customer_tags`: customer_id, tag.
- `consent_events` (append-only): customer_id, channel, state, basis (express/implied), source, wording_version, at, expires_at.
- `data_requests`: customer_id, type (access/deletion), received_at, due_at, status, handled_by, completed_at.
- `orders` add: `fulfillment_status`, `shipping_address jsonb` (snapshot, nullable), `stripe_payment_intent_id`, `mode` (test/live), `anonymised_at`.
- `order_events` (append-only timeline): order_id, type, staff_id nullable, data jsonb, at. `order_notes`: order_id, staff_id, body.
- `fulfillments`: id, order_id, carrier, tracking_number, tracking_url, shipped_at, staff_id; `fulfillment_lines`: fulfillment_id, order_line_id, quantity (sum <= ordered).
- `payments`: order_id, stripe_charge_id, amount_minor, fee_minor, net_minor, status, balance_txn_id. `payouts`: stripe_payout_id, amount_minor, arrival_date, status.
- `refunds`: id, order_id, stripe_refund_id (unique, null until created), amount_minor, status (pending/succeeded/failed), stripe_reason, internal_reason, note, restock, staff_id.
- `stripe_events` (extends `processed_webhook_events`): status, attempts, error_code, received_at, payload_ref (metadata only; no raw payload with PII).
- `ledger_accounts`: id, code, name, type, active. `journal_entries`: id, entry_date, memo, source_type, source_id, kind, mode, reverses_id; unique (source_type, source_id, kind).
  `journal_lines`: entry_id, account_id, debit_minor, credit_minor (exactly one non-zero), check sums balance per entry. `accounting_periods`: start, end, closed_at, closed_by.
- `inventory_movements` (append-only): id, variant_id, delta, quantity_after, reason_code, order_id nullable, refund_id nullable, staff_id nullable, note, at. `variants.inventory_quantity`
  stays as the fast read model, written only by one stock function.
- `products` add: `status`, `content_review` (reviewed_by, reviewed_at, evidence_ref). `variants` add: `cost_minor` nullable, `low_stock_threshold` nullable, `status`. `images` need `alt`, `provenance`, `placeholder`.
- `policy_pages` (LATER): slug, body, version, published_at, published_by.

## 4. Non-functional

**Auth (admin never reachable unauthenticated).**
| Option | Pros | Cons |
| --- | --- | --- |
| A. Supabase Auth, email + TOTP MFA, invite-only | Free tier, same project, MFA built in, no new vendor | Must verify current MFA/rate-limit behaviour on our plan; auth schema is separate from our `staff_users` |
| B. Passkeys (WebAuthn) | Phishing-resistant, no code to type | Check current Supabase passkey support; otherwise a library to maintain and recovery flow to design |
| C. Edge access gate (e.g. Cloudflare Access free tier, verify limits) in front of `/admin` | Blocks before app code runs | Extra vendor and domain setup; still need in-app roles |
| D. Hand-rolled passwords | None | Highest risk; reject |

Recommend **A** for MVP, with a `staff_users` allow-list (a valid Supabase user who is not in `staff_users` is denied), invite-only sign-up (public sign-up disabled), MFA
required before any admin page, then add passkeys later if supported. Authorisation is checked in every server action and route handler, not only in middleware.
- **Separation:** routes under `/admin` and `/api/admin`, own layout and no storefront cart cookie; `noindex`, `Cache-Control: private, no-store`, excluded from sitemap;
  consider an `admin.` subdomain later. Admin cookies HTTP-only, Secure, SameSite=Lax or Strict, short idle timeout (OWNER INPUT).
- **CSRF:** mutations only via POST/PATCH/DELETE; verify Origin/Host on each; Server Actions' built-in checks plus an explicit check in route handlers.
- **Rate limiting:** sign-in, MFA, password reset, exports, refunds, data requests; Postgres-backed counter is enough at this scale. Lock-out is audited.
- **Secrets and DB:** Stripe restricted key server-side only; never `NEXT_PUBLIC_*`. Prefer a separate database role for admin versus storefront (the storefront role cannot
  read staff, ledger or audit tables). Revoke UPDATE/DELETE on ledger, audit and movement tables, and add a trigger so even the owner role cannot mutate them.
- **PII minimisation:** collect only email, shipping address and optional phone; no card data ever; mask email in lists for roles that do not need it; no PII in logs, audit
  diffs or URLs; exports are audited and PII exports are Owner-only; retention per record type is an OWNER INPUT.
- **Money:** integer minor units in storage, decimal strings (`MoneyV2`) in API and CSV; ledger bigint; CAD only; no floats; rounding rules for partial refund tax are an accountant matter.
- **Accessibility and resilience:** keyboard-complete tables and dialogs, readable on a phone for the fulfilment queue, errors mapped from codes (as the shop does), no raw server messages.
- **Testing:** unit tests for posting rules (balanced, idempotent), stock function (never negative, concurrent), refund caps; e2e for sign-in denial, role denial, mark fulfilled,
  refund error paths. Fixture/test-mode banner on every admin page.

## 5. MVP cut

**Slice 1 (about two weeks): foundation, catalog, fulfilment.** Auth + MFA + `staff_users` + roles; audit log; orders list/detail with shipping address snapshot, mark fulfilled with
tracking, notes, packing slip; products/variants draft-active-archived with publish gate; stock adjustments with movements and low-stock threshold; overview with sales/orders/AOV/low stock/webhook
health; webhook log (read-only); staff page. Roles enabled: Owner, Admin, Fulfilment (Bookkeeper and Support created but with no extra screens yet).
**Slice 2: money.** Payments/payouts store, refunds (pending to succeeded via webhook), ledger posting with test/live mode, trial balance, period close, CSV exports, Bookkeeper role live. Needs
accountant sign-off on the chart before any live use.
**Slice 3: people and policy.** Customers, notes/tags, consent events, data requests, policy pages, Support role live, settings edit.
**Later:** discounts, segments/campaigns, returns/RMA, disputes workflow, alerts, bank matching, tax automation, manual journals with approval, purchase orders, reports, multiple locations, passkeys.

## 6. Open owner decisions

1. Store timezone, fiscal year start, and bookkeeping basis (cash or accrual).
2. Sales tax: register or not, which provinces, Stripe Tax (paid add-on) or manual; this decides whether GST/HST payable exists.
3. Shipping: markets, rates, carriers, who packs; whether shipping income is charged.
4. Is cost price tracked (turns on Inventory/COGS), and does the accountant want the full chart above?
5. Who are the first staff, and which role does each hold; is a single-owner setup acceptable at launch?
6. Auth choice (recommendation A) and the idle timeout; whether MFA is mandatory for every role.
7. Refund policy and approval limits (who may refund, any amount needing Owner approval); restock default after a refund.
8. Low-stock default threshold and whether the storefront shows low stock at all.
9. Retention periods for orders, ledger, audit log, consent records and anonymisation after a deletion request (accountant/counsel).
10. CASL wording, implied-consent handling, and whether any marketing email is planned (needs an email provider and unsubscribe flow).
11. Privacy-request handling: target response time and who is the privacy contact.
12. Email provider for shipping confirmation and alerts, or rely on Stripe receipts and the tracking page only.
13. Image storage (repo `public/products`, Supabase Storage, or CDN) and who supplies alt text and provenance.
14. Who reviews product claims and what evidence reference is required before activation.
15. Policy texts (returns, privacy, terms, shipping): owner or counsel supplies; admin stores only.
16. Discounts: any plans, given the storefront currently forbids promo codes.
17. Hosting and database tier: backups, point-in-time recovery and inactivity-pause behaviour must be checked against the chosen Supabase plan before live; admin host must be commercial-use compatible.
18. Stripe: create a restricted key and subscribe the extra webhook events (refunds, payouts, disputes); keep test mode until told otherwise.
19. Should admin live on a separate subdomain, and is IP allow-listing wanted?
20. Priority check: is fulfilment/inventory first (Slice 1) or refunds/ledger first?
