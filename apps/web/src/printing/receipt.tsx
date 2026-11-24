import { calculateLine, formatMoney, DEFAULT_SHOP_SETTINGS, type Receipt } from '@lee/shared';
import { useEffect, useRef, type CSSProperties } from 'react';
import { browserPrinter } from './printer';
export function SaleReceipt({
  receipt,
  autoPrint = false,
}: {
  receipt: Receipt;
  autoPrint?: boolean;
}) {
  const settings = receipt.receiptSettings ?? DEFAULT_SHOP_SETTINGS;
  const printed = useRef('');
  useEffect(() => {
    if (!autoPrint || !settings.autoPrint || printed.current === receipt.id) return;
    const frame = requestAnimationFrame(() => {
      printed.current = receipt.id;
      browserPrinter.print();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoPrint, settings.autoPrint, receipt.id]);
  const payment = receipt.payments[0]!;
  return (
    <div
      className="receipt-paper"
      id="sale-receipt"
      style={{ '--receipt-width': `${settings.paperWidthMm - 8}mm` } as CSSProperties}
    >
      <style media="print">{`@page { size: ${settings.paperWidthMm}mm 200mm; margin: 4mm; }`}</style>
      <h2>{settings.name}</h2>
      {settings.address && <p>{settings.address}</p>}
      {settings.phone && <p>{settings.phone}</p>}
      {receipt.status === 'voided' && (
        <p className="receipt-watermark">VOIDED · {receipt.voidReason}</p>
      )}
      <p>SALES RECEIPT</p>
      <p>{new Date(receipt.createdAt).toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })}</p>
      <p>Cashier: {receipt.cashier.name}</p>
      <p className="receipt-id">Receipt: {receipt.id}</p>
      <div className="receipt-rule" />
      {receipt.items.map((item) => (
        <div className="receipt-item" key={item.id}>
          <strong>{item.productName}</strong>
          <div>
            <span>
              {item.qty} × {formatMoney(item.unitPriceCents)}
            </span>
            <span>
              {formatMoney(
                calculateLine(item.unitPriceCents, item.qty, 0).subtotalCents +
                  item.taxCents -
                  item.discountCents,
              )}
            </span>
          </div>
        </div>
      ))}
      <div className="receipt-rule" />
      <div className="receipt-row">
        <span>Subtotal</span>
        <span>{formatMoney(receipt.subtotalCents)}</span>
      </div>
      <div className="receipt-row">
        <span>Tax</span>
        <span>{formatMoney(receipt.taxCents)}</span>
      </div>
      <div className="receipt-row receipt-total">
        <strong>Total</strong>
        <strong>{formatMoney(receipt.totalCents)}</strong>
      </div>
      <div className="receipt-rule" />
      <div className="receipt-row">
        <span>{payment.method === 'cash' ? 'Cash received' : 'Card terminal'}</span>
        <span>{formatMoney(payment.tenderedCents)}</span>
      </div>
      {payment.method === 'cash' ? (
        <div className="receipt-row">
          <span>Change</span>
          <span>{formatMoney(payment.tenderedCents - receipt.totalCents)}</span>
        </div>
      ) : (
        <p>Terminal reference: {payment.reference}</p>
      )}
      <div className="receipt-rule" />
      <p>{settings.receiptFooter}</p>
    </div>
  );
}
