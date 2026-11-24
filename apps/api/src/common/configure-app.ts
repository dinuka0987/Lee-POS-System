import { ValidationPipe, type INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import type { Request, Response, NextFunction } from 'express';

export function configureApp(app: INestApplication, webOrigin: string): void {
  app.setGlobalPrefix('api');
  app.use(helmet());
  // Protect authenticated responses even when the API is hosted without Nginx.
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.enableCors({ origin: webOrigin });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
}
