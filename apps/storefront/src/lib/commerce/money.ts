import type { CurrencyCode, MoneyV2 } from './types';

/**
 * Money helpers. Amounts are integer minor units (cents) everywhere internally and
 * decimal strings at the boundary. No floating point is used for arithmetic.
 * This module is pure (no server-only import) so client code may import it for display.
 */

export const CURRENCY: CurrencyCode = 'CAD';
const DECIMAL = /^(0|[1-9]\d{0,9})(?:\.(\d{1,2}))?$/;

export class MoneyError extends Error {}

/** Parse "68.00" / "68" / "68.5" into integer cents. Throws MoneyError on anything else. */
export function parseAmount(amount: string): number {
  const m = typeof amount === 'string' ? DECIMAL.exec(amount) : null;
  if (!m) throw new MoneyError('Invalid money amount');
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents)) throw new MoneyError('Money amount out of range');
  return cents;
}

export function parseMoney(money: MoneyV2): number {
  if (money.currencyCode !== CURRENCY) throw new MoneyError('Unsupported currency');
  return parseAmount(money.amount);
}

/** Integer cents to decimal string with exactly two places. */
export function minorToAmount(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new MoneyError('Money amount must be an integer number of cents');
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function toMoney(minor: number): MoneyV2 {
  return { amount: minorToAmount(minor), currencyCode: CURRENCY };
}

export function multiplyMinor(unit: number, quantity: number): number {
  if (!Number.isSafeInteger(unit) || !Number.isSafeInteger(quantity)) throw new MoneyError('Integer operands required');
  const product = unit * quantity;
  if (!Number.isSafeInteger(product)) throw new MoneyError('Money amount out of range');
  return product;
}

export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isSafeInteger(v)) throw new MoneyError('Integer operands required');
    total += v;
    if (!Number.isSafeInteger(total)) throw new MoneyError('Money amount out of range');
  }
  return total;
}

/**
 * Display only, e.g. "$68.00 CAD". The decimal string is handed to Intl as a string
 * so no float conversion happens. Never use the result for arithmetic.
 */
export function formatMoney(money: MoneyV2, locale = 'en-CA'): string {
  const cents = parseMoney(money);
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currencyCode,
    currencyDisplay: 'narrowSymbol',
  }).format(minorToAmount(cents) as unknown as number);
  return `${formatted} ${money.currencyCode}`;
}
