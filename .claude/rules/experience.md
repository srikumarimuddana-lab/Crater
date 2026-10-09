---
paths:
  - "apps/storefront/src/components/experience/**/*"
  - "apps/storefront/public/products/**/*"
---

# Experience boundaries

Use the poster/loading/ready/failed states and budgets in `docs/architecture.md`.
Keep HTML copy visible, mobile in normal flow, and reduced motion static. Use one
timeline owner; invalidate R3F demand frames after external mutations. Clean up
timelines, listeners, observers, and owned GPU resources. Confirm failures and
navigation/remounts preserve the product and purchase controls.
