import { useState } from 'react';
import { Navigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ManagedUser } from '@lee/shared';
import { Plus, X, KeyRound } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useDialog } from '@/components/use-dialog';
const schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email(),
  password: z.string().min(12, 'Use at least 12 characters').max(72),
});
function AccountForm({ target, close }: { target: ManagedUser | null; close: () => void }) {
  useDialog('account');
  const { user, logout } = useAuth();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: target?.name ?? '', email: target?.email ?? '', password: '' },
  });
  return (
    <div className="modal-backdrop">
      <section
        className="product-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
      >
        <div className="dialog-heading">
          <h2 id="account-title">{target ? 'Reset account password' : 'Add cashier'}</h2>
          <button aria-label="Close account form" disabled={isSubmitting} onClick={close}>
            <X size={22} />
          </button>
        </div>
        <form
          onSubmit={handleSubmit(async (values) => {
            setError('');
            try {
              await api(target ? `/users/${target.id}/password` : '/users', {
                method: 'POST',
                body: JSON.stringify(target ? { password: values.password } : values),
              });
              await client.invalidateQueries({ queryKey: ['users'] });
              close();
              if (target?.id === user?.id) logout();
            } catch (error) {
              setError((error as Error).message);
            }
          })}
        >
          {target ? (
            <p className="muted-note">
              {target.name} · {target.email}. Existing sessions will be revoked.
            </p>
          ) : (
            <>
              <label className="field">
                Cashier name
                <input {...register('name')} autoComplete="off" />
              </label>
              <label className="field">
                Email address
                <input type="email" {...register('email')} autoComplete="off" />
              </label>
            </>
          )}
          <label className="field">
            New password
            <input type="password" {...register('password')} autoComplete="new-password" />
            <small>Use 12–72 characters. Share the password directly with the cashier.</small>
          </label>
          {Object.values(errors).map((error, index) => (
            <p className="field-error" key={index}>
              {error.message}
            </p>
          ))}
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <div className="form-actions">
            <Button type="button" variant="outline" onClick={close} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : target ? 'Reset password' : 'Create cashier'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
export function UsersPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [editing, setEditing] = useState<ManagedUser | null | undefined>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const accounts = useQuery({
    queryKey: ['users'],
    queryFn: () => api<ManagedUser[]>('/users'),
    enabled: user?.role === 'admin',
  });
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <main className="management-content">
      <div className="checkout-heading">
        <div>
          <p className="eyebrow">THE PEOPLE AT YOUR COUNTER</p>
          <h1>Users</h1>
          <p className="subtitle">Add cashiers, manage access, and reset passwords.</p>
        </div>
        <Button onClick={() => setEditing(null)}>
          <Plus size={17} />
          Add cashier
        </Button>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {accounts.isError ? (
        <div className="error-banner">{accounts.error.message}</div>
      ) : accounts.isPending ? (
        <p className="catalog-empty">Loading accounts…</p>
      ) : (
        <section className="products-table-panel table-scroll">
          <table className="products-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {accounts.data.map((account) => (
                <tr key={account.id}>
                  <td>{account.name}</td>
                  <td>{account.email}</td>
                  <td>{account.role === 'admin' ? 'Administrator' : 'Cashier'}</td>
                  <td>
                    <span className={`product-status ${account.active ? '' : 'archived'}`}>
                      {account.active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <div className="inline-actions">
                      <Button variant="outline" size="sm" onClick={() => setEditing(account)}>
                        <KeyRound size={15} />
                        Reset password
                      </Button>
                      {account.role === 'cashier' && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy === account.id}
                          onClick={async () => {
                            setBusy(account.id);
                            setError('');
                            try {
                              await api(`/users/${account.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ active: !account.active }),
                              });
                              await client.invalidateQueries({ queryKey: ['users'] });
                            } catch (error) {
                              setError((error as Error).message);
                            } finally {
                              setBusy(null);
                            }
                          }}
                        >
                          {account.active ? 'Disable' : 'Enable'}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="muted-note">
        Administrator accounts are protected from disabling here. Password resets invalidate server
        access immediately; an offline counter learns about changes when it reconnects.
      </p>
      {editing !== undefined && (
        <AccountForm target={editing} close={() => setEditing(undefined)} />
      )}
    </main>
  );
}
