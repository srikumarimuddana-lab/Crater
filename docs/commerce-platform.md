# Craters Remedy commerce platform

This implementation extends the existing Next.js/Postgres application. The storefront ports the approved Remedy reference assets, typography, section layout, scroll motion and routine tabs into React components. The admin uses the same green/cream palette, Cabinet display face and rounded controls.

## Included workflows

| Area | Working path |
| --- | --- |
| Storefront | Collection filters, server search and pagination, product/variant selection, persistent bag, province tax, server-priced discount/shipping quote and hosted Stripe checkout |
| Staff | Password-only login, invitations, expiring single-use password reset, role/status management, session revocation and final-Owner protection; no MFA |
| Content | `/admin/content`: structured page fields, private drafts, authenticated preview, optimistic version conflicts, publish, revision restore; Owner-only policy publication |
| Photography | `/admin/media`: validated upload, metadata stripping and bounded WebP derivative, reusable gallery selection, private preview and immutable published assets |
| Catalog | Products/variants, collections, publish checks, image galleries, new-product CSV import and CSV export |
| Orders | Order book, payment/review flags, notes, packing slips, partial shipments, tracking and separate physical returns/restocking |
| Inventory | Available/held/committed quantities, stock movement journal, suppliers, purchase orders, explicit test/live receipts and cost snapshots |
| Payments | Persistent refund requests, reserved refund limits, provider reconciliation, uncertain/pending states and signed callback recovery |
| Finance | Balanced immutable journals, sales/tax/shipping, refunds, fulfilment costs, supplier payable/receipt costs, physical-return cost reversal, fees/payouts, trial balance, corrections, period close/reopen and CSV |
| CRM | Order history, notes/tags, email and phone-bound consent, customer export/anonymization, audited merge preview and support inbox |
| Communications | Resend email and Twilio SMS adapters, versioned templates, durable leased outbox, signed callbacks, explicit campaign queues, confirmed newsletter opt-in and unsubscribe/STOP handling |
| Analytics | Opt-in page views/clicks/product/add-to-cart tracking, server-accepted checkout and paid attribution, mode-separated sales/traffic/funnel reports, CSV and retention |

## Configure an environment

Use `apps/storefront/.env.example` as the variable inventory. Keep secrets in the deployment's secret manager. The integration screen displays missing variable names and actual recorded delivery states, never secret values.

1. Configure persistent PostgreSQL with `COMMERCE_DB=postgres`, `DATABASE_URL`, verified TLS where required, and `SITE_URL` set to the canonical HTTPS origin. Memory mode is only for local fixtures/tests.
2. Run `npm ci`, then `npm run db:migrate` from `apps/storefront`. Migrations are ordered and recorded. Back up an existing database and exercise the upgrade on a copy first. Migration 0006 invalidates old sessions and retires TOTP secrets while preserving staff and password hashes.
3. Create the first Owner with `npm run admin:create-owner`. Enter the password through its prompt/stdin; do not place it in source files. Use Staff for subsequent invitations.
4. Configure `COMMERCE_PROVIDER=stripe`, test `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the site origin. Create the fixed tax rates with `npm run stripe:tax-rates`. Register `/api/webhooks/stripe` for checkout completed, async payment succeeded/failed, expired, and refund created/updated/failed events. Live charging additionally requires `STRIPE_ALLOW_LIVE=true`.
5. Configure Resend's verified sender/reply-to/API key and webhook secret; callback `/api/webhooks/resend`. Configure Twilio account/API key credentials, Messaging Service, auth token, and exact public inbound/status callback URLs at `/api/webhooks/twilio`.
6. Configure a strong `COMMUNICATIONS_WORKER_SECRET` and `COMMUNICATIONS_UNSUBSCRIBE_SECRET`. Keep `COMMUNICATIONS_MODE=test`, `COMMUNICATIONS_ALLOW_LIVE=false`, and use an exact test-recipient allowlist. Enable sending only after the provider setup and sandbox checks. Newsletter marketing also requires a business postal address.
7. Schedule `POST /api/communications/process` with `Authorization: Bearer <worker secret>`. It recovers finance/CRM/notification/analytics effects from committed records, reconciles provider refunds and fees, prunes analytics and processes a bounded message batch. Inbox/Integrations also offers a manual run. Do not rely on an in-process timer.
8. Replace fixture products and publish actual brand copy, policies, product details and photography through the admin. Review configuration diagnostics and run the staging acceptance checklist before enabling live payments/messages.

## Data and recovery

Orders and pricing are server authoritative. Checkout holds serialize stock claims; ambiguous provider failures retain holds until expiry. A verified late payment is retained and flagged for stock review. Payment callbacks deduplicate orders and stock movement. Ledger and notification source keys are durable, so a worker restart repairs post-commit gaps without duplicating journals/jobs. SMS acceptance is distinct from delivery; an ambiguous send becomes Unknown and is not blindly resent.

Amounts use integer CAD minor units. Product subtotal is net of discount; original line prices and discount totals are retained. Shipping is a separate taxable Stripe line and a separate internal amount, excluded from merchandise order lines. Receipt accounting requires explicit test/live mode. Refunds and physical restocking are independent actions.

Images are stored as validated WebP bytes in private PostgreSQL tables, capped at 10 MB input and 2400px derivatives. This delivers durable uploads without an additional storage account. Published assets remain available at immutable URLs. Private media requires an editor session. Page publication locks referenced media in the same transaction. For high media volume, replace the storage adapter with object storage while preserving the publication boundary.

## Practical limits

- Deployment/provider credentials, verified senders, DNS, a persistent staging database and live activation are environment setup, not provisioned by this code change.
- Communications uses a transaction-locked state document and finance serializes per payment mode. This is intended for a modest single-store workload; normalize/partition before large campaigns or long histories.
- CSV import creates new products, one product/variant per row; it is not a bulk update or a multi-variant export round-trip importer.
- Media editing supports upload/replacement, accessible descriptions and page/gallery selection. It does not include an interactive focal-point/crop editor or video library.
- Unsupported Stripe adjustments/disputes and missing historical cost snapshots appear as reconciliation review items. Bank statement matching and supplier payment settlement remain manual.
- Privacy/terms defaults require the owner's business-specific content. SEO remains noindex until the owner prepares and activates the production store.
- Payment mismatch/review flags require investigation before fulfilment. The application does not automatically repair an inconsistent historical payment snapshot.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run build`, and `npm run test:e2e`. Native PostgreSQL tests require a throwaway `TEST_DATABASE_URL` whose name includes `test`; `npm run test:integration:pg` provisions a temporary cluster when Postgres binaries exist. Tests never require real payments or messages. The delivery verification record is in `docs/superpowers/verification/2026-10-14-commerce.md`.
