'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import BottomSheet from './BottomSheet';
import { supabase } from '@/lib/supabase/client';
import { todayLocal } from '@/lib/dates';
import { useDataVersion } from './DataContext';

type SheetType = 'income' | 'allocate' | 'transfer' | 'mood' | null;

interface QuickActionsContextType {
  openSheet: (type: SheetType) => void;
  closeSheet: () => void;
}

const QuickActionsContext = createContext<QuickActionsContextType>({
  openSheet: () => {},
  closeSheet: () => {},
});

export const useQuickActions = () => useContext(QuickActionsContext);

export function QuickActionsProvider({ children }: { children: React.ReactNode }) {
  const { notifyDataChanged, dataVersion } = useDataVersion();
  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [accounts, setAccounts] = useState<any[]>([]);

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('savings');
  const [accountId, setAccountId] = useState('');
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [entryDate, setEntryDate] = useState(todayLocal());
  const [mood, setMood] = useState('Happy');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchAccounts();
  }, [dataVersion]);

  const fetchAccounts = async () => {
    const { data } = await supabase.rpc('get_account_balances');
    if (data && data.length > 0) {
      setAccounts(data);
      const def = data.find((a: any) => a.is_default) || data[0];
      setAccountId(def.account_id);
      setFromAccount(data[0].account_id);
      if (data.length > 1) setToAccount(data[1].account_id);
    }
  };

  const openSheet = (type: SheetType) => {
    setErrorMsg('');
    setAmount('');
    setNote('');
    setEntryDate(todayLocal());
    setActiveSheet(type);
  };

  const closeSheet = () => setActiveSheet(null);

  const handleLogIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: cutoff } = await supabase
      .from('cutoffs')
      .select('id, closed_at')
      .eq('user_id', user.id)
      .lte('start_date', entryDate)
      .gte('end_date', entryDate)
      .is('deleted_at', null)
      .maybeSingle();

    if (cutoff?.closed_at) {
      setErrorMsg('This cutoff is locked.');
      return;
    }

    const { error } = await supabase.from('income_entries').insert([
      {
        user_id: user.id,
        cutoff_id: cutoff?.id,
        account_id: accountId,
        amount: parseFloat(amount),
        source: note || 'Salary Income',
        entry_date: entryDate,
      },
    ]);

    if (error) setErrorMsg(error.message);
    else {
      closeSheet();
      notifyDataChanged();
    }
  };

  const handleAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: cutoff } = await supabase
      .from('cutoffs')
      .select('id, closed_at')
      .eq('user_id', user.id)
      .lte('start_date', entryDate)
      .gte('end_date', entryDate)
      .is('deleted_at', null)
      .maybeSingle();

    if (cutoff?.closed_at) {
      setErrorMsg('This cutoff is locked.');
      return;
    }

    const { error } = await supabase.from('allocations').insert([
      {
        user_id: user.id,
        cutoff_id: cutoff?.id,
        account_id: accountId,
        category,
        amount: parseFloat(amount),
        note: note || category,
        entry_date: entryDate,
      },
    ]);

    if (error) setErrorMsg(error.message);
    else {
      closeSheet();
      notifyDataChanged();
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fromAccount === toAccount) {
      setErrorMsg('Destination account must be different from source.');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('transfers').insert([
      {
        user_id: user.id,
        from_account: fromAccount,
        to_account: toAccount,
        amount: parseFloat(amount),
        entry_date: entryDate,
        note,
      },
    ]);

    if (error) setErrorMsg(error.message);
    else {
      closeSheet();
      notifyDataChanged();
    }
  };

  return (
    <QuickActionsContext.Provider value={{ openSheet, closeSheet }}>
      {children}

      <BottomSheet isOpen={activeSheet === 'income'} onClose={closeSheet} title="Log Income">
        <form onSubmit={handleLogIncome} className="space-y-4">
          {errorMsg && <p className="text-xs text-coral font-bold">{errorMsg}</p>}
          <div>
            <label className="block text-xs font-bold text-jade mb-1">Account</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            >
              {accounts.map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {a.name} ({a.kind})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-jade mb-1">Entry Date</label>
            <input
              type="date"
              required
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            />
          </div>
          <input
            type="number"
            inputMode="decimal"
            required
            placeholder="Income Amount (₱)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          />
          <input
            type="text"
            placeholder="Source / Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          />
          <button type="submit" className="w-full py-3 bg-jade text-paper font-bold rounded-xl text-sm min-h-[44px]">
            Save Income
          </button>
        </form>
      </BottomSheet>

      <BottomSheet isOpen={activeSheet === 'allocate'} onClose={closeSheet} title="Allocate Funds">
        <form onSubmit={handleAllocate} className="space-y-4">
          {errorMsg && <p className="text-xs text-coral font-bold">{errorMsg}</p>}
          <div>
            <label className="block text-xs font-bold text-jade mb-1">Account</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            >
              {accounts.map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {a.name} ({a.kind})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-jade mb-1">Entry Date</label>
            <input
              type="date"
              required
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          >
            <option value="savings">Savings Target</option>
            <option value="bills">Bills</option>
            <option value="groceries">Groceries</option>
            <option value="other">Other Expense</option>
          </select>
          <input
            type="number"
            inputMode="decimal"
            required
            placeholder="Amount (₱)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          />
          <input
            type="text"
            placeholder="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          />
          <button type="submit" className="w-full py-3 bg-jade text-paper font-bold rounded-xl text-sm min-h-[44px]">
            Confirm Allocation
          </button>
        </form>
      </BottomSheet>

      <BottomSheet isOpen={activeSheet === 'transfer'} onClose={closeSheet} title="Transfer Between Accounts">
        <form onSubmit={handleTransfer} className="space-y-4">
          {errorMsg && <p className="text-xs text-coral font-bold">{errorMsg}</p>}
          <div>
            <label className="block text-xs font-bold text-jade mb-1">From Account</label>
            <select
              value={fromAccount}
              onChange={(e) => setFromAccount(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            >
              {accounts.map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {a.name} ({a.kind})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-jade mb-1">To Account</label>
            <select
              value={toAccount}
              onChange={(e) => setToAccount(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            >
              {accounts.map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {a.name} ({a.kind})
                </option>
              ))}
            </select>
          </div>

          <input
            type="number"
            inputMode="decimal"
            required
            placeholder="Transfer Amount (₱)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          />

          <input
            type="text"
            placeholder="Note (e.g. GCash Topup)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          />

          <button type="submit" className="w-full py-3 bg-jade text-paper font-bold rounded-xl text-sm min-h-[44px]">
            Execute Transfer
          </button>
        </form>
      </BottomSheet>
    </QuickActionsContext.Provider>
  );
}