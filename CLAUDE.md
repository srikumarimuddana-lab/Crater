# Crater

Build a premium cosmetics/skincare ecommerce storefront with an editorial identity,
one cinematic 3D product story, and a clear purchase journey. This repository
contains the development toolkit, the specifications, and the storefront in
`apps/storefront` (Phase 1 complete: static homepage on marked fixture data).

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

- Planned app location: `apps/storefront`. Stack: Next.js App Router, TypeScript,
  Tailwind, Three.js/React Three Fiber/Drei, GSAP, Shopify Storefront Cart API.
- Render text, price, accessible controls, and a responsive product image before
  loading WebGL. Keep the purchase journey functional with motion disabled and
  while the 3D asset fails or loads.
- Use native scrolling by default. GSAP owns the cinematic timeline; React/CSS
  own ordinary interface state. Avoid competing animation owners.
- Preserve keyboard access, reduced motion, mobile document flow, and readable
  product content. Keep essential content outside the canvas.
- Use Shopify variant IDs and authoritative totals. Keep cart state uncached and
  private. Never invent reviews, clinical evidence, stock, or certifications.
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
  `npm run lint`, `npm run build`, and `npm run test:e2e` (needs a prior build).
- No Git hooks are installed. Claude lifecycle hooks are advisory, perform no
  network calls or edits, and do not launch builds, tests, or extra agents.

Read `docs/claude-code-setup.md` for the skill/agent catalog, optional integrations,
platform notes, and how to disable the advisory hooks.
