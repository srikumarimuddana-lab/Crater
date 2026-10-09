# Crater

A Claude Code development kit for a premium cosmetics/skincare ecommerce site
with an editorial design, cinematic 3D product storytelling, and a clear purchase
journey.

**Status:** Phase 1 (static foundation, fixture data) is implemented in
`apps/storefront`; see `apps/storefront/README.md`. Phases 2–6 are not started.

## Included

- **9 skills:** coordination, visual direction, Next.js, 3D, scroll motion,
  own commerce backend with Stripe Checkout, content/SEO, quality review, and product assets.
- **8 agents:** architect/coordinator, product analyst, art director, frontend,
  experience, commerce, QA, and a read-only release reviewer.
- **3 advisory hooks:** project context, relevant edit advice, and agent handoffs.
- **4 scoped rules**, setup diagnostics, hook checks, optional pinned browser
  MCP configuration, environment example, and a PR template.
- A visual brief, architecture, asset workflow, and six-phase implementation plan.

The hooks do not install Git hooks, block commits/pushes, or run builds and tests
after every edit. The kit does not require store credentials or optional plugins.

## Start

Use Node 22+ and a current Claude Code installation. No toolkit dependency install
is needed.

```bash
git clone https://github.com/srikumarimuddana-lab/Crater.git
cd Crater
node scripts/check-setup.cjs
node scripts/doctor.cjs
claude --agent crater-orchestrator
```

Then enter:

```text
/crater-kickoff Build Phase 1 in fixture mode using the design brief. Create the static homepage before adding 3D or commerce.
```

Start with one implementer, or two independent workers when coordination is
useful. The coordinator owns shared dependencies, interfaces, and integration.

## Project references

| Read | Purpose |
| --- | --- |
| [Claude Code setup](docs/claude-code-setup.md) | Exact skills/agents, hooks, optional tools, and disable instructions |
| [Design brief](docs/design-brief.md) | Mineral Atelier direction, page sequence, and motion behavior |
| [Architecture](docs/architecture.md) | Next.js/R3F/GSAP/commerce boundaries and initial budgets |
| [Implementation plan](docs/implementation-plan.md) | Static foundation through commerce and preview review |
| [Asset brief](docs/asset-brief.md) | Packaging, packshots, GLBs, posters, and provenance |
| [Primary sources](docs/sources.md) | Verified vendor documentation and optional integrations |
| [Shared instructions](CLAUDE.md) | Project contracts for Claude Code |
| [Agent instructions](AGENTS.md) | Shared guidance for other coding assistants |

## Check the kit

```bash
npm run check:setup
npm run test:hooks
npm run doctor:setup
```

These checks verify the development setup, not storefront performance or a live
purchase path. Product, brand, packaging, market/policy inputs, and Stripe
configuration are collected during the relevant application phases.
