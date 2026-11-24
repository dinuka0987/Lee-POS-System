export const SHOP_TIME_ZONE = 'Asia/Colombo';
export function shopDate(value: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
export function shopDayRange(date: string): { gte: Date; lt: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Use a date in YYYY-MM-DD format');
  const gte = new Date(`${date}T00:00:00+05:30`);
  if (Number.isNaN(gte.getTime()) || shopDate(gte) !== date)
    throw new Error('Select a valid calendar date');
  return { gte, lt: new Date(gte.getTime() + 86_400_000) };
}
