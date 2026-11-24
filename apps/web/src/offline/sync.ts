import type { Receipt, User } from '@lee/shared';
import { api, ApiError } from '@/lib/api';
import { offlineDb } from './db';
import { retryDelay } from './queue';
import { refreshCatalogAfterChange } from './catalog';
import { readSession } from '@/features/auth/session';
let running = false;
export async function syncSales(user: User): Promise<void> {
  if (running || !navigator.onLine || readSession()?.user.id !== user.id) return;
  running = true;
  try {
    let changed = false;
    const candidates = (await offlineDb.sales.where('ownerId').equals(user.id).toArray())
      .filter(
        (sale) =>
          sale.branchId === user.branchId &&
          sale.state === 'pending' &&
          sale.nextAttemptAt <= Date.now(),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, 20);
    for (const candidate of candidates) {
      if (!navigator.onLine || readSession()?.user.id !== user.id) break;
      const claimed = await offlineDb.transaction('rw', offlineDb.sales, async () => {
        const current = await offlineDb.sales.get(candidate.id);
        if (
          !current ||
          current.state !== 'pending' ||
          current.leaseUntil > Date.now() ||
          current.nextAttemptAt > Date.now()
        )
          return false;
        await offlineDb.sales.update(current.id, { leaseUntil: Date.now() + 30_000 });
        return true;
      });
      if (!claimed) continue;
      if (readSession()?.user.id !== user.id) {
        await offlineDb.sales.update(candidate.id, { leaseUntil: 0 });
        break;
      }
      try {
        const receipt = await api<Receipt>('/sync/sales', {
          method: 'POST',
          body: JSON.stringify(candidate.request),
        });
        await offlineDb.sales.update(candidate.id, {
          state: 'synced',
          receipt: { ...receipt, syncStatus: 'synced' },
          syncedAt: new Date().toISOString(),
          leaseUntil: 0,
          lastError: '',
        });
        changed = true;
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 0;
        const blocked = [400, 403, 404, 409, 422].includes(status);
        await offlineDb.sales.update(candidate.id, {
          state: blocked ? 'blocked' : 'pending',
          receipt: { ...candidate.receipt, syncStatus: blocked ? 'blocked' : 'pending' },
          attempts: candidate.attempts + 1,
          nextAttemptAt: Date.now() + retryDelay(candidate.attempts + 1),
          leaseUntil: 0,
          lastError: (error as Error).message,
        });
        if (!blocked || status === 401) break;
      }
    }
    if (changed && readSession()?.user.id === user.id) {
      try {
        await refreshCatalogAfterChange(user);
      } catch {
        /* Synced receipts stay saved even if refreshing the catalog fails. */
      }
    }
  } finally {
    running = false;
  }
}
export async function retryQueuedSale(id: string, user: User) {
  const entry = await offlineDb.sales.get(id);
  if (!entry || entry.ownerId !== user.id || entry.state === 'synced') return;
  await offlineDb.sales.update(id, { state: 'pending', nextAttemptAt: 0, lastError: '' });
  await syncSales(user);
}
