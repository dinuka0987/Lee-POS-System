import { DEFAULT_SHOP_SETTINGS, type Product, type ShopSettings, type User } from '@lee/shared';
import { api, ApiError } from '@/lib/api';
import { offlineDb } from './db';
const refreshing = new Map<string, Promise<Product[]>>();

export function refreshCatalog(user: User): Promise<Product[]> {
  const existing = refreshing.get(user.branchId);
  if (existing) return existing;
  const work = fetchCatalog(user).finally(() => refreshing.delete(user.branchId));
  refreshing.set(user.branchId, work);
  return work;
}

export async function refreshCatalogAfterChange(user: User): Promise<Product[]> {
  // A poll started before a mutation may contain the old stock. Let it finish,
  // then request a snapshot that starts after the mutation has committed.
  await refreshing.get(user.branchId)?.catch(() => {});
  return refreshCatalog(user);
}

async function pendingSales(branchId: string) {
  return (await offlineDb.sales.where('branchId').equals(branchId).toArray()).filter(
    (sale) => sale.state !== 'synced',
  );
}
const pendingSignature = (sales: Awaited<ReturnType<typeof pendingSales>>) =>
  sales
    .map((sale) => `${sale.id}:${sale.state}`)
    .sort()
    .join('|');

async function fetchCatalog(user: User): Promise<Product[]> {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = pendingSignature(await pendingSales(user.branchId));
      const [products, settings, categories] = await Promise.all([
        api<Product[]>('/products'),
        api<ShopSettings>('/settings'),
        api<Product['category'][]>('/categories'),
      ]);
      const result = await offlineDb.transaction(
        'rw',
        offlineDb.catalogs,
        offlineDb.sales,
        async () => {
          const unconfirmed = await pendingSales(user.branchId);
          // A sale queued or synced while the HTTP request was in flight changes
          // which deductions belong to this server snapshot. Fetch a fresh one.
          if (pendingSignature(unconfirmed) !== before) return null;
          const catalog = products.map((product) => ({
            ...product,
            quantity: Math.max(
              0,
              product.quantity -
                unconfirmed.reduce(
                  (sum, sale) =>
                    sum +
                    (sale.request.items.find((item) => item.productId === product.id)?.qty ?? 0),
                  0,
                ),
            ),
          }));
          await offlineDb.catalogs.put({
            branchId: user.branchId,
            products: catalog,
            categories,
            settings,
            cachedAt: new Date().toISOString(),
          });
          return catalog;
        },
      );
      if (result) return result;
    }
    throw new ApiError('Stock is changing. Try refreshing again.', 503);
  } catch (error) {
    if (!(error instanceof ApiError) || (error.status !== 0 && error.status < 500)) throw error;
    const cached = await offlineDb.catalogs.get(user.branchId);
    if (!cached)
      throw new Error('No catalog is cached yet. Connect and sign in before selling offline.', {
        cause: error,
      });
    return cached.products;
  }
}
export async function cachedSettings(branchId: string) {
  return (await offlineDb.catalogs.get(branchId))?.settings ?? DEFAULT_SHOP_SETTINGS;
}
