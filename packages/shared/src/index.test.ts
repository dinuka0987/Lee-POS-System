import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './index';

describe('API health contract', () => {
  const response = {
    status: 'ok',
    service: 'lee-pos-api',
    store: 'Lee',
    timestamp: '2026-11-23T00:00:00.000Z',
  };

  it('accepts a valid health response', () => {
    expect(healthResponseSchema.parse(response)).toEqual(response);
  });

  it('rejects a response for a different service or an invalid timestamp', () => {
    expect(healthResponseSchema.safeParse({ ...response, service: 'other' }).success).toBe(false);
    expect(healthResponseSchema.safeParse({ ...response, timestamp: 'yesterday' }).success).toBe(
      false,
    );
  });
});
