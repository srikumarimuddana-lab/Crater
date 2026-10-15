# Automated Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver admin-editable guided chat with private drafts, isolated visitor sessions and durable CRM/email follow-up.

**Architecture:** A dedicated repository stores configuration, transcript sessions and handoff source events. Server code exposes only published answers and session-owned messages. Handoff reconciliation creates an existing email-channel CRM conversation; the browser never reads CRM records.

**Tech Stack:** Existing Next.js/React/TypeScript, pg, node:crypto, Vitest and Playwright; no chat provider dependency.

**Spec:** [Approved design](../specs/2026-10-15-chat-and-booking-design.md). [Shared plan and integration inventory](2026-10-15-chat-and-booking.md).

**Implementation record:** Coding is complete. Predicted test-file boundaries were consolidated into service, route, privacy and SQL suites; actual commands, results, browser checks and staging limitations are recorded in [verification](../verification/2026-10-15-chat-booking.md).

## Global Constraints

- Preserve the approved Remedy design across public pages and admin, and existing password-only staff access.
- Automatic chat must not be described as implemented AI.
- Both modules remain disabled until the owner configures actual business content.
- Private transcripts are excluded from public content and traffic event payloads.
- Appointment contact is not marketing consent; chat follow-up also grants no marketing consent.
- Paths below are relative to `apps/storefront/`.

## Review Focus

- Guessed session IDs and supplied email addresses never authorize access to another transcript (Task 2).
- Stale editor forms cannot overwrite a newer draft/publication (Task 1).
- A database/CRM outage cannot produce a false saved-message receipt (Task 2).
- Closing the widget restores focus and never traps the cart drawer behind it (Task 3).
- A worker restart recovers handoff exactly once at the CRM event boundary (Task 2).

### Task 1: Publishable configuration, private repository and request protection

**Files:** Create `src/lib/chat/{types,validation,repository,memory-repository,postgres-repository,index}.ts`, `src/lib/public-interactions/{rate-limit,validation}.ts`, `db/migrations/0013_chat.sql`, `tests/unit/chat/{configuration,repository,rate-limit,postgres}.test.ts`. Modify `src/lib/admin/{types,permissions}.ts`.

**Interfaces:**
- `ChatConfig = {enabled:boolean; title:string; greeting:string; fallback:string; followUpLabel:string; allowedPaths:string[]; retentionDays:number; questions:ChatQuestion[]}`.
- `ChatQuestion = {id:string; label:string; answer:string; href:string|null}`; only same-origin relative public links accepted.
- `ChatPublication = {draft:ChatConfig; published:ChatConfig|null; version:number; publishedVersion:number|null}`.
- `ChatRepository.readConfiguration():Promise<ChatPublication>`; `saveDraft(config:ChatConfig, expectedVersion:number, actor:string):Promise<ChatPublication>`; `publish(expectedVersion:number, actor:string):Promise<ChatPublication>`; `readPublished():Promise<ChatConfig|null>`.
- `getChatRepository():Promise<ChatRepository>` follows commerce repository factory mode; do not persist chat in the global communications JSON document.
- `consumePublicLimit(input:{scope:string;subjectHash:string;limit:number;windowMs:number}, now:Date):Promise<boolean>` uses a durable Postgres row and atomic increment, with an isolated memory adapter for tests.
- Capabilities: `chat:manage` to Owner/Admin only; handling email handoff continues through existing CRM support access.

- [x] **Step 1: Write failing tests.** `disabled_by_default` asserts `readPublished() === null`; `publish_does_not_leak_draft` saves a new draft after publishing and asserts public greeting stays unchanged; `rejects_stale_versions` expects a conflict. Reject `javascript:`/external/admin links, overlong text and missing retention. `parallel_rate_limit` launches six calls with limit five and asserts five true results.
- [x] **Step 2: Run** `npm run test:unit -- tests/unit/chat/configuration.test.ts tests/unit/chat/repository.test.ts tests/unit/chat/rate-limit.test.ts tests/unit/chat/postgres.test.ts`; confirm missing-module/implementation failures before product code.
- [x] **Step 3: Implement** the interfaces above. Cap configuration at 30 questions; label 120, answer 4000, greeting/fallback 1000 characters. Validate retention as 1–3650 days with no published default. Migration stores versioned config, sessions/messages, handoff events, durable request buckets and audit entries in private RLS-enabled tables with public/anon/authenticated grants denied. Configure feature publication only when real copy and retention are valid. Rate limits are keyed by hashed session/contact identifiers; do not trust arbitrary forwarded IP headers.
- [x] **Step 4: Run** the same suite in memory and with isolated `TEST_DATABASE_URL`; both must pass, including concurrent increments and migration permissions.
- [x] **Step 5: Commit** with `feat: add publishable chat configuration and private persistence`.

### Task 2: Visitor-owned conversations and recoverable CRM handoff

**Files:** Create `src/lib/chat/{service,session,handoff}.ts`, `src/app/api/chat/{session,message,handoff}/route.ts`, `tests/unit/chat/{service,routes,handoff}.test.ts`. Modify `src/lib/operations/commerce.ts`.

**Interfaces:**
- `ChatSession = {id:string; tokenHash:string; expiresAt:string; createdAt:string}`; server cookie contains a random 32-byte opaque token, HTTP-only, SameSite=Lax, Secure on HTTPS, seven-day maximum bounded by retention.
- `ChatMessage = {id:string;sessionId:string;requestId:string;kind:'question'|'answer'|'fallback'|'handoff';body:string;createdAt:string}`.
- Add repository `transaction<T>(work:(tx:ChatTransaction)=>Promise<T>):Promise<T>`; `ChatTransaction` reads/locks session, inserts unique request/message, writes a handoff source event and audit entry atomically. Memory implementation mirrors transaction rollback/serialization.
- `createChatService(repo:ChatRepository,now:()=>Date)` produces `startSession():Promise<{token:string;expiresAt:string}>`, `ask(token:string,input:{requestId:string;questionId?:string;text?:string}):Promise<{messages:ChatMessage[]}>`, `handoff(token:string,input:{requestId:string;name:string;email:string;message:string}):Promise<{received:true}>`.
- `reconcileChatHandoffs():Promise<{recovered:number}>` replays source events through `getCrm().inbound` with `eventId = chat-handoff:<event-id>`, email channel and a snapshot of the submitted message; no existing CRM content is returned publicly.
- `POST /api/chat/session` sets the opaque cookie; message/handoff endpoints read only that cookie. No caller-supplied session/customer ID is accepted.

- [x] **Step 1: Write failing tests.** `other_session_cannot_read_transcript` and `email_does_not_authorize_customer_history` assert no private record fields in responses. Unknown questions use the published fallback; retries reuse request IDs without duplicate messages. `failed_source_commit_returns_no_receipt` expects 503, while `crm_down_then_replay` persists a handoff and later reconciles once through the CRM inbound ID. Disabled/unpublished configuration rejects new public work.
- [x] **Step 2: Run** `npm run test:unit -- tests/unit/chat/service.test.ts tests/unit/chat/routes.test.ts tests/unit/chat/handoff.test.ts` and confirm expected failures.
- [x] **Step 3: Implement** service/routes. Read native/JSON bodies with existing `readSubmission`/origin protection; maximum 16 KiB body, 4000-character question/handoff message, 150-character name and validated email. Apply 30 messages/hour/session and five handoffs/hour/contact hash via Task 1 limiter. Persist guided answers from the published version only; free text uses normalized exact-label matching then fallback, without claiming semantic/AI understanding. Persist source+messages before returning `received`; CRM follow-up can reconcile later. Run handoff reconciliation from maintenance even when provider sends are paused.
- [x] **Step 4: Run** Task 2 tests plus existing communications routes/service tests; verify no SMS channel widening, marketing consent, live provider call or customer authentication was introduced.
- [x] **Step 5: Commit** with `feat: add session-isolated guided chat and CRM follow-up`.

### Task 3: Public widget and admin editor

**Files:** Create `src/components/chat/{launcher,dialog}.tsx`, `src/app/chat/page.tsx`, `src/app/admin/(console)/chat/page.tsx`, `src/app/admin/_actions/chat.ts`, `tests/e2e/chat.spec.ts`, `tests/unit/chat/actions.test.ts`. Modify `src/components/page-shell.tsx`, `src/components/admin/shell.tsx`, `src/app/remedy.css`.

**Interfaces:**
- `ChatLauncher({config}:{config:ChatConfig})` renders only for allowed public paths; initial server render omits disabled chat. The ordinary `/chat` page provides an accessible alternative to the widget.
- Server actions `saveChatDraft(previous:ActionResult,form:FormData):Promise<ActionResult>` and `publishChat(previous:ActionResult,form:FormData):Promise<ActionResult>` enforce `chat:manage`, origin and expectedVersion; use existing action-result conventions.
- Booking calls to action point to `/book` only when booking is enabled, and accept only configured active service IDs once that module exists. No preview-only answers enter public props.

- [x] **Step 1: Write failing tests.** Admin draft/preview/publish changes public answers only at publication; Support cannot publish; invalid action retains editor values. Browser tests open chat, select a question, save handoff and inspect CRM; Escape restores focus, tab stays in the active dialog, cart/chat never open simultaneously, disabled chat is absent. At 390px the launcher cannot cover purchase controls. Unknown question displays an honest fallback.
- [x] **Step 2: Run** `npm run test:unit -- tests/unit/chat/actions.test.ts` and the new Playwright spec against the baseline; confirm missing editor/widget failures.
- [x] **Step 3: Implement** shared Remedy styling, accessible modal controls, loading/error/retry states, editable title/copy/questions/placement/retention and authenticated draft preview. Use existing public page shell, not root admin layout, for the launcher. Keep opt-in analytics limited to a fixed `chat.open` click ID; never transmit messages or email.
- [x] **Step 4: Run** scoped browser/unit checks, 390px/1440px inspection, axe and reduced-motion checks. Record actual outcomes; update the shared verification record with chat behavior and pending business configuration.
- [x] **Step 5: Commit** with `feat: add configurable Remedy chat widget and admin editor`.

Optional AI remains unselected and disabled. The guided-answer service boundary
permits a later adapter; this plan does not choose a provider, add keys or incur
model usage. The completed chat module works independently of booking.
