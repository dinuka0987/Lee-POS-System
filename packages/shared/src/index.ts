import { z } from 'zod';
export * from './money';
export * from './contracts';
export * from './dates';

export const STORE_NAME = 'Lee';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('lee-pos-api'),
  store: z.literal('Lee'),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
