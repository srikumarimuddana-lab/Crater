import { isVariantAvailable, toVariant, type CatalogIndex } from './catalog';
import { gid, numericId } from './ids';
import { multiplyMinor, sumMinor, toMoney } from './money';
import type { CartLineRecord, CartRecord } from './records';
import type {
  Attribute,
  Cart,
  CartBuyerIdentity,
  CartInput,
  CartLine,
  CartLineInput,
  CartLineUpdateInput,
  CartUserError,
  CartWarning,
  ID,
} from './types';

export const MAX_LINE_QUANTITY = 10;
export const MAX_CART_LINES = 50;
export const CART_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const CHECKOUT_URL = '/api/checkout';
const MAX_NOTE = 5000;
const MAX_ATTRIBUTES = 20;

export type Outcome = {
  /** The next record, or null when nothing should be written. */
  next: CartRecord | null;
  userErrors: CartUserError[];
  warnings: CartWarning[];
};

const err = (code: CartUserError['code'], field: string[] | null, message: string): CartUserError => ({ code, field, message });

export function isCartDead(cart: CartRecord, now: Date): boolean {
  if (cart.completedAt) return true;
  return now.getTime() - new Date(cart.updatedAt).getTime() > CART_TTL_MS;
}

export const lineId = (n: number): ID => gid('CartLine', n);

// ---------------------------------------------------------------------------
// Input validation

function validateAttributes(value: unknown, path: string[], errors: CartUserError[]): Attribute[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ATTRIBUTES) {
    errors.push(err('INVALID', path, 'Attributes must be a list of at most 20 key/value pairs.'));
    return [];
  }
  const out: Attribute[] = [];
  value.forEach((a, i) => {
    const ok =
      a && typeof a === 'object' && typeof (a as Attribute).key === 'string' && typeof (a as Attribute).value === 'string' &&
      (a as Attribute).key.length > 0 && (a as Attribute).key.length <= 64 && (a as Attribute).value.length <= 256;
    if (ok) out.push({ key: (a as Attribute).key, value: (a as Attribute).value });
    else errors.push(err('INVALID', [...path, String(i)], 'Invalid attribute.'));
  });
  return out;
}

/** Quantity rule for add/create: integer 1..10. Update additionally allows 0. */
function checkQuantity(q: unknown, path: string[], allowZero: boolean): CartUserError | null {
  if (typeof q !== 'number' || !Number.isInteger(q)) return err('INVALID', path, 'Quantity must be a whole number.');
  if (q < (allowZero ? 0 : 1)) return err('LESS_THAN', path, `Quantity must be at least ${allowZero ? 0 : 1}.`);
  if (q > MAX_LINE_QUANTITY) return err('GREATER_THAN', path, `Quantity cannot exceed ${MAX_LINE_QUANTITY} per line.`);
  return null;
}

function lookupVariant(index: CatalogIndex, merchandiseId: unknown, path: string[], errors: CartUserError[]) {
  const found = numericId(merchandiseId, 'ProductVariant') !== null ? index.variants.get(merchandiseId as ID) : undefined;
  if (!found) errors.push(err('MERCHANDISE_NOT_FOUND', path, 'The product variant could not be found.'));
  return found;
}

// ---------------------------------------------------------------------------
// Stock rule shared by add and update.
// `current` is the quantity already in the cart for this variant, `desired` the new target.
// Quantity may never be pushed above what is available; it can stay where it is or go down.

function applyStock(
  variantQuantity: number | null,
  current: number,
  desired: number,
): { quantity: number; shortage: 'NONE' | 'OUT_OF_STOCK' | 'NOT_ENOUGH_STOCK' } {
  if (variantQuantity === null) return { quantity: desired, shortage: 'NONE' };
  const quantity = Math.min(desired, Math.max(variantQuantity, current));
  if (quantity >= desired) return { quantity, shortage: 'NONE' };
  return { quantity, shortage: variantQuantity <= 0 ? 'OUT_OF_STOCK' : 'NOT_ENOUGH_STOCK' };
}

const stockMessage = (title: string, shortage: 'OUT_OF_STOCK' | 'NOT_ENOUGH_STOCK') =>
  shortage === 'OUT_OF_STOCK'
    ? `${title} is out of stock.`
    : `Only a limited quantity of ${title} is available; the quantity was reduced.`;

// ---------------------------------------------------------------------------
// Mutations. Each works on a copy and is all-or-nothing with respect to userErrors.

function cloneCart(cart: CartRecord): CartRecord {
  return structuredClone(cart);
}

function addInto(
  next: CartRecord,
  inputs: CartLineInput[],
  index: CatalogIndex,
  basePath: string[],
  userErrors: CartUserError[],
  warnings: CartWarning[],
) {
  inputs.forEach((input, i) => {
    const path = [...basePath, String(i)];
    const rawQuantity: unknown = input?.quantity === undefined ? 1 : input.quantity;
    const qErr = checkQuantity(rawQuantity, [...path, 'quantity'], false);
    if (qErr) userErrors.push(qErr);
    const attributes = validateAttributes(input?.attributes, [...path, 'attributes'], userErrors);
    const found = lookupVariant(index, input?.merchandiseId, [...path, 'merchandiseId'], userErrors);
    if (qErr || !found) return;
    const quantity = rawQuantity as number;

    const { variant, product } = found;
    const existing = next.lines.find((l) => l.variantId === variant.id);
    const current = existing?.quantity ?? 0;
    const desired = current + quantity;
    if (desired > MAX_LINE_QUANTITY) {
      userErrors.push(err('GREATER_THAN', [...path, 'quantity'], `A line cannot hold more than ${MAX_LINE_QUANTITY} of one item.`));
      return;
    }
    const stock = applyStock(variant.quantity, current, desired);
    if (stock.shortage === 'OUT_OF_STOCK' && !existing) {
      warnings.push({ code: 'MERCHANDISE_OUT_OF_STOCK', message: stockMessage(product.title, 'OUT_OF_STOCK'), target: variant.id });
      return;
    }
    let line: CartLineRecord;
    if (existing) {
      existing.quantity = stock.quantity;
      // The shopper just saw the current price on the product page: re-baseline it.
      existing.priceAtAddMinor = variant.priceMinor;
      if (input.attributes !== undefined) existing.attributes = attributes;
      line = existing;
    } else {
      line = { n: ++next.lineSeq, variantId: variant.id, quantity: stock.quantity, attributes, priceAtAddMinor: variant.priceMinor };
      next.lines.push(line);
    }
    if (stock.shortage !== 'NONE') {
      warnings.push({
        code: stock.shortage === 'OUT_OF_STOCK' ? 'MERCHANDISE_OUT_OF_STOCK' : 'MERCHANDISE_NOT_ENOUGH_STOCK',
        message: stockMessage(product.title, stock.shortage),
        target: stock.shortage === 'OUT_OF_STOCK' ? variant.id : lineId(line.n),
      });
    }
  });
  if (next.lines.length > MAX_CART_LINES) {
    userErrors.push(err('INVALID', basePath, `A cart can hold at most ${MAX_CART_LINES} lines.`));
  }
}

function finish(next: CartRecord, now: Date, userErrors: CartUserError[], warnings: CartWarning[]): Outcome {
  if (userErrors.length) return { next: null, userErrors, warnings: [] };
  next.updatedAt = now.toISOString();
  return { next, userErrors, warnings };
}

export function applyLinesAdd(cart: CartRecord, lines: CartLineInput[], index: CatalogIndex, now: Date): Outcome {
  const next = cloneCart(cart);
  const userErrors: CartUserError[] = [];
  const warnings: CartWarning[] = [];
  if (!Array.isArray(lines) || lines.length === 0) {
    return { next: null, userErrors: [err('INVALID', ['lines'], 'At least one line is required.')], warnings };
  }
  addInto(next, lines, index, ['lines'], userErrors, warnings);
  return finish(next, now, userErrors, warnings);
}

export function applyLinesUpdate(cart: CartRecord, lines: CartLineUpdateInput[], index: CatalogIndex, now: Date): Outcome {
  const next = cloneCart(cart);
  const userErrors: CartUserError[] = [];
  const warnings: CartWarning[] = [];
  if (!Array.isArray(lines) || lines.length === 0) {
    return { next: null, userErrors: [err('INVALID', ['lines'], 'At least one line is required.')], warnings };
  }
  lines.forEach((input, i) => {
    const path = ['lines', String(i)];
    const n = numericId(input?.id, 'CartLine');
    const line = n === null ? undefined : next.lines.find((l) => l.n === n);
    if (!line) {
      userErrors.push(err('INVALID_MERCHANDISE_LINE', [...path, 'id'], 'The cart line could not be found.'));
      return;
    }
    let ok = true;
    if (input.quantity !== undefined) {
      const qErr = checkQuantity(input.quantity, [...path, 'quantity'], true);
      if (qErr) { userErrors.push(qErr); ok = false; }
    }
    let attributes: Attribute[] | undefined;
    if (input.attributes !== undefined) attributes = validateAttributes(input.attributes, [...path, 'attributes'], userErrors);
    const newVariant = input.merchandiseId !== undefined ? lookupVariant(index, input.merchandiseId, [...path, 'merchandiseId'], userErrors) : undefined;
    if (input.merchandiseId !== undefined && !newVariant) ok = false;
    if (!ok) return;

    const target = newVariant ?? index.variants.get(line.variantId);
    const switching = Boolean(newVariant && newVariant.variant.id !== line.variantId);
    const desired = input.quantity ?? line.quantity;
    if (desired === 0) {
      next.lines = next.lines.filter((l) => l !== line);
      return;
    }
    if (!target) {
      // The catalog no longer has this variant: it cannot be increased, only reduced or removed.
      if (desired <= line.quantity) line.quantity = desired;
      else userErrors.push(err('MERCHANDISE_NOT_FOUND', [...path, 'quantity'], 'The product variant could not be found.'));
      if (attributes) line.attributes = attributes;
      return;
    }
    // Switching to a variant that already has a line merges into that line.
    const other = switching ? next.lines.find((l) => l !== line && l.variantId === target.variant.id) : undefined;
    const current = other ? other.quantity : switching ? 0 : line.quantity;
    const wanted = other ? other.quantity + desired : desired;
    if (wanted > MAX_LINE_QUANTITY) {
      userErrors.push(err('GREATER_THAN', [...path, 'quantity'], `A line cannot hold more than ${MAX_LINE_QUANTITY} of one item.`));
      return;
    }
    const stock = applyStock(target.variant.quantity, current, wanted);
    if (stock.quantity <= 0) {
      // Switching to an out-of-stock variant leaves the line untouched.
      warnings.push({ code: 'MERCHANDISE_OUT_OF_STOCK', message: stockMessage(target.product.title, 'OUT_OF_STOCK'), target: target.variant.id });
      return;
    }
    const kept = other ?? line;
    if (other) {
      other.quantity = stock.quantity;
      if (attributes) other.attributes = attributes;
      next.lines = next.lines.filter((l) => l !== line);
    } else {
      line.variantId = target.variant.id;
      line.quantity = stock.quantity;
      // A different variant was chosen on screen; its current price is what the shopper saw.
      if (switching) line.priceAtAddMinor = target.variant.priceMinor;
      if (attributes) line.attributes = attributes;
    }
    if (stock.shortage !== 'NONE') {
      warnings.push({
        code: stock.shortage === 'OUT_OF_STOCK' ? 'MERCHANDISE_OUT_OF_STOCK' : 'MERCHANDISE_NOT_ENOUGH_STOCK',
        message: stockMessage(target.product.title, stock.shortage),
        target: stock.shortage === 'OUT_OF_STOCK' ? target.variant.id : lineId(kept.n),
      });
    }
  });
  return finish(next, now, userErrors, warnings);
}

export function applyLinesRemove(cart: CartRecord, lineIds: ID[], now: Date): Outcome {
  const next = cloneCart(cart);
  const userErrors: CartUserError[] = [];
  if (!Array.isArray(lineIds) || lineIds.length === 0) {
    return { next: null, userErrors: [err('INVALID', ['lineIds'], 'At least one line id is required.')], warnings: [] };
  }
  const remove = new Set<number>();
  lineIds.forEach((id, i) => {
    const n = numericId(id, 'CartLine');
    if (n === null || !next.lines.some((l) => l.n === n)) {
      userErrors.push(err('INVALID_MERCHANDISE_LINE', ['lineIds', String(i)], 'The cart line could not be found.'));
    } else remove.add(n);
  });
  next.lines = next.lines.filter((l) => !remove.has(l.n));
  return finish(next, now, userErrors, []);
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export function validateBuyerIdentity(
  identity: Partial<CartBuyerIdentity> | undefined,
  path: string[],
  errors: CartUserError[],
): Partial<{ email: string | null; countryCode: string | null }> {
  const out: Partial<{ email: string | null; countryCode: string | null }> = {};
  if (identity === undefined) return out;
  if (identity === null || typeof identity !== 'object') {
    errors.push(err('INVALID', path, 'Invalid buyer identity.'));
    return out;
  }
  if (identity.email !== undefined) {
    if (identity.email === null) out.email = null;
    else if (typeof identity.email === 'string' && identity.email.length <= 254 && EMAIL.test(identity.email)) out.email = identity.email;
    else errors.push(err('INVALID', [...path, 'email'], 'The email address is not valid.'));
  }
  if (identity.countryCode !== undefined) {
    if (identity.countryCode === null) out.countryCode = null;
    else if (typeof identity.countryCode === 'string' && /^[A-Z]{2}$/.test(identity.countryCode)) out.countryCode = identity.countryCode;
    else errors.push(err('INVALID', [...path, 'countryCode'], 'The country code must be an ISO 3166 alpha-2 code.'));
  }
  return out;
}

export function validateNote(note: unknown, path: string[], errors: CartUserError[]): string | null {
  if (typeof note !== 'string' || note.length > MAX_NOTE) {
    errors.push(err('INVALID', path, `The note must be text of at most ${MAX_NOTE} characters.`));
    return null;
  }
  return note;
}

/** True when the catalog price of this line differs from the price the shopper last saw. */
export function lineHasPriceChange(line: CartLineRecord, index: CatalogIndex): boolean {
  const found = index.variants.get(line.variantId);
  return Boolean(found) && found!.variant.priceMinor !== line.priceAtAddMinor;
}

/** The shopper has seen the current prices: re-baseline every line. Extends the cart's life like any mutation. */
export function applyPriceAcknowledge(cart: CartRecord, index: CatalogIndex, now: Date): Outcome {
  const next = cloneCart(cart);
  for (const line of next.lines) {
    const found = index.variants.get(line.variantId);
    if (found) line.priceAtAddMinor = found.variant.priceMinor;
  }
  return finish(next, now, [], []);
}

export function applyBuyerIdentity(cart: CartRecord, identity: Partial<CartBuyerIdentity>, now: Date): Outcome {
  const next = cloneCart(cart);
  const userErrors: CartUserError[] = [];
  const v = validateBuyerIdentity(identity, ['buyerIdentity'], userErrors);
  if (v.email !== undefined) next.buyerEmail = v.email;
  if (v.countryCode !== undefined) next.buyerCountry = v.countryCode;
  return finish(next, now, userErrors, []);
}

export function applyNote(cart: CartRecord, note: string, now: Date): Outcome {
  const next = cloneCart(cart);
  const userErrors: CartUserError[] = [];
  const v = validateNote(note, ['note'], userErrors);
  if (!userErrors.length) next.note = v === '' ? null : v;
  return finish(next, now, userErrors, []);
}

/** Build a brand-new record from CartInput. Nothing is persisted when userErrors is non-empty. */
export function buildNewCart(
  id: ID,
  input: CartInput | undefined,
  index: CatalogIndex,
  now: Date,
): { cart: CartRecord | null; userErrors: CartUserError[]; warnings: CartWarning[] } {
  const iso = now.toISOString();
  const cart: CartRecord = {
    id, createdAt: iso, updatedAt: iso, completedAt: null,
    note: null, buyerEmail: null, buyerCountry: null, attributes: [], lineSeq: 0, lines: [],
  };
  const userErrors: CartUserError[] = [];
  const warnings: CartWarning[] = [];
  if (input !== undefined && (input === null || typeof input !== 'object')) {
    return { cart: null, userErrors: [err('INVALID', ['input'], 'Invalid cart input.')], warnings };
  }
  if (input?.lines !== undefined) {
    if (!Array.isArray(input.lines)) userErrors.push(err('INVALID', ['input', 'lines'], 'Lines must be a list.'));
    else addInto(cart, input.lines, index, ['input', 'lines'], userErrors, warnings);
  }
  const identity = validateBuyerIdentity(input?.buyerIdentity, ['input', 'buyerIdentity'], userErrors);
  if (identity.email !== undefined) cart.buyerEmail = identity.email;
  if (identity.countryCode !== undefined) cart.buyerCountry = identity.countryCode;
  if (input?.note !== undefined) cart.note = validateNote(input.note, ['input', 'note'], userErrors) || null;
  if (input?.attributes !== undefined) cart.attributes = validateAttributes(input.attributes, ['input', 'attributes'], userErrors);
  if (userErrors.length) return { cart: null, userErrors, warnings: [] };
  return { cart, userErrors, warnings };
}

// ---------------------------------------------------------------------------
// Read model: always repriced from the current catalog.

export function buildCart(record: CartRecord, index: CatalogIndex): Cart {
  const nodes: CartLine[] = [];
  let subtotal = 0;
  let hasPriceChanges = false;
  for (const line of record.lines) {
    const found = index.variants.get(line.variantId);
    if (!found) continue; // variant removed from the catalog: not purchasable, not shown
    const unit = found.variant.priceMinor;
    const total = multiplyMinor(unit, line.quantity);
    subtotal = sumMinor([subtotal, total]);
    if (unit !== line.priceAtAddMinor) hasPriceChanges = true;
    nodes.push({
      id: lineId(line.n),
      quantity: line.quantity,
      merchandise: toVariant(found.variant, found.product),
      cost: {
        amountPerQuantity: toMoney(unit),
        compareAtAmountPerQuantity: found.variant.compareAtMinor === null ? null : toMoney(found.variant.compareAtMinor),
        subtotalAmount: toMoney(total),
        totalAmount: toMoney(total),
      },
      attributes: line.attributes.map((a) => ({ ...a })),
      priceAtAdd: toMoney(line.priceAtAddMinor),
    });
  }
  return {
    id: record.id,
    checkoutUrl: CHECKOUT_URL,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    totalQuantity: nodes.reduce((sum, n) => sum + n.quantity, 0),
    lines: {
      nodes,
      pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
    },
    cost: {
      subtotalAmount: toMoney(subtotal),
      totalAmount: toMoney(subtotal),
      totalTaxAmount: null,
      checkoutChargeAmount: toMoney(subtotal),
    },
    buyerIdentity: { email: record.buyerEmail, countryCode: record.buyerCountry },
    note: record.note,
    attributes: record.attributes.map((a) => ({ ...a })),
    hasPriceChanges,
  };
}

export { isVariantAvailable };
