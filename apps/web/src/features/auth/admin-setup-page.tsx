import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { adminSetupSchema, type AdminSetupStatus } from '@lee/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from './auth-context';

const schema = adminSetupSchema
  .extend({ confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords must match',
  });

export function AdminSetupPage() {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);
  const [existing, setExisting] = useState(false);
  const status = useQuery({
    queryKey: ['admin-setup'],
    queryFn: () => api<AdminSetupStatus>('/auth/setup'),
    retry: false,
    staleTime: 0,
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '', setupKey: '' },
  });
  if (user) return <Navigate to="/" replace />;
  return (
    <main className="admin-setup-shell">
      <section className="login-form-card admin-setup-card">
        <div className="login-lock lee-logo">
          <img src="/lee-logo.png" alt="Lee logo" width={44} height={44} />
        </div>
        <p className="eyebrow">WELCOME TO LEE</p>
        <h1>{created ? 'Your account is ready' : 'Create your admin account'}</h1>
        {created ? (
          <p className="login-description" role="status">
            Sign in with the email and password you just chose. You can add cashier accounts from
            Users.
          </p>
        ) : existing || status.data?.required === false ? (
          <p className="login-description">
            An administrator account already exists. Sign in or ask your administrator for access.
          </p>
        ) : status.isPending ? (
          <p className="login-description">Checking shop setup…</p>
        ) : status.isError ? (
          <div className="error-banner" role="alert">
            {status.error.message}
            <Button variant="outline" onClick={() => void status.refetch()}>
              Retry
            </Button>
          </div>
        ) : !status.data?.enabled ? (
          <p className="login-description">
            First-time setup has not been enabled. Contact your system developer to enable
            administrator setup.
          </p>
        ) : (
          <>
            <p className="login-description">
              Choose the account you will use to manage your shop.
            </p>
            <form
              onSubmit={handleSubmit(async ({ confirmPassword: _confirmation, ...values }) => {
                setError('');
                try {
                  await api('/auth/setup', { method: 'POST', body: JSON.stringify(values) });
                  reset();
                  setCreated(true);
                  void status.refetch();
                } catch (error) {
                  setError((error as Error).message);
                  if (error instanceof ApiError && error.status === 409) {
                    const current = await status.refetch();
                    setExisting(current.data?.required === false);
                  }
                }
              })}
            >
              <div className="admin-setup-fields">
                <label className="field">
                  Your name
                  <input autoComplete="name" maxLength={80} {...register('name')} />
                  {errors.name && <small className="field-error">{errors.name.message}</small>}
                </label>
                <label className="field">
                  Email address
                  <input
                    type="email"
                    autoComplete="username"
                    maxLength={254}
                    {...register('email')}
                  />
                  {errors.email && <small className="field-error">{errors.email.message}</small>}
                </label>
                <label className="field">
                  Password
                  <input
                    type="password"
                    aria-label="Password"
                    aria-describedby="setup-password-help"
                    autoComplete="new-password"
                    {...register('password')}
                  />
                  <small id="setup-password-help">
                    At least 12 characters, up to 72 UTF-8 bytes.
                  </small>
                  {errors.password && (
                    <small className="field-error">{errors.password.message}</small>
                  )}
                </label>
                <label className="field">
                  Confirm password
                  <input
                    type="password"
                    autoComplete="new-password"
                    {...register('confirmPassword')}
                  />
                  {errors.confirmPassword && (
                    <small className="field-error">{errors.confirmPassword.message}</small>
                  )}
                </label>
                <label className="field admin-setup-key">
                  Setup key
                  <input
                    type="password"
                    aria-label="Setup key"
                    aria-describedby="setup-key-help"
                    autoComplete="off"
                    maxLength={256}
                    {...register('setupKey')}
                  />
                  <small id="setup-key-help">
                    Use the private setup key supplied by your deployment owner.
                  </small>
                  {errors.setupKey && (
                    <small className="field-error">{errors.setupKey.message}</small>
                  )}
                </label>
              </div>
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              <Button type="submit" className="login-submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating account…' : 'Create admin account'}
              </Button>
            </form>
          </>
        )}
        <p className="login-help">
          <Link className="setup-link" to="/login">
            {created ? 'Continue to sign in' : 'Back to sign in'}
          </Link>
        </p>
      </section>
    </main>
  );
}
