# Claude Code setup

## What is included

The repository contains nine original project skills, eight native Claude Code
agent definitions, four path-scoped rules, and three advisory lifecycle hooks.
They load from the checkout; no global skill installer is required.

| Command | Use |
| --- | --- |
| `/crater-kickoff` | Scope a phase, assign ownership, coordinate, and hand off |
| `/crater-art-direction` | Visual identity, type, composition, and screenshot critique |
| `/crater-nextjs-storefront` | Routes, server/client boundaries, and shopping UI |
| `/crater-3d-product` | Scene, loading/failure policy, and GPU budgets |
| `/crater-scroll-motion` | Bounded GSAP story, media policy, and cleanup |
| `/crater-shopify-commerce` | Provider, variants, cart recovery, and checkout |
| `/crater-content-seo` | Approved product facts, claims, metadata, and events |
| `/crater-quality-review` | Critical purchase/fallback checks and a scoped verdict |
| `/crater-product-assets` | Packshots, GLBs, posters, provenance, and size validation |

| Agent | Skills preloaded | Responsibility |
| --- | --- | --- |
| `crater-orchestrator` | kickoff | Architect, shared contracts, integration |
| `crater-product-strategist` | content-seo | Business analysis, catalog, evidence, acceptance |
| `crater-art-director` | art-direction, product-assets | Visual/asset contract |
| `crater-frontend-engineer` | nextjs-storefront | Routes and shopping UI |
| `crater-experience-engineer` | 3d-product, scroll-motion, product-assets | 3D and cinematic story |
| `crater-commerce-engineer` | shopify-commerce | Secure server commerce/recovery |
| `crater-quality-engineer` | quality-review | Run scoped checks, report evidence |
| `crater-release-reviewer` | quality-review | Read-only final diff/evidence review |

The architect inherits the current model; specialists use the `sonnet` alias.
These definitions do not automatically start eight agents. Use one implementer
for small work, and initially at most two workers for independent tasks.
Only the main coordinator delegates and handles shared files/integration.
The release reviewer has only Read/Glob/Grep tools. QA has shell access to run
existing checks, with instructions to return findings instead of editing app code.

## Start a session

Use Node 22+ and a current Claude Code release that supports exec-form hook
arguments (`command` plus `args`). The current hook reference recommends this
form for paths containing spaces and for Windows Node scripts.

```bash
git clone https://github.com/srikumarimuddana-lab/Crater.git
cd Crater
node scripts/check-setup.cjs
node scripts/doctor.cjs
claude --agent crater-orchestrator
```

Inside Claude Code:

```text
/crater-kickoff Build Phase 1 in fixture mode using the design brief. Deliver the static homepage first, with mobile layouts and a clear shopping action.
```

Use a specialist directly when helpful, for example `claude --agent
crater-frontend-engineer`. Use `/help` and the slash-command menu to confirm the
project skills appear. Refer to the current agent documentation for listing and
invocation behavior; commands can change between Claude Code releases.

The toolkit commands need no `npm install` and no Shopify credentials. The future
storefront will have its own dependencies and lockfile at the scaffold phase.

## Hooks and ordinary Git work

| Event | Effect | When quiet |
| --- | --- | --- |
| `SessionStart` | Refresh short project/milestone context | Outside matched start/resume/compact events |
| `PostToolUse` on Write/Edit | Advise on edited JSON, motion, commerce, or env files | Most ordinary file edits |
| `SubagentStart` for `crater-*` | Inject owned-file/evidence handoff contract | Unrelated agents |

All three run `.claude/hooks/project-hook.cjs` through Node with a five-second
timeout. The script has no child processes, network calls, file writes, exit-2
responses, blocking decisions, builds, formatter runs, test runs, or agent calls.
Malformed input is ignored. Worktree handling prefers the event's current checkout
and checks canonical file boundaries before inspecting configuration.

The edit hook is guidance, not a security enforcement layer. It only observes
Claude's Write/Edit tool calls; a shell command or external editor can change
files without triggering it. Use explicit setup/app checks after such changes.

No `.husky`, `.githooks`, `core.hooksPath` changes, pre-commit, or pre-push scripts
are installed. Existing machine/repository hooks from other sources may still
apply; `doctor:setup` reports them without modifying them.

To turn these advisory hooks off, create or merge this entry into ignored
`.claude/settings.local.json`:

```json
{
  "disableAllHooks": true
}
```

An existing local settings file may contain other preferences; preserve them.
Managed organization policies can have higher precedence. If an older Claude Code
cannot parse exec-form arguments, update it or disable these advisory hooks while
using the checked-in skills and agents.

## Optional external capabilities

**Anthropic frontend-design:** useful for additional visual critique. It is an
official plugin, separate from the original Crater skills. Install through the
official plugin UI, or enter this inside Claude Code when the official marketplace
is available:

```text
/plugin install frontend-design@claude-plugins-official
```

It is not enabled in shared settings, so the project works without it. Follow the
supplied Crater/brand brief if an optional plugin's defaults differ.

**Playwright MCP:** the optional `.mcp.json.example` uses Microsoft's reviewed
`@playwright/mcp@0.0.83` release and an isolated browser. Copy its entries into your
ignored `.mcp.json` only when browser tooling is wanted, then inspect connection
state with `/mcp`. This can download packages/browser resources on first use and
needs network access. The main coordinator can use it for local/preview inspection
and give screenshots/results to the scoped reviewers. No production sign-in or
live checkout is part of setup.

**Figma, image generation, and Blender:** use supplied design files and connected
tools if available; use Blender for accurate 3D assets. None of these are assumed
installed or authenticated by a Markdown agent definition. Keep editable assets,
rights, and approved packaging inputs in the asset workflow.

Avoid adding multiple overlapping design plugins, scroll engines, or context
servers initially. Add a capability when a concrete phase needs it and record
its version and role. See [primary sources](sources.md) for verified references.

## Verification and limits

```bash
npm run check:setup
npm run test:hooks
npm run doctor:setup
```

Setup validation checks metadata, all agent preloads, rule scoping, hook commands,
Node syntax, and local document links. Thirteen process-level hook checks cover
event output, malformed/large input, quiet edits, JSON advice, private env contents,
outside/missing/symlink files, and linked-worktree behavior. A planning scenario
was also exercised with all nine skills.

Validation ran under Node 24.19.0 on Linux. A Claude Code binary and Windows/macOS
machines were not available in the setup environment, so native session loading
and those platform executions still need the local check described above. Hook
and agent formats follow the current primary documentation.

This verifies the development kit. App builds, browser shopping tests, device
profiles, real assets, Shopify configuration, and live publishing occur in their
respective implementation phases.
