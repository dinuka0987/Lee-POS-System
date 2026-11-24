import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Wifi, WifiOff, RefreshCw, X } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { offlineDb } from './db';
import { retryQueuedSale, syncSales } from './sync';
import { ReceiptDialog } from '@/printing/receipt-dialog';
import { Button } from '@/components/ui/button';
import type { Receipt } from '@lee/shared';
import { useDialog } from '@/components/use-dialog';
export function OfflineStatus({ online }: { online: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState('');
  const queued = useLiveQuery(
    async () =>
      user
        ? (await offlineDb.sales.where('branchId').equals(user.branchId).toArray()).filter(
            (sale) => sale.state !== 'synced',
          )
        : [],
    [user?.id, user?.branchId],
    [],
  );
  useDialog(open && !receipt ? 'sync-queue' : '');
  return (
    <>
      <button
        className={`network-badge ${online ? '' : 'offline'}`}
        onClick={() => setOpen(true)}
        aria-label="Open offline sync status"
      >
        {online ? <Wifi size={16} /> : <WifiOff size={16} />}
        {online ? 'Online' : 'Offline'} · {queued?.length ?? 0} unsynced
      </button>
      {open && !receipt && (
        <div className="modal-backdrop">
          <section
            className="sync-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-title"
          >
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">SAVED ON THIS DEVICE</p>
                <h2 id="sync-title">Offline sales queue</h2>
              </div>
              <button aria-label="Close sync status" onClick={() => setOpen(false)}>
                <X size={22} />
              </button>
            </div>
            <p className="muted-note">
              Sales sync automatically while this app is open and their original cashier is signed
              in. Do not clear browser data while sales are unsynced.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                if (user) void syncSales(user).catch((error) => setError((error as Error).message));
              }}
            >
              <RefreshCw size={16} />
              Sync my sales now
            </Button>
            {error && <div className="error-banner">{error}</div>}
            {!queued?.length ? (
              <p className="catalog-empty">All sales on this device are synced.</p>
            ) : (
              queued.map((sale) => (
                <article className="queue-entry" key={sale.id}>
                  <div>
                    <strong>
                      {sale.id.slice(0, 8)} · {sale.ownerName}
                    </strong>
                    <span
                      className={`product-status ${sale.state === 'blocked' ? 'archived' : ''}`}
                    >
                      {sale.state === 'blocked' ? 'Needs review' : 'Waiting to sync'}
                    </span>
                  </div>
                  <p>
                    {new Date(sale.createdAt).toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })}
                  </p>
                  {sale.lastError && <p className="field-error">{sale.lastError}</p>}
                  <div className="inline-actions">
                    <Button variant="outline" size="sm" onClick={() => setReceipt(sale.receipt)}>
                      View local receipt
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!online || sale.ownerId !== user?.id}
                      onClick={() => {
                        if (user)
                          void retryQueuedSale(sale.id, user).catch((error) =>
                            setError((error as Error).message),
                          );
                      }}
                    >
                      Retry same sale
                    </Button>
                  </div>
                  {sale.ownerId !== user?.id && (
                    <p>Sign in as {sale.ownerName} to sync this sale.</p>
                  )}
                </article>
              ))
            )}
          </section>
        </div>
      )}
      {receipt && <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />}
    </>
  );
}
