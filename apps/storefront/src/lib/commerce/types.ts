/**
 * Crater commerce contract.
 *
 * Object shapes, operation names, and error semantics follow the Shopify
 * Storefront API (https://shopify.dev/docs/api/storefront) so the UI can be
 * written against familiar, documented behaviour. Crater runs this layer itself:
 * catalog, carts, and orders live in our database; Stripe Checkout takes payment.
 *
 * Coordinator-owned shared file. Change it only through the coordinator.
 */

// ---------------------------------------------------------------------------
// Scalars and common objects

/** Global ID, Shopify style: `gid://crater/<Type>/<id>`. Opaque to the UI. */
export type ID = string;

/** ISO 8601 date-time string. */
export type DateTime = string;

/** ISO 4217 code. The preview market is CAD. */
export type CurrencyCode = 'CAD';

/** Storefront `MoneyV2`: a decimal string (e.g. "68.00"), never a float. */
export type MoneyV2 = {
  amount: string;
  currencyCode: CurrencyCode;
};

export type Image = {
  url: string;
  altText: string;
  width: number;
  height: number;
  /** Crater addition: true while the image is a marked illustration placeholder. */
  placeholder: boolean;
};

export type SelectedOption = {
  name: string;
  value: string;
};

export type ProductOptionValue = {
  id: ID;
  name: string;
};

export type ProductOption = {
  id: ID;
  name: string;
  optionValues: ProductOptionValue[];
};

export type PageInfo = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
};

export type Connection<T> = {
  nodes: T[];
  pageInfo: PageInfo;
};

// ---------------------------------------------------------------------------
// Catalog

export type ProductVariant = {
  id: ID;
  title: string;
  sku: string;
  availableForSale: boolean;
  /** Null when inventory is not tracked for the variant. */
  quantityAvailable: number | null;
  price: MoneyV2;
  compareAtPrice: MoneyV2 | null;
  selectedOptions: SelectedOption[];
  image: Image | null;
  /** Minimal back-reference, as in the Storefront API. */
  product: { id: ID; handle: string; title: string };
};

export type ProductPriceRange = {
  minVariantPrice: MoneyV2;
  maxVariantPrice: MoneyV2;
};

/**
 * Approved-content fields Shopify would hold in metafields. All values are
 * preview placeholders until verified brand copy replaces them.
 */
export type ProductDetails = {
  benefits: string[];
  ingredients: string[];
  howToUse: string;
  precautions: string;
};

export type Product = {
  id: ID;
  handle: string;
  title: string;
  description: string;
  vendor: string;
  productType: string;
  tags: string[];
  availableForSale: boolean;
  options: ProductOption[];
  priceRange: ProductPriceRange;
  featuredImage: Image | null;
  images: Image[];
  variants: ProductVariant[];
  details: ProductDetails;
  /** Crater addition: true for fixture/sample products. Rendered as a visible marker. */
  sample: boolean;
  createdAt: DateTime;
  updatedAt: DateTime;
};

export type Collection = {
  id: ID;
  handle: string;
  title: string;
  description: string;
};

export type ProductSortKeys = 'TITLE' | 'PRICE' | 'CREATED_AT' | 'RELEVANCE';

export type ProductsQueryArgs = {
  first?: number;
  after?: string | null;
  /** Shopify-style search string. Supported terms: free text, `product_type:<value>`, `tag:<value>`, `available_for_sale:true`. */
  query?: string;
  sortKey?: ProductSortKeys;
  reverse?: boolean;
  /** Collection handle filter (Storefront: `collection(handle).products`). */
  collection?: string;
};

// ---------------------------------------------------------------------------
// Cart

export type CartLineCost = {
  amountPerQuantity: MoneyV2;
  compareAtAmountPerQuantity: MoneyV2 | null;
  subtotalAmount: MoneyV2;
  totalAmount: MoneyV2;
};

export type CartLine = {
  id: ID;
  quantity: number;
  merchandise: ProductVariant;
  cost: CartLineCost;
  attributes: Attribute[];
  /**
   * Crater addition (no Storefront equivalent): the unit price the shopper was
   * shown when the line was added, updated, or last acknowledged. When it differs
   * from `cost.amountPerQuantity`, the price changed since the shopper saw it.
   */
  priceAtAdd: MoneyV2;
};

export type Attribute = { key: string; value: string };

/**
 * Totals are authoritative server calculations. Tax and shipping are decided at
 * Stripe Checkout, so they are null here (Storefront: `totalTaxAmount` may be null).
 */
export type CartCost = {
  subtotalAmount: MoneyV2;
  /** Subtotal plus tax when a ship-to province is set; otherwise equals the subtotal. */
  totalAmount: MoneyV2;
  /** Null until the shopper picks a ship-to province (taxes depend on it). */
  totalTaxAmount: MoneyV2 | null;
  /** Crater addition: per-tax breakdown for the chosen province (e.g. GST 5%, PST 6%). Empty when unknown. */
  taxLines: TaxLine[];
  checkoutChargeAmount: MoneyV2;
};

/** Canadian province/territory code (ISO 3166-2 suffix). */
export type ProvinceCode = 'AB' | 'BC' | 'MB' | 'NB' | 'NL' | 'NS' | 'NT' | 'NU' | 'ON' | 'PE' | 'QC' | 'SK' | 'YT';

/** Crater addition: one tax component, computed by Crater and charged by Stripe with a fixed tax rate. */
export type TaxLine = {
  /** Stable key, e.g. "CA_GST", "CA_HST_ON", "SK_PST". */
  key: string;
  /** Shopper-facing label, e.g. "GST", "HST (Ontario)", "PST (Saskatchewan)". */
  title: string;
  /** Percentage as a decimal string, e.g. "5", "9.975". */
  ratePercent: string;
  amount: MoneyV2;
};

export type CartBuyerIdentity = {
  email: string | null;
  countryCode: string | null;
  /** Crater addition: ship-to province chosen in the bag; drives tax. Checkout requires it. */
  provinceCode: ProvinceCode | null;
};

export type Cart = {
  id: ID;
  /** Our route that creates a Stripe Checkout Session for this cart (POST). Never a Stripe URL. */
  checkoutUrl: string;
  createdAt: DateTime;
  updatedAt: DateTime;
  totalQuantity: number;
  lines: Connection<CartLine>;
  cost: CartCost;
  buyerIdentity: CartBuyerIdentity;
  note: string | null;
  attributes: Attribute[];
  /** Crater addition: true when any line's current unit price differs from `priceAtAdd`. */
  hasPriceChanges: boolean;
};

export type CartLineInput = {
  merchandiseId: ID;
  quantity?: number; // default 1
  attributes?: Attribute[];
};

export type CartLineUpdateInput = {
  id: ID;
  quantity?: number; // 0 removes the line
  merchandiseId?: ID;
  attributes?: Attribute[];
};

export type CartInput = {
  lines?: CartLineInput[];
  buyerIdentity?: Partial<CartBuyerIdentity>;
  note?: string;
  attributes?: Attribute[];
};

/** Subset of Storefront `CartErrorCode` that this backend can emit. */
export type CartErrorCode =
  | 'INVALID'
  | 'LESS_THAN'
  | 'GREATER_THAN'
  | 'INVALID_MERCHANDISE_LINE'
  | 'MERCHANDISE_NOT_FOUND'
  | 'MISSING_CART'
  | 'INVALID_QUANTITY';

export type CartUserError = {
  code: CartErrorCode;
  /** Path to the input field, e.g. ["lines", "0", "quantity"]. */
  field: string[] | null;
  message: string;
};

/** Subset of Storefront `CartWarningCode`: the mutation succeeded with an adjustment. */
export type CartWarningCode = 'MERCHANDISE_NOT_ENOUGH_STOCK' | 'MERCHANDISE_OUT_OF_STOCK';

export type CartWarning = {
  code: CartWarningCode;
  message: string;
  target: ID;
};

/** Every cart mutation returns this payload, as in the Storefront API. */
export type CartMutationPayload = {
  cart: Cart | null;
  userErrors: CartUserError[];
  warnings: CartWarning[];
};

// ---------------------------------------------------------------------------
// Checkout and orders (Crater additions; Shopify hosts these itself)

export type CheckoutSessionResult =
  | { ok: true; redirectUrl: string }
  | {
      ok: false;
      /** PRICE_CHANGED: a line's price changed since the shopper saw it; they must review it first. */
      /** PROVINCE_REQUIRED: the shopper must pick a ship-to province (tax depends on it) before checkout. */
      code: 'FIXTURE_MODE' | 'EMPTY_CART' | 'CART_INVALID' | 'PRICE_CHANGED' | 'PROVINCE_REQUIRED' | 'PAYMENT_PROVIDER_UNAVAILABLE';
      message: string;
    };

export type OrderFinancialStatus = 'PENDING' | 'PAID' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'VOIDED';

export type OrderLineItem = {
  title: string;
  variantTitle: string;
  sku: string;
  quantity: number;
  originalUnitPrice: MoneyV2;
  originalTotalPrice: MoneyV2;
  variantId: ID;
};

export type Order = {
  id: ID;
  /** Human-facing number, e.g. "#1001". */
  name: string;
  email: string | null;
  processedAt: DateTime;
  financialStatus: OrderFinancialStatus;
  currencyCode: CurrencyCode;
  subtotalPrice: MoneyV2;
  totalShippingPrice: MoneyV2;
  totalTax: MoneyV2;
  totalPrice: MoneyV2;
  lineItems: OrderLineItem[];
  /** Stripe Checkout Session ID; never shown to shoppers. */
  paymentReference: string;
};

// ---------------------------------------------------------------------------
// Service contract (server-only). UI code calls this through `getStorefront()`.

export interface Storefront {
  /** Storefront `products(first, after, query, sortKey, reverse)`. */
  products(args?: ProductsQueryArgs): Promise<Connection<Product>>;
  /** Storefront `product(handle:)`. Null when missing. */
  product(args: { handle: string }): Promise<Product | null>;
  /** Storefront `Product.variantBySelectedOptions`. Null when no variant matches. */
  variantBySelectedOptions(args: { handle: string; selectedOptions: SelectedOption[] }): Promise<ProductVariant | null>;
  collections(): Promise<Collection[]>;

  /** Storefront `cart(id:)`. Null for unknown, expired, or completed carts. */
  cart(args: { id: ID }): Promise<Cart | null>;
  cartCreate(args: { input?: CartInput }): Promise<CartMutationPayload>;
  cartLinesAdd(args: { cartId: ID; lines: CartLineInput[] }): Promise<CartMutationPayload>;
  cartLinesUpdate(args: { cartId: ID; lines: CartLineUpdateInput[] }): Promise<CartMutationPayload>;
  cartLinesRemove(args: { cartId: ID; lineIds: ID[] }): Promise<CartMutationPayload>;
  cartBuyerIdentityUpdate(args: { cartId: ID; buyerIdentity: Partial<CartBuyerIdentity> }): Promise<CartMutationPayload>;
  cartNoteUpdate(args: { cartId: ID; note: string }): Promise<CartMutationPayload>;
  /**
   * Crater addition: the shopper has seen the current prices; set every line's
   * `priceAtAdd` to its current unit price. Returns MISSING_CART like other mutations.
   */
  cartPriceChangesAcknowledge(args: { cartId: ID }): Promise<CartMutationPayload>;
}
