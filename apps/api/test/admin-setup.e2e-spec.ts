import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { compare } from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { configureApp } from '../src/common/configure-app';

describe('First-time administrator registration', () => {
  let app: INestApplication;
  let db: PrismaService;
  let config: ConfigService;
  const key = randomUUID() + randomUUID();
  const prefix = `setup-${randomUUID()}`;
  const body = () => ({
    name: 'New Shop Owner',
    email: `${prefix}@example.test`,
    password: randomUUID(),
    setupKey: key,
  });
  beforeEach(async () => {
    if (
      !process.env.TEST_DATABASE_URL ||
      !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')
    )
      throw new Error('Run through the isolated API test runner');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app, 'http://localhost:5173');
    await app.init();
    db = app.get(PrismaService);
    config = app.get(ConfigService);
    config.set('INITIAL_ADMIN_SETUP_TOKEN', key);
    expect(await db.user.count({ where: { role: 'admin' } })).toBe(0);
  });
  afterEach(async () => {
    if (db) {
      const users = await db.user.findMany({
        where: { email: { startsWith: prefix } },
        select: { id: true },
      });
      const ids = users.map((user) => user.id);
      await db.auditLog.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });
  it('requires explicit enablement, a valid private key and validated account fields', async () => {
    config.set('INITIAL_ADMIN_SETUP_TOKEN', '');
    await request(app.getHttpServer())
      .get('/api/auth/setup')
      .expect(200)
      .expect({ required: true, enabled: false });
    await request(app.getHttpServer()).post('/api/auth/setup').send(body()).expect(403);
    config.set('INITIAL_ADMIN_SETUP_TOKEN', key);
    await request(app.getHttpServer())
      .post('/api/auth/setup')
      .send({ ...body(), setupKey: randomUUID() })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/auth/setup')
      .send({ ...body(), role: 'admin' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/auth/setup')
      .send({ ...body(), password: '界'.repeat(25) })
      .expect(400);
    expect(await db.user.count({ where: { email: { startsWith: prefix } } })).toBe(0);
  });
  it('creates and audits the chosen admin, permits login, then closes setup even for disabled admins', async () => {
    const account = body();
    await request(app.getHttpServer())
      .get('/api/auth/setup')
      .expect(200)
      .expect({ required: true, enabled: true });
    const response = await request(app.getHttpServer())
      .post('/api/auth/setup')
      .send({ ...account, email: account.email.toUpperCase(), name: ' Owner ' })
      .expect(201);
    expect(response.body).toEqual({ created: true });
    const user = await db.user.findUniqueOrThrow({ where: { email: account.email } });
    expect(user.name).toBe('Owner');
    expect(user.role).toBe('admin');
    expect(await compare(account.password, user.passwordHash)).toBe(true);
    const audit = await db.auditLog.findFirstOrThrow({ where: { userId: user.id } });
    expect(JSON.stringify(audit.details)).not.toContain(account.password);
    expect(JSON.stringify(audit.details)).not.toContain(key);
    expect(JSON.stringify(audit.details)).not.toContain(user.passwordHash);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: account.email, password: account.password })
      .expect(201);
    expect(login.body.user.role).toBe('admin');
    expect(login.body.user.passwordHash).toBeUndefined();
    await request(app.getHttpServer())
      .post('/api/auth/setup')
      .send({ ...body(), email: `${prefix}-second@example.test` })
      .expect(409);
    await db.user.update({ where: { id: user.id }, data: { active: false } });
    await request(app.getHttpServer())
      .get('/api/auth/setup')
      .expect(200)
      .expect({ required: false, enabled: false });
    await request(app.getHttpServer()).post('/api/auth/setup').send(body()).expect(409);
  });
  it('serializes concurrent initial registrations in PostgreSQL', async () => {
    const first = body();
    const second = { ...body(), email: `${prefix}-other@example.test` };
    const replies = await Promise.all(
      [first, second].map((account) =>
        request(app.getHttpServer()).post('/api/auth/setup').send(account),
      ),
    );
    expect(replies.map((reply) => reply.status).sort()).toEqual([201, 409]);
    expect(await db.user.count({ where: { role: 'admin' } })).toBe(1);
    expect(await db.auditLog.count({ where: { user: { email: { startsWith: prefix } } } })).toBe(1);
  });
});
