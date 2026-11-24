import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate } from 'react-router';
import { formatMoney, parseMoney, type Product } from '@lee/shared';
import { Plus, Search, Pencil, Archive, X, Package, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/auth-context';
import { Button } from '@/components/ui/button';
import { useDialog } from '@/components/use-dialog';
import { useLiveQuery } from 'dexie-react-hooks';
import { offlineDb } from '@/offline/db';
import { refreshCatalogAfterChange } from '@/offline/catalog';
import { StockDialog } from './stock-dialog';

const schema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(64),
  barcode: z.string().regex(/^\S{1,64}$/, 'Enter a barcode without spaces'),
  categoryId: z.uuid('Select a category'),
  price: z.string().refine((value) => {
    try {
      return parseMoney(value) > 0 && parseMoney(value) <= 100_000_000;
    } catch {
      return false;
    }
  }, 'Enter a valid price greater than zero'),
  tax: z.string().refine((value) => {
    try {
      return parseMoney(value) <= 10000;
    } catch {
      return false;
    }
  }, 'Enter tax between 0 and 100%'),
  quantity: z
    .string()
    .regex(/^\d{1,7}$/, 'Enter a whole number')
    .refine((value) => Number(value) <= 1_000_000, 'Maximum opening stock is 1,000,000'),
});
type FormValues = z.infer<typeof schema>;
type Category = { id: string; name: string };
const decimal = (cents: number) =>
  `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

function ProductForm({ product, onClose }: { product: Product | null; onClose: () => void }) {
  useDialog('product');
  const client = useQueryClient();
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories?includeInactive=true'),
  });
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: product?.name ?? '',
      sku: product?.sku ?? '',
      barcode: product?.barcode ?? '',
      categoryId: product?.categoryId ?? '',
      price: product ? decimal(product.priceCents) : '',
      tax: product ? decimal(product.taxRateBps) : '0',
      quantity: '0',
    },
  });
  const fields = [
    { name: 'name', label: 'Product name', placeholder: 'e.g. Ceylon Tea · 200 g' },
    { name: 'sku', label: 'SKU', placeholder: 'e.g. BEV-003' },
    { name: 'barcode', label: 'Barcode', placeholder: 'Scan or enter barcode' },
    { name: 'price', label: 'Selling price (LKR, before tax)', placeholder: '0.00' },
    { name: 'tax', label: 'Tax rate (%)', placeholder: '0' },
  ] as const;
  return (
    <div className="modal-backdrop">
      <section
        className="product-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">YOUR CATALOG</p>
            <h2 id="product-form-title">{product ? 'Edit product' : 'Add product'}</h2>
          </div>
          <button aria-label="Close product form" disabled={isSubmitting} onClick={onClose}>
            <X size={22} />
          </button>
        </div>
        <form
          onSubmit={handleSubmit(async (values) => {
            setError('');
            try {
              await api(`/products${product ? `/${product.id}` : ''}`, {
                method: product ? 'PATCH' : 'POST',
                body: JSON.stringify({
                  name: values.name,
                  sku: values.sku,
                  barcode: values.barcode,
                  categoryId: values.categoryId,
                  priceCents: parseMoney(values.price),
                  taxRateBps: parseMoney(values.tax),
                  ...(!product ? { initialQuantity: Number(values.quantity) } : {}),
                }),
              });
              if (user) await refreshCatalogAfterChange(user);
              await Promise.all([
                client.invalidateQueries({ queryKey: ['admin-products'] }),
                client.invalidateQueries({ queryKey: ['catalog'] }),
              ]);
              onClose();
            } catch (error) {
              setError((error as Error).message);
            }
          })}
        >
          <div className="product-form-grid">
            {fields.map((field) => (
              <label
                className={`field ${field.name === 'name' ? 'full-field' : ''}`}
                key={field.name}
              >
                {field.label}
                <input
                  {...register(field.name)}
                  placeholder={field.placeholder}
                  autoFocus={field.name === 'name'}
                />
                {errors[field.name] && (
                  <small className="field-error">{errors[field.name]?.message}</small>
                )}
              </label>
            ))}
            <label className="field">
              Category
              <select {...register('categoryId')}>
                <option value="">Select a category</option>
                {categories.data?.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {errors.categoryId && (
                <small className="field-error">{errors.categoryId.message}</small>
              )}
            </label>
            {!product && (
              <label className="field">
                Opening stock
                <input inputMode="numeric" {...register('quantity')} />
                {errors.quantity && (
                  <small className="field-error">{errors.quantity.message}</small>
                )}
              </label>
            )}
          </div>
          <div className="new-category-row">
            <input
              aria-label="New category name"
              placeholder="New category name (optional)"
              maxLength={80}
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!newCategory.trim() || addingCategory}
              onClick={async () => {
                setAddingCategory(true);
                setError('');
                try {
                  const category = await api<Category>('/categories', {
                    method: 'POST',
                    body: JSON.stringify({ name: newCategory.trim() }),
                  });
                  await Promise.all([
                    client.invalidateQueries({ queryKey: ['categories'] }),
                    client.invalidateQueries({ queryKey: ['catalog'], refetchType: 'all' }),
                  ]);
                  setValue('categoryId', category.id, { shouldValidate: true });
                  setNewCategory('');
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setAddingCategory(false);
                }
              }}
            >
              Add category
            </Button>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <div className="form-actions">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save product'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function ProductsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const cached = useLiveQuery(
    () => (user ? offlineDb.catalogs.get(user.branchId) : undefined),
    [user?.branchId],
  );
  const quantities = new Map(cached?.products.map((product) => [product.id, product.quantity]));
  const client = useQueryClient();
  const products = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => api<Product[]>('/products?includeInactive=true'),
    enabled: user?.role === 'admin',
  });
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  const visible =
    products.data?.filter((product) =>
      `${product.name} ${product.sku} ${product.barcode}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <main className="products-content">
      <div className="checkout-heading">
        <div>
          <p className="eyebrow">KEEP YOUR SHELVES READY</p>
          <h1>Products</h1>
          <p className="subtitle">Your catalog, prices, and barcodes in one place.</p>
        </div>
        <Button onClick={() => setEditing(null)}>
          <Plus size={18} />
          Add product
        </Button>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <section className="products-table-panel">
        <div className="products-toolbar">
          <div className="scan-search">
            <Search size={18} />
            <input
              aria-label="Search product catalog"
              placeholder="Search name, SKU, or barcode…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <span>{visible.length} products</span>
        </div>
        {products.isPending ? (
          <p className="catalog-empty">Loading catalog…</p>
        ) : products.isError ? (
          <div className="error-banner" role="alert">
            {products.error.message}
            <Button variant="outline" onClick={() => void products.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Barcode / SKU</th>
                  <th>Price</th>
                  <th>Tax</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="table-product">
                        <span>
                          <Package size={19} />
                        </span>
                        <div>
                          <strong>{product.name}</strong>
                          <small>{product.category.name}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span>{product.barcode}</span>
                      <small>{product.sku}</small>
                    </td>
                    <td className="table-price">{formatMoney(product.priceCents)}</td>
                    <td>{product.taxRateBps / 100}%</td>
                    <td>
                      <button
                        className="stock-edit-button"
                        aria-label={`Adjust stock for ${product.name}`}
                        onClick={() => setStockProduct(product)}
                      >
                        {quantities.get(product.id) ?? product.quantity}
                        <Pencil size={14} />
                      </button>
                    </td>
                    <td>
                      <span className={`product-status ${product.active ? '' : 'archived'}`}>
                        {product.active ? 'Active' : 'Archived'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          aria-label={`Edit ${product.name}`}
                          onClick={() => setEditing(product)}
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          disabled={updating === product.id}
                          aria-label={`${product.active ? 'Archive' : 'Restore'} ${product.name}`}
                          onClick={async () => {
                            setUpdating(product.id);
                            setError('');
                            try {
                              await api(`/products/${product.id}`, {
                                method: product.active ? 'DELETE' : 'PATCH',
                                ...(product.active
                                  ? {}
                                  : { body: JSON.stringify({ active: true }) }),
                              });
                              await Promise.all([
                                client.invalidateQueries({ queryKey: ['admin-products'] }),
                                client.invalidateQueries({
                                  queryKey: ['catalog'],
                                  refetchType: 'all',
                                }),
                                client.invalidateQueries({ queryKey: ['categories'] }),
                              ]);
                            } catch (error) {
                              setError((error as Error).message);
                            } finally {
                              setUpdating(null);
                            }
                          }}
                        >
                          {product.active ? <Archive size={17} /> : <RotateCcw size={17} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 && (
              <div className="catalog-empty">No products found. Add a product to get started.</div>
            )}
          </div>
        )}
      </section>
      <p className="products-note">
        Select a stock count to adjust inventory. Stock updates automatically every five seconds
        while online. Archiving preserves past receipts.
      </p>
      {editing !== undefined && (
        <ProductForm product={editing} onClose={() => setEditing(undefined)} />
      )}
      {stockProduct && <StockDialog product={stockProduct} onClose={() => setStockProduct(null)} />}
    </main>
  );
}
