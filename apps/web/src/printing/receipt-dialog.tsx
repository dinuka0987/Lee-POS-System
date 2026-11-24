import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Receipt } from '@lee/shared';
import { Printer, X } from 'lucide-react';
import { SaleReceipt } from './receipt';
import { browserPrinter } from './printer';
import { Button } from '@/components/ui/button';
import { useDialog } from '@/components/use-dialog';
export function ReceiptDialog({
  receipt,
  onClose,
  children,
}: {
  receipt: Receipt;
  onClose: () => void;
  children?: ReactNode;
}) {
  useDialog('history-receipt');
  return createPortal(
    <div className="modal-backdrop">
      <section
        className="receipt-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-receipt-title"
      >
        <div className="dialog-heading">
          <h2 id="history-receipt-title">Sale receipt</h2>
          <button aria-label="Close receipt" onClick={onClose}>
            <X size={22} />
          </button>
        </div>
        <div className="receipt-preview">
          <SaleReceipt receipt={receipt} />
          {children}
        </div>
        <div className="receipt-actions">
          <Button variant="outline" onClick={() => browserPrinter.print()}>
            <Printer size={16} />
            Print receipt
          </Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
