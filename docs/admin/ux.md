# Admin UX contract (draft for review)

Status: designer draft, aligned with `docs/admin/requirements.md` (BA) after cross-review (section 9). Patterns are general (Polaris-like admins, Stripe Dashboard, ledger tools); no copied UI or icons. All names, accounts, reasons and thresholds are placeholders, not business data. **[owner]** marks an owner decision. Ledger and tax text is **not tax, legal or accounting advice**.

## 1. Principles and brand relation

1. Work tool first: density, scannability, predictable tables/forms, keyboard use. No hero imagery, ornaments, gold, WebGL or GSAP in `/admin`.
2. Same families as the storefront (Manrope for UI; Bodoni Moda only for the page title at 28px, never under 20px), a quieter palette, and **Forest only for primary actions** (one primary per view; focus ring also forest). Everything else is espresso/walnut on warm neutrals.
3. Money and stock are never edited in place: every change is an explicit action with a reason and an append-only record (timeline, ledger, movement).
4. State lives in the URL (filters, sort, cursor, tab) so views can be shared, bookmarked and restored.
5. Honest data: fixtures show a "Sample data" badge beside the "Test mode" badge. Never show invented totals, stock or evidence.

Tokens go in a scoped admin layer (`[data-admin]` / `admin.css`), not storefront `globals.css`; frontend owner decides the file. Base size 14/20 (16px inputs under 768px to avoid iOS zoom); 4px spacing scale reused; radius 2px (controls) and 4px (cards).

| Token | Hex | Role |
| --- | --- | --- |
| `a-canvas` | `#F6F4EF` | Page background |
| `a-surface` | `#FFFFFF` | Cards, tables, top bar, inputs |
| `a-sunken` | `#ECE8DF` | Sidebar, table header, neutral badge |
| `a-line` | espresso @15% | Hairlines, card borders (decorative) |
| `a-control` | `#8C7B6B` | Input/checkbox borders (needs 3:1) |
| `espresso` / `walnut` | `#2A1D15` / `#5C4330` | Text / secondary text (storefront tokens) |
| `forest` / `forest-hover` | `#14301F` / `#1F4430` | Primary button, focus ring |
| `parchment` | `#EDE3D1` | Selected row, active tab fill |
| `a-danger` | `#9B1C1C` | Destructive button, error text |

Status pairs (text on tint; each badge also carries a shape and a word):
success `#1E5B34` on `#E3F0E5`; warning `#6B4200` on `#FBEBC8`; critical `#9B1C1C` on `#FBE6E3`; info `#1D4A6E` on `#E2EDF6`; neutral espresso on `#ECE8DF`.

Contrast (WCAG 2.x, computed by hand with the relative-luminance formula; the method reproduces the contract's espresso/ivory 14.65 and walnut/ivory 8.18. Re-run the storefront contrast script before shipping):

| Pairing | Ratio |
| --- | --- |
| espresso / walnut on `a-surface` | 16.34 / 9.13 |
| espresso / walnut on `a-canvas` | 14.87 / 8.31 |
| espresso / walnut on `a-sunken` | 13.37 / 7.47 |
| espresso on parchment (selected row) | 12.85 |
| white on forest / forest-hover (primary button) | 14.26 / 10.89 |
| white on `a-danger` (destructive button) | 8.15 |
| forest focus ring on canvas / surface | 12.97 / 14.26 |
| `a-control` border on surface / canvas | 4.07 / 3.70 |
| success / warning / critical / info text on tint | 6.87 / 7.41 / 6.81 / 7.83 |

Forbidden: gold/gold-deep as text, colour as the only status signal, white text on `a-control`.
Status map (shape + word): Paid = check-circle success; Pending = hollow circle neutral; Partially refunded = half circle info; Refunded = return arrow neutral; Voided = slashed circle neutral; Unfulfilled = hollow square warning; Partially fulfilled = half square info; Fulfilled = check-square success; Failed / webhook failed = octagon-x critical; Needs attention = triangle warning. Icons are inline SVG, `aria-hidden`; the word is the accessible name.

**Roles drive the UI (deny-by-default).** Five fixed roles from the BA matrix: Owner, Admin, Fulfilment, Bookkeeper, Support; one role per staff member, defined in code. The session carries a permission set (`can('refund')`); components never test role names.
- Hidden, not disabled: a nav item whose module the role cannot read, a page header action the role can never perform, bulk actions, tabs (e.g. Audit log for Admin). Direct URL gives `/admin/403` naming the needed role. Disabled with a stated reason only for state-dependent limits ("Already fully refunded", "Period closed").
- Server-side redaction is the real control: the API omits fields; the UI never relies on CSS or conditional rendering. Absent data renders nothing, not "0.00".
- **Fulfilment** gets a price-free order view (title "Pack order #1001"): items, SKU, quantity, shipping address, order number, fulfilment form, timeline of fulfilment events only. No prices, totals, payment, email, phone, customer or internal notes (BA says "notes": treated as packing instructions only, see section 9). The packing slip is a print stylesheet of that same view (no money, no payment ids). Products show no price or cost columns; Overview shows orders/stock tiles only.
- **Support**: no payment ids. **Bookkeeper**: no customer notes, customer aggregates only. Emails in lists are masked (`j***@example.com`) for roles without need; PII never in URLs.
- **Step-up MFA**: refund, any export, period close, staff and role changes, customer-data export and deletion. If the last step-up is older than the owner-set window **[owner]**, the dialog shows an "Authenticator code" field above the confirm button; failure is inline, counted, and audited. The page behind stays usable.

## 2. Information architecture

Sidebar (232px, `a-sunken`; active item = white fill + 3px espresso bar, `aria-current="page"`). Groups in order:
- (none) Overview
- Sales: Orders, Payments, Customers
- Catalog: Products, Inventory, Discounts (hidden until built)
- Finance: Ledger (Journal, Accounts, Trial balance, Periods, Exports as sub-tabs, not sub-nav)
- System: Event log, Staff and roles, Settings
Visibility: groups with no visible item disappear. Fulfilment sees Overview, Orders, Products, Inventory only; Support Overview, Orders, Customers, Products, Inventory, Settings (policies); Bookkeeper Overview, Orders, Payments, Customers (aggregates), Products, Inventory, Ledger, Event log (audit tab), Settings (read); Admin all except Staff and roles; Owner all. Discounts stay LATER and hidden.

Top bar (56px, surface): menu button (below 1024px), global search (`/` or Ctrl/Cmd+K; opens a command palette searching orders `#1001`/email, customers, products/SKU, payments, ledger entry numbers; grouped results, recent items; queries not logged with PII), environment badge "Test mode" (warning style; a live key would show "Live" in critical style and add a "real money" line to money dialogs), "Sample data" badge when fixtures, user menu (name, role, Keyboard shortcuts, Sign out). Breadcrumbs sit in the page header on detail pages only: `Orders / #1001`; the index is the first crumb, never a duplicate title.

URLs (all `noindex`, no storefront chrome):
`/admin` | `/admin/orders[?status&fulfilment&q&sort&after]` `/admin/orders/[id]` | `/admin/payments` `/admin/payments/[id]` | `/admin/customers` `/admin/customers/[id]` `/admin/customers/data-requests` | `/admin/products` `/admin/products/new` `/admin/products/[id]` | `/admin/inventory` `/admin/inventory/movements` | `/admin/ledger` (journal) `/admin/ledger/entries/[id]` `/admin/ledger/accounts[/code]` `/admin/ledger/trial-balance?asOf=` `/admin/ledger/exports` | `/admin/events` (tabs `?tab=webhooks|audit`) `/admin/events/[id]` | `/admin/staff` `/admin/staff/[id]` `/admin/staff/roles` | `/admin/settings/{general,tax,shipping,policies,payments}` | `/admin/discounts` (later) | `/admin/login`, `/admin/403`.
Refund and stock adjust are dialogs/drawers on existing pages (`?refund=1` / `?adjust=<variant>` for restore), not separate routes.

## 3. Layout system

**Page header:** breadcrumb (detail only), title (Bodoni 28/32) + badges, right-aligned actions: one primary (forest), up to two secondary (outline), rest in a "More actions" menu button. Mobile: title, then the primary full width.
**Content width:** fluid to 1280px, 24px page padding (16px under 768). Cards: surface, 1px `a-line`, 4px radius, 16px padding, optional card title 14/600.

**Index tables** (`DataTable`):
- Order: select checkbox, identifier link (row header), then data, then status, then numbers. Text left; numbers, money and counts right-aligned with `tabular-nums`; dates left (`Oct 9, 14:02`, full ISO + timezone in `title`/tooltip and in `<time datetime>`). Currency appears once in the column header ("Total, CAD"); negatives use a true minus (U+2212); ledger uses separate Debit and Credit columns, never signed.
- Row 40px dense, 52px comfortable (user toggle, default dense); 44px target on coarse pointers. Sticky header; first column sticky on horizontal scroll. No more than 8 columns by default; column chooser for more. Truncate with ellipsis plus full text on focus/hover; never wrap numbers.
- Saved views = tabs above the table backed by URL presets (All, Unfulfilled, ...); custom saved views later. Filter bar: search field, "Add filter" popover, applied chips with remove buttons, "Clear all". Sort by clicking a header (button in `th`).
- Bulk (component built, no MVP screen uses it; BA marks bulk LATER): selecting a row replaces the toolbar with "3 selected [actions] Clear"; results dialog lists per-row success/failure. Money actions are never bulk. Selection checkboxes render only when a bulk action exists.
- Pagination is cursor-based (matches `Connection`/`PageInfo`): Previous, Next, page size 25/50/100, "1-25 of about 214" (total only if cheap). Cursor in URL.
- States: **empty first-use** (one sentence + the relevant action), **empty filtered** ("No orders match" + Clear filters), **loading** (skeleton rows keep headers and column widths, `aria-busy`, no shimmer under reduced motion), **error** (inline panel in table area: what failed, Retry, request id; keep stale rows dimmed if a refetch fails), **403** (named role needed).

**Detail pages:** header, then two columns: main (fluid, cards) and sidebar of key facts (320px, `KeyValueList` cards: customer, address, tags, notes, IDs). Below 1024px a single column; the order is main action card first, then facts, then timeline. Timeline (newest first) is the audit surface: system, Stripe and staff entries with actor and time.

**Forms:** sections as cards with a left description on wide screens; label above control, hint below, required marked by word "Required" not an asterisk alone. Validate on blur, then on change; errors inline (`aria-invalid`, `aria-describedby`, icon + text) plus an error summary at the top (`role="alert"`, links focus the fields) on failed save. **Unsaved-changes bar:** sticky under the top bar when dirty: "Unsaved changes [Discard] [Save]" (Save is the one primary); route-guard dialog and `beforeunload`. Optimistic concurrency: save sends `updatedAt`; on conflict show "Changed by <name> at <time>. Reload to see it" and keep the draft.

**ConfirmDialog for money and destructive actions:** modal; title states the verb and object; body states consequences (what is sent to Stripe, what ledger entries post, what stock changes). Typed confirmation: user types the exact amount (`34.00`; the `$` and spaces are tolerated) before the danger button "Refund $34.00" enables. Step-up MFA field appears here when needed. Escape/Cancel are default focus-safe; initial focus lands on the first field (or Cancel when there is none), never the danger button. An idempotency key is created when the dialog opens; double submit is blocked; the button shows pending text. Provider errors render inside the dialog (not a toast) and keep the input. Reversible low-risk actions use a plain confirm without typing.

**Toasts:** bottom-left stack of max 3, `role="status"` (errors `role="alert"`); success 6s, errors persist until dismissed; pause on hover/focus; optional single action (Undo only where the backend can reverse). A toast is never the only record: money, stock and status changes also appear in the timeline.

## 4. Screens (MVP)

Legend: `[P]` primary action, `[ ]` secondary.

**Overview** `/admin`. Periods: Today, Last 7 days, Last 30 days (rolling, store timezone shown **[owner]**, compared with the previous equal period; no delta shown when the prior period is empty). Tiles use the BA names; each has an info popover with its definition.
```
Overview            [Today | 7 days | 30 days]   Timezone: <store>
[Gross sales][Net sales][Orders][AOV][Refunds (n)]     <- delta vs previous period
Unfulfilled (n) oldest 2 d  >      | Webhook health: [OK | triangle Attention]
Low stock (n), out of stock first >|  last processed event 14:02; failed/unprocessed 24 h: n
Recent orders (5), "All orders"    |  orders with review flags: n; checkouts awaiting payment >24 h: n
```
Definitions shown to users: **Gross sales** = subtotal of paid orders (PAID, PARTIALLY_REFUNDED, REFUNDED by processed date), before refunds, excluding tax and shipping. **Net sales** = Gross sales minus refunded item value in the period; shipping and tax listed separately. **Orders** = count of paid orders. **AOV** = Gross sales / Orders, shows "–" when Orders is 0, never 0.00. **Refunds** = succeeded refunds by refund date (not order date) with count. **Low stock** = tracked active variants at or under threshold. Role cuts: Fulfilment sees Unfulfilled and Low stock; Bookkeeper money tiles; Support the Orders tile. Empty: "No orders yet" and "–". Error: each tile fails alone with Retry. Webhook health states are words plus icons, never red alone.

**Orders index** `/admin/orders`. Columns: Order, Date, Customer, Payment, Fulfilment (Unfulfilled, Partially fulfilled, Fulfilled), Items, Total. Views: All, Unfulfilled (oldest first, Fulfilment's default), Refunded. Filters: payment status, fulfilment status, date; search number/email. Fulfilment's variant: Order, Date, Items, Ship-to city, Fulfilment; no Customer, Payment or Total. No bulk actions in MVP.
**Order detail** (Owner/Admin/Bookkeeper/Support variants differ only by redaction):
```
< Orders / #1001  [Paid][Unfulfilled]        [P Fulfil items] [Refund] [More v]
+- Items (3) --------------------------+  +- Customer ------------+
| img Title - variant  SKU  2 x 68.00  |  | Name, email (link)    |
+- Payment ----------------------------+  | Shipping address      |
| Subtotal / Shipping / Tax / Total    |  | Internal notes, flags |
| Paid via Stripe ...ab12 [View payment]|  +-----------------------+
+- Timeline: placed, paid, fulfilled, refund requested/succeeded, note, flag -+
Fulfilment variant "Pack order #1001": Items (title, variant, SKU, qty) | Ship-to address | [P Fulfil items] [Print packing slip]. No money, email or notes.
```
Fulfil drawer: per-line quantity (cannot exceed unfulfilled), carrier, tracking number (trimmed, length-checked), optional tracking URL (https only); no customer email in MVP (LATER). Idempotent per line; a stale page shows current state, never a duplicate; refunded orders warn before fulfilling; DB failure keeps the form values. Phone-first screen (section 6).

**Payments** `/admin/payments`, tabs Payments | Payouts | Refunds (Owner, Admin, Bookkeeper read). Payments: Order, Charge date, Amount, Fee, Net, Status (Stripe ref last 4 only). Payouts: Arrival date, Amount, Status, orders covered when Stripe provides it. Refunds: Date, Order, Amount, Status (Pending, Succeeded, Failed), Reason. Disputes are LATER (read-only list), not in nav.
**Payment detail + refund flow** (rule: nothing posts to the order, ledger or stock until Stripe's webhook confirms):
```
< Payments / ...ab12 [Paid]                           [Refund]
Main: Amount card (captured, refunded, refundable)  | Sidebar: Order link, Stripe ref,
      Refunds table (date, amount, status, reason)  |  mode, fee, net
      Ledger entries (links, only after confirmed)  |
Dialog 1 Amount: (o) pick lines ( ) enter amount, max 34.00 (server recomputes; form never trusted)
  Stripe reason [duplicate|fraudulent|requested by customer] + internal reason + note
  Restock per line: unchecked by default (no silent restock)
Dialog 2 Review: "Refund $34.00 CAD on order #1001. This cannot be undone."  Type 34.00 [__]
  [Authenticator code __] when step-up is stale            [Cancel] [Refund $34.00]
After submit, dialog closes; Refunds row: [hollow circle Pending] $34.00 requested 14:02,
  "Waiting for Stripe to confirm"  [Check status]. Order status, ledger and stock unchanged.
Webhook confirms -> row Succeeded; order status updates; timeline, ledger link, restock movement appear.
```
Timeout on submit: the dialog says "We could not confirm Stripe received this" and offers only **Check status** (re-fetches by our refund id; never re-sends). Double submit uses the same key, one refund. Failed: row Failed with a mapped message, nothing posted; a new refund is a new action. Pending beyond the owner-set age shows a triangle "Attention" and counts in Webhook health. Other errors: amount over cap (inline), already fully refunded (button disabled with reason), Stripe error (in dialog). Approval limits for Admin are LATER **[owner]**.

**Ledger** `/admin/ledger` (Owner W/close, Admin R, Bookkeeper R/export). Separate ledgers per mode: a segmented control "Test ledger | Live ledger" (Live absent until live mode **[owner]**). The test ledger shows a warning badge "Test ledger: sample data, never exported as real" in the page header, a `Mode` column, and `TEST` in export filenames. On every ledger screen, under the page header and not dismissible: info-icon notice "Operational bookkeeping support, not tax, legal or accounting advice. Your accountant confirms the chart of accounts, tax treatment and basis before use." (also in the export dialog and Settings > Tax).
- **Journal:** Date, Entry no., Memo, Source (Order, Refund, Fee, Payout), Debits, Credits; "Closed period" badge. Append-only, system-posted from webhooks: no edit, delete, reverse or manual-entry controls in the MVP (manual adjusting entries are LATER with Owner approval). Detail: lines (account code and name, debit, credit), source link, footer "Debits = credits" check badge, "Reverses #n" when applicable.
- **Accounts:** code, name, type, balance; detail = running balance with drill-through to order, refund or payout. Chart content is **[owner/accountant]**; the BA's list is illustrative. Reconciliation tile: Stripe clearing equals payments minus fees minus payouts, else the difference with a triangle.
- **Trial balance:** as-at date and mode:
```
Trial balance (Test ledger)   As at [2026-10-09]  [Export CSV]
Code  Account            Debit      Credit
1000  <fixture name>     1,234.00
Totals                   x          x      [check] Balanced   (else [octagon-x] Out by 0.01)
```
- **Periods:** Period, Status (Open; Closed with who and when), [Close period] Owner only. Dialog: "New entries dated in this period are rejected; corrections post to the open period with a memo." Typed period name plus step-up MFA; no reopen in MVP **[owner]**.
- **Exports:** journal lines, trial balance, sales by day with tax columns; CSV only; mode and period chosen; dialog states "UTF-8, one header row, decimal-string amounts, text cells beginning = + - @ are neutralised"; step-up MFA; audit-logged; large files async with a download row. Bookkeeper and Owner only.

**Customers index** `/admin/customers` (a customer = one order email; no shopper accounts): Name, Email (masked by role), Orders, Lifetime value, Marketing consent, Last order. Search by email or order number. Bookkeeper sees an aggregates card only. **Detail:** main = orders, timeline; sidebar = contact, tags, internal notes (Support/Owner/Admin write), **Consent** card, **Data requests** card.
- **Consent (append-only `consent_events`):** current state (Express, Implied, None, Unsubscribed) with basis, source, wording version, timestamp and expiry for implied; below it a read-only event history, newest first. No edit or delete. Staff can add only an Unsubscribed event (honoured immediately); recording consent on a customer's behalf is not offered **[counsel]**. Records consent only; nothing is emailed from the admin.
- **Data requests (PIPEDA)** `/customers/data-requests`: Support logs Access or Deletion with received date and due date (**[owner]** target period; overdue gets a triangle badge); Owner approves (Received, Approved, Completed, Declined with reason). Access: generate that customer's data export (Owner, step-up MFA, audited). Deletion dialog lists **Anonymised** (email, name, phone, shipping address, notes on customer and order rows) and **Kept** (amounts, line items, Stripe ids, ledger entries), typed customer email plus step-up MFA; afterwards the customer shows "Anonymised on <date>" and orders keep their financials. Retention periods are **[accountant/counsel]**.

**Products index:** Image, Title, Status (Draft, Active, Archived), Variants, Stock (sum), Price range (hidden for Fulfilment). **Editor:**
```
< Products / Title  [Draft]                 [Preview] [Save draft] [P Publish]
Main: Title+description | Media (alt text and provenance per image; Move buttons)
      Variants: title, SKU (locked after first order), price, compare-at, cost*, tracked, qty, low-stock threshold
      Details: ingredients (INCI), precautions, benefits + review (reviewer, date, evidence reference)
Sidebar: Publish checklist | Status | Sample marker | Type, vendor, tags, handle   (*cost: Owner/Admin/Bookkeeper)
Publish checklist           (each row links to its field; Publish disabled while any row is open)
 [check] Price set on every variant       [triangle] Ingredients (INCI) missing
 [triangle] Precautions missing           [triangle] Benefits not reviewed (reviewer, date, evidence)
 [check] Alt text on every image          [triangle] 2 images lack provenance
 [triangle] Not a sample product (blocks in live mode only; "Allowed in test mode" otherwise)
```
Publish stays disabled with `aria-describedby` pointing at the open rows; Save draft always works; the server re-checks and returns the same list. The admin offers no generate or autofill for claims, INCI or alt text; empty stays empty. **Price edit** confirm step: "Price $68.00 to $72.00. N open bags hold this variant; shoppers will see the price-change notice." (N = 0: "No open bags hold this variant."; count failure: "Open bag count unavailable", save still allowed); audited. Products with orders archive, never delete; handle changes warn that URLs change.

**Inventory** `/admin/inventory`: Product/variant, SKU, On hand, Low-stock threshold, Status (Low stock, Out of stock, Not tracked). One quantity per variant (no committed/available split). Row action "Adjust" opens a right drawer:
```
Adjust stock - Variant, SKU   Current on hand 12
( ) Change by [ +/- n ]  ( ) Set counted quantity [ n ]    -> New on hand: 9
Reason [required select, filtered by role]   Note (optional)
[Cancel] [P Save adjustment]
```
Reasons: Fulfilment may pick received, cycle count, damaged; Admin/Owner add lost, returned (restock), correction. `sale` and `refund_restock` are system-only and appear in history. The result can never go below zero (preview turns to an inline error); a concurrent change returns "Stock is now 8. Review and retry" instead of overwriting. Untracked variants show "Not tracked", no drawer. Success toast links to the movement. **Movements tab** `/inventory/movements`: Date, Variant, Change (+/-), Balance after, Reason, Actor, Linked order/refund. Append-only; corrections are new movements.

**Settings:** tabs. General (legal name, timezone, support email, default low-stock threshold; Owner edits, CAD read-only), **Tax** and **Shipping**: read-only card "Decided at Stripe Checkout today. **[owner]** Stripe Tax or manual rates, registrations, shipping zones." No rates shown or invented; editing is LATER. Policies (returns, privacy, terms, shipping; slice 3): owner-supplied text with version and published date, "Not supplied" until entered; the admin writes no legal text. Payments: Stripe status, mode, last webhook time; no secrets rendered.
**Staff and roles** (Owner only): Staff table (Name, Email, Role, Status, MFA enrolled, Last sign-in); Invite drawer (invite-only); Disable; role change. All need step-up MFA and are audited; the last Owner cannot be demoted or disabled. Roles page is a **read-only** matrix mirroring the BA table (roles are fixed in code, not editable).

**Event log** `/admin/events`. Webhooks tab (Owner, Admin): Time, Source, Type, Object (masked), Status (Processed, Failed, Ignored, Retrying), Attempts; detail drawer: signature verified, processing result, linked order/payment/ledger entry, redacted payload (no secrets or opaque cart ids, per `commerce.md`), [Retry] for failed events (Owner/Admin, idempotent, ConfirmDialog). Audit tab (Owner all; Bookkeeper financial actions only): time, actor, role at the time, action, entity, outcome (success, denied, error); no PII in diffs; immutable. Empty: "No events in this range"; error: retry.

## 5. Components

| Component | Props (sketch) | Notes |
| --- | --- | --- |
| `AdminShell` | `nav`, `user`, `env` | Sidebar, top bar, skip link, `<main id>` |
| `PageHeader` | `title`, `badges?`, `breadcrumb?`, `primary?`, `secondary?`, `more?` | One primary only |
| `DataTable<T>` | `columns[{id,header,align,sortable,cell,sticky}]`, `rows`, `rowKey`, `sort`, `onSort`, `selection?`, `bulkActions?`, `state:'ready'\|'loading'\|'error'\|'empty'`, `pageInfo`, `density`, `mobileCard?`, `caption` | Real `<table>`; URL-driven |
| `FilterBar` | `search`, `filters[{key,label,type,options}]`, `value`, `onChange`, `views[]` | Writes search params |
| `StatusBadge` | `tone`, `icon`, `label` | Tone from a fixed map; never colour alone |
| `MoneyCell` | `amount: string`, `currency`, `variant:'plain'\|'debit'\|'credit'` | Decimal strings only; no float math |
| `DateCell` | `value`, `format:'short'\|'relative'` | `<time>`, store tz, full value on hover/focus |
| `Stat` | `label`, `value`, `delta?`, `href?`, `state` | Delta has sign word plus arrow |
| `KeyValueList` | `items[{label,value,copy?}]` | `<dl>`; copy buttons for ids |
| `Timeline` | `events[{time,actor,kind,text,link?}]` | `<ol>`; actor and time always shown |
| `ConfirmDialog` | `title`, `body`, `confirmLabel`, `tone`, `typedConfirm?:string`, `stepUp?:boolean`, `onConfirm` | Focus trap, idempotency key slot, MFA field |
| `Can` / `useCan` | `permission`, `fallback?` | Hides; never the only control (server redacts) |
| `PublishChecklist` | `items[{id,label,state,fieldHref}]` | Blocks Publish; rows are links |
| `MaskedValue`, `ModeBadge` | `value` / `mode:'test'\|'live'` | Masked email; ledger and env mode |
| `Drawer` | `title`, `open`, `onClose`, `footer` | Right, 480px; sheet on mobile; modal semantics |
| `Toast` / `useToast` | `tone`, `text`, `action?`, `persist?` | Live region |
| `Tabs` | `items[{id,label,count?,href}]` | Links for URL tabs; `role=tablist` only for in-page |
| `Pagination` | `pageInfo`, `pageSize`, `onChange` | Cursor based |
| `FormField` | `label`, `hint`, `error`, `required`, `children` | Wires ids, `aria-describedby` |
| `Money/TextInput`, `Select`, `Checkbox`, `Switch`, `Combobox` | standard | Min 44px on coarse pointers |
| `UnsavedBar`, `ErrorSummary`, `EmptyState`, `ErrorPanel`, `Skeleton` | | Shared state patterns |
| `CommandPalette`, `ShortcutHelp` | `groups`, `onSelect` | Opened by `/`, Ctrl/Cmd+K, `?` |
| `LineChart`, `ChartTable` | `series[{date,value,prev?}]`, `format` | Section 7 |

## 6. Accessibility and devices

- Tables: native `table`, visually-hidden `caption`, `th scope=col`, first cell `th scope=row`. Sortable header is a `button` inside `th` with `aria-sort` on the `th` (`ascending`, `descending`, otherwise omitted). Selection checkboxes carry row-specific labels; a polite live region announces "Showing 1-25, sorted by date, newest first" and "3 selected". Use `role=grid` only if cells become editable (not planned).
- Dialogs/drawers: `role=dialog`, `aria-modal`, labelled by title, focus trapped, Escape closes (except while a money request is in flight), focus returns to the trigger; background `inert`. Menus and popovers follow the same return-focus rule.
- Shortcuts: `/` search, Ctrl/Cmd+K palette, `?` help, `g` then `o/p/c/i/l` go to Orders/Payments/Customers/Inventory/Ledger, `j`/`k` move row focus, `Enter` open, `x` select. Single-key shortcuts are inactive in fields, with modifiers, or inside dialogs, and can be switched off in the user menu (WCAG 2.1.4). Discoverable via `?`, tooltips on the search field, and menu hints. None override browser or screen-reader commands; destructive actions have no shortcut.
- Reduced motion: no slide/shimmer/chart animation; transitions are opacity-only at most 120ms by default. Forced-colors: focus uses `Highlight`, badges keep borders and icons.
- Targets: 44px minimum on coarse pointers (row actions, checkboxes via padded hit area); 24px minimum elsewhere. WCAG 2.2 AA throughout; errors identified by text and icon, not colour.
- Phone (below 640px) **must** work: Overview glance, Orders list/detail and **fulfilling an order** (mark fulfilled with tracking), order lookup, Customers lookup, Inventory lookup and quick adjust, Event log read. Orders, Inventory and Customers tables collapse to cards (title, status badges, key figure). Tablet (768+) supports everything except heavy editing. Desktop-first, read-only/scroll on phone: Ledger, Trial balance, Product editor, Settings, Staff and roles. Wide tables scroll inside their container with a sticky first column; the page itself never scrolls sideways. Refunds on phone are allowed but use the same typed confirmation, full-screen sheet.
- Session: idle timeout shows a dialog before sign-out; unsaved drafts are kept locally for the re-sign-in **[owner: durations]**.

## 7. Charts

The BA lists charts as LATER, so the MVP ships **Sales by day** as a table (Date, Orders, Gross sales, Refunds, Net sales; exportable `DataTable`) and one optional chart, **Gross sales over time**, as a thin layer over it. Nothing else is charted.
- SVG, no animation; espresso line, previous period dashed in `a-control` (dash plus colour), direct end labels instead of a legend, 3:1 marks, y-axis from zero, currency in the axis label.
- `<figure>` with a `figcaption` summary; SVG `role=img` with the same label; tooltip on hover and focus; arrow keys step through points ("Mon Oct 5: $1,240.00, 12 orders"). **Chart | Table** toggle; the table is the default under 360px. Empty: "No sales in this range"; error: card-level `ErrorPanel`.

## 8. Needs owner input (top)

Timezone and bookkeeping basis; Admin refund limits and the step-up window; accountant sign-off on chart, tax approach and CSV formats; whether the live ledger can be reopened after close; CASL wording and PIPEDA due dates; low-stock default and adjustment reasons; Fulfilment's access to order notes. Backend gaps are in `requirements.md` section 0.

## 9. Cross-review (changes after reading the BA draft)

Changed here: the five BA roles replace my starter roles, with hidden-not-disabled rules, a price-free Fulfilment view and step-up MFA (sec. 1, 4); Overview uses the BA metric names; refund flow is pending-until-webhook with Check status and no resend; ledger gets test/live separation, periods, formula-safe export and a permanent notice; publish checklist and open-bag count; append-only consent and PIPEDA anonymisation; inventory drops Committed/Available and role-filtered reasons; bulk actions, manual ledger entries and reversal controls moved to LATER; custom date range dropped; Reprocess renamed Retry.
Disagreements and questions for the BA:
1. Fulfilment "R own: items, address, notes" conflicts with "no customer notes". I show packing instructions only; the BA should name the field.
2. Formula-safe CSV must not neutralise numeric columns: a refund of `-12.00` begins with `-`. Neutralise text columns only (memo, names, notes); keep amount columns generated decimals, unsigned debit/credit in the ledger.
3. Net sales subtracts refunds by refund date but Gross sales counts by order date, so a period can show negative Net sales; keep the definitions but label the tile "by refund date".
4. Charts: BA says LATER; I recommend the table now, chart optional.
5. A closed-period correction with no reopen path needs an owner decision (sec. 8).
