import { useState } from 'react';
import { Navigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { formatMoney, shopDate, type DailyReport } from '@lee/shared';
import { Banknote, CreditCard, ReceiptText, Package, RefreshCw } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
export function ReportsPage() {
  const { user } = useAuth();
  const [date, setDate] = useState(shopDate());
  const report = useQuery({
    queryKey: ['daily-report', date],
    queryFn: () => api<DailyReport>(`/reports/daily?date=${date}`),
    enabled: user?.role === 'admin' && !!date,
  });
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <main className="management-content">
      <div className="checkout-heading">
        <div>
          <p className="eyebrow">YOUR SHOP AT A GLANCE</p>
          <h1>Daily sales report</h1>
          <p className="subtitle">Completed sales · Sri Lanka time (Asia/Colombo)</p>
        </div>
        <Button
          variant="outline"
          onClick={() => void report.refetch()}
          disabled={report.isFetching}
        >
          <RefreshCw size={16} />
          Refresh
        </Button>
      </div>
      <div className="filters-bar">
        <label>
          Business date
          <input
            aria-label="Report date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <Button variant="outline" onClick={() => setDate(shopDate())}>
          Today
        </Button>
      </div>
      {report.isError ? (
        <div className="error-banner" role="alert">
          {report.error.message} Reports need a connection to the server.
        </div>
      ) : report.isPending ? (
        <p className="catalog-empty">Loading report…</p>
      ) : (
        <>
          <div className="report-cards">
            <article>
              <span>Total sales</span>
              <strong>{formatMoney(report.data.totalCents)}</strong>
              <small>{report.data.transactionCount} completed transactions</small>
            </article>
            <article>
              <span>
                <Banknote size={17} />
                Cash sales
              </span>
              <strong>{formatMoney(report.data.cashCents)}</strong>
              <small>Applied payments, excluding change</small>
            </article>
            <article>
              <span>
                <CreditCard size={17} />
                Card sales
              </span>
              <strong>{formatMoney(report.data.cardCents)}</strong>
              <small>External terminal payments</small>
            </article>
            <article>
              <span>
                <Package size={17} />
                Items sold
              </span>
              <strong>{report.data.itemsSold.toLocaleString()}</strong>
              <small>{report.data.voidCount} voided transactions excluded</small>
            </article>
          </div>
          <section className="detail-panel">
            <h2>
              <ReceiptText size={20} />
              Sales breakdown
            </h2>
            <dl className="breakdown">
              <div>
                <dt>Subtotal before tax</dt>
                <dd>{formatMoney(report.data.subtotalCents)}</dd>
              </div>
              <div>
                <dt>Tax collected</dt>
                <dd>{formatMoney(report.data.taxCents)}</dd>
              </div>
              <div>
                <dt>Discounts</dt>
                <dd>{formatMoney(report.data.discountCents)}</dd>
              </div>
              <div>
                <dt>Total sales</dt>
                <dd>{formatMoney(report.data.totalCents)}</dd>
              </div>
            </dl>
            <p className="muted-note">
              Voided sales and sales still stored only on a cashier’s device are excluded. Late
              offline sync adds sales to their original business date.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
