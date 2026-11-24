import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { User } from '@lee/shared';
import { AdminOnly, CurrentUser } from '../auth/auth.decorators';
import { PrismaService } from '../common/prisma.service';
class AuditQueryDto {
  @IsOptional()
  @IsIn([
    'void',
    'adjust',
    'user.create',
    'user.update',
    'user.password-reset',
    'settings.update',
    'sale.manual',
  ])
  action?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
}
@ApiTags('Audit')
@ApiBearerAuth()
@AdminOnly()
@Controller('audit')
export class AuditController {
  constructor(private readonly db: PrismaService) {}
  @Get() async list(@Query() query: AuditQueryDto, @CurrentUser() user: User) {
    const where = { branchId: user.branchId, ...(query.action ? { action: query.action } : {}) };
    return this.db.$transaction(
      async (tx) => ({
        data: await tx.auditLog.findMany({
          where,
          include: { user: { select: { name: true, email: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * 25,
          take: 25,
        }),
        total: await tx.auditLog.count({ where }),
        page: query.page,
        pageSize: 25,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
