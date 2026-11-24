import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
export async function deductStock(
  tx: Prisma.TransactionClient,
  productId: string,
  branchId: string,
  qty: number,
  saleId: string,
  userId: string,
) {
  const updated = await tx.stockLevel.updateMany({
    where: { productId, branchId, quantity: { gte: qty } },
    data: { quantity: { decrement: qty } },
  });
  if (updated.count !== 1)
    throw new ConflictException('Insufficient stock. Refresh the catalog and check the quantity.');
  await tx.stockMovement.create({
    data: { productId, branchId, qty: -qty, type: 'sale', refId: saleId, userId },
  });
}
