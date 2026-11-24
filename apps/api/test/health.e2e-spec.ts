import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { healthResponseSchema } from '@lee/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/configure-app';
import { PrismaService } from '../src/common/prisma.service';

describe('API health (HTTP integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    configureApp(app, 'http://localhost:5173/');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves the shared contract with security headers', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(healthResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('allows the configured browser origin', async () => {
    await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'http://localhost:5173')
      .expect('Access-Control-Allow-Origin', 'http://localhost:5173')
      .expect(200);
  });

  it('does not grant access to an untrusted browser origin', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'https://untrusted.example')
      .expect(200);
    expect(response.headers['access-control-allow-origin']).not.toBe('https://untrusted.example');
  });
});
