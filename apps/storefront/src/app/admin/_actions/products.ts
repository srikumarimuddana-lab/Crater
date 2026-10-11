'use server';

import { revalidatePath } from 'next/cache';
import { getAdmin, requireAdmin, type ProductStatus, type ProductUpdateInput } from '@/lib/admin';
import { CHECK_LABEL, gidFrom } from '@/components/admin/format';
import { echo, errorsToState, failed, runAction, text } from '../_lib/results';
import type { FormState } from '@/components/admin/form-state';

const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export async function saveProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = echo(fd);
  const slug = text(fd, 'productId');
  const id = gidFrom('Product', slug);
  if (!id) return failed('Product not found.', values);

  const errors: { field: string; message: string }[] = [];
  const variants: NonNullable<ProductUpdateInput['variants']> = [];
  const count = Number(text(fd, 'variantCount')) || 0;
  for (let i = 0; i < count; i++) {
    const vid = text(fd, `variants.${i}.id`);
    const price = text(fd, `variants.${i}.price`).trim();
    const costRaw = text(fd, `variants.${i}.cost`).trim();
    const hadCost = text(fd, `variants.${i}.hadCost`) === '1';
    const hasCostField = fd.has(`variants.${i}.cost`);
    const threshold = text(fd, `variants.${i}.lowStockThreshold`).trim();
    const v: NonNullable<ProductUpdateInput['variants']>[number] = { id: vid };
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(price)) errors.push({ field: `variants.${i}.price`, message: 'Price must be an amount like 24.00.' });
    else v.price = price;
    if (hasCostField) {
      if (costRaw === '') {
        if (hadCost) v.cost = null;
      } else if (!/^\d{1,7}(\.\d{1,2})?$/.test(costRaw)) errors.push({ field: `variants.${i}.cost`, message: 'Cost must be an amount like 9.50.' });
      else v.cost = costRaw;
    }
    if (!/^\d{1,6}$/.test(threshold)) errors.push({ field: `variants.${i}.lowStockThreshold`, message: 'Low-stock threshold must be a whole number, 0 or more.' });
    else v.lowStockThreshold = Number(threshold);
    variants.push(v);
  }
  if (!text(fd, 'title').trim()) errors.push({ field: 'title', message: 'Enter a title.' });
  if (errors.length) return { status: 'error', errors, values };

  const input: ProductUpdateInput = {
    id,
    expectedUpdatedAt: text(fd, 'expectedUpdatedAt'),
    title: text(fd, 'title'),
    description: text(fd, 'description'),
    details: {
      benefits: lines(text(fd, 'details.benefits')),
      ingredients: lines(text(fd, 'details.ingredients')),
      howToUse: text(fd, 'details.howToUse'),
      precautions: text(fd, 'details.precautions'),
    },
    variants,
  };
  const out = await runAction(async () => {
    await requireAdmin('products:write');
    return (await getAdmin()).products.update(input);
  }, values);
  if ('state' in out) return out.state;
  const { userErrors } = out.result;
  if (userErrors.length) {
    // On a conflict keep the stale token (and the draft): the user must reload to continue.
    if (!userErrors.some((e) => e.code === 'CONFLICT')) revalidatePath(`/admin/products/${slug}`);
    return errorsToState(userErrors, values);
  }
  revalidatePath(`/admin/products/${slug}`);
  revalidatePath('/admin/products');
  revalidatePath('/admin/inventory');
  return { status: 'success', errors: [], message: 'Saved. Price changes are recorded in the audit log.' };
}

export async function setStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const slug = text(fd, 'productId');
  const id = gidFrom('Product', slug);
  const status = text(fd, 'status') as ProductStatus;
  if (!id || !['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(status)) return failed('Choose a status.', echo(fd));
  const out = await runAction(async () => {
    await requireAdmin('products:publish');
    return (await getAdmin()).products.setStatus({ id, status, expectedUpdatedAt: text(fd, 'expectedUpdatedAt') || undefined });
  }, echo(fd));
  if ('state' in out) return out.state;
  const { userErrors } = out.result;
  if (userErrors.some((e) => e.code === 'PUBLISH_BLOCKED')) {
    // The product comes back unchanged; redraw the checklist from the fresh page and name what is failing.
    revalidatePath(`/admin/products/${slug}`);
    const failing = (out.result.data?.publishChecks ?? []).filter((c) => !c.passed).map((c) => CHECK_LABEL[c.key] ?? c.key);
    return { status: 'error', errors: [], values: echo(fd), message: `Publishing is blocked until these pass: ${failing.join('; ') || 'see the checklist'}.` };
  }
  if (userErrors.length) {
    if (!userErrors.some((e) => e.code === 'CONFLICT')) revalidatePath(`/admin/products/${slug}`);
    return errorsToState(userErrors, echo(fd));
  }
  revalidatePath(`/admin/products/${slug}`);
  revalidatePath('/admin/products');
  return { status: 'success', errors: [], message: `Status is now ${status.charAt(0)}${status.slice(1).toLowerCase()}.` };
}
