import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SHOP_SETTINGS, type Product, type SaleRequest, type User } from '@lee/shared';
import { offlineDb } from './db';
import { enqueueSale, retryDelay, type CartLine } from './queue';
import { syncSales } from './sync';
import { saveSession } from '@/features/auth/session';
import { api, ApiError } from '@/lib/api';
import { refreshCatalog, refreshCatalogAfterChange } from './catalog';
vi.mock('@/lib/api', () => ({
  api: vi.fn(),
  ApiError: class extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));
const user: User = {
  id: '10000000-0000-4000-8000-000000000001',
  branchId: '10000000-0000-4000-8000-000000000002',
  name: 'Test Cashier',
  email: 'test@example.test',
  role: 'cashier',
};
const product: Product = {
  id: '10000000-0000-4000-8000-000000000003',
  sku: 'TEA',
  barcode: '123',
  name: 'Tea',
  categoryId: '10000000-0000-4000-8000-000000000004',
  category: { id: '10000000-0000-4000-8000-000000000004', name: 'Groceries' },
  priceCents: 10000,
  taxRateBps: 1800,
  quantity: 5,
  active: true,
};
const session = (account = user) =>
  saveSession({
    user: account,
    accessToken: `x.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.x`,
  });
const request = (qty = 2): SaleRequest => ({
  id: crypto.randomUUID(),
  cashierId: user.id,
  branchId: user.branchId,
  occurredAt: new Date().toISOString(),
  items: [{ productId: product.id, qty, unitPriceCents: 10000, taxRateBps: 1800 }],
  payment: { method: 'cash', amountCents: 11800 * qty },
});
beforeEach(async () => {
  vi.resetAllMocks();
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal('navigator', { onLine: true });
  await offlineDb.sales.clear();
  await offlineDb.catalogs.clear();
  session();
  await offlineDb.catalogs.put({
    branchId: user.branchId,
    products: [product],
    settings: DEFAULT_SHOP_SETTINGS,
    cachedAt: new Date().toISOString(),
  });
});
afterAll(async () => {
  await offlineDb.delete();
  vi.unstubAllGlobals();
});
describe('durable offline checkout', () => {
  it('queues a mixed manual bill once, synchronizes it and only deducts catalog stock once', async () => {
    const manualProduct: CartLine['product'] = {
      ...product,
      id: crypto.randomUUID(),
      manual: true,
      name: 'Handmade item',
      priceCents: 12345,
      taxRateBps: 0,
      quantity: 10000,
    };
    const body: SaleRequest = {
      ...request(2),
      items: [
        {
          productId: product.id,
          unitPriceCents: product.priceCents,
          taxRateBps: product.taxRateBps,
          qty: 2,
        },
        {
          manual: true,
          lineId: manualProduct.id,
          productName: manualProduct.name,
          qty: 3,
          unitPriceCents: 12345,
          taxRateBps: 0,
        },
      ],
      payment: { method: 'cash', amountCents: 60635 },
    };
    const cart = [
      { product, qty: 2 },
      { product: manualProduct, qty: 3 },
    ];
    const receipt = await enqueueSale(body, cart, user);
    await enqueueSale(body, cart, user);
    expect(receipt.totalCents).toBe(60635);
    expect(receipt.items.find((line) => line.productName === manualProduct.name)).toMatchObject({
      productId: null,
      qty: 3,
    });
    expect(await offlineDb.sales.count()).toBe(1);
    expect((await offlineDb.catalogs.get(user.branchId))!.products).toHaveLength(1);
    expect((await offlineDb.catalogs.get(user.branchId))!.products[0]!.quantity).toBe(3);
    vi.mocked(api).mockImplementation(async (path) =>
      path === '/sync/sales'
        ? receipt
        : path === '/products'
          ? [{ ...product, quantity: 3 }]
          : path === '/categories'
            ? [product.category]
            : DEFAULT_SHOP_SETTINGS,
    );
    await syncSales(user);
    expect((await offlineDb.sales.get(body.id))!.state).toBe('synced');
    expect((await offlineDb.catalogs.get(user.branchId))!.products[0]!.quantity).toBe(3);
  });

  it('allows manual-only offline bills when the cached catalog is empty', async () => {
    await offlineDb.catalogs.update(user.branchId, { products: [] });
    const body: SaleRequest = {
      ...request(),
      items: [
        {
          manual: true,
          lineId: crypto.randomUUID(),
          productName: 'Unlisted item',
          qty: 1,
          unitPriceCents: 25050,
          taxRateBps: 0,
        },
      ],
      payment: { method: 'cash', amountCents: 25050 },
    };
    const receipt = await enqueueSale(body, [], user);
    expect(receipt.items[0]).toMatchObject({ productId: null, productName: 'Unlisted item' });
    expect((await offlineDb.catalogs.get(user.branchId))!.products).toEqual([]);
  });

  it('refetches stale stock if a sale syncs while a catalog request is in flight', async () => {
    const body = request();
    await enqueueSale(body, [{ product, qty: 2 }], user);
    let resolve!: (products: Product[]) => void;
    let reads = 0;
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/products') {
        reads++;
        return reads === 1
          ? new Promise<Product[]>((done) => {
              resolve = done;
            })
          : [{ ...product, quantity: 3 }];
      }
      return path === '/categories' ? [] : DEFAULT_SHOP_SETTINGS;
    });
    const refresh = refreshCatalog(user);
    await vi.waitFor(() => expect(reads).toBe(1));
    await offlineDb.sales.update(body.id, { state: 'synced' });
    resolve([{ ...product, quantity: 5 }]);
    expect((await refresh)[0]!.quantity).toBe(3);
    expect(reads).toBe(2);
    expect((await offlineDb.catalogs.get(user.branchId))!.products[0]!.quantity).toBe(3);
  });

  it('coalesces polls but fetches a new snapshot after a manual stock change', async () => {
    let resolve!: (products: Product[]) => void;
    let reads = 0;
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/products') {
        reads++;
        return reads === 1
          ? new Promise<Product[]>((done) => {
              resolve = done;
            })
          : [{ ...product, quantity: 8 }];
      }
      return path === '/categories' ? [] : DEFAULT_SHOP_SETTINGS;
    });
    const poll = refreshCatalog(user);
    expect(refreshCatalog(user)).toBe(poll);
    await vi.waitFor(() => expect(reads).toBe(1));
    const changed = refreshCatalogAfterChange(user);
    resolve([{ ...product, quantity: 5 }]);
    await poll;
    expect((await changed)[0]!.quantity).toBe(8);
    expect(reads).toBe(2);
  });

  it('recovers an abandoned upload lease after expiry', async () => {
    const body = request();
    const receipt = await enqueueSale(body, [{ product, qty: 2 }], user);
    await offlineDb.sales.update(body.id, { leaseUntil: Date.now() + 30_000 });
    vi.mocked(api).mockImplementation(async (path) =>
      path === '/sync/sales'
        ? receipt
        : path === '/products'
          ? [{ ...product, quantity: 3 }]
          : DEFAULT_SHOP_SETTINGS,
    );
    await syncSales(user);
    expect(api).not.toHaveBeenCalled();
    await offlineDb.sales.update(body.id, { leaseUntil: Date.now() - 1 });
    await syncSales(user);
    expect((await offlineDb.sales.get(body.id))!.state).toBe('synced');
    expect(vi.mocked(api).mock.calls.filter((call) => call[0] === '/sync/sales')).toHaveLength(1);
  });
  it('atomically saves the receipt and stock once, even for repeated local requests', async () => {
    const body = request();
    const [first, second] = await Promise.all([
      enqueueSale(body, [{ product, qty: 2 }], user),
      enqueueSale(body, [{ product, qty: 2 }], user),
    ]);
    expect(first.id).toBe(second.id);
    expect(first.totalCents).toBe(23600);
    expect(await offlineDb.sales.count()).toBe(1);
    expect((await offlineDb.catalogs.get(user.branchId))!.products[0]!.quantity).toBe(3);
  });
  it('rolls back the local queue when cached stock is insufficient', async () => {
    await expect(enqueueSale(request(6), [{ product, qty: 6 }], user)).rejects.toThrow(
      'Cached stock',
    );
    expect(await offlineDb.sales.count()).toBe(0);
    expect((await offlineDb.catalogs.get(user.branchId))!.products[0]!.quantity).toBe(5);
  });
  it('retries lost responses with the same UUID and marks success without another local deduction', async () => {
    const body = request();
    const receipt = await enqueueSale(body, [{ product, qty: 2 }], user);
    vi.mocked(api).mockRejectedValueOnce(new ApiError('Response lost', 0));
    await syncSales(user);
    expect((await offlineDb.sales.get(body.id))!.state).toBe('pending');
    await offlineDb.sales.update(body.id, { nextAttemptAt: 0 });
    vi.mocked(api).mockImplementation(async (path) =>
      path === '/sync/sales'
        ? receipt
        : path === '/products'
          ? [{ ...product, quantity: 3 }]
          : DEFAULT_SHOP_SETTINGS,
    );
    await syncSales(user);
    expect((await offlineDb.sales.get(body.id))!.state).toBe('synced');
    const requests = vi.mocked(api).mock.calls.filter((call) => call[0] === '/sync/sales');
    expect(requests.map((call) => JSON.parse(call[1]!.body as string).id)).toEqual([
      body.id,
      body.id,
    ]);
    expect((await offlineDb.catalogs.get(user.branchId))!.products[0]!.quantity).toBe(3);
  });
  it('retains rejected sales for review and does not sync another cashier’s queue', async () => {
    const body = request();
    await enqueueSale(body, [{ product, qty: 2 }], user);
    const other: User = { ...user, id: '10000000-0000-4000-8000-000000000005' };
    session(other);
    await syncSales(other);
    expect(api).not.toHaveBeenCalled();
    session();
    vi.mocked(api).mockRejectedValue(new ApiError('Price changed', 409));
    await syncSales(user);
    const saved = await offlineDb.sales.get(body.id);
    expect(saved!.state).toBe('blocked');
    expect(saved!.lastError).toBe('Price changed');
    expect(retryDelay(1)).toBe(2000);
    expect(retryDelay(99)).toBe(300000);
  });
});
