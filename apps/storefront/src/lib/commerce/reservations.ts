import type { CartRecord, CheckoutLineSnapshot, CheckoutRecord } from './records';
import type { ID } from './types';

export function quantitiesByVariant(lines: Pick<CheckoutLineSnapshot, 'variantId' | 'quantity'>[]): Map<ID, number> {
  const quantities = new Map<ID, number>();
  for (const line of lines) quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.quantity);
  return quantities;
}

export function snapshotMatchesCart(checkout: CheckoutRecord, cart: CartRecord, expectedUpdatedAt: string): boolean {
  const amounts = (lines: { variantId: ID; quantity: number; unitMinor: number }[]) => {
    const grouped = new Map<string, number>();
    for (const line of lines) { const key = `${line.variantId}:${line.unitMinor}`; grouped.set(key, (grouped.get(key) ?? 0) + line.quantity); }
    return JSON.stringify([...grouped].sort(([a], [b]) => a.localeCompare(b)));
  };
  return !cart.completedAt && cart.updatedAt === expectedUpdatedAt && cart.buyerEmail === checkout.buyerEmail && cart.buyerProvince === checkout.province &&
    amounts(cart.lines.map(line => ({ ...line, unitMinor: line.priceAtAddMinor }))) ===
    amounts(checkout.lines.map(line => ({ ...line, unitMinor: line.originalUnitMinor ?? line.unitMinor })));
}
