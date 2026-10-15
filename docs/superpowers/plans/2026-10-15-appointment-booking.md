# Appointment Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver configurable service booking, admin scheduling and durable Resend lifecycle emails without assuming the owner's eventual business use.

**Architecture:** Private normalized Postgres records own resources, availability and reservations. Booking mutations atomically persist versioned notification source events; the existing communications worker reconciles those into email jobs. A public native-form flow and staff calendar share the same server service.

**Tech Stack:** Existing Next.js/React/TypeScript, PostgreSQL/pg, Intl/node:crypto, Resend adapter, Vitest and Playwright. No external scheduler or calendar subscription.

**Spec:** [Approved design](../specs/2026-10-15-chat-and-booking-design.md). [Shared plan](2026-10-15-chat-and-booking.md). Execute after the chat plan supplies durable public limits.

**Implementation record:** Coding is complete. Predicted test-file boundaries were consolidated into service, route, privacy and SQL suites; actual commands, results, browser checks and staging limitations are recorded in [verification](../verification/2026-10-15-chat-booking.md).

## Global Constraints

- Initial release uses one resource per booking and capacity one.
- A business timezone must be configured rather than inferred from the owner's location.
- Store appointment instants in UTC and retain the business timezone.
- Booking states: confirmed, cancelled, completed and no_show. Email states remain separate from booking states.
- Viewing a link never changes state, so email scanners cannot cancel appointments.
- Appointment contact is not marketing consent.
- Reminder processing uses the authenticated scheduled worker, not browser or in-process timers.
- Both modules remain disabled until the owner configures actual business content.
- Paths below are relative to `apps/storefront/`.

## Review Focus

- DST gaps/repeated local times and overnight boundaries produce deterministic availability (Task 1).
- Concurrent reserve/reschedule requests never overlap buffers or lose an existing reservation (Task 2).
- Reminder work left pending during cancellation/reschedule is suppressed, not retried stale (Task 3).
- A guessed reference or scanned GET link never authorizes/mutates a booking (Task 2/4).
- Worker failure, email suppression and customer anonymization do not lose reservations or expose contact data (Task 3/5).

### Task 1: Configuration, time rules and persistence

**Files:** Create `src/lib/booking/{types,validation,availability,repository,memory-repository,postgres-repository,index}.ts`, `db/migrations/0014_booking.sql`, `tests/unit/booking/{configuration,availability,postgres}.test.ts`. Modify `src/lib/admin/{types,permissions}.ts`.

**Interfaces:**
- `BookingStatus = 'confirmed'|'cancelled'|'completed'|'no_show'`.
- `BookingSettings = {enabled:boolean;timezone:string;heading:string;intro:string;staffEmails:string[];minimumNoticeMinutes:number;horizonDays:number;cancellationNoticeMinutes:number;reminderMinutes:number;retentionDays:number;version:number}`.
- `BookingResource = {id:string;name:string;active:boolean;weekly:WeeklyWindow[];exceptions:DateException[];version:number}`. `WeeklyWindow={weekday:number;startMinute:number;endMinute:number}`; weekday 0–6. `DateException={date:string;windows:{startMinute:number;endMinute:number}[]}` overrides that date; empty means closed.
- `BookingService = {id:string;name:string;description:string;durationMinutes:number;bufferBeforeMinutes:number;bufferAfterMinutes:number;resourceIds:string[];active:boolean;version:number}`.
- `Slot = {serviceId:string;resourceId:string;startsAt:string;endsAt:string;timezone:string}`; ISO timestamps are UTC. `ReservationWindow={resourceId:string;busyStartsAt:string;busyEndsAt:string}`.
- `availableSlots(input:{service:BookingService;resource:BookingResource;settings:BookingSettings;date:string;busy:ReservationWindow[];now:Date}):Slot[]`.
- `BookingRepository.readConfiguration():Promise<{settings:BookingSettings;services:BookingService[];resources:BookingResource[]}>`; `saveSettings`, `saveService`, `saveResource` each take their typed object, expectedVersion and actor and return the persisted object; all audit writes occur in the same transaction.

- [x] **Step 1: Write failing tests.** Reject invalid IANA zones, backwards/overlapping weekly windows, non-integer duration and an enabled incomplete configuration. `spring_gap` offers no nonexistent local time; `fall_repeat` excludes ambiguous local starts rather than choosing silently. Adjacent intervals use half-open overlap rules. Exceptions override weekly hours; buffers/notice/horizon remove unavailable slots; settings edits leave stored appointments unchanged.
- [x] **Step 2: Run** `npm run test:unit -- tests/unit/booking/configuration.test.ts tests/unit/booking/availability.test.ts tests/unit/booking/postgres.test.ts`; confirm missing implementation failures.
- [x] **Step 3: Implement** configuration/availability and migration. Generate candidate UTC minute instants over the local date and round-trip through Intl to resolve wall time, rejecting gap/repeated starts; start grid is 15 local minutes. Service plus buffers must fit one availability window. Bounds: durations 5–480 minutes, buffers 0–240, notice/cancellation/reminder 0–43200 minutes, horizon 1–365 days and explicit retention 1–3650 days. Migration creates private services/resources/settings/reservations/source events/management tokens/audit tables and necessary foreign keys/indexes, RLS and grant revocation. No appointment data is stored in public CMS tables.
- [x] **Step 4: Run** configuration/availability tests and database schema tests with isolated Postgres. Check both hemispheres' transitions and a non-hour offset zone; the algorithm must not assume 24-hour local dates.
- [x] **Step 5: Commit** with `feat: add configurable booking resources and timezone-aware availability`.

### Task 2: Atomic booking and customer management authorization

**Files:** Create `src/lib/booking/{service,tokens}.ts`, `tests/unit/booking/{service,tokens,concurrency}.test.ts`.

**Interfaces:**
- `Booking = {id:string;reference:string;serviceId:string;resourceId:string;startsAt:string;endsAt:string;busyStartsAt:string;busyEndsAt:string;timezone:string;serviceName:string;name:string;email:string;notes:string;status:BookingStatus;mode:'test'|'live';version:number;createdAt:string;updatedAt:string}`; snapshot service name/times so later edits cannot rewrite history.
- `createBookingService(repo:BookingRepository, now:()=>Date)` produces `reserve(input:{requestId:string;serviceId:string;resourceId:string;startsAt:string;name:string;email:string;notes:string}):Promise<{booking:Booking;managementToken:string}>`, `reschedule(id:string,token:string,input:{requestId:string;expectedVersion:number;resourceId:string;startsAt:string}):Promise<Booking>`, `cancel(id:string,token:string,input:{requestId:string;expectedVersion:number}):Promise<Booking>` and `getManaged(id:string,token:string):Promise<Booking>`.
- Repository `transaction<T>(work:(tx:BookingTransaction)=>Promise<T>):Promise<T>` supplies row locking, authoritative schedule/reservation reads, booking and source-event writes; public configuration methods remain from Task 1. `BookingTransaction.lockResources(ids:string[]):Promise<void>` locks resource rows in sorted order before overlap checks and updates. `lockBooking(id:string)` follows the same documented lock order; reschedule discovers IDs first then locks resources and re-reads booking/version.
- Tokens use 32 random bytes, constant-time hash comparison and expiry at appointment end plus 30 days. Persist token hash; encrypt recoverable notification token with AES-256-GCM using server-only `BOOKING_TOKEN_ENCRYPTION_KEY`. Require a valid key before enabling booking. Scope idempotency to a server-issued visitor cookie or authenticated staff identity: only that identity can replay its original result for the same request key and input digest. Reject changed payloads; never return a management token based on a request ID/email alone.

- [x] **Step 1: Write failing tests.** Two separate Postgres connections concurrently reserve the same resource and overlapping buffers: exactly one succeeds. Different resources may share the time. `failed_reschedule_preserves_original`, cross-resource swap, stale version, duplicate retry with changed payload, cancellation cutoff, forged/expired token, past complete/no-show and token redaction each assert explicit outcomes. Booking plus source events roll back together on failure.
- [x] **Step 2: Run** `npm run test:unit -- tests/unit/booking/service.test.ts tests/unit/booking/tokens.test.ts tests/unit/booking/concurrency.test.ts` with isolated Postgres; capture failures before implementing mutations.
- [x] **Step 3: Implement** service methods using transactions and half-open `busyStartsAt < other.busyEndsAt && busyEndsAt > other.busyStartsAt` checks under resource locks. Recalculate Task 1 slots at commit time, including disabled services/resources. Cancelled reservations release capacity; completed/no_show retain historical occupancy. Cancellation/reschedule apply the configured cutoff, with audited staff override in Task 4. Persist source events and encrypted token in the same transaction; never call Resend inside it.
- [x] **Step 4: Run** all Task 2 suites against memory and real Postgres; repeat the concurrent case within the test's bounded contention scenario, not by re-running the entire build. Verify replay returns the same reference and one event per version.
- [x] **Step 5: Commit** with `feat: add atomic appointment reservation and secure management`.

### Task 3: Durable lifecycle email and reminders

**Files:** Create `src/lib/booking/{notifications,maintenance}.ts`, `tests/unit/booking/notifications.test.ts`. Modify `src/lib/communications/service.ts`, `src/lib/operations/{types,store,commerce}.ts`, `src/lib/communications/README.md`, `.env.example`.

**Interfaces:**
- `BookingEvent = {id:string;bookingId:string;bookingVersion:number;kind:'confirmed'|'rescheduled'|'cancelled'|'reminder';mode:'test'|'live';createdAt:string}` references a private immutable payload snapshot and encrypted management token.
- `reconcileBookingNotifications(now:Date):Promise<{queued:number;suppressed:number}>` reads committed events and enqueues existing email notifications with `eventKey=booking:<id>:v<version>:<kind>:<audience>`; audience is customer or stable hashed configured staff address. After restart, enqueue deduplication precedes marking a source processed.
- Add optional notification `source?:{kind:'booking';id:string;version:number;event:string}`. Extend `createCommunications(store,now,options?)` with optional `beforeSend:(job:Notification)=>Promise<{send:boolean;reason?:string}>`; invoke outside communications-state locks immediately before provider send. Recheck current booking version/status for reminders; suppress stale pending jobs and keep processing leases safe. Provider-accepted messages cannot be unsent; document cancellation after provider acceptance truthfully.
- Template variables add `service`, `appointment_time`, `timezone`, `booking_reference`, `manage_link` to the existing allowlist. Ensure presets are added idempotently to existing Postgres states without overwriting edited templates.
- Existing authenticated worker calls booking maintenance regardless of provider pause. ReminderMinutes=0 disables reminders; other values enqueue one due reminder for a future confirmed booking only.

- [x] **Step 1: Write failing tests.** Confirm/reschedule/cancel/reminder and staff messages use mode-separated stable keys. Crash after enqueue before acknowledgment replays without duplication. Cancellation before send suppresses a queued reminder; reschedule invalidates the prior version; missed reminders after appointment start are suppressed. Resend failure does not change booking status. Bounce/withdrawal/test allowlists and unknown-send reconciliation retain existing behavior. A failed pre-send guard never leaves a job blindly retrying an ambiguous provider send.
- [x] **Step 2: Run** `npm run test:unit -- tests/unit/booking/notifications.test.ts tests/unit/communications/service.test.ts tests/unit/communications/advanced.test.ts` and confirm expected failures.
- [x] **Step 3: Implement** event reconciliation, token decryption only for trusted management message generation, preset migration, pre-send check and maintenance scheduling integration. Unknown provider outcomes retain manual reconciliation. Configure management links as `/book/manage#<id>.<token>` so tokens are absent from request URLs; Task 4 exchanges them via POST into a scoped HTTP-only cookie. Staff emails use their own configured destinations, not customer contact. No newsletters/marketing opt-in are created by booking.
- [x] **Step 4: Run** notification and existing provider/CRM suites. Use mocked providers locally; record actual Resend sandbox sends/callbacks only when credentials and an authorized test address are available.
- [x] **Step 5: Commit** with `feat: connect appointment email events and stale-reminder recovery`.

### Task 4: Public booking forms and admin scheduling

**Files:** Create `src/app/book/{page.tsx,actions.ts}`, `src/app/book/manage/{page.tsx,actions.ts}`, `src/app/api/booking/{slots,reserve,manage}/route.ts`, `src/components/booking/{slot-picker,management-link}.tsx`, `src/app/admin/(console)/appointments/page.tsx`, `src/app/admin/(console)/appointments/settings/page.tsx`, `src/app/admin/_actions/appointments.ts`, `tests/unit/booking/routes.test.ts`, `tests/e2e/booking.spec.ts`. Modify `src/components/admin/shell.tsx`, `src/app/remedy.css` and chat booking CTA.

**Interfaces:**
- Slots API accepts only active service/resource IDs and a local date, returning `Slot[]` without appointment identities. Native GET forms provide date/slot selection; native POST creates/mutates through the same service as JSON.
- Creation returns a private receipt with reference and current email status; an opaque cookie grants read/manage access to that single booking. Email fragment exchange requires POST; a no-JS form accepts the management code manually. GET never changes state or consumes a one-use code. Set no-store, noindex and no-referrer; exclude private management paths from analytics.
- Capabilities `appointments:read`, `appointments:manage`, `appointments:configure`: Owner/Admin all; Support read/manage; other existing roles none. Actions validate session role+capability, same origin and expectedVersion.
- Public limits: five reserve/manage attempts per hour per hashed session/contact subject with Task 1 chat-plan limiter, 16 KiB bodies, names 150 and notes 4000 characters. Return accessible 429/error feedback without contact data in URLs.

- [x] **Step 1: Write failing route/browser tests.** Native no-JS booking succeeds; stale slots return a useful conflict with preserved fields; valid management exchange permits only its booking; wrong token cannot enumerate customer details; GET cancel query has no effect. Admin can configure schedules and filter date/service/resource/status, complete/no-show appointments, override cutoff with a reason and export authorized CSV. Support cannot change configuration. Calendar/list links and disabled module behave correctly.
- [x] **Step 2: Run** `npm run test:unit -- tests/unit/booking/routes.test.ts` and the new Playwright booking spec to establish failures.
- [x] **Step 3: Implement** timezone-labeled Remedy forms, pending/failure/success views, availability error refresh, and admin calendar plus equivalent accessible list. Keep the picker a progressive enhancement. Reuse one canonical service for native, JSON and staff mutations. Protect CSV formula cells and audit exports/overrides. Add settings editors for all configuration/availability/retention fields and validate before enabling.
- [x] **Step 4: Run** booking browser checks at 390px/1440px including keyboard focus, axe, no-JS and reduced motion; run affected cart/chat/admin authorization regressions. Inspect receipt and email previews for explicit timezone and honest delivery status.
- [x] **Step 5: Commit** with `feat: add Remedy appointment booking and admin calendar`.

### Task 5: CRM history, reporting, retention and release evidence

**Files:** Create `src/lib/booking/{crm,report,retention}.ts`, `src/lib/chat/retention.ts`, `tests/unit/booking/{privacy,report}.test.ts`, `tests/unit/chat/privacy.test.ts`. Modify `src/lib/crm/service.ts`, `src/app/admin/_actions/communications.ts`, `src/app/admin/(console)/customers/[id]/{page.tsx,export/route.ts}`, `src/app/admin/(console)/analytics/page.tsx`, `src/lib/analytics/{schema,report}.ts`, `src/lib/operations/commerce.ts`, repository `docs/commerce-platform.md` and a new dated verification record.

**Interfaces:**
- `customerInteractions(customerId:string):Promise<{bookings:Booking[];chatHandoffs:{id:string;createdAt:string}[]}>` is staff-only and resolves explicit server-side customer links. Public contact submissions never receive these records.
- `bookingReport(input:{from:string;to:string;mode:'test'|'live'}):Promise<{confirmed:number;cancelled:number;completed:number;noShow:number}>` counts canonical records rather than client conversion events. Extend fixed opt-in click vocabulary with `chat.open` and `booking.start`; permit `/chat` and `/book` only. Management/receipt data stays excluded.
- `anonymizeInteractions(customerIds:string[],actor:string):Promise<void>` removes matching booking contact/notes, chat messages and management access, suppresses pending source/jobs, and records completion. `exportInteractions(customerIds:string[]):Promise<unknown>` joins staff-authorized customer export.
- CRM anonymization first writes a durable privacy request; maintenance replays that across repositories until all succeed, preventing partial failure from claiming completion. No consent is transferred during merge. New history resolves merged source IDs; it does not rewrite historical contacts or recipients.
- `runInteractionRetention(now:Date):Promise<{chatDeleted:number;bookingsAnonymized:number}>` applies explicitly configured retention; removes transcripts after their window and anonymizes contact after appointment-end retention while retaining aggregate counts. Invalidate management tokens, erase encrypted source payloads and suppress pending notices when anonymized. Reuse the same bounded deletion rules for expired sessions, old request buckets and terminal handoff events; preserve only non-personal event keys needed for deduplication.

- [x] **Step 1: Write failing tests.** CRM merge/export/anonymization includes both modules and retries partial failure durably; unauthorized roles get no interaction records. Retention clears transcript/contact/tokens but preserves financial snapshots and aggregate counts. Reports separate test/live, avoid duplicate-event counts and contain no email/notes/token fields; analytics rejects arbitrary chat text and management URLs.
- [x] **Step 2: Run** `npm run test:unit -- tests/unit/booking/privacy.test.ts tests/unit/booking/report.test.ts tests/unit/chat/privacy.test.ts` and confirm missing implementation failures.
- [x] **Step 3: Implement** history, durable privacy fan-out, retention worker and aggregate metrics. Extend existing customer export UI and anonymization status to show incomplete fan-out honestly. Finish disabled-by-default setup diagnostics, provider activation instructions and limitations; do not claim a live launch.
- [x] **Step 4: Run** the shared plan's final unit, Postgres, browser, typecheck, lint and build acceptance. Record exact commands/results and distinguish mocked provider tests from real sandbox delivery.
- [x] **Step 5: Commit** with `feat: connect appointment CRM reporting and interaction privacy`; then complete the shared PR handoff.
