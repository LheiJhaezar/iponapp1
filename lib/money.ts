export function formatMoney(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
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