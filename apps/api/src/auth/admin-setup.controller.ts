import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'node:crypto';
import { hash } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { adminSetupSchema, type AdminSetupStatus } from '@lee/shared';
import { PrismaService } from '../common/prisma.service';
import { Public } from './auth.decorators';

@ApiTags('Authentication')
@Controller('auth/setup')
@Public()
export class AdminSetupController {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async status(): Promise<AdminSetupStatus> {
    const admin = await this.db.user.findFirst({ where: { role: 'admin' }, select: { id: true } });
    return {
      required: !admin,
      enabled: !admin && !!this.config.get<string>('INITIAL_ADMIN_SETUP_TOKEN'),
    };
  }

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async create(@Body() body: unknown) {
    const token = this.config.get<string>('INITIAL_ADMIN_SETUP_TOKEN');
    if (!token) throw new ForbiddenException('First-time administrator setup is not enabled');
    const parsed = adminSetupSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('. '));
    const { name, email, password, setupKey } = parsed.data;
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(digest(token), digest(setupKey)))
      throw new ForbiddenException('The setup key is incorrect');
    const passwordHash = await hash(password, 12);
    try {
      return await this.db.$transaction(async (tx) => {
        // Serialize first-admin creation across processes/serverless instances.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(17482026, 1)`;
        if (await tx.user.findFirst({ where: { role: 'admin' }, select: { id: true } }))
          throw new ConflictException('An administrator already exists. Sign in instead.');
        const account = await tx.user.create({
          data: { name, email, passwordHash, role: 'admin' },
          select: { id: true, name: true, email: true, role: true },
        });
        await tx.auditLog.create({
          data: {
            userId: account.id,
            branchId: this.config.getOrThrow<string>('BRANCH_ID'),
            action: 'user.create',
            entity: 'user',
            entityId: account.id,
            details: { before: null, after: account, initialAdministrator: true },
          },
        });
        return { created: true };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('This email already has an account. Choose another email.');
      throw error;
    }
  }
}
