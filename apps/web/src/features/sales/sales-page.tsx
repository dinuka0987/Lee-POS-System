import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatMoney, shopDate, type Receipt, type SalesPage } from '@lee/shared';
import { Search, RefreshCw, ReceiptText } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/auth-context';
import { ReceiptDialog } from '@/printing/receipt-dialog';
import { Button } from '@/components/ui/button';
import { VoidControls } from './void-controls';
export function SalesHistoryPage() {
  const { user } = useAuth();
  const [date, setDate] = useState(shopDate());
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const params = new URLSearchParams({
    page: String(page),
    ...(date ? { date } : {}),
    ...(search ? { q: search } : {}),
    ...(status ? { status } : {}),
  });
  const sales = useQuery({
    queryKey: ['sales-history', date, search, status, page, user!.id],
    queryFn: () => api<SalesPage>(`/sales?${params}`),
  });
  return (
    <main className="management-content">
      <div className="checkout-heading">
        <div>
          <p className="eyebrow">EVERY SALE, ACCOUNTED FOR</p>
          <h1>Sales history</h1>
          <p className="subtitle">
            {user?.role === 'admin'
              ? 'Review your store’s sales and reprint receipts.'
              : 'Your completed sales and receipts.'}
          </p>
        </div>
        <Button variant="outline" disabled={sales.isFetching} onClick={() => void sales.refetch()}>
          <RefreshCw size={16} />
          Refresh
        </Button>
      </div>
      <div className="filters-bar">
        <label>
          Business date
          <input
            aria-label="Sales date"
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <Button
          variant="outline"
          onClick={() => {
            setDate('');
            setPage(1);
          }}
        >
          All dates
        </Button>
        <label>
          Status
          <select
            aria-label="Sales status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="voided">Voided</option>
          </select>
        </label>
        <form
          className="history-search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(q);
            setPage(1);
          }}
        >
          <input
            aria-label="Search sales"
            placeholder="Full receipt ID, product, or cashier"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <Button variant="outline" type="submit">
            <Search size={16} />
            Search
          </Button>
        </form>
      </div>
      {sales.isError ? (
        <div className="error-banner" role="alert">
          {sales.error.message} Synced sales history requires a server connection.
        </div>
      ) : sales.isPending ? (
        <p className="catalog-empty">Loading sales…</p>
      ) : (
        <section className="products-table-panel">
          <div className="table-scroll">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Time · Colombo</th>
                  <th>Cashier</th>
                  <th>Items</th>
                  <th>Payment</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {sales.data.data.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <code title={sale.id}>{sale.id.slice(0, 8)}</code>
                    </td>
                    <td>
                      {new Date(sale.createdAt).toLocaleString('en-LK', {
                        timeZone: 'Asia/Colombo',
                      })}
                    </td>
                    <td>{sale.cashier.name}</td>
                    <td>{sale.items.reduce((sum, line) => sum + line.qty, 0)}</td>
                    <td>{sale.payments[0]?.method === 'card' ? 'Card' : 'Cash'}</td>
                    <td>{formatMoney(sale.totalCents)}</td>
                    <td>
                      <span
                        className={`product-status ${sale.status === 'voided' ? 'archived' : ''}`}
                      >
                        {sale.status === 'voided' ? 'Voided' : 'Completed'}
                      </span>
                    </td>
                    <td>
                      <Button variant="outline" size="sm" onClick={() => setReceipt(sale)}>
                        <ReceiptText size={16} />
                        View receipt
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!sales.data.total && (
              <div className="catalog-empty">No sales match these filters.</div>
            )}
          </div>
          <div className="pagination">
            <span>
              {sales.data.total} sales · Page {page}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * sales.data.pageSize >= sales.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </section>
      )}
      {receipt && (
        <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)}>
          {user?.role === 'admin' && (
            <VoidControls key={receipt.id} receipt={receipt} onVoided={setReceipt} />
          )}
        </ReceiptDialog>
      )}
    </main>
  );
}
