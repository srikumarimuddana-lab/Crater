import { CART_TTL_MS } from '@/lib/commerce/cart-logic';
import { MoneyError, parseAmount, toMoney } from '@/lib/commerce/money';
import type { ProductRecord, ProductStatus } from '@/lib/commerce/records';
import type { ID } from '@/lib/commerce/types';
import { toAuditInput } from '../audit';
import { diffProduct, publishChecks, sameInstant } from '../product-logic';
import { gidTail } from '../ids';
import { fieldAccess } from '../permissions';
import type { ProductPatch } from '../records';
import type { AdminProductsQuery, AdminProductSummary, SetStatusInput } from '../service-types';
import type { AdminMutationResult, AdminProduct, AdminSession, AdminVariant, ProductUpdateInput } from '../types';
import { applyProductPatch } from '../product-logic';
import { auditDraft, cleanText, fail, mutateAs, ok, readAs, userError, type Ctx } from './shared';

/** Typo guard on prices and costs (not a business rule): $100,000.00. */
export const MAX_PRICE_MINOR = 10_000_000;
const STATUSES: ProductStatus[] = ['DRAFT', 'ACTIVE', 'ARCHIVED'];

export function shapeProduct(p: ProductRecord, s: AdminSession, committed: Map<ID, number>, carts: Map<ID, number>): AdminProduct {
  const showCost = fieldAccess(s.staff.role).productCost;
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    description: p.description,
    productType: p.productType,
    status: p.status,
    sample: p.sample,
    details: { benefits: [...p.details.benefits], ingredients: [...p.details.ingredients], howToUse: p.details.howToUse, precautions: p.details.precautions },
    images: p.images.map((i) => ({ url: i.url, altText: i.altText })),
    variants: p.variants.map((v): AdminVariant => {
      const available = v.quantity ?? 0; // untracked stock cannot be expressed in AdminVariant; see InventoryLevel.tracked
      const c = committed.get(v.id) ?? 0;
      return {
        id: v.id,
        title: v.title,
        sku: v.sku,
        price: toMoney(v.priceMinor),
        cost: showCost && v.costMinor !== null ? toMoney(v.costMinor) : null,
        available,
        committed: c,
        onHand: available + c,
        lowStockThreshold: v.lowStockThreshold,
        openCartCount: carts.get(v.id) ?? 0,
      };
    }),
    publishChecks: publishChecks(p),
    updatedAt: p.updatedAt,
  };
}

function parseMoneyField(v: unknown, label: string, min: number): { minor: number } | { error: string } {
  try {
    const minor = parseAmount(typeof v === 'string' ? v.trim() : '');
    if (minor < min) return { error: `${label} must be at least ${min === 1 ? '0.01' : '0.00'}.` };
    if (minor > MAX_PRICE_MINOR) return { error: `${label} is too large.` };
    return { minor };
  } catch (e) {
    if (e instanceof MoneyError) return { error: `${label} must be an amount like 24.00.` };
    throw e;
  }
}

export function productsService(ctx: Ctx) {
  const { admin, commerce } = ctx;
  const counts = async () => ({
    committed: await admin.committedByVariant(),
    carts: await commerce.openCartCounts(new Date(ctx.clock().getTime() - CART_TTL_MS)),
  });
  const find = async (id: ID) => {
    const n = gidTail(id, 'Product');
    return n === null ? null : ((await commerce.listProducts({ includeInactive: true })).find((p) => p.id === id) ?? null);
  };

  async function view(p: ProductRecord, s: AdminSession): Promise<AdminProduct> {
    const c = await counts();
    return shapeProduct(p, s, c.committed, c.carts);
  }

  return {
    async list(query: AdminProductsQuery = {}): Promise<AdminProductSummary[]> {
      await readAs(ctx, 'products:read');
      const text = (query.query ?? '').trim().toLowerCase().slice(0, 100);
      return (await commerce.listProducts({ includeInactive: true }))
        .filter((p) => (!query.status || p.status === query.status) && (!text || p.title.toLowerCase().includes(text) || p.variants.some((v) => v.sku.toLowerCase().includes(text))))
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((p): AdminProductSummary => {
          const prices = p.variants.map((v) => v.priceMinor);
          return {
            id: p.id,
            handle: p.handle,
            title: p.title,
            productType: p.productType,
            status: p.status,
            sample: p.sample,
            variantCount: p.variants.length,
            available: p.variants.reduce((n, v) => n + (v.quantity ?? 0), 0),
            priceFrom: prices.length ? toMoney(Math.min(...prices)) : null,
            priceTo: prices.length ? toMoney(Math.max(...prices)) : null,
            publishable: publishChecks(p).every((c) => c.passed),
            updatedAt: p.updatedAt,
          };
        });
    },

    async get(id: ID): Promise<AdminProduct | null> {
      const s = await readAs(ctx, 'products:read');
      const p = await find(id);
      return p ? view(p, s) : null;
    },

    async update(input: ProductUpdateInput): Promise<AdminMutationResult<AdminProduct>> {
      return mutateAs(ctx, 'products:write', async (s, at) => {
        const n = gidTail(input?.id, 'Product');
        if (n === null) return fail(userError('NOT_FOUND', ['id'], 'Product not found.'));
        if (typeof input.expectedUpdatedAt !== 'string' || Number.isNaN(Date.parse(input.expectedUpdatedAt))) {
          return fail(userError('INVALID', ['expectedUpdatedAt'], 'expectedUpdatedAt is required.'));
        }
        const patch: ProductPatch = {};
        const bad = (field: string[], message: string) => fail<AdminProduct>(userError('INVALID', field, message));
        if (input.title !== undefined) {
          const c = cleanText(input.title, 'Title', { min: 1, max: 200 });
          if ('error' in c) return bad(['title'], c.error);
          patch.title = c.value;
        }
        if (input.description !== undefined) {
          const c = cleanText(input.description, 'Description', { max: 5000, multiline: true });
          if ('error' in c) return bad(['description'], c.error);
          patch.description = c.value;
        }
        if (input.details !== undefined) {
          const d: NonNullable<ProductPatch['details']> = {};
          const list = (key: 'benefits' | 'ingredients', max: number, maxLen: number) => {
            const v = input.details?.[key];
            if (v === undefined) return null;
            if (!Array.isArray(v) || v.length > max) return `${key} must be a list of at most ${max} items.`;
            const out: string[] = [];
            for (const item of v) {
              const c = cleanText(item, key, { min: 1, max: maxLen });
              if ('error' in c) return c.error;
              out.push(c.value);
            }
            d[key] = out;
            return null;
          };
          for (const [key, max, len] of [['benefits', 20, 500], ['ingredients', 100, 200]] as const) {
            const e = list(key, max, len);
            if (e) return bad(['details', key], e);
          }
          for (const [key, max] of [['howToUse', 2000], ['precautions', 2000]] as const) {
            if (input.details[key] === undefined) continue;
            const c = cleanText(input.details[key], key, { max, multiline: true });
            if ('error' in c) return bad(['details', key], c.error);
            d[key] = c.value;
          }
          patch.details = d;
        }
        if (input.variants !== undefined) {
          if (!Array.isArray(input.variants) || input.variants.length > 100) return bad(['variants'], 'variants must be a list.');
          patch.variants = [];
          for (const [i, v] of input.variants.entries()) {
            const out: NonNullable<ProductPatch['variants']>[number] = { id: v?.id };
            if (gidTail(v?.id, 'ProductVariant') === null) return bad(['variants', String(i), 'id'], 'Unknown variant.');
            if (v.price !== undefined) {
              const m = parseMoneyField(v.price, 'Price', 1);
              if ('error' in m) return bad(['variants', String(i), 'price'], m.error);
              out.priceMinor = m.minor;
            }
            if (v.cost !== undefined) {
              if (v.cost === null) out.costMinor = null;
              else {
                const m = parseMoneyField(v.cost, 'Cost', 0);
                if ('error' in m) return bad(['variants', String(i), 'cost'], m.error);
                out.costMinor = m.minor;
              }
            }
            if (v.lowStockThreshold !== undefined) {
              if (!Number.isInteger(v.lowStockThreshold) || v.lowStockThreshold < 0 || v.lowStockThreshold > 100_000) {
                return bad(['variants', String(i), 'lowStockThreshold'], 'Low-stock threshold must be a whole number from 0 to 100000.');
              }
              out.lowStockThreshold = v.lowStockThreshold;
            }
            patch.variants.push(out);
          }
        }

        const current = await find(input.id);
        if (!current) return fail(userError('NOT_FOUND', ['id'], 'Product not found.'));
        if (!sameInstant(current.updatedAt, input.expectedUpdatedAt)) {
          return fail(userError('CONFLICT', null, 'This product was changed by someone else. Reload to see the latest version.'));
        }
        const preview = applyProductPatch(current, patch, at);
        if ('invalidVariant' in preview) return bad(['variants'], 'A variant does not belong to this product.');
        const d = diffProduct(current, preview.after);
        if (!Object.keys(d.fields).length && !Object.keys(d.prices).length) return ok(await view(current, s)); // nothing changed

        const result = await admin.updateProduct({
          productId: n,
          expectedUpdatedAt: input.expectedUpdatedAt,
          patch,
          now: at,
          audit: (before, after) => {
            const diff = diffProduct(before, after);
            const target = { type: 'product', id: before.id };
            const entries = [];
            if (Object.keys(diff.fields).length) entries.push(toAuditInput(auditDraft(s, at, { action: 'product.updated', target, changes: diff.fields })));
            if (Object.keys(diff.prices).length) entries.push(toAuditInput(auditDraft(s, at, { action: 'product.price_changed', target, changes: diff.prices })));
            return entries;
          },
        });
        switch (result.kind) {
          case 'not_found':
            return fail(userError('NOT_FOUND', ['id'], 'Product not found.'));
          case 'conflict':
            return fail(userError('CONFLICT', null, 'This product was changed by someone else. Reload to see the latest version.'));
          case 'invalid_variant':
            return bad(['variants'], 'A variant does not belong to this product.');
          default:
            return ok(await view(result.after, s));
        }
      });
    },

    async setStatus(input: SetStatusInput): Promise<AdminMutationResult<AdminProduct>> {
      return mutateAs(ctx, 'products:publish', async (s, at) => {
        const n = gidTail(input?.id, 'Product');
        if (n === null) return fail(userError('NOT_FOUND', ['id'], 'Product not found.'));
        if (!STATUSES.includes(input.status)) return fail(userError('INVALID', ['status'], 'Unknown status.'));
        if (input.expectedUpdatedAt !== undefined && Number.isNaN(Date.parse(input.expectedUpdatedAt))) {
          return fail(userError('INVALID', ['expectedUpdatedAt'], 'expectedUpdatedAt is not a date.'));
        }
        const r = await admin.setProductStatus({
          productId: n,
          status: input.status,
          expectedUpdatedAt: input.expectedUpdatedAt ?? null,
          now: at,
          gate: publishChecks,
          audit: (before, after) =>
            toAuditInput(auditDraft(s, at, { action: 'product.status_changed', target: { type: 'product', id: before.id }, changes: { status: { from: before.status, to: after.status } } })),
        });
        switch (r.kind) {
          case 'not_found':
            return fail(userError('NOT_FOUND', ['id'], 'Product not found.'));
          case 'conflict':
            return fail(userError('CONFLICT', null, 'This product was changed by someone else. Reload to see the latest version.'));
          case 'blocked': {
            const failing = r.checks.filter((c) => !c.passed).map((c) => c.key);
            const current = await find(input.id);
            await admin.appendAudit(
              toAuditInput(auditDraft(s, at, { action: 'product.publish_blocked', target: { type: 'product', id: input.id }, changes: { failedChecks: { from: null, to: failing.join(',') } } })),
            );
            // data carries the product so the UI can redraw the checklist from `publishChecks`.
            return { data: current ? await view(current, s) : null, userErrors: [userError('PUBLISH_BLOCKED', ['status'], `Publishing is blocked until these checks pass: ${failing.join(', ')}.`)] };
          }
          default:
            return ok(await view(r.after, s));
        }
      });
    },
  };
}
