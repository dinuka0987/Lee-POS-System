import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { validateEnvironment } from './common/environment';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from './common/prisma.service';
import { AuthGuard } from './auth/auth.guard';
import { AuthController } from './auth/auth.controller';
import { AdminSetupController } from './auth/admin-setup.controller';
import { ProductsController } from './products/products.controller';
import { SalesController } from './sales/sales.controller';
import { SalesService } from './sales/sales.service';
import { ReportsController } from './reports/reports.controller';
import { SettingsController } from './settings/settings.controller';
import { UsersController } from './users/users.controller';
import { AuditController } from './audit/audit.controller';
import { SyncController } from './sync/sync.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnvironment,
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '8h',
          algorithm: 'HS256',
          issuer: 'lee-pos',
          audience: 'lee-counter',
        },
        verifyOptions: { algorithms: ['HS256'], issuer: 'lee-pos', audience: 'lee-counter' },
      }),
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
  ],
  controllers: [
    HealthController,
    AuthController,
    AdminSetupController,
    ProductsController,
    SalesController,
    ReportsController,
    SettingsController,
    UsersController,
    AuditController,
    SyncController,
  ],
  providers: [
    PrismaService,
    SalesService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
