# Crater

The current app is the Craters Remedy storefront and operations platform in
`apps/storefront`: Next.js/React/TypeScript, Postgres, Stripe, Resend and Twilio.
Storefront and admin follow the owner-selected Remedy reference with lightweight
React-safe motion. Password-only staff access, editable pages/media, orders, CRM,
inventory/purchasing, ledger and analytics are implemented; real catalog and live
provider activation remain environment/owner inputs. Read `docs/commerce-platform.md`
and the latest records in `docs/superpowers/verification/` for current scope.
Earlier cinematic 3D and MFA proposals are historical and do not override the
owner's later reference-design and no-MFA decisions.

## Start here

- Read `docs/design-brief.md`, `docs/architecture.md`, and the current milestone in
  `docs/implementation-plan.md` before product work.
- Use `/crater-kickoff` to coordinate a milestone. Start the architect as the main
  session with `claude --agent crater-orchestrator` when delegation is useful.
- Prefer one implementer for small changes. Delegate only independent tasks with
  explicit file ownership and interfaces; start with at most two workers.
- Treat the stack and visual brief as the starting recommendation. Record
  substantive changes in the docs, and respect the user's later decisions.

## Project contracts

- App location: `apps/storefront`. Stack: Next.js App Router, TypeScript,
  Tailwind, lifecycle-safe React motion, and Crater's own commerce
  backend (Shopify-Storefront-API-shaped, Postgres) with Stripe hosted Checkout.
- Render text, price, accessible controls, and a responsive product image before
  loading WebGL. Keep the purchase journey functional with motion disabled and
  while the 3D asset fails or loads.
- Use native scrolling, bounded requestAnimationFrame updates and IntersectionObserver
  reveals. React/CSS own ordinary interface state. Avoid competing animation owners.
- Preserve keyboard access, reduced motion, mobile document flow, and readable
  product content. Keep essential content outside the canvas.
- Use server-side variant IDs and authoritative totals; Stripe takes payment from
  server prices only. Keep cart state uncached and private. Stripe stays in test
  mode unless the user explicitly asks for live keys. Never invent reviews, clinical evidence, stock, or certifications.
- Start with clearly marked fixture data. Connecting paid services, publishing a
  live site, and modifying production commerce data require a user request.
- Keep real credentials in ignored local environment files. Never publish
  private tokens through `NEXT_PUBLIC_*`, browser code, logs, or fixtures.

## Working and verifying

- Inspect existing code before editing. Scaffold the app only for the requested
  implementation milestone, and commit an exact dependency lockfile then.
- Keep tasks and handoffs concise: scope, owned files, inputs/outputs, completion
  criteria, evidence, and the next dependency.
- Run checks appropriate to the change. A docs-only change needs link/config
  validation; a cart change needs failure-path coverage; a visual interaction
  needs inspection in the browser when available. Record skipped checks honestly.
- Commands available now: `npm run check:setup`, `npm run doctor:setup`, and
  `npm run test:hooks`. Storefront (run in `apps/storefront`): `npm run typecheck`,
  `npm run lint`, `npm run test:unit`, `npm run build`, `npm run test:e2e` (needs a
  prior build), and `npm run db:migrate` / `db:seed` (needs a Postgres URL).
- No Git hooks are installed. Claude lifecycle hooks are advisory, perform no
  network calls or edits, and do not launch builds, tests, or extra agents.

Read `docs/claude-code-setup.md` for the skill/agent catalog, optional integrations,
platform notes, and how to disable the advisory hooks.
