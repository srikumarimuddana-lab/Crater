/**
 * SHOP MICROCOPY (preview). Canadian English. Owned by the business analyst;
 * the contract and acceptance criteria live in docs/shop-requirements.md.
 *
 * Rules for every string here:
 * - No exclamation marks, urgency pressure, discounts, claims, or reviews.
 * - Nothing states a business policy (tax, shipping, returns, contact). Those are
 *   owner decisions; strings that touch them stay neutral and are tagged OWNER.
 * - Stock numbers are only ever the backend's real `quantityAvailable`.
 * - UI should map error CODES to this copy and not render the server `message`.
 *
 * Only tiny formatters live here. No imports except types.
 */
import type { CartErrorCode, CartWarningCode, CheckoutSessionResult, MoneyV2 } from '@/lib/commerce/types';

// ---------------------------------------------------------------------------
// Formatters

/** "$68.00 CAD", the same shape as the Price component. Amounts are decimal strings. */
export function formatPrice(money: MoneyV2): string {
  const n = Number(money.amount);
  const text = Number.isFinite(n)
    ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: money.currencyCode, currencyDisplay: 'narrowSymbol' }).format(n)
    : money.amount;
  return `${text} ${money.currencyCode}`;
}

const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
const name = (title: string, variantTitle?: string) => (variantTitle ? `${title}, ${variantTitle}` : title);

// ---------------------------------------------------------------------------
// Preview and mode markers

export const previewCopy = {
  bannerSample: 'Preview — sample products, not for sale.',
  sampleChip: 'Sample product',
  samplePriceLabel: 'Sample price',
  imagePlaceholderCaption: 'Illustration placeholder, not a product photo.',
} as const;

/** Exact text requested for Stripe test mode. */
export const stripeTestModeBanner = 'Test mode — use Stripe test card 4242 4242 4242 4242; no real charge';

export const fixtureCheckout = {
  heading: 'Checkout is switched off in preview',
  body: 'This is a preview store with sample products. Checkout is not connected, no payment can be taken, and nothing can be ordered.',
  action: 'Back to your bag',
} as const;

// ---------------------------------------------------------------------------
// Browse and filter

export const browse = {
  filterLabel: 'Filter by collection',
  allChip: 'All',
  viewProduct: (title: string) => `View ${title}`,
  sortLabel: 'Sort by',
  sortApply: 'Apply',
  sortOptions: { featured: 'Featured', title: 'Name', 'price-asc': 'Price, low to high', 'price-desc': 'Price, high to low' },
  count: (n: number) => (n === 1 ? '1 product' : `${n} products`),
  emptyCollection: 'There are no products in this collection yet.',
  listLoadError: 'We could not load the collection. Please refresh the page.',
} as const;

// ---------------------------------------------------------------------------
// Product page

export const productPage = {
  priceLabel: 'Price',
  /** `optionName` comes from the product ("Size", "Shade"). */
  optionLegend: (optionName: string) => `Choose a ${optionName.toLowerCase()}`,
  selectedOption: (optionName: string, value: string) => `${optionName}: ${value}`,
  optionUnavailableSuffix: 'currently unavailable',
  optionValueLabel: (value: string, available: boolean) => (available ? value : `${value}, currently unavailable`),
  variantUnavailable: (variantTitle: string) => `${variantTitle} is currently unavailable. Please choose another option.`,
  allUnavailable: 'This product is currently unavailable.',
  /** Shown when the URL names an option combination that does not exist. */
  variantNotFound: 'That option is not available for this product. The default option is shown instead.',
  quantityLabel: 'Quantity',
  quantityHint: (max: number) => `Up to ${max} per order line.`,
  galleryLabel: 'Product images',
  imageCount: (index: number, total: number) => `Image ${index} of ${total}`,
  breadcrumbLabel: 'Breadcrumb',
  backToCollection: 'Back to the collection',
  notFoundHeading: 'We could not find that product',
  notFoundBody: 'The link may be out of date. The collection lists everything that is currently available.',
  notFoundAction: 'Browse the collection',
  soldOut: 'Sold out',
  sizeCount: (n: number) => `${n} sizes`,
  fromPrice: 'From',
  shopAll: 'Shop all',
  keyFacts: 'Key facts',
  sizeFact: 'Size',
  categoryFact: 'Category',
} as const;

/**
 * PROPOSED display threshold, pending an owner decision (see shop-requirements.md).
 * Low-stock text appears only when quantityAvailable is a number from 1 to this value.
 */
export const LOW_STOCK_DISPLAY_THRESHOLD_PROPOSED = 5;

/**
 * Calm low-stock line from the REAL quantity. Returns null (show nothing) when stock is not
 * tracked (null), is zero (use unavailable copy), or is above the threshold.
 */
export function lowStockText(quantityAvailable: number | null, threshold: number = LOW_STOCK_DISPLAY_THRESHOLD_PROPOSED): string | null {
  if (quantityAvailable === null || !Number.isInteger(quantityAvailable)) return null;
  if (quantityAvailable < 1 || quantityAvailable > threshold) return null;
  return `Low stock: ${quantityAvailable} available`;
}

/** Details sections. Every section is preview copy until the brand supplies verified content. */
export const detailsSections = {
  benefits: { heading: 'Benefits', disclaimer: 'Preview copy. Not an approved claim.' },
  ingredients: { heading: 'Ingredients', disclaimer: 'Preview copy. The brand has not yet supplied the ingredient list.' },
  howToUse: { heading: 'How to use', disclaimer: 'Preview copy. Directions are pending approval.' },
  precautions: { heading: 'Precautions', disclaimer: 'Preview copy. Precautions are pending approval; do not rely on this text.' },
  shippingReturns: {
    heading: 'Shipping & returns',
    disclaimer: 'Preview copy. Shipping and returns policies have not been set for this preview store.',
    body: 'Shipping and returns details will be added before launch.',
  },
  sectionNote: 'Sample product details are placeholders and are not product information.',
} as const;

// ---------------------------------------------------------------------------
// Add to bag

export const addToBag = {
  idle: 'Add to bag',
  pending: 'Adding to bag…',
  added: 'Added to bag',
  unavailable: 'Currently unavailable',
  /** Accessible name, so several buttons on one page stay distinguishable. */
  label: (title: string, variantTitle?: string) => `Add ${name(title, variantTitle)} to bag`,
  /** Polite live-region announcement after a successful add. */
  announceAdded: (title: string, variantTitle: string | undefined, quantity: number) =>
    `${quantity > 1 ? `${quantity} × ` : ''}${name(title, variantTitle)} added to your bag.`,
  /** Second click while a request is in flight is ignored, not queued. */
  inProgress: 'Adding this item. Please wait a moment.',
  viewBag: 'View bag',
} as const;

// ---------------------------------------------------------------------------
// Bag (drawer and /cart page)

export const bag = {
  title: 'Your bag',
  /** Header trigger button name. */
  openLabel: (totalQuantity: number) => (totalQuantity > 0 ? `Open bag, ${items(totalQuantity)}` : 'Open bag, empty'),
  countBadgeLabel: (totalQuantity: number) => items(totalQuantity),
  closeLabel: 'Close bag',
  emptyHeading: 'Your bag is empty',
  emptyBody: 'Items you add will appear here.',
  continueShopping: 'Continue shopping',
  viewFullBag: 'View full bag',
  subtotal: 'Subtotal',
  /** OWNER: tax and shipping policy is undecided; this line makes no promise about either. */
  taxShippingNote: 'Taxes and shipping are confirmed at checkout.',
  checkout: 'Checkout',
  checkoutPending: 'Preparing checkout…',
  lineTotal: 'Line total',
  unitPrice: 'Each',
  loading: 'Updating your bag…',
  sampleNote: 'Sample items. This is a preview store.',
  /** Page-level regions. */
  linesLabel: 'Items in your bag',
  summaryLabel: 'Order summary',
} as const;

export const quantity = {
  increase: (title: string, variantTitle?: string) => `Increase quantity of ${name(title, variantTitle)}`,
  decrease: (title: string, variantTitle?: string) => `Decrease quantity of ${name(title, variantTitle)}`,
  remove: (title: string, variantTitle?: string) => `Remove ${name(title, variantTitle)} from bag`,
  input: (title: string, variantTitle?: string) => `Quantity of ${name(title, variantTitle)}`,
  /** Visible labels for the no-JavaScript /cart form. */
  updateButton: 'Update quantity',
  removeButton: 'Remove',
  atMaximum: (max: number) => `You have reached the limit of ${max} for this item.`,
  announceUpdated: (title: string, variantTitle: string | undefined, newQuantity: number) =>
    `Quantity of ${name(title, variantTitle)} is now ${newQuantity}.`,
  announceRemoved: (title: string, variantTitle?: string) => `${name(title, variantTitle)} removed from your bag.`,
  announceSubtotal: (subtotal: MoneyV2) => `Subtotal is now ${formatPrice(subtotal)}.`,
} as const;

// ---------------------------------------------------------------------------
// Cart userErrors: mapped by CartUserError.code (the server `message` is not shown).

export const cartErrors: Record<CartErrorCode, string> = {
  INVALID: 'We could not make that change. Please check your selection and try again.',
  LESS_THAN: 'Please choose a quantity of at least 1, or remove the item.',
  GREATER_THAN: 'That is more than can be added for one item. Please choose a smaller quantity.',
  INVALID_MERCHANDISE_LINE: 'That item is no longer in your bag. We have refreshed your bag.',
  MERCHANDISE_NOT_FOUND: 'This product is no longer available.',
  MISSING_CART: 'Your bag has expired or could not be found. Please add your items again.',
  INVALID_QUANTITY: 'Please enter the quantity as a whole number.',
};

/** Cart warnings: the change succeeded with an adjustment. `productName` is the product title. */
export const cartWarnings: Record<CartWarningCode, (productName: string) => string> = {
  MERCHANDISE_NOT_ENOUGH_STOCK: (productName) =>
    `Only a limited quantity of ${productName} is available, so we adjusted the quantity in your bag.`,
  MERCHANDISE_OUT_OF_STOCK: (productName) => `${productName} is out of stock right now. Please review your bag.`,
};

// ---------------------------------------------------------------------------
// Checkout start failures and return states

/** `FORBIDDEN` is emitted by the /api/checkout route only (cross-site request). */
export type CheckoutFailureCode = Extract<CheckoutSessionResult, { ok: false }>['code'] | 'FORBIDDEN';

export const checkoutErrors: Record<CheckoutFailureCode, string> = {
  FIXTURE_MODE: `${fixtureCheckout.heading}. ${fixtureCheckout.body}`,
  EMPTY_CART: 'Your bag is empty. Add an item before checking out.',
  CART_INVALID: 'Some items in your bag are no longer available in the quantity requested. Please review your bag and try again.',
  PAYMENT_PROVIDER_UNAVAILABLE: 'Checkout is temporarily unavailable. Your bag is saved. Please try again in a moment.',
  FORBIDDEN: 'We could not start checkout from here. Please open your bag on this site and try again.',
};

/** Shown for an unrecognised `?checkout_error=` value. */
export const checkoutErrorFallback = 'We could not start checkout. Your bag is saved. Please try again.';

export function checkoutErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return Object.prototype.hasOwnProperty.call(checkoutErrors, code) ? checkoutErrors[code as CheckoutFailureCode] : checkoutErrorFallback;
}

export const checkoutCancelled = {
  heading: 'Checkout was cancelled',
  body: 'No payment was taken and your bag is unchanged.',
} as const;

// ---------------------------------------------------------------------------
// Confirmation page: /checkout/success

export type CheckoutResultStatus = 'paid' | 'processing' | 'unpaid' | 'not_found';

/** OWNER: the contact address is undecided. Never print a made-up address. */
export const contactLine = (email: string | null): string =>
  email ? `If you need help, write to ${email}.` : 'If you need help, use the contact details that will be added to this site before launch.';

export const confirmation = {
  paid: {
    heading: 'Thank you. Your order is confirmed',
    orderNumberLabel: 'Order number',
    itemsLabel: 'Items ordered',
    subtotal: 'Subtotal',
    shipping: 'Shipping',
    tax: 'Taxes',
    total: 'Total',
    keepNumber: 'Keep this order number for any questions about your order.',
    continueShopping: 'Continue shopping',
    testOrderNote: 'This was a test payment. No real charge was made and nothing will be shipped.',
    fixtureOrderNote: 'This is a sample order from a preview store.',
  },
  processing: {
    heading: 'We are confirming your payment',
    body: 'Your payment has not been matched to an order yet. This can take a short while. Please refresh this page in a minute, and do not pay again.',
    refresh: 'Refresh this page',
  },
  unpaid: {
    heading: 'Payment was not completed',
    body: 'No order was created from this attempt. You can return to your bag and try again.',
    action: 'Return to your bag',
  },
  not_found: {
    heading: 'We could not find that order',
    body: 'The link may be incomplete or out of date. If you believe a payment was completed, please contact us and do not pay again.',
    action: 'Continue shopping',
  },
} as const satisfies Record<'paid' | CheckoutResultStatus, unknown>;

// ---------------------------------------------------------------------------
// Recovery

export const recovery = {
  networkError: 'We could not reach the store. Please check your connection and try again.',
  serverError: 'Something went wrong on our side. Please try again in a moment.',
  retry: 'Try again',
  cartExpiredHeading: 'Your bag has expired',
  cartExpiredBody: 'Bags are kept for a limited time. Please add your items again.',
  /** Shown when a refreshed bag has a different unit price than the one the shopper saw. */
  priceChanged: (title: string, was: MoneyV2, now: MoneyV2) =>
    `The price of ${title} changed from ${formatPrice(was)} to ${formatPrice(now)}. Please review your bag.`,
  priceChangedGeneric: 'Some prices in your bag have changed. Please review your subtotal before checking out.',
  itemUnavailable: (title: string) => `${title} is no longer available and was removed from your bag.`,
  /** A timed-out add may or may not have succeeded; never replay it silently. */
  addUncertain: 'We could not confirm that this item was added. Please check your bag before adding it again.',
  errorPageHeading: 'Something went wrong',
  errorPageBody: 'Please try again, or return to the collection.',
  errorPageHome: 'Return home',
} as const;
