import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
const path = new URL('../../../.env', import.meta.url);
if (!existsSync(path)) throw new Error('Copy .env.example to .env and configure PostgreSQL first.');
let contents = readFileSync(path, 'utf8');
const values = parse(contents);
const additions = {
  JWT_SECRET: randomBytes(48).toString('hex'),
  BRANCH_ID: '00000000-0000-4000-8000-000000000001',
  ADMIN_PASSWORD: randomBytes(18).toString('base64url'),
  CASHIER_PASSWORD: randomBytes(18).toString('base64url'),
};
for (const [name, value] of Object.entries(additions)) {
  if (values[name]) continue;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  contents = pattern.test(contents)
    ? contents.replace(pattern, `${name}=${value}`)
    : `${contents.trimEnd()}\n${name}=${value}\n`;
}
writeFileSync(path, contents);
console.log(
  'Local auth configuration is ready. Existing values were preserved. Read ADMIN_PASSWORD and CASHIER_PASSWORD in your .env; do not share them.',
);
