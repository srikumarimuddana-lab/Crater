# Crater storefront

Next.js App Router storefront. **Phase 1:** static homepage on clearly marked
fixture data. No credentials, no live commerce, and nothing can be purchased.

```bash
cd apps/storefront
npm ci
npm run dev          # http://localhost:3000
npm run typecheck
npm run lint
npm run build
npm run test:e2e     # serves the production build; run `npm run build` first
```

Playwright is pinned to 1.56.1. Install its browser with `npx playwright install
chromium`, or point `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at a matching preinstalled
Chromium.

- Fixture data: `src/lib/content/fixtures.ts` (all names, prices, and copy are placeholders).
- Placeholder packshots: `public/products/<handle>/packshot.svg`, regenerated with
  `node scripts/generate-placeholder-packshots.cjs public/products`.
- Design tokens and composition: `../../docs/visual-contract.md`.
