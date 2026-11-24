import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  TRUST_PROXY: z.enum(['0', '1']).default('0'),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
  JWT_SECRET: z.string().min(32),
  BRANCH_ID: z.uuid(),
});

export function validateEnvironment(environment: Record<string, unknown>) {
  const result = environmentSchema.parse(environment);
  if (result.NODE_ENV === 'production' && !result.WEB_ORIGIN.startsWith('https://')) {
    throw new Error('WEB_ORIGIN must use HTTPS in production');
  }
  return result;
}
