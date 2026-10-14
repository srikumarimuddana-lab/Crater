import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createMemoryRepository, memoryStateOf } from '@/lib/commerce/memory-repository';
import type { OrderRecord } from '@/lib/commerce/records';
const { getRepository, stripeForMode } = vi.hoisted(() => ({ getRepository: vi.fn(), stripeForMode: vi.fn() }));
vi.mock('@/lib/commerce/repository-factory', () => ({ getRepository }));
vi.mock('@/lib/finance/provider', () => ({ stripeForMode, stripeRefundProvider: { create: vi.fn(), list: vi.fn() } }));
import { reconcileStripeRefund, getFinance } from '@/lib/finance';
const order: OrderRecord = { id: 1, number: 1001, checkoutId: 'chk_example', stripeSessionId: 'cs_test_example', email: null, financialStatus: 'PAID', subtotalMinor: 1000, shippingMinor: 100, taxMinor: 55, totalMinor: 1155, reviewFlags: [], processedAt: '2026-10-14T12:00:00.000Z', lines: [], taxLines: [], taxProvince: null, shippingProvince: null, fulfilmentStatus: 'UNFULFILLED', shippingAddress: null, packingInstructions: null, internalNotes: null };
const refund = { id: 're_external', payment_intent: 'pi_original', amount: 500, currency: 'cad', status: 'succeeded', created: 1791979260, metadata: {} };
const session = { id: order.stripeSessionId, payment_intent: 'pi_original', livemode: false, payment_status: 'paid', amount_total: 1155, currency: 'cad' };
beforeEach(() => { const repo = createMemoryRepository(); memoryStateOf(repo).orders.push(structuredClone(order)); getRepository.mockResolvedValue(repo); stripeForMode.mockReturnValue({ refunds: { retrieve: vi.fn().mockResolvedValue(refund) }, checkout: { sessions: { list: vi.fn().mockResolvedValue({ data: [session] }) } } }); });
describe('verified refund event fast path', () => {
    it('resolves the checkout and imports current provider refund idempotently', async () => { expect(await reconcileStripeRefund('re_external', 'test')).toEqual({ handled: true, status: 'succeeded' }); await reconcileStripeRefund('re_external', 'test'); const s = await (await getFinance()).snapshot('test'); expect(s.refunds).toHaveLength(1); expect(s.journals).toHaveLength(2); expect(stripeForMode).toHaveBeenCalledWith('test'); });
    it('rejects mismatched payment totals before financial posting', async () => { stripeForMode.mockReturnValue({ refunds: { retrieve: vi.fn().mockResolvedValue(refund) }, checkout: { sessions: { list: vi.fn().mockResolvedValue({ data: [{ ...session, amount_total: 99 }] }) } } }); await expect(reconcileStripeRefund('re_external', 'test')).rejects.toThrow(/does not match/); expect((await (await getFinance()).snapshot('test')).journals).toHaveLength(0); });
    it('ignores a session from the wrong mode', async () => { expect(await reconcileStripeRefund('re_external', 'live')).toEqual({ handled: false, reason: 'order_not_found' }); expect((await (await getFinance()).snapshot('live')).refunds).toHaveLength(0); });
});
