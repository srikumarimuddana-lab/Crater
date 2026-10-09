# Primary sources

Verified on 2026-10-09. Recheck version-sensitive details during app scaffolding.
The skills in this repository are original project guidance. External plugins and
MCP servers below are optional; none are automatically installed or enabled.

| Area | Primary source | Used for |
| --- | --- | --- |
| Claude Code skills | https://code.claude.com/docs/en/skills | Project `SKILL.md`, slash commands, invocation |
| Claude Code subagents | https://code.claude.com/docs/en/sub-agents | Agent frontmatter, tools, skills, main `--agent` session |
| Claude Code hooks | https://code.claude.com/docs/en/hooks | Native lifecycle hooks, exec-form arguments, context output, disable setting |
| Claude Code settings | https://code.claude.com/docs/en/settings | Project/local configuration and precedence |
| Anthropic frontend design | https://claude.com/plugins/frontend-design | Optional official visual design plugin |
| Official plugin catalog | https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json | Verified frontend-design marketplace entry |
| Next.js lazy loading | https://nextjs.org/docs/app/guides/lazy-loading | Client wrapper and `ssr: false` boundary |
| GSAP React | https://gsap.com/resources/React/ | Scoped animation and cleanup |
| GSAP media conditions | https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/ | Media and reduced-motion timeline changes |
| R3F performance | https://r3f.docs.pmnd.rs/advanced/scaling-performance | Demand rendering, invalidation, quality control |
| Shopify cart integration | https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage | Cart operations and fresh checkout URLs |
| Shopify cart schema | https://shopify.dev/docs/api/storefront/latest/objects/Cart | Authoritative cart fields |
| Playwright MCP | https://github.com/microsoft/playwright-mcp | Optional isolated browser integration |
| Pinned MCP release | https://github.com/microsoft/playwright-mcp/releases/tag/v0.0.83 | Reviewed example version; no floating runtime version |

Performance budgets, the visual palette, module ownership, and the phase plan are
Crater recommendations. They are not benchmark results or vendor guarantees.
