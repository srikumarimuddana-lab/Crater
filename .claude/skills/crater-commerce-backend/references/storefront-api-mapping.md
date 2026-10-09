# Shopify Storefront API → Crater mapping

Reference: https://shopify.dev/docs/api/storefront. Crater mirrors names and
semantics; it does not implement GraphQL. Keep this table current when adding
operations.

| Storefront API | Crater | Difference |
| --- | --- | --- |
| `products(first, after, query, sortKey, reverse)` | `storefront.products(args)`, `GET /api/storefront/products` | Query supports free text, `product_type:`, `tag:`, `available_for_sale:true`; sort `TITLE`, `PRICE`, `CREATED_AT`, `RELEVANCE` |
| `product(handle:)` | `storefront.product({handle})`, `GET /api/storefront/products/[handle]` | Same |
| `Product.variantBySelectedOptions` | `storefront.variantBySelectedOptions({handle, selectedOptions})` | Top-level function instead of a field |
| `collections` / `collection(handle).products` | `storefront.collections()`, `products({collection})` | No collection-level pagination |
| `Product.metafields` | `Product.details` | Fixed fields: benefits, ingredients, howToUse, precautions |
| `MoneyV2` | `MoneyV2` | Currency limited to CAD in the preview |
| `cart(id:)` | `storefront.cart({id})`, `GET /api/storefront/cart` | Null for expired or completed carts |
| `cartCreate` | `storefront.cartCreate`, `POST /api/storefront/cart` | Route sets the cart cookie |
| `cartLinesAdd` | `storefront.cartLinesAdd`, `POST /api/storefront/cart/lines` | Same variant merges into one line |
| `cartLinesUpdate` | `storefront.cartLinesUpdate`, `PATCH /api/storefront/cart/lines` | Quantity 0 removes |
| `cartLinesRemove` | `storefront.cartLinesRemove`, `DELETE /api/storefront/cart/lines` | Same |
| `cartBuyerIdentityUpdate`, `cartNoteUpdate` | Same names | Email and country only |
| `CartUserError {code, field, message}` | Same | Codes: INVALID, LESS_THAN, GREATER_THAN, INVALID_MERCHANDISE_LINE, MERCHANDISE_NOT_FOUND, MISSING_CART, INVALID_QUANTITY |
| `CartWarning {code, message, target}` | Same | Codes: MERCHANDISE_NOT_ENOUGH_STOCK, MERCHANDISE_OUT_OF_STOCK |
| `Cart.checkoutUrl` (Shopify-hosted checkout) | `/api/checkout` (POST) → Stripe Checkout Session | Snapshot + idempotency key; host must be `checkout.stripe.com` |
| `CartCost.totalTaxAmount` | Always null in the cart | Tax and shipping decided at Stripe Checkout |
| Orders (Admin API / webhooks `orders/create`) | Stripe `checkout.session.completed` → `Order` | Created only by the verified webhook |
| Inventory (`quantityAvailable`) | `ProductVariant.quantityAvailable` | Decremented in the webhook transaction |
