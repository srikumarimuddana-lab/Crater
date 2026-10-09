---
paths:
  - "apps/storefront/src/app/**/*.tsx"
  - "apps/storefront/src/components/ui/**/*"
  - "apps/storefront/src/components/commerce/**/*"
---

# Storefront boundaries

Read the shared contracts in `CLAUDE.md`. Render product content and metadata on
the server; keep interaction islands small. Reserve image/scene space, keep
shopping controls outside canvas, and preserve semantic labels, keyboard focus,
loading states, and readable error recovery. Keep the app useful before 3D loads.
Share normalized commerce types rather than embedding GraphQL in UI components.
