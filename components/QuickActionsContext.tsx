'use client';

import React, { createContext, useContext, useState } from 'react';
import BottomSheet from './BottomSheet';
import { supabase } from '@/lib/supabase/client';
import { todayLocal } from '@/lib/dates';
import { useDataVersion } from './DataContext';

type SheetType = 'income' | 'allocate' | 'mood' | null;

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
  const { notifyDataChanged } = useDataVersion();
  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('savings');
  const [entryDate, setEntryDate] = useState(todayLocal());
  const [mood, setMood] = useState('Happy');
  const [errorMsg, setErrorMsg] = useState('');

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
      setErrorMsg('This cutoff is locked. Reopen it to add entries.');
      return;
    }

    const { error } = await supabase.from('income_entries').insert([
      {
        user_id: user.id,
        cutoff_id: cutoff?.id,
        amount: parseFloat(amount),
        source: note || 'Salary Income',
        entry_date: entryDate,
      },
    ]);

    if (error) {
      setErrorMsg(error.message);
    } else {
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
      setErrorMsg('This cutoff is locked. Reopen it to add entries.');
      return;
    }

    const { error } = await supabase.from('allocations').insert([
      {
        user_id: user.id,
        cutoff_id: cutoff?.id,
        category,
        amount: parseFloat(amount),
        note: note || category,
        entry_date: entryDate,
      },
    ]);

    if (error) {
      setErrorMsg(error.message);
    } else {
      closeSheet();
      notifyDataChanged();
    }
  };

  const handleLogMood = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('mood_entries').upsert(
      {
        user_id: user.id,
        log_date: entryDate,
        mood,
        note,
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

  return (
    <QuickActionsContext.Provider value={{ openSheet, closeSheet }}>
      {children}

      <BottomSheet isOpen={activeSheet === 'income'} onClose={closeSheet} title="Log Income">
        <form onSubmit={handleLogIncome} className="space-y-4">
          {errorMsg && <p className="text-xs text-coral font-bold">{errorMsg}</p>}
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

      <BottomSheet isOpen={activeSheet === 'mood'} onClose={closeSheet} title="Log Daily Mood">
        <form onSubmit={handleLogMood} className="space-y-4">
          {errorMsg && <p className="text-xs text-coral font-bold">{errorMsg}</p>}
          <div className="grid grid-cols-3 gap-2">
            {['Happy', 'Neutral', 'Stressed'].map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setMood(m)}
                className={`py-2 rounded-xl text-xs font-bold border min-h-[44px] ${
                  mood === m ? 'bg-jade text-paper border-jade' : 'bg-paper text-jade border-line'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button type="submit" className="w-full py-3 bg-jade text-paper font-bold rounded-xl text-sm min-h-[44px]">
            Save Mood
          </button>
        </form>
      </BottomSheet>
    </QuickActionsContext.Provider>
  );
}