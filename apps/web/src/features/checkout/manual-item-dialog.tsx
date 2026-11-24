import { useState } from 'react';
import { X } from 'lucide-react';
import { manualItemSchema, parseMoney, type ManualItem } from '@lee/shared';
import { Button } from '@/components/ui/button';
import { useDialog } from '@/components/use-dialog';

export function ManualItemDialog({
  onAdd,
  onClose,
}: {
  onAdd: (item: ManualItem) => boolean;
  onClose: () => void;
}) {
  useDialog('manual-item');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState('');
  return (
    <div className="modal-backdrop">
      <section
        className="product-dialog manual-item-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-item-title"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">ONE-TIME BILL ITEM</p>
            <h2 id="manual-item-title">Add manual item</h2>
          </div>
          <button aria-label="Close manual item" onClick={onClose}>
            <X size={22} />
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            let unitPriceCents: number;
            try {
              unitPriceCents = parseMoney(price);
            } catch {
              setError('Enter a valid price, such as 250.00.');
              return;
            }
            const parsed = manualItemSchema.safeParse({
              name,
              unitPriceCents,
              qty: Number(quantity),
            });
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? 'Check the item details.');
              return;
            }
            if (onAdd(parsed.data)) onClose();
            else setError('The item could not be added. Check the basket limit or total.');
          }}
        >
          <div className="manual-item-fields">
            <label className="field">
              Item name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={160}
                required
                autoFocus
                placeholder="Enter the product name"
              />
            </label>
            <label className="field">
              Unit price (LKR)
              <input
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                required
                placeholder="0.00"
              />
            </label>
            <label className="field">
              Quantity
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="10000"
                step="1"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
              />
            </label>
            <p className="muted-note">
              Added to this bill only. No catalog stock is deducted, and no tax is added to the
              entered price.
            </p>
          </div>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Add to bill</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
