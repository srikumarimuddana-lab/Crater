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
| Shopify Storefront API | https://shopify.dev/docs/api/storefront | Reference design for Crater's commerce objects and operations |
| Shopify cart schema | https://shopify.dev/docs/api/storefront/latest/objects/Cart | Cart, line, cost, and error shapes mirrored by Crater |
| Shopify cart guide | https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage | Cart operation semantics |
| Stripe Checkout Sessions | https://docs.stripe.com/api/checkout/sessions/create | Session parameters, `price_data`, metadata |
| Stripe fulfillment | https://docs.stripe.com/payments/checkout/fulfill-orders | Webhook-driven order fulfillment |
| Stripe webhook signatures | https://docs.stripe.com/webhooks/signature | Raw-body signature verification |
| Stripe idempotency | https://docs.stripe.com/api/idempotent_requests | Safe retries of session creation |
| Stripe testing | https://docs.stripe.com/testing | Test cards and test mode |
| Stripe pricing (Canada) | https://stripe.com/en-ca/pricing | Per-transaction fees; no monthly fee |
| CRA GST/HST rates | https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html | Province rates (effective 2025-04-01) used in `docs/tax.md` |
| Saskatchewan PST | https://www.saskatchewan.ca/business/taxes-licensing-and-reporting/provincial-taxes-policies-and-bulletins/provincial-sales-tax | SK PST 6% |
| Stripe tax rates | https://docs.stripe.com/billing/taxes/tax-rates | Fixed Tax Rate objects on Checkout line items |
| Stripe Tax pricing (Canada) | https://stripe.com/en-ca/tax/pricing | Paid alternative: 0.5% per transaction where registered |
| Vercel Hobby plan | https://vercel.com/docs/plans/hobby | Free tier; non-commercial use only |
| Playwright MCP | https://github.com/microsoft/playwright-mcp | Optional isolated browser integration |
| Pinned MCP release | https://github.com/microsoft/playwright-mcp/releases/tag/v0.0.83 | Reviewed example version; no floating runtime version |

Performance budgets, the visual palette, module ownership, and the phase plan are
Crater recommendations. They are not benchmark results or vendor guarantees.
