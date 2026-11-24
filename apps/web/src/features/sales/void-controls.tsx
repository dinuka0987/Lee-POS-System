import { useState } from 'react';
import type { Receipt } from '@lee/shared';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { refreshCatalogAfterChange } from '@/offline/catalog';
export function VoidControls({
  receipt,
  onVoided,
}: {
  receipt: Receipt;
  onVoided: (receipt: Receipt) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const client = useQueryClient();
  const { user } = useAuth();
  if (receipt.status === 'voided')
    return <p className="error-banner">Voided: {receipt.voidReason}</p>;
  return (
    <div className="void-controls">
      {!open ? (
        <Button variant="outline" onClick={() => setOpen(true)}>
          Void this sale
        </Button>
      ) : (
        <>
          <h3>Void the entire sale</h3>
          <p className="muted-note">
            Stock will be restored and the sale excluded from totals. This does not reverse a card
            terminal transaction or return cash automatically.
          </p>
          <label className="field">
            Reason
            <input
              value={reason}
              maxLength={240}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is this sale being voided?"
            />
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I have handled the cash return or external terminal reversal where required.
          </label>
          {error && (
            <div role="alert" className="error-banner">
              {error}
            </div>
          )}
          <div className="form-actions">
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel void
            </Button>
            <Button
              disabled={busy || !confirmed || reason.trim().length < 4}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  const updated = await api<Receipt>(`/sales/${receipt.id}/void`, {
                    method: 'POST',
                    body: JSON.stringify({ reason: reason.trim(), paymentReversed: confirmed }),
                  });
                  onVoided(updated);
                  if (user) await refreshCatalogAfterChange(user);
                  await client.invalidateQueries();
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Voiding…' : 'Confirm void'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
