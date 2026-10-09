import { describe, expect, it } from 'vitest';
import { formatMoney, minorToAmount, MoneyError, multiplyMinor, parseAmount, sumMinor, toMoney } from '@/lib/commerce/money';

describe('money arithmetic', () => {
  it('parses decimal strings into integer cents without floats', () => {
    expect(parseAmount('68.00')).toBe(6800);
    expect(parseAmount('68')).toBe(6800);
    expect(parseAmount('0.1')).toBe(10);
    expect(parseAmount('19.99')).toBe(1999);
  });

  it('rejects malformed amounts', () => {
    for (const bad of ['', '-1.00', '1.234', '1,00', 'abc', '1e3', '01.00', ' 1.00', '99999999999']) {
      expect(() => parseAmount(bad), bad).toThrow(MoneyError);
    }
  });

  it('formats cents as two-place decimal strings', () => {
    expect(minorToAmount(0)).toBe('0.00');
    expect(minorToAmount(5)).toBe('0.05');
    expect(minorToAmount(6800)).toBe('68.00');
    expect(toMoney(1999)).toEqual({ amount: '19.99', currencyCode: 'CAD' });
  });

  it('sums exactly where floating point would drift', () => {
    // 0.1 + 0.2 !== 0.3 in floats; in cents it is exact.
    expect(sumMinor([10, 20])).toBe(30);
    expect(minorToAmount(sumMinor([10, 20]))).toBe('0.30');
    expect(minorToAmount(multiplyMinor(1999, 3))).toBe('59.97');
    expect(minorToAmount(sumMinor(Array.from({ length: 1000 }, () => 10)))).toBe('100.00');
  });

  it('rejects non-integer or overflowing operands', () => {
    expect(() => multiplyMinor(1.5, 2)).toThrow(MoneyError);
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow(MoneyError);
    expect(() => minorToAmount(0.5)).toThrow(MoneyError);
  });

  it('formats for display with the currency code', () => {
    expect(formatMoney({ amount: '68.00', currencyCode: 'CAD' })).toBe('$68.00 CAD');
    expect(formatMoney({ amount: '1234.5', currencyCode: 'CAD' })).toBe('$1,234.50 CAD');
  });
});
