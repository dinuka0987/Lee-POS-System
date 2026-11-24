import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@lee/shared';
import { ShieldCheck, ScanBarcode, ReceiptText } from 'lucide-react';
import { Navigate } from 'react-router';
import { useAuth } from './auth-context';
import { Button } from '@/components/ui/button';
export function LoginPage() {
  const { user, login } = useAuth();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  if (user) return <Navigate to="/" replace />;
  return (
    <div className="login-shell">
      <section className="login-story">
        <div className="login-brand">
          <span className="lee-logo login-brand-logo">
            <img src="/lee-logo.png" alt="" width={56} height={56} />
          </span>
          <span>
            Lee<span className="login-brand-small">POINT OF SALE</span>
          </span>
        </div>
        <div className="login-story-copy">
          <span className="login-kicker">EVERYDAY RETAIL, MADE SIMPLE</span>
          <h1>
            A better day
            <br />
            at the counter.
          </h1>
          <p>
            From the first scan to the final receipt.
            <br />
            Everything your shop needs to keep moving.
          </p>
          <div className="login-perks">
            <span>
              <ScanBarcode size={20} /> Scan and sell
            </span>
            <span>
              <ReceiptText size={20} /> Print receipts
            </span>
            <span>
              <ShieldCheck size={20} /> Secure access
            </span>
          </div>
        </div>
        <p className="login-story-footer">Built for Lee. Ready for your next customer.</p>
      </section>
      <main className="login-form-side">
        <div className="login-form-card">
          <div className="login-lock lee-logo">
            <img src="/lee-logo.png" alt="Lee logo" width={44} height={44} />
          </div>
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Sign in to your shop</h2>
          <p className="login-description">Use your Lee account to open the counter.</p>
          <form
            onSubmit={handleSubmit(async (values) => {
              setError('');
              try {
                await login(values.email, values.password);
              } catch (error) {
                setError((error as Error).message);
              }
            })}
          >
            <label className="field">
              Email address
              <input
                type="email"
                autoComplete="username"
                placeholder="Email"
                {...register('email')}
              />
              {errors.email && <small className="field-error">{errors.email.message}</small>}
            </label>
            <label className="field">
              Password
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                {...register('password')}
              />
              {errors.password && <small className="field-error">{errors.password.message}</small>}
            </label>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            <Button type="submit" className="login-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="login-help">Need access? Contact your shop administrator.</p>
        </div>
      </main>
    </div>
  );
}
