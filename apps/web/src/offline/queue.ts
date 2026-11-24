import {
  calculateCart,
  calculateLine,
  DEFAULT_SHOP_SETTINGS,
  type Product,
  type Receipt,
  type SaleRequest,
  type User,
} from '@lee/shared';
import { offlineDb } from './db';
import { readSession } from '@/features/auth/session';
export type CartLine = { product: Product & { manual?: true }; qty: number };
export async function enqueueSale(
  request: SaleRequest,
  cart: CartLine[],
  user: User,
): Promise<Receipt> {
  const session = readSession();
  if (session?.user.id !== user.id || session.user.branchId !== user.branchId)
    throw new Error('Your shift session expired. Reconnect and sign in before continuing.');
  return offlineDb.transaction('rw', offlineDb.sales, offlineDb.catalogs, async () => {
    const existing = await offlineDb.sales.get(request.id);
    if (existing) return existing.receipt;
    const cached = await offlineDb.catalogs.get(user.branchId);
    if (!cached) throw new Error('A cached catalog is required before taking payment.');
    const products = cached.products.map((product) => ({ ...product }));
    for (const line of request.items) {
      if (line.manual) continue;
      const product = products.find((product) => product.id === line.productId);
      if (!product?.active || product.quantity < line.qty)
        throw new Error('Cached stock changed. Refresh the basket and check the quantity.');
      product.quantity -= line.qty;
    }
    const totals = calculateCart(request.items);
    const createdAt = request.occurredAt ?? new Date().toISOString();
    const receipt: Receipt = {
      id: request.id,
      branchId: user.branchId,
      cashierId: user.id,
      cashier: { name: user.name },
      createdAt,
      status: 'completed',
      ...totals,
      receiptSettings: cached.settings ?? DEFAULT_SHOP_SETTINGS,
      syncStatus: 'pending',
      items: request.items.map((line) => ({
        id: crypto.randomUUID(),
        productId: line.manual ? null : line.productId,
        productName: line.manual
          ? line.productName
          : cart.find((item) => item.product.id === line.productId)!.product.name,
        qty: line.qty,
        unitPriceCents: line.unitPriceCents,
        taxCents: calculateLine(line.unitPriceCents, line.qty, line.taxRateBps).taxCents,
        discountCents: 0,
      })),
      payments: [
        {
          method: request.payment.method,
          amountCents: totals.totalCents,
          tenderedCents: request.payment.amountCents,
          reference: request.payment.reference ?? null,
        },
      ],
    };
    await offlineDb.sales.add({
      id: request.id,
      ownerId: user.id,
      ownerName: user.name,
      branchId: user.branchId,
      request,
      receipt,
      state: 'pending',
      createdAt,
      attempts: 0,
      nextAttemptAt: 0,
      leaseUntil: 0,
      lastError: '',
    });
    await offlineDb.catalogs.put({ ...cached, products });
    return receipt;
  });
}
export function retryDelay(attempts: number) {
  return Math.min(300_000, 1000 * 2 ** Math.min(attempts, 9));
}
