import { NavLink, Navigate, Outlet } from 'react-router';
import {
  ScanBarcode,
  Package,
  LogOut,
  ReceiptText,
  ChartNoAxesCombined,
  Users,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { OfflineStatus } from '@/offline/offline-status';
export function AppLayout() {
  const { user, logout } = useAuth();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="pos-shell">
      <aside className="pos-sidebar">
        <NavLink className="brand" to="/">
          <span className="brand-mark lee-logo">
            <img src="/lee-logo.png" alt="" width={48} height={48} />
          </span>
          <span>
            Lee<small>POINT OF SALE</small>
          </span>
        </NavLink>
        <p className="workspace-label">YOUR WORKSPACE</p>
        <nav>
          <NavLink to="/" end className="pos-nav">
            <ScanBarcode size={20} />
            Checkout
          </NavLink>
          {user.role === 'admin' && (
            <NavLink to="/products" className="pos-nav">
              <Package size={20} />
              Products
            </NavLink>
          )}
          <NavLink to="/sales" className="pos-nav">
            <ReceiptText size={20} />
            Sales history
          </NavLink>
          {user.role === 'admin' && (
            <>
              <NavLink to="/reports" className="pos-nav">
                <ChartNoAxesCombined size={20} />
                Reports
              </NavLink>
              <NavLink to="/users" className="pos-nav">
                <Users size={20} />
                Users
              </NavLink>
              <NavLink to="/audit" className="pos-nav">
                <ShieldCheck size={20} />
                Audit log
              </NavLink>
              <NavLink to="/settings" className="pos-nav">
                <Settings size={20} />
                Settings
              </NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="cashier-avatar">{user.name.slice(0, 1)}</div>
          <div>
            <strong>{user.name}</strong>
            <span>{user.role === 'admin' ? 'Administrator' : 'Cashier'}</span>
          </div>
          <button title="Sign out" aria-label="Sign out" onClick={logout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="pos-main">
        <header className="pos-topbar">
          <div>
            <span className="store-label">LEE STORE</span>
            <span className="counter-label">Main counter</span>
          </div>
          <OfflineStatus online={online} />
        </header>
        <Outlet />
      </div>
    </div>
  );
}
