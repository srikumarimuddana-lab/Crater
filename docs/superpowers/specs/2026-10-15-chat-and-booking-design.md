# Configurable automated chat and appointment booking

Status: approved and implemented on 2026-10-15. See the chat/booking verification
record for code behavior, test evidence and remaining environment activation.

## Owner request and intent

Add automatic chat and appointment booking with email to the existing Crater
platform. The owner will supply the intended business use later. Both modules
must therefore support editable terminology, content and configuration rather
than assume a skincare consultation, salon or particular service business.
Preserve the approved Remedy design across public pages and admin, and existing
password-only staff access.

This is an architectural addition: there is an existing CRM inbox and email
outbox, but no public web-chat conversation flow or availability/booking engine.

## Approach choices

| Approach | Benefit | Trade-off |
| --- | --- | --- |
| Native guided chat and native booking (recommended starting point) | Editable answers, predictable behavior, shared CRM and admin, no additional chat subscription | Free-form questions outside the published answers need staff follow-up |
| Native AI chat and native booking | Conversational answers using approved business content | Requires a selected model provider, credentials, usage budget and answer evaluation |
| Embedded external chat and scheduling products | Less scheduling infrastructure to maintain | Separate accounts, data, styling constraints and possible subscriptions |

Recommended default is guided automated chat, clearly identified as automated.
AI replies are a separately enabled adapter, pending the owner's preference and
provider selection. Automatic chat must not be described as implemented AI.

## Public chat

- A keyboard-accessible launcher and mobile drawer use shared design tokens.
  Preserve cart access, focus restoration, Escape and reduced-motion behavior.
- Admin edits the title, greeting, suggested questions, published answers, links,
  fallback message and follow-up contact fields. Draft answers remain private.
- Customers can choose common questions, open relevant published pages, start a
  booking, or leave a message and email for follow-up in the existing CRM inbox.
- Show saved-message confirmation only after durable storage. Staff follow-up
  uses the existing Resend workflow; no claim of real-time human availability.
- An opaque server-issued session isolates conversations. Never identify a
  customer or expose orders merely because an email was typed into chat.
- Owner/Admin configure the module; permitted support staff handle conversations.
  Private transcripts are excluded from public content and traffic event payloads.
- Publish an enable switch and page-placement controls. Both modules remain
  disabled until the owner configures actual business content.

Optional AI mode must use server-only credentials, published approved content,
bounded input/output and request limits, and an honest fallback. It cannot change
orders, reveal private records or confirm a booking through generated text; the
booking service remains authoritative. Provider and spending are owner inputs.

## Public booking

- A standalone booking page works without chat. The widget can link to it with a
  service preselected; a chat transcript alone never creates a reservation.
- Owner/Admin configure service name and description, duration, assigned staff
  or resource, IANA timezone, weekly availability, date exceptions, buffers,
  minimum notice, booking horizon, reminder offset and cancellation cutoff.
- Initial release uses one resource per booking and capacity one. A business
  timezone must be configured rather than inferred from the owner's location.
- Customer selects a service and available slot, then submits name, email and
  bounded optional notes. No customer account or purchase is required.
- The server recalculates availability at submission. A Postgres transaction
  prevents overlapping resource reservations including buffers, across workers.
  Client slots are advisory. Duplicate submission keys return the same booking.
- Store appointment instants in UTC and retain the business timezone. Display
  explicit timezone labels and handle daylight-saving gaps and repeated times.
- Booking creation is immediately confirmed when configuration and availability
  are valid. Show the reference and current email status on the receipt. Email
  delivery failure does not erase or repeat the booking.
- Expiring, high-entropy management links allow reschedule/cancel without MFA.
  Store token hashes; tokens authorize only that booking. Viewing a link never
  changes state, so email scanners cannot cancel appointments.
- Rescheduling locks the booking and target resource; retain the old slot if
  the replacement is unavailable. Cancelled bookings release capacity atomically.
- Admin calendar and list support date/service/resource/status filters, booking
  details, audited changes, complete/no-show statuses and CSV export with access
  checks. Past appointments cannot be silently moved by availability changes.

Booking states: confirmed, cancelled, completed and no_show. Email states remain
separate from booking states. Payments/deposits, group capacity, recurring
bookings and external calendar sync are later decisions, not implicit features.

## Email and connected records

- Use Resend through the existing durable communications queue for customer
  confirmation, one configurable reminder, reschedule and cancellation notices,
  and configured staff notifications.
- Extend the validated template variable allowlist deliberately for service,
  appointment time/timezone, booking reference and trusted management links.
- Store each booking mutation and its notification event in one transaction.
  Reconciliation turns events into outbox jobs with stable booking/version/type
  keys. Preserve test/live separation and exact test-recipient restrictions.
- Reminder processing uses the authenticated scheduled worker, not browser or
  in-process timers. Recheck booking version/status before queuing and sending;
  suppress obsolete reminders after cancellation or rescheduling.
- Show queued, accepted, delivered, failed, unknown and suppressed accurately.
  Use the existing retry/reconciliation rules instead of blindly resending.
- Link booking history and chat follow-up to CRM without treating a supplied
  email as proof of identity or permission to reveal existing customer data.
  Appointment contact is not marketing consent.

## Data and integration boundaries

Proposed ownership under `apps/storefront`:

- `src/lib/chat`: published configuration, guided answers, session ownership and
  message persistence; optional AI adapter behind an explicit mode boundary.
- `src/lib/booking`: availability calculation, validation, transactional booking
  operations, management token authorization and notification source events.
- `src/app/book` and dedicated public API routes: accessible booking forms and
  server-validated commands; public routes return no private availability detail.
- `src/app/admin/(console)/chat` and `appointments`: configuration and operations
  using existing staff sessions, capability checks and shared UI.
- New numbered Postgres migrations: private configuration, transcripts, services,
  resources, schedules, exceptions, bookings and notification source events.
  Match existing schema permissions/RLS and repository conventions.
- Existing communications worker/adapters: only external email delivery and
  delivery receipts. CRM links reference canonical booking IDs.

Enforce server-side authorization, same-origin mutations, input byte limits,
durable rate limits and bounded data retention for both public modules. Avoid
personal data and management tokens in analytics, logs and referrer URLs. Include
transcripts/appointments in applicable customer export/anonymization handling
without deleting required commerce financial snapshots.

## Acceptance checks before completion

1. Admin can draft, preview and publish chat copy; hidden drafts never answer
   public questions. Disabling chat removes the launcher without breaking pages.
2. Guided questions, unknown-question fallback, durable follow-up and support
   replies work; one visitor cannot access another visitor's transcript.
3. Booking works independently of chat on mobile, desktop and keyboard; core
   forms have a no-JavaScript path and clear timezone labels.
4. Rules, holidays, buffers, horizon and notice change available slots correctly;
   daylight-saving transitions have no impossible or ambiguous offered instants.
5. Two concurrent Postgres requests for one slot yield exactly one booking;
   replayed submissions do not duplicate bookings or notification events.
6. Failed rescheduling retains the original reservation; successful rescheduling
   atomically moves it and invalidates stale reminder work.
7. Expired/forged management links fail safely. GET requests never cancel or
   reschedule; staff actions require capabilities and produce audit history.
8. Booking persists through email failure and worker restart. Recovery queues
   missing jobs once, cancels obsolete reminders and respects suppression.
9. Resend sandbox verification covers confirmation, reminder, reschedule,
   cancellation, provider callbacks and staff notification before live sending.
10. CRM history, access isolation, exports and aggregate reports include the new
    records without exposing transcript text or contact values in analytics.

## Later owner inputs and release boundary

The business purpose, real service list, resource schedules, timezone, contact
address, approved answers, retention policy and optional AI preference will be
provided later. These are admin configuration/release inputs; no fictional
service is published. Existing Resend activation and a persistent database plus
a scheduled worker remain necessary for real emails and reliable appointments.

Review this specification before implementation planning. This document records
the requested scope and does not claim that chat, booking or email delivery has
been built, tested or deployed.
