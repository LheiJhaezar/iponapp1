'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatMoney, computeRunningBalances } from '@/lib/money';
import BottomSheet from '@/components/BottomSheet';

export default function DashboardPage() {
  const supabase = createClient();

  const [user, setUser] = useState<any>(null);
  const [activeCutoff, setActiveCutoff] = useState<any>(null);

  // Continuous Ledger Metrics
  const [totalSavings, setTotalSavings] = useState(0);
  const [carriedOverSavings, setCarriedOverSavings] = useState(0);
  const [thisCutoffSavings, setThisCutoffSavings] = useState(0);
  const [availableCash, setAvailableCash] = useState(0);

  const [billsDueCount, setBillsDueCount] = useState(0);
  const [upcomingBills, setUpcomingBills] = useState<any[]>([]);
  const [recentLedger, setRecentLedger] = useState<any[]>([]);

  // New Cutoff Modal Sheet
  const [isNewCutoffOpen, setIsNewCutoffOpen] = useState(false);
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newTargetAmount, setNewTargetAmount] = useState('5000');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;
    setUser(currentUser);

    // Idempotent auto-deduct function
    await supabase.rpc('process_my_due_bills');

    // Fetch Cutoffs
    const { data: cutoffs } = await supabase
      .from('cutoffs')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('start_date', { ascending: false });

    const currentCut = cutoffs?.[0];
    setActiveCutoff(currentCut);

    if (currentCut) {
      // Set next cutoff start date default
      const endDate = new Date(currentCut.end_date);
      endDate.setDate(endDate.getDate() + 1);
      setNewStartDate(endDate.toISOString().split('T')[0]);
    } else {
      setNewStartDate(new Date().toISOString().split('T')[0]);
    }

    // Fetch Income, Allocations, and Recurring Bills
    const [{ data: incData }, { data: allocData }, { data: billsData }] = await Promise.all([
      supabase.from('income_entries').select('*').eq('user_id', currentUser.id),
      supabase.from('allocations').select('*').eq('user_id', currentUser.id),
      supabase.from('recurring_bills').select('*').eq('user_id', currentUser.id).eq('active', true),
    ]);

    // 1. Calculate Continuous Savings
    const allSavings = (allocData || []).filter((a) => a.category === 'savings');
    const computedTotalSavings = allSavings.reduce((acc, curr) => acc + Number(curr.amount), 0);
    setTotalSavings(computedTotalSavings);

    const thisCutSavings = allSavings
      .filter((a) => a.cutoff_id === currentCut?.id)
      .reduce((acc, curr) => acc + Number(curr.amount), 0);
    setThisCutoffSavings(thisCutSavings);
    setCarriedOverSavings(computedTotalSavings - thisCutSavings);

    // 2. Compute Available Cash
    const totalIncome = (incData || []).reduce((acc, curr) => acc + Number(curr.amount), 0);
    const totalAllocations = (allocData || []).reduce((acc, curr) => acc + Number(curr.amount), 0);
    setAvailableCash(totalIncome - totalAllocations);

    // 3. Process Bills Due within 7 Days
    const today = new Date();
    const next7Days = new Date();
    next7Days.setDate(today.getDate() + 7);

    const dueSoon = (billsData || []).filter((b) => {
      if (!b.next_due_date) return false;
      const d = new Date(b.next_due_date);
      return d <= next7Days;
    });

    setBillsDueCount(dueSoon.length);
    setUpcomingBills(
      (billsData || [])
        .sort((a, b) => new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime())
        .slice(0, 3)
    );

    // 4. Recent Ledger Entries
    const rawIncomes = (incData || []).map((i) => ({
      id: i.id,
      created_at: i.created_at,
      type: 'income' as const,
      amount: Number(i.amount),
      category: 'income',
      note: i.source || i.note || 'Income',
    }));

    const rawAllocations = (allocData || []).map((a) => ({
      id: a.id,
      created_at: a.created_at,
      type: 'allocation' as const,
      amount: Number(a.amount),
      category: a.category,
      note: a.note || a.category,
    }));

    const processed = computeRunningBalances([...rawIncomes, ...rawAllocations]);
    setRecentLedger(processed.slice(0, 3));
  };

  const handleCreateCutoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    await supabase.from('cutoffs').insert([
      {
        user_id: user.id,
        start_date: newStartDate,
        end_date: newEndDate,
        target_amount: parseFloat(newTargetAmount),
        carried_in_savings: totalSavings,
      },
    ]);

    setIsNewCutoffOpen(false);
    loadDashboardData();
  };

  const cutoffTarget = Number(activeCutoff?.target_amount || 5000);
  const cutoffProgressPercent = Math.min(100, Math.round((thisCutoffSavings / (cutoffTarget || 1)) * 100));

  return (
    <div className="p-4 space-y-5">
      {/* Header & Avatar */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#143f34]">Ipon App</h1>
          <p className="text-xs text-[#143f34]/60 font-medium">Continuous Savings Ledger</p>
        </div>
        <button
          onClick={() => setIsNewCutoffOpen(true)}
          className="p-2 bg-[#1f5d4c]/10 rounded-full border border-[#1f5d4c]/20 text-sm font-bold min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          👤
        </button>
      </div>

      {/* Hero Card: Total Continuous Savings */}
      <div className="bg-[#1f5d4c] text-[#f6f3ea] p-6 rounded-3xl shadow-xl space-y-4 relative overflow-hidden">
        <div className="space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-[#e2a63f] font-bold">Total Savings</span>
          <h2 className="font-serif text-4xl font-extrabold">{formatMoney(totalSavings)}</h2>
          <p className="text-xs text-[#f6f3ea]/80">
            {formatMoney(carriedOverSavings)} carried over + {formatMoney(thisCutoffSavings)} this cutoff
          </p>
        </div>

        {/* Cutoff Target Progress */}
        <div className="pt-2 space-y-1.5 border-t border-[#f6f3ea]/15">
          <div className="flex justify-between items-center text-xs">
            <span>Cutoff Progress ({cutoffProgressPercent}%)</span>
            <span>Target: {formatMoney(cutoffTarget)}</span>
          </div>
          <div className="w-full bg-[#143f34] rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-[#e2a63f] h-full rounded-full transition-all duration-500"
              style={{ width: `${cutoffProgressPercent}%` }}
            />
          </div>
        </div>

        <button
          onClick={() => setIsNewCutoffOpen(true)}
          className="w-full py-3 bg-[#e2a63f] text-[#143f34] font-bold rounded-2xl text-xs uppercase tracking-wider transition active:scale-98 min-h-[44px]"
        >
          Start Next Cutoff
        </button>
      </div>

      {/* Three Stat Chips */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-3 rounded-2xl text-center space-y-1">
          <span className="text-[10px] uppercase font-bold text-[#143f34]/60">Available</span>
          <p className={`text-sm font-extrabold ${availableCash < 0 ? 'text-[#c85c46]' : 'text-[#1f5d4c]'}`}>
            {formatMoney(availableCash)}
          </p>
        </div>

        <div className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-3 rounded-2xl text-center space-y-1">
          <span className="text-[10px] uppercase font-bold text-[#143f34]/60">Bills Due</span>
          <p className="text-sm font-extrabold text-[#c85c46]">{billsDueCount} Soon</p>
        </div>

        <div className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-3 rounded-2xl text-center space-y-1">
          <span className="text-[10px] uppercase font-bold text-[#143f34]/60">Streak</span>
          <p className="text-sm font-extrabold text-[#e2a63f]">
            {thisCutoffSavings >= cutoffTarget ? '🔥 Active' : '⏳ Pending'}
          </p>
        </div>
      </div>

      {/* Coming Up Strip */}
      <div className="space-y-2">
        <h3 className="font-serif text-sm font-bold text-[#143f34]">Coming Up Bills</h3>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
          {upcomingBills.map((b) => (
            <div key={b.id} className="min-w-[160px] bg-[#f6f3ea] border border-[#1f5d4c]/15 p-3 rounded-2xl space-y-1">
              <p className="text-xs font-bold text-[#143f34] truncate">{b.name}</p>
              <p className="text-xs font-extrabold text-[#c85c46]">{formatMoney(Number(b.expected_amount))}</p>
              <span className="text-[10px] text-[#143f34]/60 block">{b.next_due_date}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Ledger Preview */}
      <div className="space-y-3 pt-2">
        <div className="flex justify-between items-center">
          <h3 className="font-serif text-base font-bold text-[#143f34]">Ledger</h3>
          <Link href="/ledger" className="text-xs font-bold text-[#1f5d4c] hover:underline min-h-[44px] flex items-center">
            See all →
          </Link>
        </div>

        <div className="space-y-2">
          {recentLedger.map((row) => (
            <div key={row.id} className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-3 rounded-2xl flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-[#143f34]">{row.note}</p>
                <span className="text-[10px] text-[#143f34]/60">{new Date(row.created_at).toLocaleDateString()}</span>
              </div>
              <span className={`text-xs font-extrabold ${row.type === 'income' ? 'text-[#1f5d4c]' : 'text-[#c85c46]'}`}>
                {row.type === 'income' ? '+' : '-'} {formatMoney(row.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* New Cutoff Bottom Sheet */}
      <BottomSheet isOpen={isNewCutoffOpen} onClose={() => setIsNewCutoffOpen(false)} title="Start Next Cutoff">
        <form onSubmit={handleCreateCutoff} className="space-y-4">
          <div className="p-3 bg-[#e2a63f]/15 border border-[#e2a63f]/30 rounded-2xl text-xs space-y-1">
            <span className="font-bold text-[#143f34]">What carries over:</span>
            <p className="text-[#143f34]/80">Carried in savings: {formatMoney(totalSavings)}</p>
            <p className="text-[#143f34]/80">Available cash: {formatMoney(availableCash)}</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Start Date</label>
            <input
              type="date"
              required
              value={newStartDate}
              onChange={(e) => setNewStartDate(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34] focus:outline-none focus:border-[#1f5d4c]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">End Date</label>
            <input
              type="date"
              required
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34] focus:outline-none focus:border-[#1f5d4c]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Target Amount (₱)</label>
            <input
              type="number"
              inputMode="decimal"
              required
              value={newTargetAmount}
              onChange={(e) => setNewTargetAmount(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34] focus:outline-none focus:border-[#1f5d4c]"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]"
          >
            Confirm & Extend Ledger
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}