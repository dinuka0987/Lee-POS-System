import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { shopDate, shopDayRange, SHOP_TIME_ZONE, type DailyReport, type User } from '@lee/shared';
import { PrismaService } from '../common/prisma.service';
import { AdminOnly, CurrentUser } from '../auth/auth.decorators';
import { SalesQueryDto } from './report.dto';
@ApiTags('Reports')
@ApiBearerAuth()
@AdminOnly()
@Controller('reports')
export class ReportsController {
  constructor(private readonly db: PrismaService) {}
  @Get('daily')
  async daily(@Query() query: SalesQueryDto, @CurrentUser() user: User): Promise<DailyReport> {
    const date = query.date ?? shopDate();
    let range;
    try {
      range = shopDayRange(date);
    } catch {
      throw new BadRequestException('Select a valid calendar date');
    }
    const where = { branchId: user.branchId, createdAt: range, status: 'completed' as const };
    return this.db.$transaction(
      async (tx) => {
        const sales = await tx.sale.aggregate({
          where,
          _count: true,
          _sum: { subtotalCents: true, taxCents: true, discountCents: true, totalCents: true },
        });
        const items = await tx.saleItem.aggregate({ where: { sale: where }, _sum: { qty: true } });
        const payments = await tx.payment.groupBy({
          by: ['method'],
          where: { sale: where },
          _sum: { amountCents: true },
        });
        const voidCount = await tx.sale.count({ where: { ...where, status: 'voided' } });
        const result: DailyReport = {
          date,
          timeZone: SHOP_TIME_ZONE,
          transactionCount: sales._count,
          itemsSold: items._sum.qty ?? 0,
          subtotalCents: sales._sum.subtotalCents ?? 0,
          taxCents: sales._sum.taxCents ?? 0,
          discountCents: sales._sum.discountCents ?? 0,
          totalCents: sales._sum.totalCents ?? 0,
          cashCents: payments.find((p) => p.method === 'cash')?._sum.amountCents ?? 0,
          cardCents: payments.find((p) => p.method === 'card')?._sum.amountCents ?? 0,
          voidCount,
        };
        if (
          Object.values(result).some(
            (value) => typeof value === 'number' && !Number.isSafeInteger(value),
          )
        )
          throw new BadRequestException('Report totals exceed supported limits');
        return result;
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
