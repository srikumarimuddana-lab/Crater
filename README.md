# Crater

Craters Remedy ecommerce storefront and operations console, with a shared
reference design and a repository development kit.

**Status (2026-10-14):** `apps/storefront` now includes the reference-designed storefront and admin, password-only staff access, editable content and image uploads, Stripe checkout/refunds, Resend/Twilio integrations, orders, CRM, inventory/purchasing, a financial ledger and sales/click analytics. The implementation is ready for code review and staging configuration; no production deployment or live provider activation is included.

See the [platform guide](docs/commerce-platform.md) for workflows, setup and practical limits, and the [verification record](docs/superpowers/verification/2026-10-14-commerce.md) for checks and remaining staging requirements. The [design specification](docs/superpowers/specs/2026-10-14-complete-commerce-platform-design.md) preserves the original scope and baseline audit.

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

## Complete commerce implementation

See [the platform guide](docs/commerce-platform.md) for the connected storefront/admin workflows, provider setup, migrations, recovery jobs and current deployment limits. The design follows the approved Craters Remedy reference.
