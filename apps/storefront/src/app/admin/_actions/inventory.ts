'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { allowedAdjustReasons, getAdmin, requireAdmin, type StockAdjustmentReason } from '@/lib/admin';
import { echo, errorsToState, failed, runAction, text } from '../_lib/results';
import type { FormState } from '@/components/admin/form-state';

const REASONS: StockAdjustmentReason[] = ['RECEIVED', 'COUNT_CORRECTION', 'DAMAGED', 'EXPIRED', 'RETURN_RESTOCK', 'SAMPLES_GIFTS', 'LOST_STOLEN', 'OTHER'];
const REMOVES: StockAdjustmentReason[] = ['DAMAGED', 'EXPIRED', 'SAMPLES_GIFTS', 'LOST_STOLEN'];
const REMOVES_TEXT: Partial<Record<StockAdjustmentReason, string>> = {
  DAMAGED: 'Damaged stock must be a negative change.',
  EXPIRED: 'Expired stock must be a negative change.',
  SAMPLES_GIFTS: 'Samples and gifts must be a negative change.',
  LOST_STOLEN: 'Lost or stolen stock must be a negative change.',
};

export async function adjustStockAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = echo(fd);
  const variantId = text(fd, 'variantId');
  const sku = text(fd, 'sku');
  const raw = text(fd, 'delta').trim().replace('−', '-');
  const reason = text(fd, 'reason') as StockAdjustmentReason;
  const note = text(fd, 'note').trim();
  const errors = [];
  if (!/^[+-]?\d{1,7}$/.test(raw) || Number(raw) === 0) errors.push({ field: 'delta', message: 'Enter a whole number other than 0, like 5 or -2.' });
  if (!REASONS.includes(reason)) errors.push({ field: 'reason', message: 'Choose a reason.' });
  const delta = Number(raw);
  if (!errors.length) {
    if (reason === 'OTHER' && note.length < 3) errors.push({ field: 'note', message: 'Add a note of at least 3 characters when the reason is Other.' });
    if (REMOVES.includes(reason) && delta > 0) errors.push({ field: 'delta', message: REMOVES_TEXT[reason] ?? 'This reason must be a negative change.' });
    if ((reason === 'RECEIVED' || reason === 'RETURN_RESTOCK') && delta < 0) errors.push({ field: 'delta', message: 'Received and returned stock must be a positive change.' });
  }
  if (errors.length) return { status: 'error', errors, values };

  const out = await runAction(async () => {
    const s = await requireAdmin('inventory:adjust');
    if (!allowedAdjustReasons(s.staff.role).includes(reason)) {
      return { data: null, userErrors: [{ code: 'FORBIDDEN' as const, field: ['reason'], message: 'Your role cannot use this reason.' }] };
    }
    return (await getAdmin()).inventory.adjust({ variantId, delta, reason, note: note || null });
  }, values);
  if ('state' in out) return out.state;
  if (out.result.userErrors.length) return errorsToState(out.result.userErrors, values);
  revalidatePath('/admin/inventory');
  revalidatePath('/admin/inventory/movements');
  const sign = delta > 0 ? '+' : '−';
  redirect(`/admin/inventory?adjusted=${encodeURIComponent(sku)}&change=${encodeURIComponent(`${sign}${Math.abs(delta)}`)}`);
  return failed('Unexpected state.');
}
