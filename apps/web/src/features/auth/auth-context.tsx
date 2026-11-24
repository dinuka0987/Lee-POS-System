import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '@lee/shared';
import { api, ApiError, setAccessToken } from '@/lib/api';
import { readSession, saveSession, clearSession, sessionExpiry } from './session';
import { refreshCatalog } from '@/offline/catalog';
import { syncSales } from '@/offline/sync';
const Context = createContext<{
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
} | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const session = readSession();
    setAccessToken(session?.accessToken ?? null);
    return session?.user ?? null;
  });
  const client = useQueryClient();
  function logout() {
    clearSession();
    setAccessToken(null);
    setUser(null);
    client.clear();
  }
  useEffect(() => {
    const expire = () => {
      clearSession();
      setAccessToken(null);
      setUser(null);
      client.clear();
    };
    window.addEventListener('lee-session-expired', expire);
    return () => window.removeEventListener('lee-session-expired', expire);
  }, [client]);
  useEffect(() => {
    const session = readSession();
    if (!user || !session) return;
    const timer = setTimeout(
      () => {
        clearSession();
        setAccessToken(null);
        setUser(null);
        client.clear();
      },
      Math.max(0, sessionExpiry(session.accessToken) - Date.now()),
    );
    const work = () => {
      void syncSales(user).catch(() => {});
    };
    work();
    const interval = setInterval(work, 2000);
    window.addEventListener('online', work);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('online', work);
    };
  }, [user, client]);
  useEffect(() => {
    if (!user) return;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || !navigator.onLine || document.visibilityState === 'hidden') return;
      refreshing = true;
      try {
        await refreshCatalog(user);
        await client.invalidateQueries({ queryKey: ['admin-products'] });
      } catch {
        /* Keep the saved catalog available when the server cannot be reached. */
      } finally {
        refreshing = false;
      }
    };
    const work = () => void refresh();
    work();
    const interval = setInterval(work, 5000);
    window.addEventListener('online', work);
    window.addEventListener('focus', work);
    document.addEventListener('visibilitychange', work);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', work);
      window.removeEventListener('focus', work);
      document.removeEventListener('visibilitychange', work);
    };
  }, [user, client]);
  useEffect(() => {
    if (!user) return;
    void api<User>('/auth/me')
      .then((current) => {
        const session = readSession();
        if (session?.user.id !== current.id) return;
        saveSession({ ...session, user: current });
        if (current.role !== user.role || current.name !== user.name) setUser(current);
      })
      .catch((error) => {
        if (!(error instanceof ApiError) || error.status !== 0) {
          /* Authentication errors are handled by the global expiry event. */
        }
      });
  }, [user]);
  async function login(email: string, password: string) {
    const session = await api<{ accessToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(session.accessToken);
    try {
      saveSession(session);
      await refreshCatalog(session.user);
    } catch (error) {
      clearSession();
      setAccessToken(null);
      throw error;
    }
    client.clear();
    setUser(session.user);
    void navigator.storage?.persist?.().catch(() => {});
  }
  return <Context.Provider value={{ user, login, logout }}>{children}</Context.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error('AuthProvider is missing');
  return context;
}
