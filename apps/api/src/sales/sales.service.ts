import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  calculateCart,
  calculateLine,
  shopDayRange,
  DEFAULT_SHOP_SETTINGS,
  type User,
  type SaleRequestItem,
} from '@lee/shared';
import { PrismaService } from '../common/prisma.service';
import { deductStock } from '../inventory/deduct-stock';
import { validatePayment } from '../payments/validate-payment';
import type { CreateSaleDto } from './sales.dto';
import type { SalesQueryDto } from '../reports/report.dto';

const receiptInclude = {
  items: { orderBy: { id: 'asc' as const } },
  payments: true,
  cashier: { select: { name: true } },
};
@Injectable()
export class SalesService {
  constructor(private readonly db: PrismaService) {}
  async history(query: SalesQueryDto, user: User) {
    let range;
    if (query.date) {
      try {
        range = shopDayRange(query.date);
      } catch {
        throw new BadRequestException('Select a valid calendar date');
      }
    }
    const q = query.q?.trim();
    const where: Prisma.SaleWhereInput = {
      branchId: user.branchId,
      ...(user.role === 'cashier' ? { cashierId: user.id } : {}),
      ...(range ? { createdAt: range } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q)
          ? { id: q }
          : {
              OR: [
                { items: { some: { productName: { contains: q, mode: 'insensitive' } } } },
                { cashier: { name: { contains: q, mode: 'insensitive' } } },
              ],
            }
        : {}),
    };
    const pageSize = 25;
    return this.db.$transaction(
      async (tx) => ({
        data: await tx.sale.findMany({
          where,
          include: receiptInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * pageSize,
          take: pageSize,
        }),
        total: await tx.sale.count({ where }),
        page: query.page,
        pageSize,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async receipt(id: string, user: User) {
    const sale = await this.db.sale.findFirst({
      where: {
        id,
        branchId: user.branchId,
        ...(user.role === 'cashier' ? { cashierId: user.id } : {}),
      },
      include: receiptInclude,
    });
    if (!sale) throw new NotFoundException('Receipt not found');
    return sale;
  }
  async void(id: string, reason: string, user: User) {
    return this.db.$transaction(async (tx) => {
      const before = await tx.sale.findFirst({
        where: { id, branchId: user.branchId },
        include: receiptInclude,
      });
      if (!before) throw new NotFoundException('Sale not found');
      if (before.status === 'voided') return before;
      const changed = await tx.sale.updateMany({
        where: { id, branchId: user.branchId, status: 'completed' },
        data: { status: 'voided', voidReason: reason.trim(), voidedAt: new Date() },
      });
      if (changed.count === 1) {
        for (const item of [...before.items].sort((a, b) =>
          (a.productId ?? '').localeCompare(b.productId ?? ''),
        )) {
          if (item.productId === null) continue;
          await tx.stockLevel.upsert({
            where: { productId_branchId: { productId: item.productId, branchId: user.branchId } },
            create: { productId: item.productId, branchId: user.branchId, quantity: item.qty },
            update: { quantity: { increment: item.qty } },
          });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              branchId: user.branchId,
              type: 'return',
              qty: item.qty,
              refId: id,
              userId: user.id,
            },
          });
        }
        await tx.auditLog.create({
          data: {
            userId: user.id,
            branchId: user.branchId,
            action: 'void',
            entity: 'sale',
            entityId: id,
            details: {
              before: { status: 'completed', totalCents: before.totalCents },
              after: { status: 'voided' },
              reason: reason.trim(),
              paymentReversalConfirmed: true,
            },
          },
        });
      }
      return tx.sale.findUniqueOrThrow({ where: { id }, include: receiptInclude });
    });
  }
  async create(body: CreateSaleDto, user: User) {
    if (
      (body.cashierId && body.cashierId !== user.id) ||
      (body.branchId && body.branchId !== user.branchId)
    )
      throw new ForbiddenException(
        'Sign in as the original cashier at the original branch to sync this sale',
      );
    const items = body.items
      .map<SaleRequestItem>((item) => {
        const { productId, qty, unitPriceCents, taxRateBps } = item;
        if (item.manual === true) {
          if (productId !== undefined)
            throw new BadRequestException('Manual items cannot reference a catalog product');
          return {
            manual: true,
            lineId: item.lineId!,
            productName: item.productName!.trim(),
            qty,
            unitPriceCents,
            taxRateBps,
          };
        }
        if (item.lineId !== undefined || item.productName !== undefined)
          throw new BadRequestException(
            'Catalog items cannot override the item name or manual line ID',
          );
        // Preserve the original catalog-only hash shape for already queued sales.
        return { productId: productId!, qty, unitPriceCents, taxRateBps };
      })
      .sort((a, b) =>
        (a.manual ? `manual:${a.lineId}` : a.productId).localeCompare(
          b.manual ? `manual:${b.lineId}` : b.productId,
        ),
      );
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          items,
          ...(body.occurredAt ? { occurredAt: body.occurredAt } : {}),
          ...(body.cashierId ? { cashierId: body.cashierId } : {}),
          ...(body.branchId ? { branchId: body.branchId } : {}),
          payment: {
            method: body.payment?.method,
            amountCents: body.payment?.amountCents,
            reference: body.payment?.reference?.trim() || null,
          },
        }),
      )
      .digest('hex');
    const existing = await this.db.sale.findUnique({
      where: { id: body.id },
      include: receiptInclude,
    });
    const checkExisting = (sale: NonNullable<typeof existing>) => {
      if (
        sale.cashierId !== user.id ||
        sale.branchId !== user.branchId ||
        sale.requestHash !== requestHash
      )
        throw new ConflictException('This sale ID has already been used for a different request');
      return sale;
    };
    if (existing) return checkExisting(existing);
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
    if (
      occurredAt.getTime() > Date.now() + 300_000 ||
      occurredAt.getTime() < Date.now() - 30 * 86_400_000
    )
      throw new BadRequestException(
        'Sale date must be within the last 30 days and no more than five minutes ahead',
      );
    let totals: ReturnType<typeof calculateCart>;
    try {
      totals = calculateCart(items);
    } catch {
      throw new BadRequestException('Sale total or quantity is outside supported limits');
    }
    validatePayment(totals.totalCents, body.payment);
    try {
      return await this.db.$transaction(async (tx) => {
        const settings = await tx.shopSetting.findUnique({ where: { branchId: user.branchId } });
        const products = await tx.product.findMany({
          where: {
            id: { in: items.flatMap((item) => (item.manual ? [] : [item.productId])) },
            active: true,
          },
        });
        const lines = items.map((item) => {
          if (item.manual)
            return {
              productId: null,
              productName: item.productName,
              qty: item.qty,
              unitPriceCents: item.unitPriceCents,
              taxCents: calculateLine(item.unitPriceCents, item.qty, item.taxRateBps).taxCents,
              discountCents: 0,
            };
          const product = products.find((product) => product.id === item.productId);
          if (!product) throw new ConflictException('A product is no longer available');
          if (product.priceCents !== item.unitPriceCents || product.taxRateBps !== item.taxRateBps)
            throw new ConflictException(
              'A price or tax rate changed. Refresh the catalog and rebuild this sale.',
            );
          return {
            productId: item.productId,
            productName: product.name,
            qty: item.qty,
            unitPriceCents: product.priceCents,
            taxCents: calculateLine(product.priceCents, item.qty, product.taxRateBps).taxCents,
            discountCents: 0,
          };
        });
        const sale = await tx.sale.create({
          data: {
            id: body.id,
            branchId: user.branchId,
            cashierId: user.id,
            requestHash,
            createdAt: occurredAt,
            receiptSettings: settings
              ? {
                  name: settings.name,
                  address: settings.address,
                  phone: settings.phone,
                  receiptFooter: settings.receiptFooter,
                  paperWidthMm: settings.paperWidthMm,
                  autoPrint: settings.autoPrint,
                }
              : DEFAULT_SHOP_SETTINGS,
            ...totals,
            items: { create: lines },
            payments: {
              create: {
                method: body.payment.method,
                amountCents: totals.totalCents,
                tenderedCents: body.payment.amountCents,
                reference: body.payment.method === 'card' ? body.payment.reference!.trim() : null,
              },
            },
          },
          include: receiptInclude,
        });
        // Stable ordering prevents two baskets from locking the same stock rows in reverse order.
        for (const item of items) {
          if (!item.manual)
            await deductStock(tx, item.productId, user.branchId, item.qty, body.id, user.id);
        }
        const manualItems = items.filter((item) => item.manual);
        if (manualItems.length)
          await tx.auditLog.create({
            data: {
              userId: user.id,
              branchId: user.branchId,
              action: 'sale.manual',
              entity: 'sale',
              entityId: body.id,
              details: { items: manualItems },
            },
          });
        return sale;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.db.sale.findUnique({
          where: { id: body.id },
          include: receiptInclude,
        });
        if (duplicate) return checkExisting(duplicate);
      }
      throw error;
    }
  }
}
