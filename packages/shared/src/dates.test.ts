import { describe, expect, it } from 'vitest';
import { shopDate, shopDayRange } from './dates';
describe('Colombo business dates', () => {
  it('uses Sri Lankan midnight rather than the browser/server time zone', () => {
    expect(shopDate(new Date('2026-11-22T18:30:00Z'))).toBe('2026-11-23');
    expect(shopDayRange('2026-11-23')).toEqual({
      gte: new Date('2026-11-22T18:30:00Z'),
      lt: new Date('2026-11-23T18:30:00Z'),
    });
  });
  it('rejects impossible dates and accepts leap days', () => {
    for (const date of ['2026-02-30', '2026-02-29', '23/11/2026', '2026-13-01'])
      expect(() => shopDayRange(date)).toThrow();
    expect(shopDayRange('2028-02-29').gte.toISOString()).toBe('2028-02-28T18:30:00.000Z');
  });
});
