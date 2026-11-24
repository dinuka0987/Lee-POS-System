import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { registerSW } from 'virtual:pwa-register';
import { offlineDb } from './db';
import { Button } from '@/components/ui/button';
type InstallEvent = Event & { prompt: () => Promise<void> };
export function PwaControls() {
  const [update, setUpdate] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [cart, setCart] = useState(0);
  const updater = useRef<((reload?: boolean) => Promise<void>) | null>(null);
  const pending = useLiveQuery(
    () =>
      offlineDb.sales
        .where('state')
        .notEqual('synced')
        .count()
        .catch(() => 0),
    [],
    0,
  );
  useEffect(() => {
    if (import.meta.env.PROD)
      updater.current = registerSW({ immediate: true, onNeedRefresh: () => setUpdate(true) });
    const available = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    const installed = () => setInstall(null);
    const basket = (event: Event) => setCart((event as CustomEvent<number>).detail);
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', installed);
    window.addEventListener('lee-cart-state', basket);
    return () => {
      window.removeEventListener('beforeinstallprompt', available);
      window.removeEventListener('appinstalled', installed);
      window.removeEventListener('lee-cart-state', basket);
    };
  }, []);
  if (!install && !update) return null;
  return (
    <aside className="pwa-banner" role="status">
      {update ? (
        <>
          <span>
            A Lee update is ready. Finish the basket and sync local sales before reloading.
          </span>
          <Button
            size="sm"
            disabled={!!pending || cart > 0}
            onClick={() => {
              void updater.current?.(true);
            }}
          >
            Reload app
          </Button>
        </>
      ) : (
        <>
          <span>Keep Lee at your counter.</span>
          <Button
            size="sm"
            onClick={() => {
              void install?.prompt();
              setInstall(null);
            }}
          >
            Install app
          </Button>
        </>
      )}
    </aside>
  );
}
