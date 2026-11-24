import { config } from 'dotenv';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
config({ path: new URL('../../../.env', import.meta.url), quiet: true });
export const apiDirectory = fileURLToPath(new URL('..', import.meta.url));
export function runNode(script, args, environment = process.env) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: apiDirectory,
    env: environment,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('A test preparation or test command failed');
}
export async function prepareTestDatabase() {
  const source = process.env.DATABASE_URL;
  if (!source) throw new Error('Configure DATABASE_URL first');
  const url = new URL(process.env.TEST_DATABASE_URL || source);
  if (!process.env.TEST_DATABASE_URL) url.pathname = `${url.pathname}_test`;
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-zA-Z0-9_]+_test$/.test(name))
    throw new Error('Tests require a separate database whose name ends in _test');
  const admin = new pg.Client({ connectionString: source });
  try {
    await admin.connect();
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!existing.rowCount) await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  const environment = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: url.toString(),
    TEST_DATABASE_URL: url.toString(),
  };
  runNode(
    fileURLToPath(new URL('../../../node_modules/prisma/build/index.js', import.meta.url)),
    ['migrate', 'deploy'],
    environment,
  );
  return environment;
}
