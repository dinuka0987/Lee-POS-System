import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { prepareTestDatabase, runNode } from './test-database.mjs';
const require = createRequire(import.meta.url);
let db;
const userId = randomUUID();
let adminId = randomUUID();
const adminEmail = `browser-admin-${adminId}@example.test`;
const setupKey = randomUUID() + randomUUID();
const categoryId = randomUUID();
const productId = randomUUID();
const branchId = randomUUID();
const managedEmail = `managed-${randomUUID()}@example.test`;
try {
  const environment = await prepareTestDatabase();
  const password = randomUUID();
  const email = `browser-${userId}@example.test`;
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }) });
  if (await db.user.count({ where: { role: 'admin' } }))
    throw new Error('Browser setup tests require a test database with no existing administrators');
  await db.user.create({
    data: {
      id: userId,
      email,
      name: 'Browser Test Cashier',
      role: 'cashier',
      passwordHash: await hash(password, 4),
    },
  });
  await db.category.create({ data: { id: categoryId, name: `Browser ${categoryId}` } });
  await db.product.create({
    data: {
      id: productId,
      name: 'Browser Test Tea',
      sku: productId,
      barcode: productId,
      categoryId,
      priceCents: 10000,
      taxRateBps: 0,
      stockLevels: {
        create: {
          branchId,
          quantity: 20,
        },
      },
    },
  });
  runNode(
    require.resolve('@playwright/test/cli'),
    ['test', '--config', fileURLToPath(new URL('../../../playwright.config.ts', import.meta.url))],
    {
      ...environment,
      JWT_SECRET: randomUUID() + randomUUID(),
      INITIAL_ADMIN_SETUP_TOKEN: setupKey,
      E2E_SETUP_KEY: setupKey,
      E2E_EMAIL: email,
      E2E_ADMIN_EMAIL: adminEmail,
      E2E_CATEGORY_ID: categoryId,
      E2E_NEW_BARCODE: randomUUID(),
      E2E_PASSWORD: password,
      E2E_BARCODE: productId,
      E2E_MANAGED_EMAIL: managedEmail,
      E2E_USER_ID: userId,
      BRANCH_ID: branchId,
      API_PORT: '3100',
      WEB_ORIGIN: 'http://127.0.0.1:5174',
      VITE_API_PROXY_TARGET: 'http://127.0.0.1:3100',
      VITE_API_BASE_URL: '/api',
    },
  );
} catch {
  console.error('Browser tests failed. See the command output above.');
  process.exitCode = 1;
} finally {
  if (db) {
    const registeredAdmin = await db.user.findUnique({
      where: { email: adminEmail },
      select: { id: true },
    });
    if (registeredAdmin) adminId = registeredAdmin.id;
    const ids = (
      await db.sale.findMany({
        where: { cashierId: { in: [userId, adminId] } },
        select: { id: true },
      })
    ).map((sale) => sale.id);
    const managed = await db.user.findUnique({
      where: { email: managedEmail },
      select: { id: true },
    });
    const categoryIds = (
      await db.category.findMany({
        where: { OR: [{ id: categoryId }, { name: `Browser Empty ${categoryId}` }] },
        select: { id: true },
      })
    ).map((category) => category.id);
    await db.$transaction([
      db.saleItem.deleteMany({ where: { saleId: { in: ids } } }),
      db.payment.deleteMany({ where: { saleId: { in: ids } } }),
      db.sale.deleteMany({ where: { id: { in: ids } } }),
      db.stockMovement.deleteMany({ where: { userId: { in: [userId, adminId] } } }),
      db.auditLog.deleteMany({ where: { userId: { in: [userId, adminId] } } }),
      db.stockLevel.deleteMany({ where: { product: { categoryId: { in: categoryIds } } } }),
      db.product.deleteMany({ where: { categoryId: { in: categoryIds } } }),
      db.category.deleteMany({ where: { id: { in: categoryIds } } }),
      db.user.deleteMany({ where: { id: { in: [userId, adminId] } } }),
      db.user.deleteMany({ where: { id: managed?.id ?? '00000000-0000-4000-8000-000000000000' } }),
      db.shopSetting.deleteMany({ where: { branchId } }),
      db.developerContact.deleteMany({ where: { branchId } }),
    ]);
    await db.$disconnect();
  }
}
