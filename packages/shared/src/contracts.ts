import { z } from 'zod';
export const loginSchema = z.object({ email: z.email(), password: z.string().min(1).max(128) });
export const adminSetupSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name').max(80),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    password: z
      .string()
      .min(12, 'Use at least 12 characters')
      .max(72)
      .refine(
        (value) => new TextEncoder().encode(value).length <= 72,
        'Password must be at most 72 UTF-8 bytes',
      ),
    setupKey: z.string().min(32, 'Enter the setup key supplied by your deployment owner').max(256),
  })
  .strict();
export type AdminSetupStatus = { required: boolean; enabled: boolean };
export type User = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'cashier';
  branchId: string;
};
export type DailyReport = {
  date: string;
  timeZone: string;
  transactionCount: number;
  itemsSold: number;
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  cashCents: number;
  cardCents: number;
  voidCount: number;
};
export type SalesPage = { data: Receipt[]; total: number; page: number; pageSize: number };
export type ShopSettings = {
  name: string;
  address: string;
  phone: string;
  receiptFooter: string;
  paperWidthMm: 58 | 80;
  autoPrint: boolean;
};
export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  name: 'Lee',
  address: '',
  phone: '',
  receiptFooter: 'Thank you for shopping at Lee.',
  paperWidthMm: 80,
  autoPrint: false,
};

const contactUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Enter a full HTTPS URL, or leave this field blank.');

export const developerContactSchema = z
  .object({
    name: z.string().trim().max(100),
    email: z
      .string()
      .trim()
      .max(254)
      .refine(
        (value) => !value || z.email().safeParse(value).success,
        'Enter a valid email address, or leave this field blank.',
      ),
    mobile: z
      .string()
      .trim()
      .max(40)
      .refine(
        (value) =>
          !value ||
          (/^\+?[\d ()-]+$/.test(value) &&
            value.replace(/\D/g, '').length >= 6 &&
            value.replace(/\D/g, '').length <= 15),
        'Enter a mobile number with 6–15 digits, optionally starting with +.',
      ),
    facebookUrl: contactUrl.refine((value) => {
      if (!value) return true;
      try {
        const host = new URL(value).hostname.toLowerCase();
        return ['facebook.com', 'fb.com', 'fb.me'].some(
          (domain) => host === domain || host.endsWith(`.${domain}`),
        );
      } catch {
        return false;
      }
    }, 'Enter a Facebook profile or page URL.'),
    websiteUrl: contactUrl,
    supportHours: z.string().trim().max(160),
  })
  .strict();

export type DeveloperContact = z.infer<typeof developerContactSchema>;
export const DEFAULT_DEVELOPER_CONTACT: DeveloperContact = {
  name: 'Dinuka Dilshan',
  email: 'dinukadilshan1009@gmail.com',
  mobile: '0705237919',
  facebookUrl: '',
  websiteUrl: '',
  supportHours: '',
};
export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'cashier';
  active: boolean;
};
export type AuditEntry = {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  createdAt: string;
  user: { name: string; email: string };
  details: unknown;
};
export type Product = {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  categoryId: string;
  category: { id: string; name: string };
  priceCents: number;
  taxRateBps: number;
  active: boolean;
  quantity: number;
};
export const manualItemSchema = z.object({
  name: z.string().trim().min(1, 'Enter an item name.').max(160),
  unitPriceCents: z.number().int().min(1, 'Enter a price greater than zero.').max(100_000_000),
  qty: z.number().int().min(1).max(10_000),
});
export type ManualItem = z.infer<typeof manualItemSchema>;
export type SaleRequestItem = {
  qty: number;
  unitPriceCents: number;
  taxRateBps: number;
} & (
  | { productId: string; manual?: false; lineId?: never; productName?: never }
  | { manual: true; lineId: string; productName: string; productId?: never }
);
export type SaleRequest = {
  id: string;
  occurredAt?: string;
  cashierId?: string;
  branchId?: string;
  items: SaleRequestItem[];
  payment: { method: 'cash' | 'card'; amountCents: number; reference?: string };
};
export type Receipt = {
  id: string;
  branchId: string;
  cashierId: string;
  cashier: { name: string };
  createdAt: string;
  status: string;
  voidReason?: string | null;
  voidedAt?: string | null;
  receiptSettings?: ShopSettings | null;
  syncStatus?: 'pending' | 'synced' | 'blocked';
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  items: {
    id: string;
    productId: string | null;
    productName: string;
    qty: number;
    unitPriceCents: number;
    taxCents: number;
    discountCents: number;
  }[];
  payments: {
    method: 'cash' | 'card';
    amountCents: number;
    tenderedCents: number;
    reference: string | null;
  }[];
};
