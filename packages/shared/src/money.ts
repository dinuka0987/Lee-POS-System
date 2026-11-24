export const MAX_CENTS = 2_000_000_000;

export function integer(value: number, name: string, maximum = MAX_CENTS): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${name} must be a non-negative integer no greater than ${maximum}`);
  }
  return value;
}

export function parseMoney(value: string): number {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value.trim()))
    throw new Error('Enter an amount with up to two decimal places');
  const [whole = '0', fraction = ''] = value.trim().split('.');
  return integer(Number(whole) * 100 + Number(fraction.padEnd(2, '0')), 'Amount');
}

export function formatMoney(cents: number): string {
  integer(cents, 'Amount', Number.MAX_SAFE_INTEGER);
  const whole = Math.trunc(cents / 100).toLocaleString('en-LK');
  return `LKR ${whole}.${String(cents % 100).padStart(2, '0')}`;
}

export function calculateLine(
  unitPriceCents: number,
  qty: number,
  taxRateBps: number,
  discountCents = 0,
) {
  integer(unitPriceCents, 'Price');
  integer(qty, 'Quantity', 10_000);
  if (qty === 0) throw new Error('Quantity must be positive');
  integer(taxRateBps, 'Tax rate', 10_000);
  const subtotalCents = integer(unitPriceCents * qty, 'Subtotal');
  integer(discountCents, 'Discount', subtotalCents);
  // Basis points and BigInt keep rounding deterministic, including half-cent ties.
  const taxCents = Number(
    (BigInt(subtotalCents - discountCents) * BigInt(taxRateBps) + 5_000n) / 10_000n,
  );
  return {
    subtotalCents,
    discountCents,
    taxCents,
    totalCents: integer(subtotalCents - discountCents + taxCents, 'Total'),
  };
}

export function calculateCart(
  items: { unitPriceCents: number; qty: number; taxRateBps: number }[],
) {
  return items.reduce(
    (sum, item) => {
      const line = calculateLine(item.unitPriceCents, item.qty, item.taxRateBps);
      return {
        subtotalCents: integer(sum.subtotalCents + line.subtotalCents, 'Subtotal'),
        taxCents: integer(sum.taxCents + line.taxCents, 'Tax'),
        discountCents: 0,
        totalCents: integer(sum.totalCents + line.totalCents, 'Total'),
      };
    },
    { subtotalCents: 0, taxCents: 0, discountCents: 0, totalCents: 0 },
  );
}

export function calculateChange(totalCents: number, tenderedCents: number): number {
  integer(totalCents, 'Total');
  integer(tenderedCents, 'Cash received');
  if (tenderedCents < totalCents) throw new Error('Cash received is less than the total');
  return tenderedCents - totalCents;
}

export function remainingStock(quantity: number, sold: number): number {
  integer(quantity, 'Stock');
  integer(sold, 'Sold quantity');
  if (sold > quantity) throw new Error('Insufficient stock');
  return quantity - sold;
}
