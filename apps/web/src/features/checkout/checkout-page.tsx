import { formatMoney } from '@lee/shared';
import {
  Search,
  ScanBarcode,
  Plus,
  Minus,
  Trash2,
  ShoppingBasket,
  X,
  Banknote,
  CreditCard,
  CheckCheck,
  Printer,
  RefreshCw,
  Coffee,
  Package,
  Cookie,
  House,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SaleReceipt } from '@/printing/receipt';
import { browserPrinter } from '@/printing/printer';
import { useCheckout } from './use-checkout';
import { useState } from 'react';
import { ManualItemDialog } from './manual-item-dialog';
export function CheckoutPage() {
  const [manualOpen, setManualOpen] = useState(false);
  const {
    cart,
    setCart,
    search,
    setSearch,
    category,
    setCategory,
    paymentOpen,
    setPaymentOpen,
    method,
    setMethod,
    cash,
    setCash,
    reference,
    setReference,
    error,
    setError,
    busy,
    receipt,
    setReceipt,
    input,
    products,
    categories,
    visible,
    totals,
    count,
    locked,
    pending,
    cashCents,
    updateCart,
    add,
    addManual,
    scan,
    complete,
  } = useCheckout();
  return (
    <main className="checkout-content">
      <div className="checkout-heading">
        <div>
          <p className="eyebrow">AT THE COUNTER</p>
          <h1>Checkout</h1>
          <p className="subtitle">Ready for your next customer.</p>
        </div>
        <div className="counter-date">
          {new Date().toLocaleDateString('en-LK', {
            timeZone: 'Asia/Colombo',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>
      </div>
      {error && (
        <div role="alert" className="error-banner">
          {error}
        </div>
      )}
      {pending && (
        <div className="pending-banner">
          <div>
            <strong>Payment needs confirmation</strong>
            <p>Retry this sale to confirm whether it was saved. Its receipt ID stays the same.</p>
          </div>
          <Button onClick={() => void complete()} disabled={busy}>
            <RefreshCw size={16} />
            {busy ? 'Confirming…' : 'Retry same sale'}
          </Button>
        </div>
      )}
      <div className="checkout-grid">
        <section className="catalog-panel" aria-label="Product catalog">
          <div className="scan-search">
            <ScanBarcode size={22} />
            <input
              ref={input}
              aria-label="Scan barcode or search products"
              value={search}
              placeholder="Scan a barcode or search products…"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void scan();
                }
              }}
              disabled={locked}
            />
            <kbd>Enter</kbd>
            <Search size={18} />
          </div>
          <div className="category-tabs">
            {categories.map((name) => (
              <button
                key={name}
                onClick={() => {
                  setCategory(name);
                  input.current?.focus();
                }}
                className={category === name ? 'selected' : ''}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="catalog-count">
            <span>{visible.length} products</span>
            <div className="catalog-actions">
              <Button
                className="manual-item-button"
                variant="outline"
                size="sm"
                aria-label="Add manual item"
                onClick={() => setManualOpen(true)}
                disabled={locked}
              >
                <Plus size={16} />
                Manual item
              </Button>
              <button onClick={() => void products.refetch()} disabled={products.isFetching}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          </div>
          {products.isPending ? (
            <div className="catalog-empty">Loading products…</div>
          ) : products.isError ? (
            <div className="catalog-empty error-banner">
              {products.error.message}
              <Button variant="outline" onClick={() => void products.refetch()}>
                Try again
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="catalog-empty">
              <Search size={32} />
              <h3>No matching products</h3>
              <p>Try another name, SKU, or barcode.</p>
            </div>
          ) : (
            <div className="product-grid">
              {visible.map((product) => {
                const Icon =
                  product.category.name === 'Beverages'
                    ? Coffee
                    : product.category.name === 'Snacks'
                      ? Cookie
                      : product.category.name === 'Household'
                        ? House
                        : Package;
                return (
                  <button
                    className="product-tile"
                    key={product.id}
                    disabled={locked || !product.quantity}
                    onClick={() => add(product)}
                    aria-label={`Add ${product.name}`}
                  >
                    <div className={`product-visual ${product.category.name.toLowerCase()}`}>
                      <Icon size={40} strokeWidth={1.25} />
                      <span>
                        {product.quantity ? `${product.quantity} in stock` : 'Out of stock'}
                      </span>
                    </div>
                    <div className="product-info">
                      <span className="product-category">{product.category.name}</span>
                      <h3>{product.name}</h3>
                      <div>
                        <strong>{formatMoney(product.priceCents)}</strong>
                        <span className="tile-add">
                          <Plus size={17} />
                        </span>
                      </div>
                      {product.taxRateBps > 0 && <small>+ {product.taxRateBps / 100}% tax</small>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <p className="catalog-footnote">
            <ScanBarcode size={16} /> Scanner ready · scan a barcode and press Enter
          </p>
        </section>
        <aside className="basket-panel">
          <div className="basket-heading">
            <h2>
              Current sale <span>{count}</span>
            </h2>
            <button
              aria-label="Clear basket"
              disabled={!cart.length || locked}
              onClick={() => {
                setCart([]);
                setError('');
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
          {cart.length === 0 ? (
            <div className="empty-basket">
              <span>
                <ShoppingBasket size={37} strokeWidth={1.5} />
              </span>
              <h3>A fresh start</h3>
              <p>
                Scan a barcode or select a product
                <br />
                to add it to this sale.
              </p>
            </div>
          ) : (
            <div className="basket-lines">
              {cart.map(({ product, qty }) => (
                <div className="basket-line" key={product.id}>
                  <div className="basket-line-top">
                    <strong>{product.name}</strong>
                    <button
                      aria-label={`Remove ${product.name}`}
                      disabled={locked}
                      onClick={() =>
                        setCart((current) =>
                          current.filter((item) => item.product.id !== product.id),
                        )
                      }
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <p>
                    {formatMoney(product.priceCents)} each
                    {product.manual && <span className="manual-item-label"> · Manual item</span>}
                  </p>
                  <div className="basket-line-bottom">
                    <div className="qty-controls">
                      <button
                        aria-label={`Decrease ${product.name}`}
                        disabled={locked}
                        onClick={() =>
                          setCart((current) =>
                            current.flatMap((item) =>
                              item.product.id === product.id
                                ? qty > 1
                                  ? [{ ...item, qty: qty - 1 }]
                                  : []
                                : [item],
                            ),
                          )
                        }
                      >
                        <Minus size={13} />
                      </button>
                      <input
                        aria-label={`Quantity for ${product.name}`}
                        type="number"
                        min="1"
                        max={Math.min(product.quantity, 10000)}
                        value={qty}
                        disabled={locked}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (
                            Number.isInteger(value) &&
                            value >= 1 &&
                            value <= Math.min(product.quantity, 10000)
                          )
                            updateCart(
                              cart.map((item) =>
                                item.product.id === product.id ? { ...item, qty: value } : item,
                              ),
                            );
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') input.current?.focus();
                        }}
                      />
                      <button
                        aria-label={`Increase ${product.name}`}
                        disabled={locked || qty >= product.quantity}
                        onClick={() => add(product)}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    <strong>{formatMoney(product.priceCents * qty)}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="basket-summary">
            <div>
              <span>Subtotal</span>
              <span>{formatMoney(totals.subtotalCents)}</span>
            </div>
            <div>
              <span>Tax</span>
              <span>{formatMoney(totals.taxCents)}</span>
            </div>
            <div className="basket-total">
              <strong>Total</strong>
              <strong>{formatMoney(totals.totalCents)}</strong>
            </div>
            <Button
              className="pay-button"
              disabled={!cart.length || locked || products.isError}
              onClick={() => {
                setError('');
                setPaymentOpen(true);
              }}
            >
              <Banknote size={20} /> Take payment <span>{formatMoney(totals.totalCents)}</span>
            </Button>
            <p className="payment-note">Cash or external card terminal</p>
          </div>
        </aside>
      </div>
      {manualOpen && <ManualItemDialog onAdd={addManual} onClose={() => setManualOpen(false)} />}
      {paymentOpen && !receipt && (
        <div className="modal-backdrop">
          <section
            className="payment-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-title"
          >
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">COMPLETE THE SALE</p>
                <h2 id="payment-title">Take payment</h2>
              </div>
              <button
                aria-label="Close payment"
                disabled={busy || !!pending}
                onClick={() => setPaymentOpen(false)}
              >
                <X size={22} />
              </button>
            </div>
            <div className="payment-due">
              <span>Amount due</span>
              <strong>{formatMoney(totals.totalCents)}</strong>
              <small>{count} items · Tax included in total</small>
            </div>
            <div className="payment-methods">
              <button
                className={method === 'cash' ? 'selected' : ''}
                disabled={locked}
                onClick={() => setMethod('cash')}
              >
                <Banknote size={22} />
                Cash
              </button>
              <button
                className={method === 'card' ? 'selected' : ''}
                disabled={locked}
                onClick={() => setMethod('card')}
              >
                <CreditCard size={22} />
                Card terminal
              </button>
            </div>
            {method === 'cash' ? (
              <>
                <label className="field">
                  Cash received (LKR)
                  <input
                    autoFocus
                    inputMode="decimal"
                    value={cash}
                    onChange={(event) => setCash(event.target.value)}
                    placeholder="0.00"
                    disabled={locked}
                  />
                </label>
                <button
                  className="exact-cash"
                  disabled={locked}
                  onClick={() =>
                    setCash(
                      `${Math.trunc(totals.totalCents / 100)}.${String(totals.totalCents % 100).padStart(2, '0')}`,
                    )
                  }
                >
                  Use exact amount
                </button>
                <div className="change-row">
                  <span>Change to customer</span>
                  <strong>{formatMoney(Math.max(0, cashCents - totals.totalCents))}</strong>
                </div>
              </>
            ) : (
              <label className="field">
                External terminal reference
                <input
                  value={reference}
                  maxLength={120}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Reference on the terminal slip"
                  disabled={locked}
                />
                <small>
                  Complete the payment on your certified terminal first. Enter its reference only.
                </small>
              </label>
            )}
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            <Button
              className="confirm-payment"
              disabled={
                busy ||
                (!pending && method === 'cash' && cashCents < totals.totalCents) ||
                (!pending && method === 'card' && !reference.trim())
              }
              onClick={() => void complete()}
            >
              {busy ? 'Saving sale…' : pending ? 'Retry same sale' : 'Complete sale'}
            </Button>
            <p className="payment-note">Confirm only after receiving cash or terminal approval.</p>
          </section>
        </div>
      )}
      {receipt && (
        <div className="modal-backdrop">
          <section
            className="receipt-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-complete"
          >
            <div className="sale-success">
              <CheckCheck size={26} />
              <h2 id="sale-complete">Sale complete</h2>
              <p>
                {receipt.syncStatus === 'synced'
                  ? 'Payment recorded and stock updated.'
                  : 'Saved on this device. Sync will run automatically.'}
              </p>
            </div>
            <div className="receipt-preview">
              <SaleReceipt receipt={receipt} autoPrint />
            </div>
            <div className="receipt-actions">
              <Button variant="outline" onClick={() => browserPrinter.print()}>
                <Printer size={17} />
                Print receipt
              </Button>
              <Button
                onClick={() => {
                  setReceipt(null);
                  setError('');
                }}
              >
                New sale
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
