export type Mode = 'test' | 'live';
export const ACCOUNTS = {
    stripe_clearing: 'Stripe clearing', bank: 'Bank', inventory: 'Inventory', supplier_payable: 'Supplier payable',
    product_revenue: 'Product revenue', shipping_revenue: 'Shipping revenue', sales_returns: 'Sales returns',
    tax_payable: 'Tax payable', cost_of_goods: 'Cost of goods sold', payment_fees: 'Payment fees',
    inventory_adjustments: 'Inventory adjustments', suspense: 'Reconciliation suspense',
} as const;
export type Account = keyof typeof ACCOUNTS;
export type Line = {
    account: Account;
    debit: number;
    credit: number;
};
export type Journal = {
    id: string;
    mode: Mode;
    currency: string;
    occurredAt: string;
    source: string;
    description: string;
    lines: Line[];
    reversalOf?: string;
};
export type Payment = {
    id: string;
    orderId: number;
    orderNumber: number;
    sessionId: string;
    mode: Mode;
    currency: string;
    subtotalMinor: number;
    shippingMinor: number;
    taxMinor: number;
    totalMinor: number;
    occurredAt: string;
};
export type RefundStatus = 'requested' | 'submitted' | 'pending' | 'unknown' | 'succeeded' | 'failed';
export type Refund = {
    id: string;
    paymentId: string;
    mode: Mode;
    currency: string;
    amountMinor: number;
    productMinor: number;
    shippingMinor: number;
    taxMinor: number;
    reason: string;
    actor: string;
    status: RefundStatus;
    providerId: string | null;
    createdAt: string;
    updatedAt: string;
    message: string | null;
    succeededAt?: string;
};
export type ProviderRefund = {
    id: string;
    paymentId: string;
    requestKey?: string;
    mode: Mode;
    currency: string;
    amountMinor: number;
    status: 'pending' | 'succeeded' | 'failed';
    occurredAt: string;
};
export type Movement = {
    id: string;
    mode: Mode;
    currency: string;
    kind: 'fee' | 'payout' | 'payout_reversal' | 'dispute' | 'dispute_recovery';
    amountMinor: number;
    occurredAt: string;
};
export type Period = {
    id: string;
    closed: boolean;
    actor: string;
    reason: string;
    updatedAt: string;
};
export type Audit = {
    id: string;
    action: string;
    actor: string;
    target: string;
    at: string;
    reason: string;
};
export type Reconciliation = {
    id: string;
    type: string;
    amountMinor: number;
    feeMinor: number;
    currency: string;
    occurredAt: string;
    status: 'imported' | 'review';
    message: string;
};
export type FinanceState = {
    payments: Payment[];
    refunds: Refund[];
    journals: Journal[];
    periods: Period[];
    audit: Audit[];
    reconciliation: Reconciliation[];
};
export interface FinanceRepository {
    transaction<T>(mode: Mode, fn: (state: FinanceState) => T): Promise<T>;
    snapshot(mode: Mode): Promise<FinanceState>;
}
export interface RefundProvider {
    create(payment: Payment, refund: Refund): Promise<ProviderRefund>;
    list(payment: Payment): Promise<ProviderRefund[]>;
}
export class FinanceError extends Error {
}
export const emptyState = (): FinanceState => ({ payments: [], refunds: [], journals: [], periods: [], audit: [], reconciliation: [] });
