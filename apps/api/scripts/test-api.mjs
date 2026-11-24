import { createRequire } from 'node:module';
import { prepareTestDatabase, runNode } from './test-database.mjs';
const require = createRequire(import.meta.url);
try {
  const environment = await prepareTestDatabase();
  runNode(
    require.resolve('jest/bin/jest'),
    ['--config', 'test/jest-e2e.json', '--runInBand'],
    environment,
  );
} catch {
  console.error(
    'API tests failed. Check that PostgreSQL is running and test database access is configured.',
  );
  process.exitCode = 1;
}
