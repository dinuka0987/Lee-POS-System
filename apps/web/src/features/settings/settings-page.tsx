import { useState } from 'react';
import { Navigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_SHOP_SETTINGS, type ShopSettings } from '@lee/shared';
import { useAuth } from '@/features/auth/auth-context';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { offlineDb } from '@/offline/db';
import { DeveloperDetails } from './developer-details';
function SettingsForm({ settings }: { settings: ShopSettings }) {
  const { user } = useAuth();
  const [value, setValue] = useState<ShopSettings>({
    name: settings.name,
    address: settings.address,
    phone: settings.phone,
    receiptFooter: settings.receiptFooter,
    paperWidthMm: settings.paperWidthMm,
    autoPrint: settings.autoPrint,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const client = useQueryClient();
  return (
    <form
      className="detail-panel settings-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setSaved(false);
        try {
          const updated = await api<ShopSettings>('/settings', {
            method: 'PUT',
            body: JSON.stringify(value),
          });
          if (user) await offlineDb.catalogs.update(user.branchId, { settings: updated });
          await client.invalidateQueries({ queryKey: ['shop-settings'] });
          setSaved(true);
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Shop details</h2>
      {(
        [
          { key: 'name', label: 'Shop name', max: 80 },
          { key: 'address', label: 'Shop address', max: 240 },
          { key: 'phone', label: 'Phone number', max: 60 },
          { key: 'receiptFooter', label: 'Receipt footer', max: 240 },
        ] as const
      ).map((field) => (
        <label className="field" key={field.key}>
          {field.label}
          <input
            value={value[field.key]}
            required={field.key === 'name'}
            maxLength={field.max}
            onChange={(event) => {
              setValue({ ...value, [field.key]: event.target.value });
              setSaved(false);
            }}
          />
        </label>
      ))}
      <h2>Receipt preferences</h2>
      <label className="field">
        Paper width
        <select
          aria-label="Paper width"
          value={value.paperWidthMm}
          onChange={(event) =>
            setValue({ ...value, paperWidthMm: Number(event.target.value) as 58 | 80 })
          }
        >
          <option value="80">80 mm</option>
          <option value="58">58 mm</option>
        </select>
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={value.autoPrint}
          onChange={(event) => setValue({ ...value, autoPrint: event.target.checked })}
        />
        Open the print dialog automatically after checkout
      </label>
      <p className="muted-note">
        Select your actual printer in the browser print dialog. Browsers cannot silently select a
        printer. Disable print headers/footers and choose matching paper.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {saved && (
        <p className="success-banner" role="status">
          Shop settings saved.
        </p>
      )}
      <div className="form-actions">
        <Button disabled={busy} type="submit">
          {busy ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </form>
  );
}
export function SettingsPage() {
  const { user } = useAuth();
  const settings = useQuery({
    queryKey: ['shop-settings'],
    queryFn: () => api<ShopSettings>('/settings'),
    enabled: user?.role === 'admin',
  });
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <main className="management-content">
      <div className="checkout-heading">
        <div>
          <p className="eyebrow">MAKE THE COUNTER YOURS</p>
          <h1>Shop settings</h1>
          <p className="subtitle">Shop details, receipt preferences, and developer support.</p>
        </div>
      </div>
      {settings.isPending ? (
        <p className="catalog-empty">Loading settings…</p>
      ) : settings.isError ? (
        <div className="error-banner">{settings.error.message}</div>
      ) : (
        <div className="settings-layout">
          <SettingsForm settings={settings.data ?? DEFAULT_SHOP_SETTINGS} />
          <DeveloperDetails />
        </div>
      )}
    </main>
  );
}
