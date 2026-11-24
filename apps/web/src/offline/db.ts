import Dexie, { type EntityTable } from 'dexie';
import type { Product, Receipt, SaleRequest, ShopSettings } from '@lee/shared';
export type CatalogRecord = {
  branchId: string;
  products: Product[];
  categories?: Product['category'][];
  settings: ShopSettings;
  cachedAt: string;
};
export type QueuedSale = {
  id: string;
  ownerId: string;
  ownerName: string;
  branchId: string;
  request: SaleRequest;
  receipt: Receipt;
  state: 'pending' | 'synced' | 'blocked';
  createdAt: string;
  attempts: number;
  nextAttemptAt: number;
  leaseUntil: number;
  lastError: string;
  syncedAt?: string;
};
export const offlineDb = new Dexie('lee-pos-offline-v1') as Dexie & {
  catalogs: EntityTable<CatalogRecord, 'branchId'>;
  sales: EntityTable<QueuedSale, 'id'>;
};
offlineDb.version(1).stores({
  catalogs: 'branchId',
  sales: 'id, ownerId, branchId, state, createdAt, [ownerId+state]',
});
