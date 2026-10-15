import { describe, it, expect, vi } from 'vitest';
const { requireAdmin, getFinance } = vi.hoisted(() => ({ requireAdmin: vi.fn(), getFinance: vi.fn() }));
vi.mock('@/lib/admin', () => ({ requireAdmin }));
vi.mock('@/lib/finance', () => ({ getFinance, FinanceError: class extends Error {
    }, reconcileStripe: vi.fn(), syncFinanceOrders: vi.fn() }));
vi.mock('@/lib/finance/provider', () => ({ stripeForMode: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { refundAction, reconcilePaymentAction, reconcileFinanceAction, backfillFinanceAction, periodAction, correctionAction } from '@/app/admin/_actions/finance';
describe('finance server-action authorization', () => {
    it.each([[refundAction, 'payments:refund'], [reconcilePaymentAction, 'payments:read'], [reconcileFinanceAction, 'finance:read'], [backfillFinanceAction, 'finance:read'], [periodAction, 'finance:reopen'], [correctionAction, 'finance:close']] as const)('denies unauthorized action before data access', async (action, capability) => { requireAdmin.mockReset().mockRejectedValue(new Error('FORBIDDEN')); getFinance.mockClear(); await expect(action({ status: 'idle', errors: [] }, new FormData())).rejects.toThrow('FORBIDDEN'); expect(requireAdmin).toHaveBeenCalledWith(capability); expect(getFinance).not.toHaveBeenCalled(); });
});
