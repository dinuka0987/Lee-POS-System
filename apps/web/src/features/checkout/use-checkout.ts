import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  calculateCart,
  parseMoney,
  manualItemSchema,
  type ManualItem,
  type SaleRequestItem,
  type Receipt,
  type SaleRequest,
} from '@lee/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/features/auth/auth-context';
import { useDialog } from '@/components/use-dialog';
import { offlineDb } from '@/offline/db';
import { refreshCatalog } from '@/offline/catalog';
import { enqueueSale, type CartLine } from '@/offline/queue';
import { syncSales } from '@/offline/sync';
type LegacyAttempt = { request: SaleRequest; cart: CartLine[] };
export function useCheckout() {
  const { user: currentUser } = useAuth();
  const user = currentUser!;
  const legacyKey = `lee-unconfirmed-sale:${user.id}`;
  const [pending, setPending] = useState<LegacyAttempt | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(legacyKey) || 'null');
    } catch {
      return null;
    }
  });
  const [cart, setCart] = useState<CartLine[]>(() => {
    if (pending) return pending.cart;
    try {
      return JSON.parse(sessionStorage.getItem(`lee-basket:${user.id}`) || '[]');
    } catch {
      return [];
    }
  });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All products');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [method, setMethod] = useState<'cash' | 'card'>('cash');
  const [cash, setCash] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [baseReceipt, setReceipt] = useState<Receipt | null>(null);
  const persisted = useLiveQuery(
    () => (baseReceipt ? offlineDb.sales.get(baseReceipt.id) : undefined),
    [baseReceipt?.id],
  );
  const receipt = persisted?.receipt ?? baseReceipt;
  const input = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const attempt = useRef<SaleRequest | null>(null);
  const cached = useLiveQuery(() => offlineDb.catalogs.get(user.branchId), [user.branchId]);
  const query = useQuery({
    queryKey: ['catalog', user.id],
    queryFn: () => refreshCatalog(user),
    networkMode: 'always',
    retry: 0,
  });
  const data = cached?.products ?? query.data ?? [];
  const products = {
    data,
    isPending: !cached && query.isPending,
    isError: !cached && query.isError,
    error: query.error ?? new Error('Catalog unavailable'),
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
  const categories = [
    'All products',
    ...[
      ...new Set(data.filter((product) => product.active).map((product) => product.category.name)),
    ].sort((left, right) => left.localeCompare(right)),
  ];
  const selectedCategory = categories.includes(category) ? category : 'All products';
  const visible = data.filter(
    (product) =>
      (selectedCategory === 'All products' || product.category.name === selectedCategory) &&
      `${product.name} ${product.barcode} ${product.sku}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const totals = calculateCart(
    cart.map(({ product, qty }) => ({
      unitPriceCents: product.priceCents,
      qty,
      taxRateBps: product.taxRateBps,
    })),
  );
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const locked = !!pending || busy;
  useEffect(() => {
    try {
      sessionStorage.setItem(`lee-basket:${user.id}`, JSON.stringify(cart));
    } catch {
      /* A failed draft save cannot discard a committed queued sale. */
    }
    window.dispatchEvent(new CustomEvent('lee-cart-state', { detail: cart.length }));
    return () => {
      window.dispatchEvent(new CustomEvent('lee-cart-state', { detail: 0 }));
    };
  }, [cart, user.id]);
  let cashCents = 0;
  try {
    cashCents = parseMoney(cash);
  } catch {
    /* Input is checked before confirmation. */
  }
  useDialog(receipt ? 'receipt' : paymentOpen ? 'payment' : '');
  useEffect(() => {
    if (!paymentOpen && !receipt && !pending) input.current?.focus();
  }, [paymentOpen, receipt, pending]);
  function updateCart(next: CartLine[]) {
    try {
      calculateCart(
        next.map(({ product, qty }) => ({
          unitPriceCents: product.priceCents,
          qty,
          taxRateBps: product.taxRateBps,
        })),
      );
      setCart(next);
      setError('');
      return true;
    } catch {
      setError('This basket exceeds the supported total.');
      return false;
    }
  }
  function add(product: CartLine['product']) {
    if (locked) return;
    const line = cart.find((item) => item.product.id === product.id);
    if ((line?.qty ?? 0) >= product.quantity || (line?.qty ?? 0) >= 10_000) {
      setError('No more cached stock is available for this item.');
      return;
    }
    if (!line && cart.length >= 100) {
      setError('A sale can contain up to 100 different products.');
      return;
    }
    updateCart(
      line
        ? cart.map((item) =>
            item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item,
          )
        : [...cart, { product, qty: 1 }],
    );
    setSearch('');
    input.current?.focus();
  }
  function addManual(item: ManualItem): boolean {
    if (locked) return false;
    const parsed = manualItemSchema.safeParse(item);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the manual item details.');
      return false;
    }
    if (cart.length >= 100) {
      setError('A sale can contain up to 100 different items.');
      return false;
    }
    const { name, unitPriceCents, qty } = parsed.data;
    const product: CartLine['product'] = {
      id: crypto.randomUUID(),
      manual: true,
      name,
      sku: '',
      barcode: '',
      categoryId: 'manual',
      category: { id: 'manual', name: 'Manual item' },
      priceCents: unitPriceCents,
      taxRateBps: 0,
      quantity: 10_000,
      active: true,
    };
    const added = updateCart([...cart, { product, qty }]);
    if (added) setSearch('');
    return added;
  }
  async function scan() {
    if (locked || !search.trim()) return;
    const found = data.find(
      (product) =>
        product.barcode === search.trim() ||
        product.sku.toLowerCase() === search.trim().toLowerCase(),
    );
    if (found) add(found);
    else
      setError('Barcode not found. Refresh the catalog or use Manual item to add it to this bill.');
  }
  async function complete() {
    if (submitting.current) return;
    setError('');
    submitting.current = true;
    setBusy(true);
    try {
      let result: Receipt;
      if (pending) {
        try {
          result = await api<Receipt>(`/sales/${pending.request.id}`);
          await offlineDb.sales.put({
            id: result.id,
            ownerId: user.id,
            ownerName: user.name,
            branchId: user.branchId,
            request: pending.request,
            receipt: { ...result, syncStatus: 'synced' },
            state: 'synced',
            createdAt: result.createdAt,
            attempts: 0,
            nextAttemptAt: 0,
            leaseUntil: 0,
            lastError: '',
            syncedAt: new Date().toISOString(),
          });
        } catch (error) {
          if (!(error instanceof ApiError) || ![0, 404].includes(error.status)) throw error;
          result = await enqueueSale(pending.request, pending.cart, user);
        }
        sessionStorage.removeItem(legacyKey);
        setPending(null);
      } else {
        if (!cart.length) return;
        if (method === 'cash' && cashCents < totals.totalCents)
          throw new Error('Enter enough cash to cover the total.');
        if (method === 'card' && !reference.trim())
          throw new Error('Enter the reference from the external card terminal.');
        attempt.current ??= {
          id: crypto.randomUUID(),
          cashierId: user.id,
          branchId: user.branchId,
          occurredAt: new Date().toISOString(),
          items: cart.map<SaleRequestItem>(({ product, qty }) =>
            product.manual
              ? {
                  manual: true,
                  lineId: product.id,
                  productName: product.name,
                  qty,
                  unitPriceCents: product.priceCents,
                  taxRateBps: 0,
                }
              : {
                  productId: product.id,
                  qty,
                  unitPriceCents: product.priceCents,
                  taxRateBps: product.taxRateBps,
                },
          ),
          payment: {
            method,
            amountCents: method === 'cash' ? cashCents : totals.totalCents,
            ...(method === 'card' ? { reference: reference.trim() } : {}),
          },
        };
        result = await enqueueSale(attempt.current, cart, user);
      }
      setReceipt(result);
      setCart([]);
      setPaymentOpen(false);
      setCash('');
      setReference('');
      attempt.current = null;
      void syncSales(user).catch(() => {});
    } catch (error) {
      attempt.current = null;
      setError((error as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return {
    cart,
    setCart,
    search,
    setSearch,
    category: selectedCategory,
    setCategory,
    paymentOpen,
    setPaymentOpen,
    method,
    setMethod,
    cash,
    setCash,
    reference,
    setReference,
    error,
    setError,
    busy,
    receipt,
    setReceipt,
    input,
    products,
    categories,
    visible,
    totals,
    count,
    locked,
    pending,
    cashCents,
    updateCart,
    add,
    addManual,
    scan,
    complete,
  };
}
