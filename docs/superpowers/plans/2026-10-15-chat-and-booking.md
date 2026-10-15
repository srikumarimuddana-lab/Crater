# Chat and Appointment Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable automated chat and appointment booking with Resend email to Crater.

**Architecture:** Two independently testable modules use the existing Next.js app, staff sessions, CRM and durable email queue. Chat is guided automation; booking owns authoritative resource availability and durable notification events. Both start disabled until configured.

**Tech Stack:** Existing Next.js 16, React 19, TypeScript, PostgreSQL/pg, Resend adapter, Vitest and Playwright. No additional paid service or AI model provider is selected.

**Spec:** [Approved design](../specs/2026-10-15-chat-and-booking-design.md).

## Global Constraints

- Preserve the approved Remedy design across public pages and admin, and existing password-only staff access.
- Initial release uses one resource per booking and capacity one.
- Store appointment instants in UTC and retain the business timezone.
- Appointment contact is not marketing consent.
- Viewing a link never changes state, so email scanners cannot cancel appointments.
- Both modules remain disabled until the owner configures actual business content.
- Automatic chat must not be described as implemented AI.
- Payments/deposits, group capacity, recurring bookings and external calendar sync are later decisions, not implicit features.

## Review Focus

1. Two visitors submitting the same resource slot: exactly one reservation; booking plan Task 2.
2. Cancel/reschedule while a reminder is queued: stale jobs are suppressed before delivery; booking plan Task 3.
3. Typing another customer's email into chat: no account/order/transcript disclosure; chat plan Task 2.
4. DST gaps/repeated times and schedule changes: deterministic slots; existing confirmed appointments retained; booking plan Task 1.
5. Worker crash after a committed booking or chat request: recover source events without duplicate inbox messages/emails; chat Task 2 and booking Task 3.

## Delivery sequence and ownership

All paths in the child plans are relative to `apps/storefront/` unless stated otherwise.

1. [Automated chat plan](2026-10-15-automated-chat.md): persistence, content publishing, session-isolated questions, durable email handoff and shared public request protection.
2. [Appointment booking plan](2026-10-15-appointment-booking.md): configuration and availability, reservations/management, Resend lifecycle messages, public/admin screens and reporting/privacy integration.
3. Each child plan ends with a runnable app and scoped regression evidence. Commit after each task. Final delivery runs shared checks once after both modules integrate.

Implemented using **native** execution: one implementer proceeds through the tasks in order because the email, CRM and authorization contracts are shared. Use an independent final reviewer only after the owner selects that execution method. Do not dispatch workers merely because the plan mentions them.

## Current integration inventory

- `src/lib/communications/service.ts`: `createCommunications(store).enqueueNotification(input)`, versioned templates and provider receipts. Channels remain `email | sms`; web chat has its own transcript model.
- `src/lib/operations/store.ts`: `getOperationsStore()`, Postgres-backed communications state and memory test adapter.
- `src/lib/crm/service.ts`: inbound email threads, consent, merge and anonymization. New modules must not use unverified contact input as customer authorization.
- `src/lib/operations/commerce.ts`: scheduled maintenance orchestrator.
- `src/app/api/communications/process/route.ts`: authenticated external-worker entry point. Keep provider sending paused unless enabled.
- `src/lib/communications/public-forms.ts`: native/JSON submission handling and same-origin enforcement.
- `src/lib/admin/{types,permissions}.ts`, `src/components/admin/shell.tsx`: capability declarations, current role matrix and navigation.
- Last migration currently `0012_checkout_reservations.sql`; reserve `0013_chat.sql` and `0014_booking.sql` after verifying the branch has not advanced.

## Final acceptance and release

- [ ] Read repository `AGENTS.md`, `CLAUDE.md`, storefront agent instructions and installed Next.js docs before implementation. Start an isolated worktree using the worktree skill; preserve the page-completion branch.
- [ ] Record current unit/typecheck baseline, implement each child plan with its failing test first, and record actual results without copying old test counts.
- [ ] Run `npm run test:unit`, `npm run typecheck`, `npm run lint` and `npm run build` in `apps/storefront` after integration. Resolve new failures; document existing failures separately.
- [ ] Run new Postgres suites with an isolated `TEST_DATABASE_URL`; a skipped database suite cannot establish concurrency correctness. Apply new migrations twice through the migration runner and verify existing data survives.
- [ ] Run the new `tests/e2e/chat.spec.ts` and `tests/e2e/booking.spec.ts` plus affected admin/content/cart regressions. Inspect 390px and 1440px, keyboard, reduced motion, no-JS booking and axe serious/critical violations.
- [ ] Record provider sandbox verification separately. Without deployment credentials, report Resend delivery as unverified; no real recipients, production data or live configuration changes are part of implementation.
- [ ] Add a dated verification record in repository `docs/superpowers/verification/`, update `docs/commerce-platform.md`, commit the exact verified source and publish a follow-up PR. Check whether PR #3 is still open before deciding whether to update it or open another PR; do not merge automatically.

The owner can provide the business purpose later. Service names, actual schedules,
timezone, retention periods and approved chat copy are editable setup inputs.
They do not require fictional live content to finish the software.

Implementation completed; see the dated verification record for the exact
checks and the native PostgreSQL/real provider activation limits. The owner explicitly authorized branch publication and PR creation on 2026-10-15,
resolving the earlier automatic approval block.
