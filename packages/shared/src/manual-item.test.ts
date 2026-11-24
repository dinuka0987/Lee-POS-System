import { describe, expect, it } from 'vitest';
import { manualItemSchema } from './contracts';

describe('manual bill items', () => {
  it('trims names and keeps price in integer cents', () => {
    expect(
      manualItemSchema.parse({ name: '  Custom item  ', unitPriceCents: 25050, qty: 2 }),
    ).toEqual({ name: 'Custom item', unitPriceCents: 25050, qty: 2 });
  });
  it('rejects missing names, invalid prices, fractional quantities and excessive limits', () => {
    const item = { name: 'Custom item', unitPriceCents: 25050, qty: 1 };
    for (const change of [
      { name: '   ' },
      { name: 'x'.repeat(161) },
      { unitPriceCents: 0 },
      { unitPriceCents: -1 },
      { unitPriceCents: 1.5 },
      { unitPriceCents: 100_000_001 },
      { qty: 0 },
      { qty: 1.5 },
      { qty: 10001 },
    ]) {
      expect(manualItemSchema.safeParse({ ...item, ...change }).success).toBe(false);
    }
  });
});
