# Crater complete ecommerce platform: design specification

**Date:** 2026-10-14 · **Status:** implementation authorized by “fix it completely”; see the delivery verification record and platform guide for implemented scope and remaining environment checks.

**Repository baseline:** `4d73678fa0c253bac810aea4c5a26585e8c502db` on `main`.

**Design reference:** https://craters-remedy-preview.mkkreddy52.chatgpt.site

The reference source was inspected at commit `90b9bc46735fc4da666b446340bd7f72af8f102e`.
It contains HTML, CSS, vanilla JavaScript, local fonts, and images. Its sample bag,
product dialogs, and newsletter are demonstrations, not commerce services.

## 1. Owner intent and decisions

Build one complete ecommerce platform with a storefront that follows the reference
and an admin that uses the same visual and interaction language. The owner must be
able to run the business and change website content without editing code.

Explicitly requested:

1. Carry the reference design, JavaScript behavior, style, and patterns across the storefront and admin.
2. Upload, select, replace, reorder, and edit images from the backend.
3. Edit text across website screens from the backend.
4. Integrate Stripe payments, Twilio messaging, and Resend email.
5. Remove MFA from staff sign-in and staff workflows.
6. Provide an order book, CRM, inventory management, financial ledger, and dashboards for sales, page clicks, and other business details.
7. Deliver working connected workflows, rather than disconnected screens.

These decisions supersede the older Forest & Gilt design and mandatory TOTP proposals
for the new implementation. They do not describe changes already made to the app.

Proposed defaults, distinguished from owner instructions:

- Keep the existing Next.js/React/TypeScript app and Postgres backend; extend their contracts.
- One merchant, CAD, `America/Regina`, and the existing Canadian storefront configuration initially.
- Use guest checkout. Customer accounts and saved payment methods are separate extensions.
- Twilio initially means SMS order/shipping updates and an incoming customer-message inbox.
  WhatsApp and voice are possible later adapters, not silently enabled channels.
- Resend handles order, shipping, refund, staff invitation/recovery, contact replies, and opted-in newsletter email.
- Use S3-compatible object storage for media through a small storage adapter. The account and bucket are deployment inputs.
- Preserve the current catalog until the owner changes it. Reference product photography and names are illustrative and must not overwrite real catalog facts.
- Use the reference's native scrolling and lightweight animation approach; a new WebGL/3D engine is unnecessary for matching this reference.

## 2. Current implementation and gaps

This is a source audit, not a new certification of the existing tests or production configuration.

| Area | Present in the repository | Work required |
| --- | --- | --- |
| Storefront | Home, product detail, cart, informational pages; Forest & Gilt styling | Reference design, reusable visual tokens, connected content |
| Payments | Stripe Checkout, signature verification, order creation, stock decrement, checkout deduplication | Refunds, payment records, fee/payout reconciliation, integration diagnostics |
| Orders | List/detail, totals/tax, notes, fulfilment with tracking, packing slips | Customer link, partial fulfilment, returns/refunds, communication history, exports |
| Products | Existing-product editor, price/cost/threshold edits, publish checks | Create products, variants/collections, media upload and image editing |
| Content | Text largely in `src/lib/content/shop-copy.ts` and components | Versioned CMS, draft preview, publish/restore, per-screen fields |
| Inventory | Available/committed/on-hand views, adjustments, movement history | Supplier/purchase-order receiving, returns, reservations, richer reports |
| CRM | No customer-management module | Customer records, history, notes, tags, consent, search, support inbox |
| Ledger | Planned only in the earlier admin plan | Balanced journals, accounts, refunds/fees/payouts, reconciliation, exports |
| Reporting | Basic overview and sales-by-day table; net sales currently equals gross sales | Actual refund-aware net sales, visual reports, traffic/click/funnel analytics |
| Staff | Built-in passwords plus mandatory TOTP; role-scoped services; staff creation CLI | Password-only sessions, browser staff management, invitation/recovery |
| Messaging | No Twilio or Resend implementation found | Providers, templates, transactional outbox, delivery tracking, inbound messages |
| Settings | Tax/timezone read model | Editable business/content/shipping settings; integration health |

Key extension points: `src/lib/admin/{types,records,permissions,service-types}.ts`,
`src/lib/admin/services/`, `src/lib/commerce/{records,checkout,services,postgres-repository}.ts`,
`src/app/admin/_actions/`, `src/app/api/webhooks/stripe/route.ts`, and `db/migrations/`.
Paths in this document are relative to `apps/storefront` unless stated otherwise.

## 3. Visual system and JavaScript behavior

Extract one set of semantic design tokens consumed by both storefront and admin:
green `#2f8751`, dark green `#182c20`, mint `#caffdd`, cream `#f7f8f3`, white,
and ink `#242924`. Check text contrast by usage; the reference muted color must
not be used for small text on a background where it fails contrast.

Reuse the reference's Cabinet display/wordmark and Public Sans assets where
applicable, with system body-font fallbacks matching the source. Preserve font
licenses/provenance with the assets. Bring across the hero portrait, green
texture, large split headline, editorial image sections, pill buttons, rounded
arrow controls, product grids, ritual tabs, journal and footer composition.

Port behavior into React hooks/components instead of executing the reference's
global DOM script against React-owned elements. Shared building blocks include
buttons, fields, tabs, modal/drawer focus handling, empty/error states, toast
feedback, media cards, and motion policy. Keep one owner for each animated property.

Match reference hero drift and sticky-header transitions using a passive scroll
listener and one `requestAnimationFrame` scheduler. Use `IntersectionObserver`
for progressive section reveals. Clean up listeners/observers on navigation;
react to reduced-motion changes. Content must be readable before JS runs and
when observers or images fail. Admin uses the same controls and subtle transitions,
with stable dense tables and no parallax around editing or financial actions.

At 390, 768, and 1440px: no page-level horizontal overflow, usable navigation,
readable forms, visible focus, and complete shopping/fulfilment flows. Admin wide
tables may scroll inside their own container. Preserve print-friendly packing slips.

## 4. Screen and content-editing coverage

Content editing uses structured fields and reusable section types, not executable
HTML, CSS or JavaScript. System status values, money, stock, security/error meanings,
and provider results are generated from application data and cannot be rewritten
by a copy editor. Admin labels/help text may be overridden through safe keyed fields;
route names, permissions and financial definitions stay code-owned.

| Screen/group | Editable content and images | Connected behavior |
| --- | --- | --- |
| Global | Logo, favicon, announcement, navigation labels/links, contact details, social links, footer, brand colors within validated presets | Header/menu/search/cart continue to use real products |
| Home | Hero text/CTA/image/crop, section visibility/order, story, feature imagery, ritual tabs, selected products, journal teasers | Published content renders on the next visit without a code deploy |
| Catalog/collections | Collection title, introduction, cover, SEO, product membership/order | Search, filters, sort, stock/price from commerce |
| Product detail | Names, descriptions, ingredients/directions/precautions, gallery/alt text, variants, price/cost, SEO | Variant choice, availability, add to cart, existing publish checks |
| Cart/checkout handoff/success | Empty-bag text, support copy, banner/illustration, order-confirmation guidance | Server-priced cart, tax/shipping, Stripe handoff, paid/pending result |
| About, sourcing, contact, shipping/returns | Structured rich text, photos, cards, FAQs and contact fields | Contact submissions enter CRM and notification queue |
| Journal | Article title, slug, body blocks, cover, author display, SEO, draft/publish state | Listing and article detail pages with working links |
| Policies | Owner-supplied terms/privacy/returns/shipping text and effective date | Published version links from footer and checkout handoff |
| Admin shell/auth | Brand logo/name, safe welcome/help copy | Password login, session management, role navigation |
| Admin business screens | Configurable safe labels, help text, email/SMS templates | Orders, payments, inventory, CRM, ledger and analytics retain defined meanings |

Add `/admin/content`, `/admin/content/[key]`, `/admin/media`, and
`/admin/templates`. The content editor shows desktop/mobile preview, Save draft,
Preview, Publish, revision history, and Restore as new draft. Use optimistic
version checks so one editor cannot silently overwrite another. Draft previews
require an authenticated staff session, are `noindex` and private/no-store.

Published pages use a published revision pointer and cache invalidation by content
key. A failed publish leaves the last good version intact. Section schemas define
field types, maximum lengths, link validation, required images/alt text, and allowed
template variables. Do not make another customer's content visible through preview URLs.

## 5. Media backend

The media library supports upload, preview, alt text, filename/title, focal point,
gallery ordering, replacement, usage search, and archiving. Content and products
reference media IDs. Replacement creates an immutable new object/version so
cache behavior and rollback are predictable; do not overwrite a storage object in place.

Initial upload types: JPEG, PNG, WebP and AVIF; maximum 10 MB and 40 megapixels.
Validate file signatures and decode images server-side; strip metadata and generate
responsive derivatives. SVG/HTML/script files are not accepted as ordinary uploads.
Keep processing bounded and reject decompression bombs. Object keys are server
generated; do not fetch arbitrary user-entered remote URLs on the server.

Uploads go through an authenticated, capability-checked route. A pending asset is
not publishable until validated. Public derivatives are served through a configured
CDN origin; original/unpublished assets remain private. Deletion is blocked while
published references exist. Abandoned uploads are garbage-collected after seven days.
Tests use a local temporary storage adapter; production never relies on ephemeral app disk.

## 6. Staff access without MFA

Password verification immediately creates the authenticated session. Remove TOTP
enrolment, second-factor prompts, pending-MFA cookies, MFA badges, and TOTP-only
configuration requirements. Existing enrolled staff sign in using their current passwords.

Retain scrypt hashing, the current 12-character minimum, email/IP login rate limits,
HttpOnly/Secure/SameSite cookies, 30-minute idle timeout, 12-hour absolute timeout,
server-side capability checks, disabled-account revocation, and audit entries.
Do not implement this by returning `steppedUp: true` everywhere. Replace factor-specific
interfaces with ordinary session authorization and explicit operation confirmation.

Owner manages staff invitations, roles and disable/reactivate actions in the admin.
Protect the final active Owner. Password reset/invitation links are single-use,
hashed at rest, time-limited (30 minutes for resets, 24 hours for invitations), and
invalidate prior sessions after a password reset. Resend delivers links when configured;
the existing owner bootstrap CLI remains available. Responses do not reveal whether an email exists.

Deployment invalidates existing/pending sessions once and retires TOTP secrets through
an explicit migration, without deleting staff or changing password hashes. Legacy MFA
URLs redirect to login or the console. No SMS or email OTP is introduced as a replacement.

## 7. Products, stock and purchasing

Complete product/variant/collection creation and editing, media assignment, archive,
publish validation, SKU uniqueness, and CSV import/export with a validation preview.
Existing historical order lines retain their original titles, prices and identifiers.

Inventory remains auditable. Make physical stock and commitments explicit:

- Current `variants.quantity` is sellable availability. Add short-lived checkout reservations;
  availability offered to a new checkout equals sellable availability minus active reservations.
- Reserve atomically while creating checkout; use a 30-minute hosted checkout expiry. On verified
  payment, consume the reservation and decrement sellable stock once, preserving current behavior.
- Paid unfulfilled units are committed. On hand = sellable + paid unfulfilled units; fulfilment
  releases committed units. Reservations are visible separately and are not physical movements.
- Release unpaid reservations on expiry/failure. A late paid event must never vanish: create a paid
  order flagged for a stock exception and route it to review without making stock negative.
- Keep null quantity as untracked inventory, without pretending it has an infinite numeric balance.

Add suppliers and purchase orders with Draft → Ordered → Partially received → Received/Cancelled.
Receiving quantities, unit costs, and optional batch/expiry references records stock movements
and receiving history atomically. Prevent duplicate receipt posting and over-receipt unless an
authorized staff member explicitly changes the purchase order first. Start with one stock location.

Return/restock is an explicit physical action after goods are received; a refund alone never
increases inventory. Capture cost snapshots for later margin/ledger reports. Low-stock thresholds
feed the dashboard and an opt-in staff alert, not customer-facing scarcity claims.

## 8. Order book, fulfilment and Stripe

Keep Stripe hosted Checkout and server-authoritative totals. Extend the order book
with search, date/status/customer filters, saved views, CSV export, payment/refund
records, customer links, communication history, and line-level fulfilment/returns.
Add partial fulfilment and separate fulfilment status from financial status.

Payment integration includes checkout creation, paid/failed/expired status,
full/partial refunds, disputes visibility, actual Stripe fees, payouts, and reconciliation.
Store mode and currency with every external operation and financial record. Test
and live data must not be mixed in orders, reports, messages or ledger postings.

Verify webhook signatures against the raw request body. Persist a deduplicated
inbox entry before acknowledgment; processing may then retry durably. Handle events
out of order and reconcile authoritative provider state where needed. The success
redirect is never independent evidence of payment. Duplicate checkout/webhook
delivery must not duplicate orders, stock movements, messages, or journals.

A refund is a durable operation with an idempotency key, amount in integer minor
units, remaining-refundable check under lock, reason, and explicit confirmation.
Statuses: Requested → Submitted/Pending → Succeeded or Failed. A timeout means
Unknown/reconciliation required, not an automatic second refund. Persist the
provider refund ID; confirmed success updates financial totals and postings once.
Refunds made directly in Stripe must also enter Crater through webhooks/reconciliation.

Tax and shipping settings remain visible and versioned. Preserve the existing province
calculation and validation during the redesign. Add configurable shipping zones/rates
and free-shipping thresholds with test coverage. Enable discounts with validity dates,
limits and eligible products only after server-side pricing and Stripe totals agree.

## 9. CRM and customer support

Add `/admin/customers` and customer detail with contact information, linked orders,
lifetime value, refund totals, last order, tags, internal notes, consent status and
communication timeline. Guest orders can link to a normalized email, but this is not
proof of account ownership. Do not auto-merge customers by display name or phone.
Customer merges require an explicit preview and audit trail; financial order snapshots stay intact.

Build a support inbox for contact forms, inbound SMS, and replies to configured support
email. Conversations have owner, state, channel and order/customer links. Store inbound
provider IDs to deduplicate and avoid replying automatically to out-of-office loops.
Outbound replies use the same durable messaging service as automated notifications.

Record channel-specific consent events, source, timestamp, and wording version.
Transactional updates and marketing subscription choices are separate. STOP/unsubscribe,
bounces and complaints suppress the appropriate channel; buying something never silently
subscribes a customer to campaigns. Add export/anonymization requests with role checks and
an audit trail, preserving required financial record relationships.

## 10. Twilio and Resend delivery

Create a transactional outbox in the same transaction as the business event. A
worker claims jobs with a lease, records attempts and provider IDs, and retries
transient failures with bounded exponential backoff. A notification failure cannot
roll back a paid order. A worker crash cannot lose the queued notification.

Resend: use a verified sending domain, configurable From/Reply-To, responsive email
templates, plain-text alternatives, and allowlisted variable interpolation. Use stable
idempotency keys per notification. Its provider idempotency window is finite, so the
application's persistent uniqueness constraint remains the long-term deduplication guard.
Verify Resend webhook signatures before recording delivered/bounced/complained events.
Support inbound replies via the configured receiving domain and signed webhook.

Twilio: use a Messaging Service, normalized E.164 numbers, configurable transactional
templates, delivery callbacks, and authenticated inbound SMS handling. Validate
signatures using the exact public callback URL and provider request parameters.
Use provider-specific state transitions so a late `sent` callback does not downgrade
`delivered`. An ambiguous send timeout enters Unknown for reconciliation; do not claim
exactly-once SMS delivery or blindly resend after an uncertain provider acceptance.

Admin shows Pending, Processing, Accepted, Delivered, Failed, Suppressed and Unknown
states, retry history, masked recipients, and actionable configuration errors. Provider
acceptance is not labelled delivery. Templates can be edited and previewed with sample
variables; queued jobs snapshot the template version and destination.

Automatic messages: order paid, shipment/tracking, refund confirmed, support reply,
staff invitation/reset and configured low-stock alerts. Add consent-filtered email
campaign drafts with audience count, preview and explicit Send action; no campaign
sends itself when an editor saves a template. Do not send real messages during development.

## 11. Operational financial ledger

Build a double-entry operational ledger linked to order/payment/refund/fee/payout and
stock-cost records. It is distinct from the inventory movement log. Every posted
journal has a unique business-event key, mode, currency, timestamp, source and balanced
debit/credit lines. Store amounts as integer minor units; reject unbalanced entries.
Corrections use reversals and replacement entries, never editing posted history.

Initial account groups: Stripe clearing, bank, inventory, supplier payable, product
and shipping revenue, sales returns, tax payable, cost of goods sold, payment fees,
inventory adjustments and reconciliation suspense. Show a chart of accounts, journals,
account activity, trial balance, payment/payout reconciliation, and CSV exports.

Proposed reporting policy: sales are recognized by paid-order date, matching the
existing overview. Tax and shipping are separate amounts. Snapshot cost at fulfilment
for cost-of-goods reporting; missing historic costs show as incomplete, not zero profit.
The chosen policy is versioned and displayed in finance settings before first live posting.

Reconcile Stripe gross payments minus refunds and actual fees to clearing movements,
then payouts to bank movement records. A payout is not new sales revenue. Record failed
or reversed payouts, disputes and recoveries as separate events; unresolved amounts stay
visible in reconciliation rather than silently balancing against sales.

Owner/Bookkeeper can close a reporting period; postings to a closed period fail with
an explicit next step. Owner may reopen with a reason, or post a linked correction in an
open period. Exports preserve numeric amounts while neutralizing formula-leading text.
Backfill historical orders with deterministic event keys and dry-run counts; reconcile
before committing batches. Never silently infer missing historic fees or cost prices.

## 12. Sales, traffic and click analytics

Dashboard cards: gross and net product sales, tax/shipping, refunds, paid orders,
average order value, repeat customers, low stock, fulfilment backlog, and integration
failures. Show sales trends, top products, customer cohorts and period comparisons
with accessible data tables and precise definitions.

Instrument a fixed event vocabulary: `page_view`, `product_view`, `collection_view`,
`cta_click`, `add_to_cart`, `begin_checkout`, and server-confirmed `purchase`.
Clicks carry stable registered element IDs (e.g. `home.hero.shop`), not arbitrary
DOM text, typed values, emails, or full URLs with query strings. Exclude admin traffic.

Capture consented anonymous session IDs, path, coarse device category and sanitized
source/campaign attribution. Respect the visitor's analytics preference; rejecting
analytics never blocks shopping. Show collection/consent coverage and exclude bots,
known internal traffic and duplicate event IDs where identifiable. Do not call page
views unique people or report a conversion rate without naming its denominator.

Analytics ingestion validates event names, known element IDs, payload size and rate
limits. Store raw events for 90 days and non-identifying daily aggregates for 24 months
as configurable defaults. No session replay, keystroke capture, fingerprinting or
cross-device identity inference. A consented cart may retain an anonymous attribution
reference, allowing Stripe-confirmed purchases to complete the funnel without browser
redirect dependence. Reconcile attributed purchases to all paid orders and show the gap.

## 13. Architecture and module boundaries

Keep a modular monolith; retain the existing commerce and admin repositories.
All business writes go through capability-checked server services and transactions.
Use persistent Postgres implementations and matching in-memory test adapters.

| Module | Proposed source boundary | Responsibility |
| --- | --- | --- |
| Design and motion | `src/components/ui/`, `src/components/experience/`, shared styles | Reference-derived components and lifecycle-safe enhancements |
| Content | `src/lib/content/cms/` | Schemas, drafts/revisions, publishing, editor validation |
| Media | `src/lib/media/` | Asset records, upload validation, derivatives, storage adapter |
| CRM | `src/lib/crm/` | Customers, consent, notes, support conversations |
| Operations | `src/lib/operations/` | Durable webhook inbox, outbox, leases, retries, health |
| Communications | `src/lib/communications/` | Resend/Twilio adapters, templates, delivery events |
| Finance | `src/lib/finance/` | Payments/refunds, posting rules, reconciliation, reports |
| Analytics | `src/lib/analytics/` | Event validation, aggregation, reporting definitions |
| Existing commerce | `src/lib/commerce/` | Prices, carts, checkout, reservations, orders and stock |
| Existing admin | `src/lib/admin/`, `src/app/admin/` | Sessions, permissions, service orchestration and screens |

New migrations start after `0005_tax.sql`. Group migrations by module, with
explicit constraints/indexes and schema-qualified queries. Preserve the repository's
private application database access model. Migration tests cover fresh install and
upgrade from the current schema; no automatic destructive reseeding.

Core new record groups: content documents/revisions/publications; media assets/usages;
customers/consent/conversations/messages; provider inbox/outbox/attempts; payments/refunds;
ledger accounts/journals/lines/reconciliation/periods; suppliers/purchase orders/receipts;
stock reservations; analytics events/daily aggregates; staff invitation/reset tokens.

Cross-module event envelope: `id`, `type`, `schemaVersion`, `mode`, `occurredAt`,
`aggregateType`, `aggregateId`, and validated typed payload. Consumers enforce a unique
`consumer + eventId` key. UI query models are not authoritative write models. External
network calls occur outside database transactions, linked through durable operations.

Worker execution uses a deployable Node process plus a one-shot job command for
scheduled execution. Multiple workers may run safely using row locks/leases. Avoid
in-memory timers and detached promises for delivery, reconciliation or analytics jobs.

## 14. Permissions and navigation

Keep the five existing staff roles. Add module capabilities in `permissions.ts`,
test the full matrix, and redact sensitive fields before returning data to the UI.

| Role | Additional module access |
| --- | --- |
| Owner | All modules; integrations, staff, policy publication and period reopening |
| Admin | Products/content/media, orders/fulfilment/refunds, CRM/support, inventory/purchasing, sales/traffic reports; no credential or staff-role management |
| Fulfilment | Price-free order packing/shipping and permitted stock operations; no finance, marketing or general customer directory |
| Bookkeeper | Payments/ledger/reconciliation/reports, financial exports, costs, period close; customer data remains restricted to required financial views |
| Support | Customer/order lookup and conversations; no refunds, finance posting, stock adjustment, or publishing |

Suggested navigation groups: Overview; Sell (Orders, Payments, Returns, Customers);
Catalog (Products, Collections, Inventory, Suppliers, Purchase orders); Website
(Content, Media, Journal); Engage (Inbox, Templates, Campaigns); Finance (Ledger,
Reconciliation); Reports (Sales, Traffic); Settings (Store, Shipping, Tax,
Integrations, Staff, Activity). Show only authorized entries. Empty modules never
display invented metrics or placeholder transactions as real records.

## 15. End-to-end acceptance scenarios

| ID | Required evidence |
| --- | --- |
| E01 | Owner signs in with password only; existing MFA-enrolled account works; disabled/expired sessions fail; role checks still deny unauthorized direct actions |
| E02 | Upload a photo, choose focal point/alt text, save home-page draft, preview, publish, observe storefront update, restore prior version; referenced media cannot be deleted |
| E03 | Create product and variants, receive stock, publish, find through collection/search, select variant, add to cart, check out with test Stripe and see one paid order |
| E04 | Replay and reorder payment events; exactly one order, stock movement, business event and ledger journal result; payment remains successful when email/SMS is unavailable |
| E05 | Customer is linked, order confirmation is queued, email/SMS acceptance and delivery tracked separately; unsubscribe/STOP suppresses later applicable messages |
| E06 | Partially fulfil an order, see updated commitments and packing slip, send tracking, fulfil remainder; refresh/retry cannot duplicate fulfilment |
| E07 | Issue partial/full refund, handle timeout/reconciliation, receive returned goods separately; inventory, net sales, customer totals and ledger agree |
| E08 | Payment fee and payout reconcile without double-counting revenue; journal sums balance; closed-period posting is blocked; correction/reopen is audited |
| E09 | Analytics consent choice controls collection; SPA navigation/clicks produce deduplicated allowed events; server-paid order completes attributed funnel; admin/PII excluded |
| E10 | Edit every listed screen's content fields; draft/private text never leaks into public HTML, metadata, cache or preview links |
| E11 | Use storefront and admin at 390/768/1440px, keyboard-only and reduced motion; complete purchasing, editing, support and fulfilment flows; inspect reference comparison screenshots |
| E12 | Restart app/worker, simulate DB/provider failures, stale edits and concurrent last-stock checkouts; state persists, retries resume, conflicts are explicit, no duplicate charge/refund/send |
| E13 | Upgrade a database containing old orders and staff; dry-run ledger/customer backfill; histories and password hashes remain intact; test/live totals remain separate |
| E14 | Create a consent-filtered campaign, preview audience/content, send only on explicit action, and process bounce/complaint/unsubscribe; no development test sends real messages |
| E15 | Export/import catalog data with validation, configure a shipping rule and a discount, and verify server/Stripe totals; invalid CSV and formulas cannot silently change data |

## 16. Delivery sequence and definition of complete

Deliver separate reviewable work packages, connected through the contracts above:

1. Shared reference design and password-only auth migration.
2. Media, CMS, product creation, and complete storefront/admin visual coverage.
3. Durable inbox/outbox, Resend/Twilio, customer records/consent, and support inbox.
4. Order/fulfilment/refund completion, reservations, purchasing, shipping and discounts.
5. Financial ledger, reconciliation, finance reports and historical backfill.
6. Traffic/click analytics, complete sales dashboard, campaigns and release verification.

Each package needs an executable implementation plan, its migrations, working UI,
service/repository behavior, failure-path coverage and recorded verification. Preserve
the repository's existing commands; run focused tests first, then typecheck/build and
the cross-module integration suite for the release. These packages are one requested
platform scope; finishing package 1 does not count as finishing the request.

The final release must demonstrate E01–E15 in a persistent staging database, with
screenshots and provider sandbox evidence. UI simulations or mocked API tests alone
do not establish live provider readiness. Deployment and real transactions/messages
remain separate from development and sandbox verification.

## 17. Configuration needed before live operation

Development can proceed with injected provider doubles. Live verification needs
account values entered through deployment secrets/configuration, never committed:

- Hosting URL, persistent Postgres database, worker/job execution and media bucket/CDN.
- Stripe account, secret key, webhook signing secret, chosen tax/shipping settings,
  and explicit live-mode activation through the existing `STRIPE_ALLOW_LIVE` control.
- Twilio Account SID, API key/secret for sends, webhook-validation credential,
  Messaging Service SID, active sender and public callback URLs.
- Resend API key, verified sending domain/From address, Reply-To/receiving configuration
  and webhook signing secret.
- Real product catalog/assets, business contact/policy content, staff recipients,
  and approved notification/campaign content.

Integration settings show Connected, Missing configuration, or Needs attention with
masked identifiers and last successful check. No secret is exposed through client
bundles, exports, audit diffs or the CMS. Saving an integration is not permission to
charge a real card, purchase a sender/storage plan, or send a real campaign.

## 18. Official integration references checked

- Stripe webhooks: https://docs.stripe.com/webhooks
- Stripe refunds: https://docs.stripe.com/refunds
- Resend idempotency: https://resend.com/docs/dashboard/emails/idempotency-keys
- Resend webhook verification: https://resend.com/docs/webhooks/verify-webhooks-requests
- Twilio webhook verification: https://www.twilio.com/docs/usage/webhooks/webhooks-security
- Twilio message delivery states: https://www.twilio.com/docs/messaging/guides/track-outbound-message-status

## Review boundary

This specification records the initial proposal and baseline gap audit. The owner subsequently instructed “fix it completely”, authorizing implementation. The detailed proposed capabilities above are not a blanket completion claim: the implementation guide and verification record below identify actual coverage and remaining limits.

## Implementation record — 2026-10-14

The owner subsequently instructed implementation. The earlier proposal/approval notes above describe the specification stage only. See [platform guide](../../commerce-platform.md) and [verification record](../verification/2026-10-14-commerce.md) for the actual delivered behavior and explicit limits. PostgreSQL-backed media was selected to avoid requiring a separate storage account; interactive focal-point editing and large-scale campaign storage are not included.
