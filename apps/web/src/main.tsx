import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router';
import { LoginPage } from './features/auth/login-page';
import { AuthProvider } from './features/auth/auth-context';
import { AppLayout } from './components/app-layout';
import { CheckoutPage } from './features/checkout/checkout-page';
import { ProductsPage } from './features/products/products-page';
import { ReportsPage } from './features/reports/reports-page';
import { SalesHistoryPage } from './features/sales/sales-page';
import { UsersPage } from './features/users/users-page';
import { AuditPage } from './features/audit/audit-page';
import { SettingsPage } from './features/settings/settings-page';
import { PwaControls } from './offline/pwa-controls';
import './styles.css';
import './pos.css';
import './management.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, networkMode: 'always' } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AppLayout />}>
              <Route index element={<CheckoutPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="sales" element={<SalesHistoryPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route
              path="*"
              element={
                <main className="not-found">
                  <h1>Page not found</h1>
                  <a href="/">Return to Lee</a>
                </main>
              }
            />
          </Routes>
          <PwaControls />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
