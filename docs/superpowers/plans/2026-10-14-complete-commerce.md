# Complete commerce implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent module tasks; the coordinator owns integration and verification.

**Goal:** Implement the owner's complete reference-designed ecommerce platform.
**Architecture:** Extend the existing Next.js modular monolith and Postgres commerce repository. Keep server-authoritative commerce, role checks and durable provider operations. All business modules get real admin routes, persistence and error states.
**Tech stack:** Existing Next.js, React, TypeScript, Postgres, Stripe; Resend/Twilio HTTP adapters; PostgreSQL-backed private media adapter.
**Spec:** ../specs/2026-10-14-complete-commerce-platform-design.md
**Execution:** Owner instructed “fix it completely” after receiving the specification; proceed continuously and record scope limitations honestly.

## Global constraints

- No MFA. Keep password hashing, login throttling, session expiry and server authorization.
- Share the reference's design assets/tokens and React-safe motion; preserve keyboard/reduced-motion fallbacks.
- Preserve money in integer minor units internally. Never make a browser response authoritative for payment.
- Use Postgres for durable production data and explicit memory adapters for tests/preview.
- No live payments/messages, production database mutation, or production deployment during implementation.
- Coordinator owns manifests, shared permissions/navigation and provider/commerce integration points.

## Review focus

- Replayed callbacks and worker restarts must not duplicate orders, messages or journals.
- Unauthorized direct server actions must fail even when navigation is hidden.
- Draft content and private media must not leak into public pages.
- A stale editor or concurrent stock operation must produce a conflict, not overwrite.
- Failed/unconfigured providers must produce actionable states, not fake successes.

## Task 1: Password-only access

Files: existing `src/lib/admin/auth`, auth types/config/session, auth actions/pages, staff display, migration `0006_password_auth.sql`, auth unit/E2E tests.
Interface: `signIn` returns successful authenticated session and `next: 'AUTHENTICATED'`; no pending second factor. Retain repository-compatible staff/session fields temporarily where necessary.
- [x] Test valid/invalid/disabled login, session expiry, enrolled legacy account and rate limiting.
- [x] Implement password-only flow; retire MFA URLs, requirements and prompts.
- [x] Run focused auth tests and typecheck; commit owned changes.

## Task 2: Content, media and reference design

Files: `src/lib/content/cms/**`, `src/lib/media/**`, new content/media admin routes and actions, `0007_content_media.sql`, shared styles/components, storefront routes/assets.
Interfaces: `getPublishedContent(key)` returns validated page content with fixture fallback; `saveDraft(key, expectedVersion, data)`, `publishContent(key, expectedVersion)` enforce roles/version conflicts; media IDs resolve to approved immutable derivatives.
- [x] Add tests for draft isolation, publish conflict, URL validation and media signatures.
- [x] Implement Postgres + memory content revisions/media metadata and upload adapter.
- [x] Build structured editor, media picker/upload, preview/publish/revision workflow.
- [x] Port reference assets, hero/sections and motion into connected storefront; apply shared tokens to admin and secondary pages.
- [x] Verify content workflows and responsive visuals, then commit.

## Task 3: Communications and CRM

Files: `src/lib/communications/**`, `src/lib/crm/**`, `src/lib/operations/**`, corresponding admin pages/actions, provider webhook routes, `0008_communications_crm.sql`, tests.
Interfaces: durable `enqueueNotification` keyed by source event/channel; `processNotifications` with leases and provider IDs; `recordCustomerOrder` derives CRM order links idempotently. Provider failures do not roll back commerce.
- [x] Test deduplication, consent suppression, callback verification, provider timeout and worker reclaim.
- [x] Implement Resend/Twilio adapters, durable outbox and callback processing.
- [x] Build customers, notes/tags/consent and inbox/templates/integration health UI.
- [x] Connect paid/fulfilled/refunded events after coordinator integration review; verify and commit.

## Task 4: Payments, finance and expanded order operations

Files: `src/lib/finance/**`, new finance/payment admin pages/actions, `0009_finance.sql`, related tests. Coordinator integrates commerce webhook and permissions.
Interfaces: `postOrder`/`postRefund` create balanced event-keyed journals; refund operations have persistent request keys/provider IDs and pending/unknown states; reconciliation never treats payouts as sales.
- [x] Test balanced journals, replay, refund limits/concurrency, closed period and mode separation.
- [x] Implement payment/refund adapters, ledger accounts/journals/reconciliation and reports.
- [x] Add admin payment/refund/ledger flows and order connections.
- [x] Verify finance failure paths and commit.

## Task 5: Inventory and catalog completion

Files: product/variant creation, collection editing, suppliers/purchase order/receiving routes and services, `0010_inventory_operations.sql`, tests.
Interfaces: receive stock once per receipt key; checkout reservations atomically protect available quantity; returns explicitly restock after physical receipt.
- [x] Test receipt replay, concurrent last-unit reservation, expired and late paid checkout.
- [x] Implement creation/import/export, suppliers, purchasing and receipt workflows.
- [x] Complete partial fulfilment/returns and shipping/discount pricing with authoritative totals.
- [x] Verify integration against existing checkout and inventory tests; commit.

## Task 6: Analytics and dashboard

Files: `src/lib/analytics/**`, consent/event client, ingestion route, dashboard/report routes, `0011_analytics.sql`, tests.
Interfaces: allowlisted events with stable click IDs, deduplication and no personal field values; paid orders remain source of revenue truth.
- [x] Test consent, invalid payloads, repeat event IDs and metric denominators.
- [x] Implement persisted events/aggregates, sales/traffic/funnel reports and accessible charts.
- [x] Connect server purchase events and expose integration/fulfilment health.
- [x] Verify reporting and commit.

## Task 7: Integration, review and delivery

- [x] Run typecheck, unit tests, build and relevant browser/Postgres integration suites.
- [x] Exercise spec scenarios E01–E15; record actual pass/block/fail per scenario.
- [x] Request independent code review and fix important findings.
- [x] Publish implementation commits to PR #2, update its description with completed behavior and exact verification limits; do not merge/deploy automatically.

## Execution record

Implementation and independent review completed. Read `../verification/2026-10-14-commerce.md` for the acceptance evidence and explicit partial/staging-only scenarios; checked implementation tasks do not certify live provider readiness or native PostgreSQL contention.
