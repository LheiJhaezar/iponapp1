import { daysBetween, todayLocal } from './dates';

export function formatMoney(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export interface SafeToSpendResult {
  perDay: number;
  safeTotal: number;
  daysLeft: number;
  committedBills: number;
  stillToSave: number;
}

export function computeSafeToSpend(
  available: number,
  cutoffEndDate: string,
  targetAmount: number,
  savedThisCutoff: number,
  activeBills: Array<{ expected_amount: number; next_due_date: string }>
): SafeToSpendResult {
  const today = todayLocal();
  const daysLeft = Math.max(1, daysBetween(today, cutoffEndDate) + 1);

  const committedBills = activeBills
    .filter((b) => b.next_due_date && b.next_due_date <= cutoffEndDate)
    .reduce((acc, curr) => acc + Number(curr.expected_amount || 0), 0);

  const stillToSave = Math.max(0, targetAmount - savedThisCutoff);
  const safeTotal = available - committedBills - stillToSave;
  const perDay = safeTotal / daysLeft;

  return { perDay, safeTotal, daysLeft, committedBills, stillToSave };
}

export interface RawLedgerEntry {
  id: string;
  created_at: string;
  type: 'income' | 'allocation';
  amount: number;
  category: string;
  note?: string;
  cutoff_id?: string;
  due_date?: string;
}

export interface ProcessedLedgerEntry extends RawLedgerEntry {
  runningAvailableBalance: number;
}

export function computeRunningBalances(entries: RawLedgerEntry[]): ProcessedLedgerEntry[] {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  let currentBalance = 0;
  const processed = sorted.map((entry) => {
    if (entry.type === 'income') {
      currentBalance += entry.amount;
    } else {
      currentBalance -= entry.amount;
    }
    return {
      ...entry,
      runningAvailableBalance: currentBalance,
    };
  });

  return processed.reverse();
}