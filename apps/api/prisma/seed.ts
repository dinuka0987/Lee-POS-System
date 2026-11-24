import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
config({ path: '../../.env', quiet: true });
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function seed() {
  const branchId = process.env.BRANCH_ID;
  if (!branchId) throw new Error('Set BRANCH_ID in .env');
  for (const role of ['admin', 'cashier'] as const) {
    const password = process.env[`${role.toUpperCase()}_PASSWORD`];
    if (!password || password.length < 12 || Buffer.byteLength(password) > 72)
      throw new Error(
        `Set ${role.toUpperCase()}_PASSWORD (12+ characters, at most 72 bytes) in .env`,
      );
    await db.user.upsert({
      where: { email: `${role}@lee.local` },
      update: {},
      create: {
        name: role === 'admin' ? 'Lee Admin' : 'Lee Cashier',
        email: `${role}@lee.local`,
        role,
        passwordHash: await hash(password, 12),
      },
    });
  }
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@lee.local' } });
  if (process.env.SEED_SAMPLE_PRODUCTS === 'false') {
    console.log(
      'Seed accounts are ready. Sample products were skipped. Existing accounts were preserved.',
    );
    return;
  }
  const catalog = [
    ['Groceries', 'GRO-001', '8901000000011', 'Basmati Rice · 1 kg', 48000],
    ['Groceries', 'GRO-002', '8901000000028', 'White Sugar · 1 kg', 32000],
    ['Beverages', 'BEV-001', '8901000000035', 'Ceylon Black Tea · 200 g', 65000],
    ['Beverages', 'BEV-002', '8901000000042', 'Mineral Water · 1 L', 12000],
    ['Snacks', 'SNK-001', '8901000000059', 'Cream Crackers · 190 g', 28000],
    ['Household', 'HOM-001', '8901000000066', 'Hand Wash · 250 ml', 45000],
    ['Snacks', 'SNK-002', '8901000000073', 'Milk Chocolate · 50 g', 35000],
    ['Household', 'HOM-002', '8901000000080', 'Cotton Shopping Bag', 25000],
  ] as const;
  for (const [categoryName, sku, barcode, name, priceCents] of catalog) {
    await db.$transaction(async (tx) => {
      if (await tx.product.findUnique({ where: { sku } })) return;
      const category = await tx.category.upsert({
        where: { name: categoryName },
        update: {},
        create: { name: categoryName },
      });
      const product = await tx.product.create({
        data: {
          sku,
          barcode,
          name,
          priceCents,
          categoryId: category.id,
          taxRateBps: 0,
          stockLevels: { create: { branchId, quantity: 50 } },
        },
      });
      await tx.stockMovement.create({
        data: {
          productId: product.id,
          branchId,
          qty: 50,
          type: 'receive',
          refId: product.id,
          userId: admin.id,
        },
      });
    });
  }
  console.log(
    'Seed complete. Accounts: admin@lee.local and cashier@lee.local. Passwords are in your local .env. Existing accounts and stock were preserved.',
  );
}
void seed()
  .catch(() => {
    console.error('Seeding failed. Check database access and seed configuration.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
