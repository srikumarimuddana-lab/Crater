import type { CartInput, CartLineInput, CartLineUpdateInput, ProductSortKeys, ProductsQueryArgs } from './types';

/** Request parsing and response helpers shared by the /api routes. */

export class BadRequest extends Error {}

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } as const;
const PUBLIC_HEADERS = { 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=120' } as const;

export const privateJson = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...PRIVATE_HEADERS, ...extra } });

export const publicJson = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: status === 200 ? PUBLIC_HEADERS : PRIVATE_HEADERS });

export const badRequest = (message = 'Invalid request') => privateJson({ error: message }, 400);

export const methodNotAllowed = (allow: string) =>
  new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { Allow: allow, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * Browsers label cross-site requests with Sec-Fetch-Site. Reject those for state-changing
 * routes (defence in depth on top of SameSite=Lax cookies). Non-browser clients that omit
 * the header are allowed through; they have no ambient cookies to abuse.
 */
export function isCrossSite(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  return site !== null && site !== 'same-origin' && site !== 'none';
}

export const MAX_BODY_BYTES = 16 * 1024;

export async function readJsonBody(request: Request): Promise<unknown> {
  const type = request.headers.get('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(type)) throw new BadRequest('Content-Type must be application/json');
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw new BadRequest('Body too large');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new BadRequest('Body too large');
  if (text.trim() === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequest('Body is not valid JSON');
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function exact(obj: unknown, allowed: readonly string[], what: string): Record<string, unknown> {
  if (!isObject(obj)) throw new BadRequest(`${what} must be an object`);
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) throw new BadRequest(`Unknown field "${key}" in ${what}`);
  return obj;
}

function attributes(v: unknown, what: string) {
  if (!Array.isArray(v) || v.length > 20) throw new BadRequest(`${what} must be a list`);
  return v.map((a) => {
    const o = exact(a, ['key', 'value'], 'attribute');
    if (typeof o.key !== 'string' || typeof o.value !== 'string') throw new BadRequest('attribute key and value must be strings');
    return { key: o.key, value: o.value };
  });
}

function lineList<T>(v: unknown, parse: (x: unknown) => T): T[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > 50) throw new BadRequest('lines must be a list of 1 to 50 items');
  return v.map(parse);
}

const parseLineInput = (x: unknown): CartLineInput => {
  const o = exact(x, ['merchandiseId', 'quantity', 'attributes'], 'line');
  if (typeof o.merchandiseId !== 'string' || o.merchandiseId.length > 100) throw new BadRequest('merchandiseId must be a string');
  if (o.quantity !== undefined && typeof o.quantity !== 'number') throw new BadRequest('quantity must be a number');
  return {
    merchandiseId: o.merchandiseId,
    ...(o.quantity !== undefined ? { quantity: o.quantity as number } : {}),
    ...(o.attributes !== undefined ? { attributes: attributes(o.attributes, 'attributes') } : {}),
  };
};

const parseLineUpdate = (x: unknown): CartLineUpdateInput => {
  const o = exact(x, ['id', 'quantity', 'merchandiseId', 'attributes'], 'line');
  if (typeof o.id !== 'string' || o.id.length > 100) throw new BadRequest('id must be a string');
  if (o.quantity !== undefined && typeof o.quantity !== 'number') throw new BadRequest('quantity must be a number');
  if (o.merchandiseId !== undefined && (typeof o.merchandiseId !== 'string' || o.merchandiseId.length > 100)) {
    throw new BadRequest('merchandiseId must be a string');
  }
  return {
    id: o.id,
    ...(o.quantity !== undefined ? { quantity: o.quantity as number } : {}),
    ...(o.merchandiseId !== undefined ? { merchandiseId: o.merchandiseId as string } : {}),
    ...(o.attributes !== undefined ? { attributes: attributes(o.attributes, 'attributes') } : {}),
  };
};

/** POST /api/storefront/cart body: a CartInput (all fields optional). */
export function parseCartInput(body: unknown): CartInput {
  if (body === undefined) return {};
  const o = exact(body, ['lines', 'buyerIdentity', 'note', 'attributes'], 'cart input');
  const out: CartInput = {};
  if (o.lines !== undefined) out.lines = lineList(o.lines, parseLineInput);
  if (o.note !== undefined) {
    if (typeof o.note !== 'string') throw new BadRequest('note must be a string');
    out.note = o.note;
  }
  if (o.attributes !== undefined) out.attributes = attributes(o.attributes, 'attributes');
  if (o.buyerIdentity !== undefined) {
    out.buyerIdentity = parseBuyerIdentity(o.buyerIdentity);
  }
  return out;
}

/** buyerIdentity object: shape only. Values (email format, country, province code) are validated by the cart layer as userErrors. */
export function parseBuyerIdentity(value: unknown): NonNullable<CartInput['buyerIdentity']> {
  const b = exact(value, ['email', 'countryCode', 'provinceCode'], 'buyerIdentity');
  for (const k of ['email', 'countryCode', 'provinceCode'] as const) {
    if (b[k] !== undefined && b[k] !== null && typeof b[k] !== 'string') throw new BadRequest(`${k} must be a string or null`);
    if (typeof b[k] === 'string' && (b[k] as string).length > 254) throw new BadRequest(`${k} is too long`);
  }
  return b as NonNullable<CartInput['buyerIdentity']>;
}

/** PATCH /api/storefront/cart body: { buyerIdentity: { email?, countryCode?, provinceCode? } }. */
export function parseBuyerIdentityBody(body: unknown): { buyerIdentity: NonNullable<CartInput['buyerIdentity']> } {
  const o = exact(body, ['buyerIdentity'], 'body');
  if (o.buyerIdentity === undefined) throw new BadRequest('buyerIdentity is required');
  return { buyerIdentity: parseBuyerIdentity(o.buyerIdentity) };
}

export function parseAddBody(body: unknown): { lines: CartLineInput[] } {
  return { lines: lineList(exact(body, ['lines'], 'body').lines, parseLineInput) };
}

export function parseUpdateBody(body: unknown): { lines: CartLineUpdateInput[] } {
  return { lines: lineList(exact(body, ['lines'], 'body').lines, parseLineUpdate) };
}

export function parseRemoveBody(body: unknown): { lineIds: string[] } {
  const ids = exact(body, ['lineIds'], 'body').lineIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50 || ids.some((i) => typeof i !== 'string' || i.length > 100)) {
    throw new BadRequest('lineIds must be a list of 1 to 50 strings');
  }
  return { lineIds: ids as string[] };
}

const SORT_KEYS: readonly ProductSortKeys[] = ['TITLE', 'PRICE', 'CREATED_AT', 'RELEVANCE'];
export const HANDLE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseProductsQuery(params: URLSearchParams): ProductsQueryArgs {
  const allowed = new Set(['first', 'after', 'query', 'sortKey', 'reverse', 'collection']);
  for (const key of params.keys()) if (!allowed.has(key)) throw new BadRequest(`Unknown parameter "${key}"`);
  const args: ProductsQueryArgs = {};
  const first = params.get('first');
  if (first !== null) {
    if (!/^\d{1,3}$/.test(first) || Number(first) < 1 || Number(first) > 50) throw new BadRequest('first must be an integer from 1 to 50');
    args.first = Number(first);
  }
  const after = params.get('after');
  if (after !== null) {
    if (after.length === 0 || after.length > 200) throw new BadRequest('after is not a valid cursor');
    args.after = after;
  }
  const query = params.get('query');
  if (query !== null) {
    if (query.length > 256) throw new BadRequest('query is too long');
    args.query = query;
  }
  const sortKey = params.get('sortKey');
  if (sortKey !== null) {
    if (!SORT_KEYS.includes(sortKey as ProductSortKeys)) throw new BadRequest('sortKey is not supported');
    args.sortKey = sortKey as ProductSortKeys;
  }
  const reverse = params.get('reverse');
  if (reverse !== null) {
    if (reverse !== 'true' && reverse !== 'false') throw new BadRequest('reverse must be true or false');
    args.reverse = reverse === 'true';
  }
  const collection = params.get('collection');
  if (collection !== null) {
    if (!HANDLE.test(collection) || collection.length > 100) throw new BadRequest('collection is not a valid handle');
    args.collection = collection;
  }
  return args;
}
