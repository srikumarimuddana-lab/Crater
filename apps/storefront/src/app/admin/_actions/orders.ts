'use server';

import { revalidatePath } from 'next/cache';
import { getAdmin, requireAdmin } from '@/lib/admin';
import { gidFrom } from '@/components/admin/format';
import { echo, errorsToState, failed, runAction, text } from '../_lib/results';
import type { FormState } from '@/components/admin/form-state';

export async function markFulfilledAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = echo(fd);
  const slug = text(fd, 'orderId');
  const orderId = gidFrom('Order', slug);
  if (!orderId) return failed('Order not found.', values);
  const out = await runAction(async () => {
    await requireAdmin('orders:fulfil');
    return (await getAdmin()).orders.markFulfilled({ orderId, carrier: text(fd, 'carrier'), trackingNumber: text(fd, 'trackingNumber') });
  }, values);
  if ('state' in out) return out.state;
  if (out.result.userErrors.length) return errorsToState(out.result.userErrors, values);
  revalidatePath(`/admin/orders/${slug}`);
  return { status: 'success', errors: [], message: 'Marked as fulfilled. The order timeline has the details.' };
}

export async function updateNotesAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = echo(fd);
  const slug = text(fd, 'orderId');
  const orderId = gidFrom('Order', slug);
  if (!orderId) return failed('Order not found.', values);
  const out = await runAction(async () => {
    await requireAdmin('orders:internal_notes');
    return (await getAdmin()).orders.updateNotes({ orderId, packingInstructions: text(fd, 'packingInstructions') || null, internalNotes: text(fd, 'internalNotes') || null });
  }, values);
  if ('state' in out) return out.state;
  if (out.result.userErrors.length) return errorsToState(out.result.userErrors, values);
  revalidatePath(`/admin/orders/${slug}`);
  return { status: 'success', errors: [], message: 'Notes saved.' };
}
