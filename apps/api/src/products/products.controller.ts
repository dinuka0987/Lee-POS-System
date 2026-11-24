import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { User } from '@lee/shared';
import { PrismaService } from '../common/prisma.service';
import { AdminOnly, CurrentUser } from '../auth/auth.decorators';
import { AdjustStockDto, CategoryDto, CreateProductDto, UpdateProductDto } from './products.dto';

const productInclude = (branchId: string) => ({
  category: true,
  stockLevels: { where: { branchId } },
});

@ApiTags('Products')
@ApiBearerAuth()
@Controller()
export class ProductsController {
  constructor(private readonly db: PrismaService) {}
  @Get('categories')
  categories(@CurrentUser() user: User, @Query('includeInactive') includeInactive?: string) {
    return this.db.category.findMany({
      where:
        user.role === 'admin' && includeInactive === 'true'
          ? {}
          : {
              products: { some: { active: true } },
            },
      orderBy: { name: 'asc' },
    });
  }
  @AdminOnly()
  @Post('categories')
  async createCategory(@Body() body: CategoryDto) {
    return this.db.category.upsert({
      where: { name: body.name.trim() },
      update: {},
      create: { name: body.name.trim() },
    });
  }
  @Get('products')
  async list(
    @CurrentUser() user: User,
    @Query('q') query = '',
    @Query('includeInactive') includeInactive?: string,
  ) {
    const products = await this.db.product.findMany({
      where: {
        ...(user.role === 'admin' && includeInactive === 'true' ? {} : { active: true }),
        ...(query
          ? {
              OR: [
                { name: { contains: query.slice(0, 160), mode: 'insensitive' as const } },
                { barcode: { contains: query.slice(0, 64) } },
                { sku: { contains: query.slice(0, 64), mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: productInclude(user.branchId),
      orderBy: { name: 'asc' },
    });
    return products.map(({ stockLevels, ...product }) => ({
      ...product,
      quantity: stockLevels[0]?.quantity ?? 0,
    }));
  }
  @Get('products/barcode/:barcode')
  async barcode(@Param('barcode') barcode: string, @CurrentUser() user: User) {
    const product = await this.db.product.findUnique({
      where: { barcode },
      include: productInclude(user.branchId),
    });
    if (!product?.active) throw new NotFoundException('Barcode not found');
    const { stockLevels, ...data } = product;
    return { ...data, quantity: stockLevels[0]?.quantity ?? 0 };
  }
  @AdminOnly()
  @Post('products')
  async create(@Body() body: CreateProductDto, @CurrentUser() user: User) {
    const { initialQuantity = 0, ...data } = body;
    try {
      return await this.db.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            ...data,
            name: data.name.trim(),
            sku: data.sku.trim(),
            stockLevels: { create: { branchId: user.branchId, quantity: initialQuantity } },
          },
        });
        if (initialQuantity > 0)
          await tx.stockMovement.create({
            data: {
              productId: product.id,
              branchId: user.branchId,
              type: 'receive',
              qty: initialQuantity,
              refId: product.id,
              userId: user.id,
            },
          });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            branchId: user.branchId,
            action: 'adjust',
            entity: 'product',
            entityId: product.id,
            details: { before: null, after: product, initialQuantity },
          },
        });
        return product;
      });
    } catch (error) {
      this.productError(error);
    }
  }
  @AdminOnly()
  @Patch('products/:id/stock')
  async adjustStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdjustStockDto,
    @CurrentUser() user: User,
  ) {
    return this.db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id } });
      if (!product) throw new NotFoundException('Product not found');
      const branchId = user.branchId;
      await tx.stockLevel.upsert({
        where: { productId_branchId: { productId: id, branchId } },
        create: { productId: id, branchId, quantity: 0 },
        update: {},
      });
      const updated = await tx.stockLevel.updateMany({
        where: { productId: id, branchId, quantity: body.expectedQuantity },
        data: { quantity: body.quantity },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'Stock changed on another till. Close this window and try again.',
        );
      const delta = body.quantity - body.expectedQuantity;
      if (delta !== 0) {
        const movementId = randomUUID();
        await tx.stockMovement.create({
          data: {
            id: movementId,
            productId: id,
            branchId,
            type: 'adjust',
            qty: delta,
            refId: movementId,
            userId: user.id,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            branchId,
            action: 'adjust',
            entity: 'stock',
            entityId: id,
            details: {
              before: body.expectedQuantity,
              after: body.quantity,
              delta,
              reason: body.reason.trim(),
              movementId,
            },
          },
        });
      }
      return { productId: id, branchId, quantity: body.quantity };
    });
  }
  @AdminOnly()
  @Patch('products/:id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProductDto,
    @CurrentUser() user: User,
  ) {
    try {
      return await this.db.$transaction(async (tx) => {
        const before = await tx.product.findUnique({ where: { id } });
        if (!before) throw new NotFoundException('Product not found');
        const after = await tx.product.update({ where: { id }, data: body });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            branchId: user.branchId,
            action: 'adjust',
            entity: 'product',
            entityId: id,
            details: { before, after },
          },
        });
        return after;
      });
    } catch (error) {
      this.productError(error);
    }
  }
  @AdminOnly()
  @Delete('products/:id')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.update(id, { active: false }, user);
  }
  private productError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ConflictException('SKU or barcode already exists');
      if (error.code === 'P2003') throw new BadRequestException('Select a valid category');
    }
    throw error;
  }
}
