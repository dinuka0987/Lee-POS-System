import { useState } from 'react';
import { Navigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { AuditEntry } from '@lee/shared';
import { useAuth } from '@/features/auth/auth-context';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
export function AuditPage() {
  const { user } = useAuth();
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const logs = useQuery({
    queryKey: ['audit', action, page],
    queryFn: () =>
      api<{ data: AuditEntry[]; total: number; pageSize: number }>(
        `/audit?${new URLSearchParams({ page: String(page), ...(action ? { action } : {}) })}`,
      ),
    enabled: user?.role === 'admin',
  });
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <main className="management-content">
      <div className="checkout-heading">
        <div>
          <p className="eyebrow">A CLEAR RECORD OF CHANGES</p>
          <h1>Audit log</h1>
          <p className="subtitle">Who changed what, when, and why.</p>
        </div>
        <Button variant="outline" onClick={() => void logs.refetch()}>
          Refresh
        </Button>
      </div>
      <div className="filters-bar">
        <label>
          Action
          <select
            aria-label="Audit action"
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All actions</option>
            {[
              'void',
              'adjust',
              'user.create',
              'user.update',
              'user.password-reset',
              'settings.update',
              'sale.manual',
            ].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      {logs.isError ? (
        <div className="error-banner">{logs.error.message}</div>
      ) : logs.isPending ? (
        <p className="catalog-empty">Loading audit records…</p>
      ) : (
        <section className="products-table-panel">
          <div className="table-scroll">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Time · Colombo</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Before / after</th>
                </tr>
              </thead>
              <tbody>
                {logs.data.data.map((log) => (
                  <tr key={log.id}>
                    <td>
                      {new Date(log.createdAt).toLocaleString('en-LK', {
                        timeZone: 'Asia/Colombo',
                      })}
                    </td>
                    <td>
                      {log.user.name}
                      <small>{log.user.email}</small>
                    </td>
                    <td>{log.action}</td>
                    <td>
                      {log.entity}
                      <small>{log.entityId}</small>
                    </td>
                    <td>
                      <details className="audit-details">
                        <summary>View changes</summary>
                        <pre>{JSON.stringify(log.details, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!logs.data.total && (
              <p className="catalog-empty">No audit records match this filter.</p>
            )}
          </div>
          <div className="pagination">
            <span>
              {logs.data.total} records · Page {page}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * logs.data.pageSize >= logs.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
