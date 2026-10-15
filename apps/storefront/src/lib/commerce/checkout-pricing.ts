import type { CheckoutLineSnapshot } from './records';

/** Largest-remainder allocation in integer cents. Split units only when a line's
 * discounted total is not divisible by its quantity; no cent is lost or invented. */
export function priceCheckoutLines(lines: CheckoutLineSnapshot[], discountMinor: number): CheckoutLineSnapshot[] {
  if (!discountMinor) return structuredClone(lines);
  const totals = lines.map(line => line.unitMinor * line.quantity);
  const subtotal = totals.reduce((sum, amount) => sum + amount, 0);
  if (!Number.isSafeInteger(discountMinor) || discountMinor < 0 || discountMinor > subtotal) throw new Error('Invalid discount allocation.');
  const allocations = totals.map((total, index) => {
    const product = BigInt(total) * BigInt(discountMinor);
    return { index, discount: Number(product / BigInt(subtotal)), remainder: product % BigInt(subtotal) };
  });
  let remaining = discountMinor - allocations.reduce((sum, allocation) => sum + allocation.discount, 0);
  for (const allocation of [...allocations].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (remaining-- <= 0) break;
    allocation.discount++;
  }
  return lines.flatMap((line, index) => {
    const total = totals[index] - allocations[index].discount;
    const unitMinor = Math.floor(total / line.quantity);
    const extra = total % line.quantity;
    const base = { ...line, originalUnitMinor: line.originalUnitMinor ?? line.unitMinor };
    return [
      ...(line.quantity - extra ? [{ ...base, quantity: line.quantity - extra, unitMinor }] : []),
      ...(extra ? [{ ...base, quantity: extra, unitMinor: unitMinor + 1 }] : []),
    ];
  });
}
