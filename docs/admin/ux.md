# Admin UX contract (draft for review)

Status: brainstorm draft by the designer. `docs/admin/requirements.md` did not exist when written; reconcile after the BA draft. Patterns are general (Polaris-like admins, Stripe Dashboard, ledger tools); no copied UI or icons. All names, accounts, reasons and thresholds below are placeholders, not business data. Items marked **[owner]** need an owner decision.

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

## 2. Information architecture

Sidebar (232px, `a-sunken`; active item = white fill + 3px espresso bar, `aria-current="page"`). Groups in order:
- (none) Overview
- Sales: Orders, Payments, Customers
- Catalog: Products, Inventory, Discounts (hidden until built)
- Finance: Ledger (Journal, Accounts, Trial balance, Exports as sub-tabs, not sub-nav)
- System: Event log, Staff and roles, Settings

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
- Bulk: selecting any row replaces the toolbar with "3 selected [actions] Clear". "Select all N matching" is offered only when the server can do it idempotently. Money actions (refund) are never bulk. Bulk result dialog lists per-row success/failure.
- Pagination is cursor-based (matches `Connection`/`PageInfo`): Previous, Next, page size 25/50/100, "1-25 of about 214" (total only if cheap). Cursor in URL.
- States: **empty first-use** (one sentence + the relevant action), **empty filtered** ("No orders match" + Clear filters), **loading** (skeleton rows keep headers and column widths, `aria-busy`, no shimmer under reduced motion), **error** (inline panel in table area: what failed, Retry, request id; keep stale rows dimmed if a refetch fails), **403** (named role needed).

**Detail pages:** header, then two columns: main (fluid, cards) and sidebar of key facts (320px, `KeyValueList` cards: customer, address, tags, notes, IDs). Below 1024px a single column; the order is main action card first, then facts, then timeline. Timeline (newest first) is the audit surface: system, Stripe and staff entries with actor and time.

**Forms:** sections as cards with a left description on wide screens; label above control, hint below, required marked by word "Required" not an asterisk alone. Validate on blur, then on change; errors inline (`aria-invalid`, `aria-describedby`, icon + text) plus an error summary at the top (`role="alert"`, links focus the fields) on failed save. **Unsaved-changes bar:** sticky under the top bar when dirty: "Unsaved changes [Discard] [Save]" (Save is the one primary); route-guard dialog and `beforeunload`. Optimistic concurrency: save sends `updatedAt`; on conflict show "Changed by <name> at <time>. Reload to see it" and keep the draft.

**ConfirmDialog for money and destructive actions:** modal; title states the verb and object; body states consequences (what is sent to Stripe, what ledger entries post, what stock changes). Typed confirmation: user types the exact amount (`34.00`; the `$` and spaces are tolerated) before the danger button "Refund $34.00" enables. Escape/Cancel are default focus-safe; initial focus lands on the first field (or Cancel when there is none), never the danger button. An idempotency key is created when the dialog opens; double submit is blocked; the button shows pending text. Provider errors render inside the dialog (not a toast) and keep the input. Reversible low-risk actions use a plain confirm without typing.

**Toasts:** bottom-left stack of max 3, `role="status"` (errors `role="alert"`); success 6s, errors persist until dismissed; pause on hover/focus; optional single action (Undo only where the backend can reverse). A toast is never the only record: money, stock and status changes also appear in the timeline.

## 4. Screens (MVP)

Legend: `[P]` primary action, `[ ]` secondary.

**Overview** `/admin`. Date range (Today, 7d, 30d, custom; store timezone shown) **[owner: timezone, "sales" definition: gross vs net of refunds and tax]**.
```
Overview                                   [Range: Last 7 days v]
[Sales][Orders][To fulfil][Refunded]       <- Stat cards, delta vs previous period
Needs attention (counts link to filtered lists)       | Sales over time (sec. 7)
 3 orders awaiting fulfilment  >                      |  line chart + [Chart|Table]
 1 webhook failed  >   2 data requests open  >        |
Recent orders (5 rows, link "All orders")
```
Empty: zero orders shows the Stats as 0 and "No orders yet" in the list. Error: each card fails independently with Retry. Low-stock and "older than N days" rules need owner thresholds.

**Orders index** `/admin/orders`. Columns: Order, Date, Customer, Payment, Fulfilment, Items, Total. Views: All, Unfulfilled, Awaiting payment, Refunded. Bulk: Mark packed, Print packing slips, Export CSV. Search by number/email.
**Order detail:**
```
< Orders / #1001  [Paid][Unfulfilled]        [P Fulfil items] [Refund] [More v]
+- Items (3) --------------------------+  +- Customer ------------+
| img Title - variant  SKU  2 x 68.00  |  | Name, email (link)    |
+- Payment ----------------------------+  | Shipping address      |
| Subtotal / Shipping / Tax / Total    |  | Delivery notes        |
| Paid via Stripe ...ab12 [View payment]| +- Tags / internal note -+
+- Timeline: placed, paid, refund...  -+
```
Fulfil flow: drawer with per-line quantities, carrier and tracking (optional), "Notify customer" checkbox; success posts timeline entry. Error states: not found, "Order changed, reload", stock shortfall on fulfil. Gap: `Order` in `types.ts` lacks fulfilment status, shipping address, customer link, refunds and notes; the backend contract must add them.

**Payments index** `/admin/payments`. Columns: Payment (Stripe ref, last 4 chars), Date, Order, Amount, Refunded, Status. Views: All, Needs attention, Refunded. Disputes display only if **[owner]** wants them handled here.
**Payment detail + refund flow:**
```
< Payments / ...ab12 [Paid]                           [Refund]
Main: Amount card (captured, refunded, refundable) | Sidebar: Order link, customer,
      Refunds table (date, amount, reason, actor)  |  Stripe ref, mode, fees (if available)
      Ledger entries posted (links)  - Timeline    |
Refund dialog step 1: amount (Full | Partial, max shown), reason (required select),
  per-line restock toggles (links to inventory), notify customer.
Step 2: summary + "Type 34.00 to confirm" + [Cancel] [Refund $34.00].
After submit: status "Refund requested - waiting for Stripe" until the webhook confirms; then ledger link appears.
```
Errors: over-refundable amount (inline), Stripe unavailable (in dialog, retry safe via idempotency key), already refunded elsewhere. Permission-gated; second approval above a threshold **[owner]**; recent sign-in rule **[owner]**.

**Ledger journal** `/admin/ledger`: Date, Entry no., Memo, Source (order, refund, adjustment, manual), Debits, Credits, Status (Posted, Reversed). Entries are immutable; "Reverse entry" creates a mirror entry. Detail: lines table (account code+name, debit, credit), footer row "Total debits = total credits" with a check badge and an out-of-balance critical state that blocks posting. Manual entry form: date, memo, line grid (add/remove rows, running difference, Post disabled until balanced and each line has an account).
**Accounts** `/ledger/accounts`: code, name, type, balance; detail = running-balance transaction list. **Chart of accounts content is [owner/accountant], not invented here.**
**Trial balance:**
```
Trial balance   As of [2026-10-09]  [Export CSV]
Code  Account            Debit      Credit
1000  <fixture name>     1,234.00
...
Totals                   x          x      [check] Balanced   (else [x] Out by 0.01)
```
Exports tab: journal, accounts, trial balance by period; format CSV (others **[owner/accountant]**); each export is audit-logged; large ones run async with a download row.

**Customers index** `/admin/customers`: Name, Email, Orders, Total spent, Marketing consent, Last order. Search by email. **Detail:** main = orders list, timeline; sidebar = contact, addresses, **Consent** card (marketing email: subscribed/not, timestamp, source, wording version; history list; staff changes require a reason and are logged), **Data requests** card (type: access, export, erasure; status Open, In progress, Completed; received/due dates **[owner/legal: deadline rules]**; actions: Generate export, Mark complete). Erasure is a ConfirmDialog with typed customer email; orders retained for accounting are anonymised, never deleted (rule **[owner/legal]**). `/customers/data-requests` is the queue view.

**Products index:** Image, Title, Status (Draft, Active, Archived), Variants, Stock (sum), Price range. **Editor:**
```
< Products / Title  [Active]                        [Duplicate] [P Save]
Main: Title+description | Media (drop zone, reorder with Move buttons, alt text required)
      Options and variants table: variant, SKU, price, compare-at, tracked, stock (link)
      Product details: benefits, ingredients, how to use, precautions (+ "Content approval: not reviewed")
Sidebar: Status, Sample marker (locked on fixtures), Type, vendor, tags, collections, URL handle
```
Price edit warns: "Carts holding this item will show a price-changed notice." Fixture products cannot be archived-deleted; products with orders archive, never delete. Claims fields show an unreviewed state; never autofill.

**Inventory** `/admin/inventory`: Product/variant, SKU, On hand, Committed, Available, Tracked. Row action "Adjust" opens a right drawer:
```
Adjust stock - Variant, SKU   Current on hand 12
( ) Change by [ +/- n ]  ( ) Set counted quantity [ n ]    -> New on hand: 9
Reason [required select: placeholder list]  Note (required for Other)  Reference (optional)
[Cancel] [P Save adjustment]
```
Rules: no negative result without permission; submit is idempotent; success toast links to the movement. **Movements tab** `/inventory/movements`: Date, Variant, Change (+/- tabular), Balance after, Reason, Actor, Reference (order, refund, manual). Append-only, no edit/delete; corrections are new movements. Reason list and low-stock threshold **[owner]**.

**Settings:** sub-nav tabs. General (name, contact, currency CAD read-only), **Tax** and **Shipping**: placeholder card "Tax is decided at Stripe Checkout today. **[owner]** choose Stripe Tax or manual rates, registrations and shipping zones/rates." No rates shown or invented. Policies (returns, privacy, terms): text editors with version, effective date, published state and storefront preview link. Payments: Stripe status (connected, mode, webhook endpoint last event time); no secrets ever rendered.
**Staff and roles:** Staff table (Name, Email, Role, Status, Last sign-in); Invite drawer; Deactivate (confirm). Roles page = permission matrix (rows: resource - orders, payments, refunds, ledger, customers, products, inventory, settings, staff; columns: view, edit, plus specials like refund, export, reverse entry). Proposed starter roles for **[owner]** review: Owner, Manager, Fulfilment, Bookkeeper, Support, Read-only. The last Owner cannot be removed. 2FA/passkey and session rules **[owner]**.

**Event log** `/admin/events`, tabs Webhooks and Audit log. Columns: Time, Source (Stripe, System, Staff), Type, Object (masked), Status (Processed, Failed, Ignored, Retrying), Attempts. Detail drawer: signature verified yes/no, processing result, linked order/payment/ledger entry, redacted payload (secrets and opaque cart ids removed, per `commerce.md`), [Reprocess] (permission, idempotent, ConfirmDialog). Filters: source, status, type, range. Empty: "No events in this range"; error: retry. Audit tab = who did what (refund, adjustment, role change, export, data-request action), immutable.

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
| `ConfirmDialog` | `title`, `body`, `confirmLabel`, `tone`, `typedConfirm?:string`, `onConfirm` | Focus trap, idempotency key slot |
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

One chart in the MVP: **Sales over time** on Overview (daily, selected range; optional dashed previous period). Nothing else is charted (orders count, stock, ledger stay as tables/Stats).
- Hand-rolled SVG or a small library with animation disabled; line in espresso, previous period dashed in `a-control` (dash plus colour), direct end labels instead of a legend, 3:1 minimum for line and axis marks, y-axis starts at zero, currency in the axis label.
- `<figure>` with a `figcaption` summary ("Sales, last 7 days: $x total, peak Tue"); the SVG is `role=img` with the same label. Tooltip appears on hover and on keyboard focus; arrow keys step through points announcing "Mon Oct 5: $1,240.00, 12 orders".
- **Chart | Table** toggle (Tabs); the table (Date, Orders, Sales, Previous) is the accessible alternative and is the default when `prefers-reduced-data` or on narrow screens under 360px. It is a normal `DataTable` and exportable.
- Empty: "No sales in this range" plus the table toggle disabled; error: the card-level `ErrorPanel`.

## 8. Needs owner input (top)

1. Sales/revenue definitions and store timezone (drives Overview, ledger cut-offs, exports).
2. Refund policy: reasons list, approval threshold, recent-sign-in requirement, restock default.
3. Role set and permissions (starter roles above), 2FA/passkeys, session timeouts.
4. Chart of accounts and accountant export formats (CSV only for MVP?); tax and shipping approach (Stripe Tax vs manual).
5. Data-request deadlines and erasure rule for accounting records; consent wording versions.
6. Low-stock thresholds, adjustment reasons, whether Discounts and disputes enter MVP.

Backend contract gaps for the architect: `Order` lacks fulfilment, address, customer link, refunds, notes; `OrderFinancialStatus` lacks failed/disputed; variants expose a single `quantityAvailable` (admin needs on hand, committed, movements); products lack draft/archived status and cost.
