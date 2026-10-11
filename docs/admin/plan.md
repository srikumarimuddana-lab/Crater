# Admin and catalogue pivot: architect's plan

Status: approved direction, 2026-10-09. Inputs: `requirements.md` (BA), `ux.md` (UI engineer),
and the owner's answers:

1. Switch the sample catalogue to herbal tinctures, body oils, single-herb extracts and kits.
2. Build sign-in into our own database now and migrate to Supabase Auth later.
3. Build admin Slice 1 first: orders, products, inventory.

This file wins where the two drafts disagree.

## 1. Owner decisions recorded

| Decision | Choice | Consequence |
| --- | --- | --- |
| Catalogue | Herbal tinctures, body oils, single herbs, kits | New seed with **original** sample names; no copied names, text, photos, certifications or reviews from any real brand |
| Health claims | None | In Canada, natural health products need a Health Canada product licence (NPN) and approved claims. Interest labels stay neutral ("Evening ritual", not "Sleep aid"), and every product page carries a sample / not-licensed notice |
| Staff sign-in | Built-in now, Supabase Auth later | An `AdminAuthProvider` interface with a `builtin` implementation; a Supabase implementation replaces it without touching screens |
| First admin slice | Orders, products, inventory | Refunds, ledger and CRM follow in Slices 2–3 |
| Storefront layout | Patterns from established herbal stores | Announcement bar, mega menu, hero with two actions, value tiles, featured carousel, shop-by-ritual tiles, story and values sections, rich footer. Patterns only; all content original or marked placeholder |

## 2. Disagreements settled

- **Roles:** the BA's five (Owner, Admin, Fulfilment, Bookkeeper, Support). No Manager or Read-only role.
  The roles page is read-only in Slice 1.
- **Fulfilment notes:** an order has `packingInstructions` (staff-only, visible to Fulfilment) and
  `internalNotes` (hidden from Fulfilment). There are no customer-facing notes in Slice 1.
- **Stock model:** `variants.quantity` stays "available to sell" and is decremented by the paid-order
  webhook, as today. "Committed" is derived from paid, unfulfilled order lines, and on hand =
  available + committed. Every change writes an append-only `inventory_movements` row.
- **Failed and disputed payments:** no new `OrderFinancialStatus` values. Use `checkouts.status`,
  plus `payments.status` and `orders.dispute_status` when Slice 2 adds payments.
- **Data requests:** access (with export) and deletion (anonymise PII, keep financial records). Slice 3.
- **Manual journals:** later. **Refunds:** Slice 2. **Period reopen:** Owner-only, with a reason and an
  audit entry, in Slice 2.
- **CSV safety:** neutralise formula-leading characters in text columns only. Ledger amounts stay
  numeric, with separate unsigned debit and credit columns.
- **Net sales** may be negative in a period (refunds counted by refund date); the tile says so.
- **Charts:** Slice 1 ships a "Sales by day" table. The chart comes later, with that table as its
  accessible alternative.

## 3. Architecture

```
src/app/admin/(auth)/login, /admin/setup-mfa          public admin routes (noindex)
src/app/admin/(console)/layout.tsx                    session gate + shell (sidebar, top bar)
src/app/admin/(console)/{page,orders,products,inventory,events,staff}/...
src/lib/admin/types.ts        coordinator-owned admin contract
src/lib/admin/auth/           AdminAuthProvider + builtin (scrypt, TOTP, sessions)
src/lib/admin/permissions.ts  role → capability map; deny by default
src/lib/admin/audit.ts        append-only audit writer
src/lib/admin/services/       orders, products, inventory, overview (server-only)
db/migrations/0003_admin.sql  admin schema + commerce additions
```

- **Separation:**
  - The admin uses its own route group, layout and design tokens (`[data-admin]`, `ux.md` §1).
  - It loads no storefront header, cart, WebGL or GSAP.
  - Every page is `noindex` and `Cache-Control: private, no-store`.
- **Authorisation:**
  - The `(console)` layout rejects requests without a valid session.
  - Every Server Action and route handler re-checks the session **and** the capability on the server.
    The layout check alone is not trusted.
- **Built-in sign-in:**
  - Passwords are hashed with Node `crypto.scrypt` and a per-user salt (no new dependency).
  - The second factor is a TOTP authenticator code (RFC 6238, HMAC-SHA1, 30 s, ±1 step), tested
    against the RFC vectors.
  - The session token is 256 random bits in a `crater_admin` cookie (HttpOnly, Secure, SameSite=Strict,
    path `/admin`). Only its SHA-256 is stored.
  - Sessions have a 30-minute idle timeout and a 12-hour absolute limit, and rotate on sign-in.
  - Login attempts are rate-limited per email and IP with backoff.
  - Accounts are invite-only. The first Owner is created with `npm run admin:create-owner`; there is
    no public sign-up.
  - Step-up (a fresh TOTP within 10 minutes) is required for staff changes, and later for refunds and
    exports.
- **Supabase migration path:**
  - `AdminAuthProvider` has `signIn`, `verifySecondFactor`, `getSession`, `signOut` and `requireStepUp`.
  - Staff rows keep their own `id`. A Supabase provider maps `auth.users.id` to `staff_users.auth_subject`.
  - Roles, audit and screens are unchanged.
- **Database:**
  - New tables live in an `admin` schema with RLS enabled and no policies, matching `commerce`.
  - The same rules apply: transaction-pooler safe, parameterised queries, a memory implementation for
    tests and development.
- **Storefront impact:**
  - Products gain `status` (draft, active, archived), and the storefront shows `active` only.
  - The paid-order webhook stores the shipping address Stripe collected and writes inventory movements.
  - The admin "open bags" count on a price edit uses the existing `priceAtAdd` mechanism.

### Admin backend (as built)

Code: `src/lib/admin/**`, migration `db/migrations/0004_admin.sql` (the plan's "0003_admin" is 0004 because 0003 already existed), `db/admin-create-owner.mjs`. UI entry point: `@/lib/admin` (`getAdmin()`, `requireAdmin()`).

- **Auth (`builtin`):** scrypt N=2^15 r=8 p=1 with a 16-byte salt, 12-character minimum. TOTP per RFC 6238 (SHA1, 6 digits, 30 s, +/-1 step), with the RFC vectors in the unit tests. A used time-step is never accepted again (atomic compare-and-set per staff row). TOTP seeds are AES-256-GCM encrypted with `ADMIN_SECRET_KEY`, bound to the staff id; admin refuses to start without a 32-byte key. Two cookies: `crater_admin` (session) and `crater_admin_pending` (password accepted, second factor to come, 5 minutes); they get a `__Host-` prefix when Secure. Both are HttpOnly, SameSite=Strict, Path `/` (the plan said `/admin`; `__Host-` requires `/`). Only the SHA-256 of each token is stored. The session has a 30-minute sliding idle limit, a 12-hour absolute limit, rotation at every sign-in, and step-up valid for 10 minutes. Rate limits are per email (5 free failures) and per IP (20), then 30 s doubling to 15 min, with the same generic message either way. `ADMIN_AUTH_PROVIDER=supabase` is a typed stub (`auth/supabase.ts`) with migration notes.
- **Roles:** the matrix is in `permissions.ts`, deny by default, with a table-driven test. Two narrowings, because `types.ts` cannot express price-free products or a money-free overview: **Fulfilment has no `products:read` and no `overview:read`.** They work from Orders (price-free) and Inventory. Cost price is visible to Owner, Admin and Bookkeeper only; order email is full for Owner, Admin and Support, masked for Bookkeeper, absent for Fulfilment.
- **Services** re-check capabilities themselves. Reads throw `AdminAuthError`; mutations return `AdminMutationResult`, and a denial is audited as `access.denied`. Every state change writes its audit row in the same transaction. Audit `changes` carry ids, statuses, money and counts only: notes and tracking numbers are never logged, personal-data keys throw, and email-looking text is redacted.
- **Product status** is one source of truth: `products.status`. `archived_at` stays as the archive timestamp, and a CHECK constraint keeps the two in lockstep. The storefront reads `status = 'ACTIVE'` only. The seed sets sample products ACTIVE.
- **Stock:** `variants.inventory_quantity` stays "available". Committed = units on paid (PAID or PARTIALLY_REFUNDED), unfulfilled order lines, and on hand = available + committed. Every change writes an append-only `inventory_movements` row (the webhook writes `ORDER_PAID` in its own transaction). The audit log and movements are append-only by trigger (UPDATE, DELETE and TRUNCATE are refused, owner included).
- **Webhook:** stores the address from `collected_information.shipping_details` (API 2026-08-26.dahlia) and logs each verified event's outcome (`PROCESSED`, `DUPLICATE`, `REJECTED`, `FAILED`) in `commerce.webhook_events`. Events with a bad signature are not logged.
- **Overview:** paid = PAID, PARTIALLY_REFUNDED or REFUNDED, by `processed_at`. Periods are calendar days in `TIMEZONE`. Net sales equals gross sales until Slice 2 adds refunds. Webhook health counts FAILED and REJECTED events in the last 24 hours.
- **Tax, timezone, reasons (docs/tax.md):** `TIMEZONE` defaults to `America/Regina`. Migration `0005_tax.sql` adds the bag's ship-to province, the checkout's expected tax and the order's per-rate tax lines, tax province and collected shipping province. The webhook records Stripe's own per-rate tax (it fetches `total_details.breakdown` because event payloads omit it; a failed fetch answers 5xx so Stripe retries) and holds the order PENDING with `TAX_PROVINCE_MISMATCH` or `TAX_AMOUNT_MISMATCH` (more than 1 cent per line). `AdminOrder.taxLines` is null without `orders:read_prices`.
- **Stock reasons:** RECEIVED, COUNT_CORRECTION, DAMAGED, EXPIRED, RETURN_RESTOCK, SAMPLES_GIFTS, LOST_STOLEN, OTHER, with sign rules in `permissions.ts` (`REASON_SIGN`). Fulfilment may use RECEIVED, COUNT_CORRECTION, DAMAGED and EXPIRED; OTHER needs a note.
- **Publish gate** gains `HAS_COST` (every sellable variant has a cost). The sample seed fills missing costs at about 35% of price (sample data, never overwrites a cost staff entered). `settings.get()` (capability `overview:read`) returns the read-only timezone and tax table.
- **Staff:** `npm run admin:create-staff -- --role <ADMIN|FULFILMENT|BOOKKEEPER|SUPPORT> --email <email> [--name <name>]` reads the password from stdin only, refuses OWNER and duplicate emails, and writes a `staff.created` audit row.
- **Dev bootstrap:** `ADMIN_DEV_STAFF` seeds MFA-enrolled staff only with `COMMERCE_DB=memory`. It is refused at config time and at seeding time otherwise (unit-tested).

## 4. Slice 1 scope (build now)

1. Sign-in, TOTP enrolment, sign-out, session handling, rate limit, `admin:create-owner`.
2. Staff and roles: list staff and their roles (read-only), and an audit log tab.
3. Overview: Gross sales, Net sales, Orders, AOV ("–" with no orders), Low stock and Webhook health
   for Today / 7 / 30 days in the store timezone (America/Regina), plus a
   Sales by day table.
4. Orders:
   - index with filters by payment and fulfilment status;
   - detail with lines, totals, shipping address, timeline, packing instructions and internal notes;
   - Mark fulfilled (carrier and tracking);
   - a price-free packing slip and a Fulfilment-role "Pack order" view.
5. Products:
   - index, and an editor for title, description, details, status, and variants (price, SKU, optional
     cost, low-stock threshold);
   - a publish-gate checklist that blocks Publish for sample data, missing ingredients or precautions,
     or missing alt text;
   - a price edit shows "N open bags hold this variant".
6. Inventory: stock levels (available, committed, on hand), an Adjust drawer with reason codes, and
   movement history.
7. Event log: webhook events and audit entries.

Slice 1 is done when:
- the unit tests (auth vectors, permissions matrix, services, Postgres parity) and the e2e tests
  (sign-in plus TOTP, role gating and a direct-URL 403, fulfil an order, adjust stock, publish gate)
  pass at 390 and 1440;
- axe reports no serious or critical violations;
- the integration suite still passes.

## 5. Later slices

- **Slice 2:** payments list, Stripe refunds (typed-amount confirmation, webhook-confirmed), fee and
  payout events, double-entry ledger (separate test and live ledgers), trial balance, period close
  and reopen, accountant CSV export.
- **Slice 3:** customers derived from orders, CASL consent events, PIPEDA access and deletion, policy
  pages.
- **Later:** discounts, disputes, a chart on the overview, staff invites and role editing, passkeys,
  Supabase Auth provider.

## 6. Build order and ownership

1. **BA:** the herbal catalogue spec and copy rules (`docs/catalogue.md`, `shop-copy.ts` additions).
2. **Coordinator:** the admin contract (`src/lib/admin/types.ts`), placeholder packshots for the new
   formats, and the catalogue seed swap.
3. **In parallel:** the commerce engineer builds the admin backend (`lib/admin/**`, migration 0003,
   webhook additions, `/admin` route handlers), while the frontend engineer redesigns the storefront
   layout.
4. **Then:** the frontend engineer builds the admin UI against `types.ts` and the services.
5. **Coordinator:** integration, every check, screenshots, commit.

## 7. Still open for the owner

Store timezone; whether shipping is charged and at what rates; tax registration and method;
refund reasons and approval limit; whether cost price is tracked; the first staff and their roles;
whether to show the low-stock threshold to shoppers; and licensed product claims (NPNs) before any
real product goes live.

## 8. Slice 1 status (2026-10-09)

Built and verified: sign-in with authenticator codes, role-filtered console, overview,
orders (list, detail, fulfil, notes, packing slip), products (editor, publish gate, status),
inventory (levels, adjust, movements), event log, staff list. Checks: typecheck, lint,
build; Vitest 262 + 101 Postgres skips (363/363 with Postgres); Playwright 236 passed,
10 skipped (storefront + admin, three viewports); integration 22/22.

Known gaps:
- Default e2e cannot create paid orders (memory mode has no webhook), so fulfilment, notes
  and packing-slip contents are covered by service unit tests only. An admin spec under the
  fake-Stripe integration setup is the next test task.
- MFA enrolment page is built but not e2e-tested; the publish-blocked action path is
  unit-tested only.
- Forbidden and config-error pages render with HTTP 200; a true 403 needs `authInterrupts`.
- Not built: customer column on orders, image editing, new-product page, toasts, unsaved-changes
  bar, keyboard shortcuts.
