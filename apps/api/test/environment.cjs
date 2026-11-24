// eslint-disable-next-line @typescript-eslint/no-require-imports
const { randomBytes, randomUUID } = require('node:crypto');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://unused:unused@localhost/unused_test';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.BRANCH_ID = randomUUID();
