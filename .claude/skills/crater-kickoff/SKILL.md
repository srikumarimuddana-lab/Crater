---
name: crater-kickoff
description: "Use when starting a Crater milestone, coordinating specialist agents, deciding architecture, or handing off ecommerce development work."
---

# Crater milestone coordination

Read `CLAUDE.md`, `docs/design-brief.md`, `docs/architecture.md`, and the requested
phase in `docs/implementation-plan.md`. Treat supplied brand facts as facts and
unconfirmed store, market, assets, and policies as assumptions. Continue work
already authorized by the user; ask only for missing decisions that affect it.

## Milestone contract

Write a compact task record containing: goal, owned files, inputs, outputs,
completion criteria, relevant checks, and unresolved dependency. Update the
current phase checklist as actual work completes. Keep a working preview after
each phase; do not mark later phases done from toolkit checks.

Use the architect as the main conversation. When the user requests coordination,
use the relevant `.claude/agents/` specialists. Run one implementer for small
work; use at most two independent workers initially for larger work. The
coordinator owns shared manifests, dependencies, types, integration, and publishing.
Workers own disjoint paths; serialize changes to shared files. Subagents should
return a handoff rather than spawning an unbounded tree of extra agents.

## Deliverable order

1. Static product/shopping experience and approved tokens.
2. Variant/cart interfaces in marked fixture mode.
3. One 3D hero with image and failure fallbacks.
4. Bounded scroll story and cleanup.
5. Verified Shopify purchase journey.
6. Content, scoped quality checks, and preview review.

Use project-specific skills only for the relevant work. Do not require optional
plugins, MCP servers, or production credentials for fixture development. Keep
Git operations ordinary; never install blocking Git hooks.

Return the milestone result, changed paths, observed verification, remaining
inputs, and the next dependency. State the app's actual status plainly.

Requested milestone: $ARGUMENTS
