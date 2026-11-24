import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SHOP_SETTINGS, type User } from '@lee/shared';
import { api, ApiError } from '@/lib/api';
import { offlineDb } from './db';
import { refreshCatalog } from './catalog';

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

beforeEach(async () => {
  vi.resetAllMocks();
  await offlineDb.catalogs.clear();
  await offlineDb.sales.clear();
});

afterAll(() => offlineDb.close());

describe('catalog categories', () => {
  it('caches categories with no products and retains them when offline', async () => {
    const categories = [{ id: '10000000-0000-4000-8000-000000000003', name: 'Bakery' }];
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/products') return [];
      if (path === '/settings') return DEFAULT_SHOP_SETTINGS;
      if (path === '/categories') return categories;
      throw new Error(`Unexpected request: ${path}`);
    });

    expect(await refreshCatalog(user)).toEqual([]);
    expect((await offlineDb.catalogs.get(user.branchId))?.categories).toEqual(categories);

    vi.mocked(api).mockRejectedValue(new ApiError('Offline', 0));
    expect(await refreshCatalog(user)).toEqual([]);
    expect((await offlineDb.catalogs.get(user.branchId))?.categories).toEqual(categories);
  });

  it('continues opening older cached catalogs that have no category list', async () => {
    await offlineDb.catalogs.put({
      branchId: user.branchId,
      products: [],
      settings: DEFAULT_SHOP_SETTINGS,
      cachedAt: new Date().toISOString(),
    });
    vi.mocked(api).mockRejectedValue(new ApiError('Offline', 0));

    expect(await refreshCatalog(user)).toEqual([]);
    expect((await offlineDb.catalogs.get(user.branchId))?.categories).toBeUndefined();
  });
});
