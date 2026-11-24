import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { Product } from '@lee/shared';
import { Button } from '@/components/ui/button';
import { useDialog } from '@/components/use-dialog';
import { useAuth } from '@/features/auth/auth-context';
import { api } from '@/lib/api';
import { offlineDb } from '@/offline/db';
import { refreshCatalogAfterChange } from '@/offline/catalog';

export function StockDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  useDialog('stock');
  const { user } = useAuth();
  const client = useQueryClient();
  const [quantity, setQuantity] = useState(String(product.quantity));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const unsynced = useLiveQuery(
    async () =>
      user
        ? (await offlineDb.sales.where('branchId').equals(user.branchId).toArray()).filter(
            (sale) => sale.state !== 'synced',
          ).length
        : 0,
    [user?.branchId],
  );
  const validQuantity = /^\d{1,7}$/.test(quantity) && Number(quantity) <= 1_000_000;
  const locked = busy || !online || unsynced === undefined || unsynced > 0;
  return (
    <div className="modal-backdrop">
      <section
        className="product-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-title"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">INVENTORY</p>
            <h2 id="stock-title">Adjust stock</h2>
            <p className="subtitle">{product.name}</p>
          </div>
          <button aria-label="Close stock adjustment" onClick={onClose} disabled={busy}>
            <X size={22} />
          </button>
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!user || locked || !navigator.onLine || !validQuantity || reason.trim().length < 4)
              return;
            setBusy(true);
            setError('');
            try {
              await api(`/products/${product.id}/stock`, {
                method: 'PATCH',
                body: JSON.stringify({
                  quantity: Number(quantity),
                  expectedQuantity: product.quantity,
                  reason: reason.trim(),
                }),
              });
              await refreshCatalogAfterChange(user);
              await client.invalidateQueries({ queryKey: ['admin-products'] });
              onClose();
            } catch (error) {
              setError((error as Error).message);
              void client.invalidateQueries({ queryKey: ['admin-products'] });
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="muted-note">Stock when opened: {product.quantity} units.</p>
          <label className="field">
            New stock quantity
            <input
              type="number"
              min="0"
              max="1000000"
              step="1"
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
              disabled={busy}
            />
          </label>
          <label className="field">
            Adjustment reason
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={4}
              maxLength={240}
              placeholder="e.g. Delivery received or stock count correction"
              required
              disabled={busy}
            />
          </label>
          {!online && <p className="error-banner">Connect to the server to adjust stock.</p>}
          {!!unsynced && (
            <p className="error-banner">
              Sync or resolve this device’s queued sales before adjusting stock.
            </p>
          )}
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={locked || !validQuantity || reason.trim().length < 4}>
              {busy ? 'Saving…' : 'Save stock'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
