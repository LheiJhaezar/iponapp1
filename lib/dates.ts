const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export const todayLocal = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

export const addDays = (iso: string, n: number) =>
  new Date(utc(iso) + n * 864e5).toISOString().slice(0, 10);

export const daysBetween = (a: string, b: string) =>
  Math.round((utc(b) - utc(a)) / 864e5);

export function addMonthsClamped(iso: string, n: number, anchorDay?: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = m - 1 + n;
  const yy = y + Math.floor(t / 12);
  const mm = ((t % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  const day = Math.min(anchorDay ?? d, last);
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export type Frequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'yearly';

export const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'semimonthly', label: 'Twice a month' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'yearly', label: 'Yearly' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const lastDayOf = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)).getUTCDate(); // m1 = 1-based month

// The two days of the month for "twice a month". 31 means "last day of the month".
export function normalizeDays(days?: number[] | null): [number, number] {
  const ok = (days || []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 31);
  if (ok.length < 2) return [15, 31];
  const [a, b] = [ok[0], ok[1]].sort((x, y) => x - y);
  return [a, b];
}

// Must stay in step with public.advance_due(date, text, int, int[]) in the database.
export function advanceDue(
  iso: string,
  freq: string,
  anchorDay?: number | null,
  days?: number[] | null
): string {
  const anchor = anchorDay ?? undefined;
  switch (freq) {
    case 'weekly':
      return addDays(iso, 7);
    case 'biweekly':
      return addDays(iso, 14);
    case 'quarterly':
      return addMonthsClamped(iso, 3, anchor);
    case 'yearly':
      return addMonthsClamped(iso, 12, anchor);
    case 'semimonthly': {
      const [a, b] = normalizeDays(days);
      const [y, m, d] = iso.split('-').map(Number);
      const last0 = lastDayOf(y, m);
      const c1 = Math.min(a, last0);
      const c2 = Math.min(b, last0);
      if (d < c1) return `${y}-${pad(m)}-${pad(c1)}`;
      if (d < c2) return `${y}-${pad(m)}-${pad(c2)}`;
      const yy = y + Math.floor(m / 12);
      const mm = (m % 12) + 1; // next month, 1-based
      return `${yy}-${pad(mm)}-${pad(Math.min(a, lastDayOf(yy, mm)))}`;
    }
    default:
      return addMonthsClamped(iso, 1, anchor);
  }
}

const ordinal = (n: number) => {
  if (n >= 31) return 'last day';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function frequencyLabel(freq: string, days?: number[] | null): string {
  if (freq === 'semimonthly') {
    if (!days || days.length < 2) return 'Twice a month';
    const [a, b] = normalizeDays(days);
    return `Twice a month (${ordinal(a)} & ${ordinal(b)})`;
  }
  return FREQUENCY_OPTIONS.find((o) => o.value === freq)?.label ?? freq;
}