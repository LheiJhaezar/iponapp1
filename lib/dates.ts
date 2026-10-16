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