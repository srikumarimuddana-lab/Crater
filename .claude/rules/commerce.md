---
paths:
  - "apps/storefront/src/lib/commerce/**/*"
  - "apps/storefront/src/app/api/**/*"
---

# Commerce boundaries

Keep private tokens server-side and cart/buyer/checkout state uncached and private.
Use authoritative Shopify variant IDs, availability, decimal-string money, and
mutation results. Validate quantity and checkout destination. Surface userErrors;
handle stale stock, expired carts, and overlapping intent. Do not blindly replay
timed-out cart additions. Verify webhook HMAC over the raw body and redact secrets
and opaque cart identifiers from diagnostics.
