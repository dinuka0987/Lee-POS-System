import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './common/configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  configureApp(app, config.getOrThrow<string>('WEB_ORIGIN'));
  if (config.get<string>('TRUST_PROXY') === '1')
    app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const documentation = new DocumentBuilder()
    .setTitle('Lee POS API')
    .setDescription(
      'Lee POS: authentication, products, and transactional checkout. All monetary amounts are integer LKR cents.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  if (config.get<string>('NODE_ENV') !== 'production')
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, documentation));
  await app.listen(config.getOrThrow<number>('API_PORT'), config.getOrThrow<string>('API_HOST'));
  app.enableShutdownHooks();
}

void bootstrap().catch((error: unknown) => {
  console.error('Lee POS API failed to start', error);
  process.exitCode = 1;
});
