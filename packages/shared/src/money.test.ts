import { describe, expect, it } from 'vitest';
import {
  calculateCart,
  calculateChange,
  calculateLine,
  parseMoney,
  formatMoney,
  remainingStock,
} from './money';

describe('integer pricing', () => {
  it('parses decimal input without floating point multiplication', () => {
    expect(parseMoney('19.99')).toBe(1999);
    expect(parseMoney('0.1')).toBe(10);
    expect(formatMoney(123456)).toBe('LKR 1,234.56');
    for (const input of ['-1', '1.001', '1e2', 'NaN', ''])
      expect(() => parseMoney(input)).toThrow();
  });
  it('rounds half-cent tax upwards per line after discounts', () => {
    expect(calculateLine(101, 1, 5000)).toEqual({
      subtotalCents: 101,
      discountCents: 0,
      taxCents: 51,
      totalCents: 152,
    });
    expect(calculateLine(1000, 2, 1800, 500)).toEqual({
      subtotalCents: 2000,
      discountCents: 500,
      taxCents: 270,
      totalCents: 1770,
    });
    expect(() => calculateLine(100, 1, 0, 101)).toThrow();
  });
  it('sums rounded lines and rejects unsafe or fractional amounts', () => {
    expect(calculateCart([{ unitPriceCents: 1999, qty: 3, taxRateBps: 1800 }]).totalCents).toBe(
      7076,
    );
    expect(() => calculateLine(1.5, 1, 0)).toThrow();
    expect(() => calculateLine(2_000_000_000, 2, 0)).toThrow();
    expect(() => calculateLine(100, 0, 0)).toThrow();
  });
  it('calculates cash change and rejects underpayment', () => {
    expect(calculateChange(1999, 2000)).toBe(1);
    expect(() => calculateChange(2000, 1999)).toThrow();
  });
  it('prevents negative stock and supports selling the final unit', () => {
    expect(remainingStock(1, 1)).toBe(0);
    expect(() => remainingStock(1, 2)).toThrow();
    expect(() => remainingStock(1, 0.5)).toThrow();
  });
});
