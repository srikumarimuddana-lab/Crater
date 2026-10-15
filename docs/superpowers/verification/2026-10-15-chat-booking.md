# Chat and appointment booking verification — 2026-10-15

## Delivered code

- Guided automatic chat, editable private drafts and published answers, placement
  switches, isolated visitor transcripts and durable CRM/email handoff.
- Public service/resource/date/slot selection with an independent `/book` page,
  authoritative availability, buffers, timezone/DST handling, notice and horizon
  rules, atomic reservations and recoverable submission identity.
- Native appointment creation, management-code entry, reschedule and cancellation;
  email links keep bearer tokens in fragments and exchange through POST. GET does
  not change a booking. Password-only staff access is retained.
- Admin configuration, services, resources, weekly hours and date exceptions,
  calendar/list filters, status changes, audited cutoff overrides and CSV.
- Resend lifecycle templates, customer/staff notices, reminder source events,
  restart deduplication, current-source pre-send checks and honest delivery states.
- CRM history/export, mode-separated appointment totals, opt-in fixed click IDs,
  configured retention and durable cross-module anonymization with privacy cutoffs.
- Shared Remedy typography, colors, controls and mobile layouts. Chat stays clear
  of the consent panel and other open dialogs.

## Verification

Commands run from `apps/storefront`:

- `npm run test:unit`: **586 passed; 159 database-dependent skips**. These skips
  include the new native PostgreSQL test and pre-existing database suites.
- `npm run typecheck`: passed.
- `npm run lint`: zero errors; seven existing direct-image warnings.
- `npm run build`: passed with all new public/admin/API routes.
- `npm run test:e2e -- chat-booking.spec.ts --project=mobile-390 --project=desktop-1440 --workers=1`:
  mobile lifecycle passed as part of the two-project run. The flow publishes chat,
  answers a question, records CRM handoff, configures resources/services, reserves,
  reschedules and cancels with JavaScript disabled, and checks booking-page axe.
- Final isolated desktop lifecycle repeat passed: `npm run test:e2e --
  chat-booking.spec.ts --project=desktop-1440 --workers=1
  --output=test-results-chat-booking` (1 passed). Desktop and mobile screenshots
  were inspected. Both screen sizes passed the complete lifecycle; the final
  desktop repeat and all four smoke regressions are green.
- Four scoped desktop purchase/home regressions passed: header/bag, reduced motion,
  drawer focus/Escape and native no-JavaScript add-to-cart.
- One SQL integration test passed through an isolated temporary PGlite Pool
  adapter. It executes actual migration/repository SQL, two independently created
  repository adapters competing for a slot, persisted config/events and RLS flags.
  **This does not establish native multi-process PostgreSQL contention**. The
  committed test runs against a real throwaway `TEST_DATABASE_URL` when supplied.

An overlapping Playwright smoke run initially removed the other run's shared
trace directory, causing an ENOENT during context cleanup after successful
cancellation. That is test-output contention, not an application result. The
repeat uses `--output=test-results-chat-booking` and runs sequentially.

## Review and regressions

An independent read-only reviewer checked the whole implementation. All Important
findings were corrected with focused failing-then-passing tests:

1. First-submission identity now exists in a signed hidden field before reservation,
   so a committed request can be replayed even if its HTTP response was lost.
2. Durable hashed-contact/time privacy cutoffs are checked atomically with CRM and
   outbox writes; stale source recovery cannot reconstruct anonymized contact.
3. Actual buffer start/end instants are checked against local availability across
   DST; the spring-forward buffer-overflow reproduction is covered.
4. Transcript retention removes the matching copied CRM inbound message and keeps
   the nonpersonal deduplication marker, preserving unrelated history.
5. Email subjects are scrubbed during anonymization along with body/recipient.
   This was regraded from Minor to Important because it retained personal data.

Browser verification also corrected native management POST rejection from a
no-referrer policy and consent-panel obstruction of the mobile launcher. Unit
regressions cover failed rescheduling retaining the original slot, stale-version
conflicts, resource contention, replayed mutations, session isolation, forged
links, stale reminders and retention of future bookings for an address whose old
appointment expires. No review findings are deferred.

## Implementation decisions and release setup

Chat uses its own private aggregate; booking uses normalized records/events and a
single merchant-level advisory transaction lock. This deliberately favors atomic
recovery and simple correctness for a modest store; high booking throughput will
need finer locking and more selective repository queries.

No real emails/SMS, payments, production data or hosting were changed. Resend
sandbox delivery/callback verification remains a deployment check requiring the
owner's provider configuration. Apply migrations 0013/0014, configure persistent
Postgres, SITE_URL and a random BOOKING_TOKEN_ENCRYPTION_KEY, and schedule the
existing authenticated communications worker. Keep test/live send guards in place.

Both modules start disabled. The eventual business purpose, actual services,
availability, timezone, retention and approved copy can be entered later in admin.
Optional AI/provider selection, paid bookings, recurring/group appointments and
external calendar synchronization are not part of this implementation.

Final source checks after the last privacy-recipient regression: **586 unit tests
passed, 159 native database skips; typecheck/build passed; lint zero errors with
seven existing image warnings**. The late suppressed outbox record also removes
the old customer email, not just message content.

Publication authorization: the initial push was blocked by automatic approval
review pending explicit permission. The owner subsequently authorized pushing
`codex/chat-and-appointments` to `srikumarimuddana-lab/Crater` and opening its PR
on 2026-10-15. This changes publication authorization only; the tested product
source and deployment/provider activation limits are unchanged.
