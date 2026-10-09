---
name: crater-shopify-commerce
description: "Use when connecting Shopify products, variants, inventory, cart mutations, checkout, Storefront API credentials, caching, or webhooks for Crater."
---

# Shopify commerce integration

Read `docs/architecture.md` and Phase 5 in `docs/implementation-plan.md`. Inspect
the installed framework and selected stable Storefront API version. Develop with
typed fixtures first; connect only the store and environment the user requested.

Implement the shared provider contract in server-only transport modules. Normalize
variant IDs, options, availability, decimal-string money, lines, and totals from
Shopify. Validate product variants and positive bounded quantities server-side.
Distinguish network/GraphQL errors from mutation `userErrors` and show actionable
messages without exposing identifiers or tokens.

Keep private Storefront tokens server-side using the private-token header;
never substitute an Admin token or expose a private token through NEXT_PUBLIC.
Use a secure HTTP-only SameSite cookie for the opaque cart identifier where
appropriate. Keep cart/buyer/checkout data private and uncached; cache public
catalog data independently. Do not log checkout-capable cart identifiers.

Serialize dependent cart mutations, reconcile with Shopify's authoritative result,
and preserve user intent through slow responses. Recreate expired carts safely.
Do not blindly retry a timed-out add-lines mutation: determine its resulting cart
state first, or ask the user to retry explicitly without claiming success.

Retrieve a fresh `checkoutUrl` at checkout intent and validate its host against
reviewed store checkout hosts. Shopify-hosted checkout owns payments, shipping,
and tax calculation; business configuration must still be checked. Fixture mode
must never redirect to real checkout or create orders.

Verify webhook HMAC over the raw body, handle duplicate notifications, and invalidate
only affected catalog tags. Test stale stock, invalid options/quantities, expired
carts, concurrent intent, network/userErrors, private caching, invalid signatures,
and checkout host rejection. Use an authorized development/test checkout.

Return the provider contract, configuration requirements, recovery evidence, and
remaining business inputs.
