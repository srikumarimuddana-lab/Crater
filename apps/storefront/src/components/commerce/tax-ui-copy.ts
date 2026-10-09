/**
 * Bag-only strings that complement `taxCopy` in shop-copy (coordinator-owned). Tax rules: docs/tax.md.
 * Fold into shop-copy.ts when the coordinator next edits it.
 */
export const taxUi = {
  /** Shown instead of "Taxes and shipping are confirmed at checkout." once taxes are known. */
  shippingNote: 'Shipping is confirmed at checkout.',
  saved: (provinceName: string) => `Shipping to ${provinceName}. Taxes and total updated.`,
  invalid: 'Choose one of the provinces in the list, then press Update.',
  /** "GST 5%" */
  taxLabel: (title: string, ratePercent: string) => `${title} ${ratePercent}%`,
} as const;
