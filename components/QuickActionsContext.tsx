'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import BottomSheet from './BottomSheet';
import { supabase } from '@/lib/supabase/client';
import { todayLocal } from '@/lib/dates';
import { useDataVersion } from './DataContext';

type SheetType = 'income' | 'allocate' | 'transfer' | 'mood' | null;

interface QuickActionsContextType {
  openSheet: (type: SheetType, initialDate?: string) => void;
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
  const [holdingList, setHoldingList] = useState<any[]>([]);
  const [holdingId, setHoldingId] = useState('');
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [entryDate, setEntryDate] = useState(todayLocal());

  // Mood State
  const [mood, setMood] = useState('Happy');
  const [moodNote, setMoodNote] = useState('');
  const [existingMoodId, setExistingMoodId] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchAccounts();
    fetchHoldings();
  }, [dataVersion]);

  const fetchHoldings = async () => {
    const { data } = await supabase
      .from('holdings')
      .select('id, name, kind')
      .is('archived_at', null)
      .order('name', { ascending: true });
    if (data) setHoldingList(data);
  };

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

  const openSheet = async (type: SheetType, initialDate?: string) => {
    setErrorMsg('');
    setAmount('');
    setNote('');
    setHoldingId('');
    setMoodNote('');
    const targetDate = initialDate || todayLocal();
    setEntryDate(targetDate);
    setActiveSheet(type);

    if (type === 'mood') {
      await loadMoodForDate(targetDate);
    }
  };

  const loadMoodForDate = async (dateStr: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('mood_entries')
      .select('*')
      .eq('user_id', user.id)
      .eq('log_date', dateStr)
      .maybeSingle();

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    if (data) {
      setMood(data.mood);
      setMoodNote(data.note || '');
      setExistingMoodId(data.id);
    } else {
      setMood('Happy');
      setMoodNote('');
      setExistingMoodId(null);
    }
  };

  const closeSheet = () => setActiveSheet(null);

  const handleLogIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('income_entries').insert([
      {
        user_id: user.id,
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

  // Savings can go into an asset (deposit); Bills can pay down a debt
  const linkKind = category === 'savings' ? 'asset' : category === 'bills' ? 'liability' : null;
  const linkChoices = linkKind ? holdingList.filter((h) => h.kind === linkKind) : [];

  const handleAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('allocations').insert([
      {
        user_id: user.id,
        account_id: accountId,
        category,
        amount: parseFloat(amount),
        note: note || category,
        entry_date: entryDate,
        holding_id: linkKind && holdingId ? holdingId : null,
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

  const handleLogMood = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('mood_entries').upsert(
      {
        user_id: user.id,
        log_date: entryDate,
        mood,
        note: moodNote || null,
      },
      { onConflict: 'user_id,log_date' }
    );

    if (error) {
      setErrorMsg(error.message);
    } else {
      closeSheet();
      notifyDataChanged();
    }
  };

  const handleDeleteMood = async () => {
    if (!window.confirm('Are you sure you want to delete this mood entry?')) return;
    setErrorMsg('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('mood_entries')
      .delete()
      .eq('user_id', user.id)
      .eq('log_date', entryDate);

    if (error) {
      setErrorMsg(error.message);
    } else {
      closeSheet();
      notifyDataChanged();
    }
  };

  const handleMoodDateChange = async (newDate: string) => {
    setEntryDate(newDate);
    await loadMoodForDate(newDate);
  };

  return (
    <QuickActionsContext.Provider value={{ openSheet, closeSheet }}>
      {children}

      <BottomSheet isOpen={activeSheet === 'income'} onClose={closeSheet} title="Log Income">
        <form onSubmit={handleLogIncome} className="space-y-4">
          {errorMsg && <p className="text-xs text-[#c85c46] font-bold p-2 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>}
          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Account</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            >
              {accounts.map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {a.name} ({a.kind})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Entry Date</label>
            <input
              type="date"
              required
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            />
          </div>
          <input
            type="number"
            inputMode="decimal"
            required
            placeholder="Income Amount (₱)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />
          <input
            type="text"
            placeholder="Source / Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />
          <button type="submit" className="w-full py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]">
            Save Income
          </button>
        </form>
      </BottomSheet>

      <BottomSheet isOpen={activeSheet === 'allocate'} onClose={closeSheet} title="Allocate Funds">
        <form onSubmit={handleAllocate} className="space-y-4">
          {errorMsg && <p className="text-xs text-[#c85c46] font-bold p-2 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>}
          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Account</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            >
              {accounts.map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {a.name} ({a.kind})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Entry Date</label>
            <input
              type="date"
              required
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            />
          </div>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setHoldingId('');
            }}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          >
            <option value="savings">Savings Target</option>
            <option value="bills">Bills</option>
            <option value="groceries">Groceries</option>
            <option value="other">Other Expense</option>
          </select>
          {linkChoices.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-[#143f34] mb-1">
                {linkKind === 'asset' ? 'Goes to (optional)' : 'Pays down (optional)'}
              </label>
              <select
                value={holdingId}
                onChange={(e) => setHoldingId(e.target.value)}
                className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
              >
                <option value="">None</option>
                {linkChoices.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <input
            type="number"
            inputMode="decimal"
            required
            placeholder="Amount (₱)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />
          <input
            type="text"
            placeholder="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />
          <button type="submit" className="w-full py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]">
            Confirm Allocation
          </button>
        </form>
      </BottomSheet>

      <BottomSheet isOpen={activeSheet === 'transfer'} onClose={closeSheet} title="Transfer Between Accounts">
        <form onSubmit={handleTransfer} className="space-y-4">
          {errorMsg && <p className="text-xs text-[#c85c46] font-bold p-2 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>}
          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">From Account</label>
            <select
              value={fromAccount}
              onChange={(e) => setFromAccount(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            >
              {accounts.map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {a.name} ({a.kind})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">To Account</label>
            <select
              value={toAccount}
              onChange={(e) => setToAccount(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
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
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />

          <input
            type="text"
            placeholder="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />

          <button type="submit" className="w-full py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]">
            Execute Transfer
          </button>
        </form>
      </BottomSheet>

      <BottomSheet isOpen={activeSheet === 'mood'} onClose={closeSheet} title="Log Daily Mood">
        <form onSubmit={handleLogMood} className="space-y-4">
          {errorMsg && <p className="text-xs text-[#c85c46] font-bold p-2 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>}
          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Date</label>
            <input
              type="date"
              required
              value={entryDate}
              onChange={(e) => handleMoodDateChange(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            />
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {[
              { m: 'Happy', emoji: '😊' },
              { m: 'Okay', emoji: '😐' },
              { m: 'Stressed', emoji: '😫' },
              { m: 'Sad', emoji: '😢' },
              { m: 'Tired', emoji: '😴' },
            ].map(({ m, emoji }) => (
              <button
                type="button"
                key={m}
                onClick={() => setMood(m)}
                className={`py-3 rounded-xl text-xs font-bold border min-h-[44px] flex flex-col items-center justify-center gap-1 ${
                  mood === m ? 'bg-[#1f5d4c] text-[#f6f3ea] border-[#1f5d4c]' : 'bg-[#f6f3ea] text-[#143f34] border-[#1f5d4c]/20'
                }`}
              >
                <span className="text-lg">{emoji}</span>
                <span className="text-[10px]">{m}</span>
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Optional Note"
            value={moodNote}
            onChange={(e) => setMoodNote(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]"
            >
              Save Mood
            </button>
            {existingMoodId && (
              <button
                type="button"
                onClick={handleDeleteMood}
                className="px-4 py-3 bg-[#c85c46]/15 text-[#c85c46] font-bold rounded-xl text-xs min-h-[44px]"
              >
                Delete Mood
              </button>
            )}
          </div>
        </form>
      </BottomSheet>
    </QuickActionsContext.Provider>
  );
}