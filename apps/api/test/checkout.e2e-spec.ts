import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { configureApp } from '../src/common/configure-app';
import { DEFAULT_DEVELOPER_CONTACT, DEFAULT_SHOP_SETTINGS } from '@lee/shared';

describe('Authenticated PostgreSQL checkout', () => {
  let app: INestApplication;
  let db: PrismaService;
  let admin: string;
  let cashier: string;
  const password = randomUUID();
  const adminId = randomUUID();
  const cashierId = randomUUID();
  const categoryId = randomUUID();
  const categoryIds: string[] = [categoryId];
  const productIds: string[] = [];
  const managedIds: string[] = [];
  const developerBranchIds: string[] = [];
  const email = (role: string) => `${role}-${categoryId}@example.test`;
  const auth = (token: string) => `Bearer ${token}`;
  beforeAll(async () => {
    if (
      !process.env.TEST_DATABASE_URL ||
      !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')
    )
      throw new Error('Use npm run test:api with a dedicated test database');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app, 'http://localhost:5173');
    await app.init();
    db = app.get(PrismaService);
    const passwordHash = await hash(password, 4);
    await db.user.createMany({
      data: [
        { id: adminId, name: 'Test Admin', email: email('admin'), role: 'admin', passwordHash },
        {
          id: cashierId,
          name: 'Test Cashier',
          email: email('cashier'),
          role: 'cashier',
          passwordHash,
        },
      ],
    });
    await db.category.create({ data: { id: categoryId, name: `Test ${categoryId}` } });
    const first = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: email('admin'), password })
      .expect(201);
    admin = first.body.accessToken;
    const second = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: email('cashier'), password })
      .expect(201);
    cashier = second.body.accessToken;
  });
  afterAll(async () => {
    if (db) {
      const sales = await db.sale.findMany({
        where: { cashierId: { in: [adminId, cashierId] } },
        select: { id: true },
      });
      const ids = sales.map((sale) => sale.id);
      await db.$transaction([
        db.saleItem.deleteMany({ where: { saleId: { in: ids } } }),
        db.payment.deleteMany({ where: { saleId: { in: ids } } }),
        db.sale.deleteMany({ where: { id: { in: ids } } }),
        db.stockMovement.deleteMany({ where: { userId: { in: [adminId, cashierId] } } }),
        db.auditLog.deleteMany({ where: { userId: { in: [adminId, cashierId] } } }),
        db.stockLevel.deleteMany({ where: { productId: { in: productIds } } }),
        db.product.deleteMany({ where: { id: { in: productIds } } }),
        db.category.deleteMany({ where: { id: { in: categoryIds } } }),
        db.user.deleteMany({ where: { id: { in: [adminId, cashierId] } } }),
        db.user.deleteMany({ where: { id: { in: managedIds } } }),
        db.shopSetting.deleteMany({ where: { branchId: process.env.BRANCH_ID! } }),
        db.developerContact.deleteMany({
          where: { branchId: { in: [process.env.BRANCH_ID!, ...developerBranchIds] } },
        }),
      ]);
    }
    await app?.close();
  });
  async function product(quantity = 10, productCategoryId: string = categoryId) {
    const id = randomUUID();
    const result = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', auth(admin))
      .send({
        name: 'Test tea',
        sku: id,
        barcode: id,
        categoryId: productCategoryId,
        priceCents: 10000,
        taxRateBps: 1800,
        initialQuantity: quantity,
      })
      .expect(201);
    productIds.push(result.body.id);
    return result.body;
  }

  it('shows only categories with active products and hides both new and archived empty categories', async () => {
    const category = await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', auth(admin))
      .send({ name: `Auto category ${randomUUID()}` })
      .expect(201);
    const id = category.body.id as string;
    categoryIds.push(id);
    const categoryList = () =>
      request(app.getHttpServer()).get('/api/categories').set('Authorization', auth(cashier));
    const containsCategory = (response: { body: { id: string }[] }) =>
      response.body.some((entry) => entry.id === id);

    expect(containsCategory(await categoryList().expect(200))).toBe(false);
    const first = await product(1, id);
    const second = await product(1, id);
    expect(containsCategory(await categoryList().expect(200))).toBe(true);
    await request(app.getHttpServer())
      .delete(`/api/products/${first.id}`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(containsCategory(await categoryList().expect(200))).toBe(true);
    await request(app.getHttpServer())
      .delete(`/api/products/${second.id}`)
      .set('Authorization', auth(admin))
      .expect(200);
    expect(containsCategory(await categoryList().expect(200))).toBe(false);
    expect(
      containsCategory(
        await request(app.getHttpServer())
          .get('/api/categories?includeInactive=true')
          .set('Authorization', auth(cashier))
          .expect(200),
      ),
    ).toBe(false);
    expect(
      containsCategory(
        await request(app.getHttpServer())
          .get('/api/categories?includeInactive=true')
          .set('Authorization', auth(admin))
          .expect(200),
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .patch(`/api/products/${first.id}`)
      .set('Authorization', auth(admin))
      .send({ active: true })
      .expect(200);
    expect(containsCategory(await categoryList().expect(200))).toBe(true);
  });
  it('only allows admins to adjust stock and rejects invalid counts', async () => {
    const item = await product(10);
    const endpoint = `/api/products/${item.id}/stock`;
    const adjustment = { quantity: 7, expectedQuantity: 10, reason: 'Physical stock count' };
    await request(app.getHttpServer())
      .patch(endpoint)
      .set('Authorization', auth(cashier))
      .send(adjustment)
      .expect(403);
    for (const quantity of [-1, 1.5, 1_000_001, null])
      await request(app.getHttpServer())
        .patch(endpoint)
        .set('Authorization', auth(admin))
        .send({ ...adjustment, quantity })
        .expect(400);
    expect(
      (
        await db.stockLevel.findUniqueOrThrow({
          where: { productId_branchId: { productId: item.id, branchId: process.env.BRANCH_ID! } },
        })
      ).quantity,
    ).toBe(10);
  });

  it('applies one concurrent stock adjustment atomically, with audit and branch isolation', async () => {
    const item = await product(10);
    const branchId = process.env.BRANCH_ID!;
    const otherBranch = randomUUID();
    await db.stockLevel.create({
      data: { productId: item.id, branchId: otherBranch, quantity: 6 },
    });
    const results = await Promise.all(
      [7, 12].map((quantity) =>
        request(app.getHttpServer())
          .patch(`/api/products/${item.id}/stock`)
          .set('Authorization', auth(admin))
          .send({ quantity, expectedQuantity: 10, reason: 'Physical stock count' }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const quantity = results.find((result) => result.status === 200)!.body.quantity as number;
    const current = await db.stockLevel.findUniqueOrThrow({
      where: { productId_branchId: { productId: item.id, branchId } },
    });
    expect(current.quantity).toBe(quantity);
    expect(
      (
        await db.stockLevel.findUniqueOrThrow({
          where: { productId_branchId: { productId: item.id, branchId: otherBranch } },
        })
      ).quantity,
    ).toBe(6);
    const movements = await db.stockMovement.findMany({
      where: { productId: item.id, type: 'adjust' },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ branchId, userId: adminId, qty: quantity - 10 });
    const audits = await db.auditLog.findMany({ where: { entity: 'stock', entityId: item.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.details).toMatchObject({
      before: 10,
      after: quantity,
      reason: 'Physical stock count',
    });
  });

  function sale(productId: string, qty = 1, amountCents = 11800 * qty) {
    return {
      id: randomUUID(),
      items: [{ productId, qty, unitPriceCents: 10000, taxRateBps: 1800 }],
      payment: { method: 'cash', amountCents },
    };
  }
  const postSale = (body: object) =>
    request(app.getHttpServer()).post('/api/sales').set('Authorization', auth(cashier)).send(body);

  it('allows cashiers to bill manual items without creating catalog products or stock', async () => {
    const name = `Manual ${randomUUID()}`;
    const body = {
      id: randomUUID(),
      items: [
        {
          manual: true,
          lineId: randomUUID(),
          productName: name,
          unitPriceCents: 25050,
          qty: 2,
          taxRateBps: 0,
        },
      ],
      payment: { method: 'cash', amountCents: 60000 },
    };
    const response = await postSale(body).expect(201);
    expect(response.body).toMatchObject({ subtotalCents: 50100, taxCents: 0, totalCents: 50100 });
    expect(response.body.items[0]).toMatchObject({
      productId: null,
      productName: name,
      qty: 2,
      unitPriceCents: 25050,
    });
    expect(await db.product.count({ where: { name } })).toBe(0);
    expect(await db.stockMovement.count({ where: { refId: body.id } })).toBe(0);
    expect(
      await db.auditLog.count({
        where: { entityId: body.id, action: 'sale.manual', userId: cashierId },
      }),
    ).toBe(1);
    const replay = await request(app.getHttpServer())
      .post('/api/sync/sales')
      .set('Authorization', auth(cashier))
      .send(body)
      .expect(201);
    expect(replay.body.id).toBe(body.id);
    expect(await db.sale.count({ where: { id: body.id } })).toBe(1);
  });

  it('handles mixed admin bills, replay, reporting and voids without inventory for manual lines', async () => {
    const item = await product(5);
    const manual = {
      manual: true,
      lineId: randomUUID(),
      productName: `Custom ${randomUUID()}`,
      unitPriceCents: 12345,
      qty: 3,
      taxRateBps: 0,
    };
    const body = {
      id: randomUUID(),
      items: [sale(item.id, 2).items[0]!, manual],
      payment: { method: 'card', amountCents: 60635, reference: 'EXTERNAL-MANUAL-TEST' },
    };
    const before = await request(app.getHttpServer())
      .get('/api/reports/daily')
      .set('Authorization', auth(admin))
      .expect(200);
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/api/sales')
          .set('Authorization', auth(admin))
          .send(body),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[0]!.body.totalCents).toBe(60635);
    expect(await db.saleItem.count({ where: { saleId: body.id } })).toBe(2);
    expect(
      (
        await db.stockLevel.findFirstOrThrow({
          where: { productId: item.id, branchId: process.env.BRANCH_ID! },
        })
      ).quantity,
    ).toBe(3);
    expect(
      await db.auditLog.count({
        where: { entityId: body.id, action: 'sale.manual', userId: adminId },
      }),
    ).toBe(1);
    await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', auth(admin))
      .send({ ...body, items: [...body.items].reverse() })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', auth(admin))
      .send({ ...body, items: [body.items[0], { ...manual, productName: 'Changed name' }] })
      .expect(409);
    const report = await request(app.getHttpServer())
      .get('/api/reports/daily')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(report.body.totalCents - before.body.totalCents).toBe(60635);
    expect(report.body.itemsSold - before.body.itemsSold).toBe(5);
    await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(`/api/sales/${body.id}/void`)
          .set('Authorization', auth(admin))
          .send({ reason: 'Returned mixed purchase', paymentReversed: true })
          .expect(201),
      ),
    );
    expect(
      (
        await db.stockLevel.findFirstOrThrow({
          where: { productId: item.id, branchId: process.env.BRANCH_ID! },
        })
      ).quantity,
    ).toBe(5);
    expect(await db.stockMovement.count({ where: { refId: body.id, type: 'return' } })).toBe(1);
    expect(await db.stockLevel.count({ where: { productId: manual.lineId } })).toBe(0);
  });

  it('validates manual lines and cannot use them to override a catalog item or bypass stock rollback', async () => {
    const item = await product(1);
    const manual = {
      manual: true,
      lineId: randomUUID(),
      productName: 'Manual item',
      unitPriceCents: 5000,
      qty: 1,
      taxRateBps: 0,
    };
    for (const change of [
      { productName: '  ' },
      { unitPriceCents: 0 },
      { unitPriceCents: -1 },
      { qty: 1.5 },
      { lineId: undefined },
      { productId: item.id },
      { manual: false },
      { manual: null },
    ]) {
      const body = {
        id: randomUUID(),
        items: [{ ...manual, ...change }],
        payment: { method: 'cash', amountCents: 5000 },
      };
      await postSale(body).expect(400);
      expect(await db.sale.count({ where: { id: body.id } })).toBe(0);
    }
    await postSale({
      id: randomUUID(),
      items: [manual, manual],
      payment: { method: 'cash', amountCents: 10000 },
    }).expect(400);
    const body = {
      id: randomUUID(),
      items: [sale(item.id, 2).items[0]!, manual],
      payment: { method: 'cash', amountCents: 28600 },
    };
    await postSale(body).expect(409);
    expect(await db.sale.count({ where: { id: body.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: body.id } })).toBe(0);
    expect(
      (
        await db.stockLevel.findFirstOrThrow({
          where: { productId: item.id, branchId: process.env.BRANCH_ID! },
        })
      ).quantity,
    ).toBe(1);
    await postSale({
      ...sale(item.id),
      items: [{ ...sale(item.id).items[0]!, productName: 'Override name' }],
    }).expect(400);
  });
  it('rejects anonymous access, incorrect passwords, and cashier product writes', async () => {
    await request(app.getHttpServer()).get('/api/products').expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: email('cashier'), password: 'incorrect' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', auth(cashier))
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', auth(cashier))
      .expect(200)
      .expect((res) => expect(res.body.passwordHash).toBeUndefined());
  });
  it('rejects forged, expired and wrong-audience tokens and all cashier administration requests', async () => {
    const jwt = app.get(JwtService);
    const tokens = [
      `${admin.slice(0, admin.lastIndexOf('.') + 1)}invalid-signature`,
      await jwt.signAsync({ sub: cashierId, ver: 0 }, { expiresIn: -1 }),
      await jwt.signAsync({ sub: cashierId, ver: 0 }, { audience: 'other-application' }),
      'eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.',
    ];
    for (const token of tokens)
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', auth(token))
        .expect(401);
    for (const path of ['/api/users', '/api/audit', '/api/reports/daily']) {
      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer()).get(path).set('Authorization', auth(cashier)).expect(403);
    }
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', auth(cashier))
      .send({ role: 'admin' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/users/${adminId}/password`)
      .set('Authorization', auth(cashier))
      .send({ password: randomUUID() })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', auth(admin))
      .expect('Cache-Control', 'no-store')
      .expect(200);
  });
  it('rejects malformed nested sale input without server errors or persisted sales', async () => {
    const body = sale(randomUUID());
    for (const items of [[null], [false], ['invalid'], [{}], null, {}])
      await postSale({ ...body, items }).expect(400);
    for (const payment of [null, false, 'invalid', {}])
      await postSale({ ...body, payment }).expect(400);
    await postSale({ ...body, role: 'admin' }).expect(400);
    expect(await db.sale.count({ where: { id: body.id } })).toBe(0);
  });
  it('looks up barcodes, edits and archives products, and records audit history', async () => {
    const item = await product();
    await request(app.getHttpServer())
      .get(`/api/products/barcode/${item.barcode}`)
      .set('Authorization', auth(cashier))
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/products/${item.id}`)
      .set('Authorization', auth(admin))
      .send({ name: 'Updated tea' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/products/${item.id}`)
      .set('Authorization', auth(admin))
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/products/barcode/${item.barcode}`)
      .set('Authorization', auth(cashier))
      .expect(404);
    expect(await db.auditLog.count({ where: { entityId: item.id } })).toBe(3);
  });
  it('saves items and payment once, deducts stock once, and safely retries concurrently', async () => {
    const item = await product();
    const body = sale(item.id, 2, 25000);
    const results = await Promise.all([postSale(body), postSale(body)]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results[0]!.body.totalCents).toBe(23600);
    expect(results[0]!.body.payments[0]).toMatchObject({
      amountCents: 23600,
      tenderedCents: 25000,
    });
    expect(await db.sale.count({ where: { id: body.id } })).toBe(1);
    expect(await db.saleItem.count({ where: { saleId: body.id } })).toBe(1);
    expect(await db.stockMovement.count({ where: { refId: body.id } })).toBe(1);
    expect((await db.stockLevel.findFirstOrThrow({ where: { productId: item.id } })).quantity).toBe(
      8,
    );
    await postSale({ ...body, payment: { method: 'cash', amountCents: 30000 } }).expect(409);
    await request(app.getHttpServer())
      .get(`/api/sales/${body.id}`)
      .set('Authorization', auth(cashier))
      .expect(200);
  });
  it('rolls back the whole basket when the second product has insufficient stock', async () => {
    const one = await product(5);
    const two = await product(0);
    const body = sale(one.id);
    body.items.push({ ...body.items[0]!, productId: two.id });
    body.payment.amountCents *= 2;
    await postSale(body).expect(409);
    expect(await db.sale.count({ where: { id: body.id } })).toBe(0);
    expect(await db.payment.count({ where: { saleId: body.id } })).toBe(0);
    expect(await db.stockMovement.count({ where: { refId: body.id } })).toBe(0);
    expect((await db.stockLevel.findFirstOrThrow({ where: { productId: one.id } })).quantity).toBe(
      5,
    );
  });
  it('allows only one concurrent checkout of the last stock unit', async () => {
    const item = await product(1);
    const results = await Promise.all([postSale(sale(item.id)), postSale(sale(item.id))]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect((await db.stockLevel.findFirstOrThrow({ where: { productId: item.id } })).quantity).toBe(
      0,
    );
  });
  it('rejects changed prices, underpayment, duplicate lines, and fractional money', async () => {
    const item = await product();
    const body = sale(item.id);
    body.items[0]!.unitPriceCents = 1;
    await postSale(body).expect(409);
    await postSale(sale(item.id, 1, 1)).expect(400);
    const duplicate = sale(item.id);
    duplicate.items.push(duplicate.items[0]!);
    await postSale(duplicate).expect(400);
    await postSale(sale(item.id, 1, 1.5)).expect(400);
  });
  it('records only external card references and requires the exact amount', async () => {
    const item = await product();
    const body = {
      ...sale(item.id),
      payment: { method: 'card', amountCents: 11800, reference: 'TERMINAL-123' },
    };
    await postSale({ ...body, payment: { method: 'card', amountCents: 11800 } }).expect(400);
    await postSale({ ...body, payment: { ...body.payment, amountCents: 12000 } }).expect(400);
    await postSale(body).expect(201);
  });
  it('blocks tokens after an account is deactivated', async () => {
    await db.user.update({ where: { id: cashierId }, data: { active: false } });
    await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', auth(cashier))
      .expect(401);
    await db.user.update({ where: { id: cashierId }, data: { active: true } });
  });
  it('reports Colombo dates and restricts cashier sales history', async () => {
    const item = await product();
    const first = sale(item.id, 2);
    const second = {
      ...sale(item.id),
      payment: { method: 'card', amountCents: 11800, reference: 'REPORT-CARD' },
    };
    const ownAdmin = sale(item.id);
    const outside = sale(item.id);
    await postSale(first).expect(201);
    await postSale(second).expect(201);
    await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', auth(admin))
      .send(ownAdmin)
      .expect(201);
    await postSale(outside).expect(201);
    await db.sale.update({
      where: { id: first.id },
      data: { createdAt: new Date('2020-02-29T18:30:00Z') },
    });
    await db.sale.update({
      where: { id: second.id },
      data: { createdAt: new Date('2020-03-01T18:29:59.999Z') },
    });
    await db.sale.update({
      where: { id: ownAdmin.id },
      data: { createdAt: new Date('2020-03-01T00:00:00Z') },
    });
    await db.sale.update({
      where: { id: outside.id },
      data: { createdAt: new Date('2020-03-01T18:30:00Z') },
    });
    const report = await request(app.getHttpServer())
      .get('/api/reports/daily?date=2020-03-01')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(report.body).toMatchObject({
      transactionCount: 3,
      itemsSold: 4,
      subtotalCents: 40000,
      taxCents: 7200,
      totalCents: 47200,
      cashCents: 35400,
      cardCents: 11800,
      voidCount: 0,
      timeZone: 'Asia/Colombo',
    });
    await request(app.getHttpServer())
      .get('/api/reports/daily')
      .set('Authorization', auth(cashier))
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/reports/daily?date=2026-02-30')
      .set('Authorization', auth(admin))
      .expect(400);
    const history = await request(app.getHttpServer())
      .get('/api/sales?date=2020-03-01')
      .set('Authorization', auth(cashier))
      .expect(200);
    expect(history.body.total).toBe(2);
    expect(
      history.body.data.every((entry: { cashierId: string }) => entry.cashierId === cashierId),
    ).toBe(true);
    await request(app.getHttpServer())
      .get(`/api/sales/${ownAdmin.id}`)
      .set('Authorization', auth(cashier))
      .expect(404);
  });
  it('voids atomically once, restores stock once, and excludes voids from reports', async () => {
    const item = await product();
    const body = sale(item.id, 2);
    await postSale(body).expect(201);
    const before = await request(app.getHttpServer())
      .get('/api/reports/daily')
      .set('Authorization', auth(admin))
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/sales/${body.id}/void`)
      .set('Authorization', auth(cashier))
      .send({ reason: 'Cash returned', paymentReversed: true })
      .expect(403);
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(`/api/sales/${body.id}/void`)
          .set('Authorization', auth(admin))
          .send({ reason: 'Cash returned', paymentReversed: true }),
      ),
    );
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect((await db.stockLevel.findFirstOrThrow({ where: { productId: item.id } })).quantity).toBe(
      10,
    );
    expect(await db.stockMovement.count({ where: { refId: body.id, type: 'return' } })).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: body.id, action: 'void' } })).toBe(1);
    const after = await request(app.getHttpServer())
      .get('/api/reports/daily')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(after.body.totalCents).toBe(before.body.totalCents - 23600);
    expect(after.body.voidCount).toBe(before.body.voidCount + 1);
  });
  it('manages cashier access and resets passwords without exposing hashes or secrets', async () => {
    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', auth(cashier))
      .expect(403);
    const newPassword = randomUUID();
    const newEmail = `managed-${categoryId}@example.test`;
    const created = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', auth(admin))
      .send({ name: 'New Cashier', email: newEmail, password: newPassword })
      .expect(201);
    managedIds.push(created.body.id);
    expect(created.body.passwordHash).toBeUndefined();
    const signedIn = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: newEmail, password: newPassword })
      .expect(201);
    const resetPassword = randomUUID();
    await request(app.getHttpServer())
      .post(`/api/users/${created.body.id}/password`)
      .set('Authorization', auth(admin))
      .send({ password: resetPassword })
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', auth(signedIn.body.accessToken))
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: newEmail, password: newPassword })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: newEmail, password: resetPassword })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/users/${created.body.id}`)
      .set('Authorization', auth(admin))
      .send({ active: false })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/users/${adminId}`)
      .set('Authorization', auth(admin))
      .send({ active: false })
      .expect(400);
    const logs = await request(app.getHttpServer())
      .get('/api/audit?action=user.password-reset')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(JSON.stringify(logs.body)).not.toContain(resetPassword);
    expect(JSON.stringify(logs.body)).not.toContain('passwordHash');
  });
  it('keeps developer contacts read-only for admins and cashiers and separate from shop settings', async () => {
    await request(app.getHttpServer()).get('/api/settings/developer').expect(401);
    const defaults = await request(app.getHttpServer())
      .get('/api/settings/developer')
      .set('Authorization', auth(admin))
      .expect(200);
    expect(defaults.body).toEqual(DEFAULT_DEVELOPER_CONTACT);
    const contact = {
      ...DEFAULT_DEVELOPER_CONTACT,
      name: 'Test Developer',
      email: 'support@example.test',
      mobile: '+94701234567',
      facebookUrl: 'https://www.facebook.com/test-developer',
      websiteUrl: 'https://example.com',
      supportHours: 'Mon–Fri, 9 am–5 pm (Sri Lanka)',
    };
    // Only deployment/database maintenance can supply a branch-specific override.
    await db.developerContact.create({
      data: { branchId: process.env.BRANCH_ID!, ...contact },
    });
    for (const token of [admin, cashier]) {
      for (const method of ['put', 'patch', 'post', 'delete'] as const)
        await request(app.getHttpServer())
          [method]('/api/settings/developer')
          .set('Authorization', auth(token))
          .send({ ...contact, name: 'Shop attempted to change developer' })
          .expect(404);
      await request(app.getHttpServer())
        .get('/api/settings/developer')
        .set('Authorization', auth(token))
        .expect(200)
        .expect((response) => expect(response.body).toEqual(contact));
    }
    await request(app.getHttpServer())
      .put('/api/settings')
      .set('Authorization', auth(admin))
      .send({ ...DEFAULT_SHOP_SETTINGS, developerContact: contact })
      .expect(400);
    const otherBranch = randomUUID();
    developerBranchIds.push(otherBranch);
    await db.developerContact.create({
      data: { branchId: otherBranch, name: 'Other Branch Developer' },
    });
    await request(app.getHttpServer())
      .get('/api/settings/developer')
      .set('Authorization', auth(cashier))
      .expect(200)
      .expect((response) => expect(response.body).toEqual(contact));
    expect(
      (await db.developerContact.findUniqueOrThrow({ where: { branchId: otherBranch } })).name,
    ).toBe('Other Branch Developer');
    expect(
      await db.auditLog.count({
        where: { entity: 'developer', branchId: process.env.BRANCH_ID!, action: 'settings.update' },
      }),
    ).toBe(0);
    const item = await product();
    const receipt = await postSale(sale(item.id)).expect(201);
    expect(receipt.body.receiptSettings).not.toHaveProperty('email');
    expect(JSON.stringify(receipt.body)).not.toContain(contact.email);
    expect(
      await db.shopSetting.findUnique({ where: { branchId: process.env.BRANCH_ID! } }),
    ).toBeNull();
  });

  it('snapshots admin shop settings onto receipts and protects updates', async () => {
    const settings = {
      name: 'Lee Test Shop',
      address: 'Test street',
      phone: '0110000000',
      receiptFooter: 'Thank you, test shopper',
      paperWidthMm: 58,
      autoPrint: false,
    };
    await request(app.getHttpServer())
      .put('/api/settings')
      .set('Authorization', auth(cashier))
      .send(settings)
      .expect(403);
    await request(app.getHttpServer())
      .put('/api/settings')
      .set('Authorization', auth(admin))
      .send(settings)
      .expect(200);
    const item = await product();
    const body = sale(item.id);
    const receipt = await postSale(body).expect(201);
    expect(receipt.body.receiptSettings.name).toBe('Lee Test Shop');
    await request(app.getHttpServer())
      .put('/api/settings')
      .set('Authorization', auth(admin))
      .send({ ...settings, name: 'New name' })
      .expect(200);
    const saved = await request(app.getHttpServer())
      .get(`/api/sales/${body.id}`)
      .set('Authorization', auth(cashier))
      .expect(200);
    expect(saved.body.receiptSettings.name).toBe('Lee Test Shop');
  });
  it('syncs captured dates idempotently and rejects a different cashier', async () => {
    const item = await product();
    const body = {
      ...sale(item.id),
      cashierId,
      branchId: process.env.BRANCH_ID,
      occurredAt: new Date(Date.now() - 86400000).toISOString(),
    };
    await request(app.getHttpServer())
      .post('/api/sync/sales')
      .set('Authorization', auth(cashier))
      .send(body)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post('/api/sync/sales')
      .set('Authorization', auth(cashier))
      .send(body)
      .expect(201);
    expect(replay.body.createdAt).toBe(body.occurredAt);
    expect(await db.sale.count({ where: { id: body.id } })).toBe(1);
    await request(app.getHttpServer())
      .post('/api/sync/sales')
      .set('Authorization', auth(admin))
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/sync/sales')
      .set('Authorization', auth(cashier))
      .send({
        ...body,
        id: randomUUID(),
        occurredAt: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(400);
  });
  it('rate limits repeated sign-in attempts', async () => {
    const responses = [];
    for (let count = 0; count < 10; count++)
      responses.push(
        (
          await request(app.getHttpServer())
            .post('/api/auth/login')
            .send({ email: email('missing'), password: 'invalid' })
        ).status,
      );
    expect(responses).toContain(429);
  });
});
