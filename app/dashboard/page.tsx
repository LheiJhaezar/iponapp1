'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { formatMoney, computeSafeToSpend, computeRunningBalances, SafeToSpendResult } from '@/lib/money';
import BottomSheet from '@/components/BottomSheet';
import { todayLocal } from '@/lib/dates';

export default function DashboardPage() {
  const [activeCutoff, setActiveCutoff] = useState<any>(null);
  const [totalSavings, setTotalSavings] = useState(0);
  const [carriedOverSavings, setCarriedOverSavings] = useState(0);
  const [thisCutoffSavings, setThisCutoffSavings] = useState(0);
  const [availableCash, setAvailableCash] = useState(0);
  const [safeToSpend, setSafeToSpend] = useState<SafeToSpendResult | null>(null);

  const [billsDueCount, setBillsDueCount] = useState(0);
  const [upcomingBills, setUpcomingBills] = useState<any[]>([]);
  const [recentLedger, setRecentLedger] = useState<any[]>([]);
  const [todayFood, setTodayFood] = useState<any>(null);
  const [todayMood, setTodayMood] = useState<string | null>(null);

  const [isSafeSheetOpen, setIsSafeSheetOpen] = useState(false);
  const [isNewCutoffOpen, setIsNewCutoffOpen] = useState(false);
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newTargetAmount, setNewTargetAmount] = useState('5000');

  useEffect(() => {
    loadDashboardData();
    window.addEventListener('ipon:data-changed', loadDashboardData);
    return () => window.removeEventListener('ipon:data-changed', loadDashboardData);
  }, []);

  const loadDashboardData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.rpc('process_my_due_bills');

    const today = todayLocal();

    const [{ data: cutoffs }, { data: incData }, { data: allocData }, { data: billsData }, { data: foodData }, { data: moodData }] = await Promise.all([
      supabase.from('cutoffs').select('*').eq('user_id', user.id).order('start_date', { ascending: false }),
      supabase.from('income_entries').select('*').eq('user_id', user.id),
      supabase.from('allocations').select('*').eq('user_id', user.id),
      supabase.from('recurring_bills').select('*').eq('user_id', user.id).eq('active', true),
      supabase.from('food_entries').select('*').eq('user_id', user.id).eq('log_date', today).maybeSingle(),
      supabase.from('mood_entries').select('mood').eq('user_id', user.id).eq('log_date', today).maybeSingle(),
    ]);

    const currentCut = cutoffs?.[0];
    setActiveCutoff(currentCut);
    setTodayFood(foodData);
    setTodayMood(moodData?.mood || null);

    if (currentCut) {
      const d = new Date(`${currentCut.end_date}T00:00:00`);
      d.setDate(d.getDate() + 1);
      setNewStartDate(d.toISOString().split('T')[0]);
    } else {
      setNewStartDate(today);
    }

    const allSavings = (allocData || []).filter((a) => a.category === 'savings');
    const computedTotalSavings = allSavings.reduce((acc, curr) => acc + Number(curr.amount), 0);
    setTotalSavings(computedTotalSavings);

    const thisCutSavings = allSavings
      .filter((a) => a.cutoff_id === currentCut?.id)
      .reduce((acc, curr) => acc + Number(curr.amount), 0);
    setThisCutoffSavings(thisCutSavings);
    setCarriedOverSavings(computedTotalSavings - thisCutSavings);

    const totalIncome = (incData || []).reduce((acc, curr) => acc + Number(curr.amount), 0);
    const totalAllocations = (allocData || []).reduce((acc, curr) => acc + Number(curr.amount), 0);
    const available = totalIncome - totalAllocations;
    setAvailableCash(available);

    if (currentCut) {
      const safe = computeSafeToSpend(
        available,
        currentCut.end_date,
        Number(currentCut.target_amount || 5000),
        thisCutSavings,
        billsData || []
      );
      setSafeToSpend(safe);
    }

    const dueSoon = (billsData || []).filter((b) => b.next_due_date && b.next_due_date <= today);
    setBillsDueCount(dueSoon.length);
    setUpcomingBills((billsData || []).slice(0, 3));

    const processed = computeRunningBalances([
      ...(incData || []).map((i) => ({ ...i, type: 'income' as const, note: i.source })),
      ...(allocData || []).map((a) => ({ ...a, type: 'allocation' as const })),
    ]);
    setRecentLedger(processed.slice(0, 3));
  };

  const handleCreateCutoff = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
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
      {/* Hero Card */}
      <div className="bg-jade text-paper p-6 rounded-card shadow-xl space-y-4">
        <div className="space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-gold font-bold">Total Savings</span>
          <h2 className="font-display font-semibold text-4xl">{formatMoney(totalSavings)}</h2>
          <p className="text-xs text-paper/80">
            {formatMoney(carriedOverSavings)} carried over + {formatMoney(thisCutoffSavings)} this cutoff
          </p>
        </div>

        <div className="pt-2 space-y-1.5 border-t border-paper/15">
          <div className="flex justify-between items-center text-xs">
            <span>Cutoff Goal ({cutoffProgressPercent}%)</span>
            <span>Target: {formatMoney(cutoffTarget)}</span>
          </div>
          <div className="w-full bg-[#143f34] rounded-full h-2.5 overflow-hidden">
            <div className="bg-gold h-full rounded-full transition-all duration-500" style={{ width: `${cutoffProgressPercent}%` }} />
          </div>
        </div>

        <button
          onClick={() => setIsNewCutoffOpen(true)}
          className="w-full py-3 bg-gold text-jade font-bold rounded-xl text-xs uppercase tracking-wider transition min-h-[44px]"
        >
          Start Next Cutoff
        </button>
      </div>

      {/* Safe to Spend Card */}
      {safeToSpend && (
        <div
          onClick={() => setIsSafeSheetOpen(true)}
          className="bg-paper border border-line p-4 rounded-card cursor-pointer hover:bg-jade/5 transition space-y-1"
        >
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold uppercase text-jade">Safe to spend today</span>
            <span className="text-xs text-jade font-bold">Details →</span>
          </div>
          <p className={`text-2xl font-black ${safeToSpend.safeTotal < 0 ? 'text-coral' : 'text-jade'}`}>
            {formatMoney(Math.max(0, safeToSpend.perDay))} / day
          </p>
        </div>
      )}

      {/* Stat Chips */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-paper border border-line p-3 rounded-card text-center space-y-1">
          <span className="text-[10px] uppercase font-bold text-jade/60">Available</span>
          <p className={`text-sm font-extrabold ${availableCash < 0 ? 'text-coral' : 'text-jade'}`}>{formatMoney(availableCash)}</p>
        </div>

        <div className="bg-paper border border-line p-3 rounded-card text-center space-y-1">
          <span className="text-[10px] uppercase font-bold text-jade/60">Bills Due</span>
          <p className="text-sm font-extrabold text-coral">{billsDueCount} Soon</p>
        </div>

        <div className="bg-paper border border-line p-3 rounded-card text-center space-y-1">
          <span className="text-[10px] uppercase font-bold text-jade/60">Streak</span>
          <p className="text-sm font-extrabold text-gold">{thisCutoffSavings >= cutoffTarget ? '🔥 Active' : '⏳ Pending'}</p>
        </div>
      </div>

      {/* Coming Up Strip */}
      <div className="space-y-2">
        <h3 className="font-display font-semibold text-sm text-jade">Coming Up Bills</h3>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
          {upcomingBills.map((b) => (
            <div key={b.id} className="min-w-[160px] bg-paper border border-line p-3 rounded-card space-y-1">
              <p className="text-xs font-bold text-jade truncate">{b.name}</p>
              <p className="text-xs font-extrabold text-coral">{formatMoney(Number(b.expected_amount))}</p>
              <span className="text-[10px] text-jade/60 block">{b.next_due_date}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Daily Check-in */}
      <div className="bg-paper border border-line p-4 rounded-card space-y-2">
        <h3 className="font-display font-semibold text-xs text-jade">Daily Check-in</h3>
        <div className="flex justify-between items-center text-xs">
          <span>Meals Logged: {todayFood ? 'Logged ✓' : 'None yet'}</span>
          <span>Mood: {todayMood || 'Not set'}</span>
        </div>
      </div>

      {/* Ledger Preview */}
      <div className="space-y-3 pt-2">
        <div className="flex justify-between items-center">
          <h3 className="font-display font-semibold text-base text-jade">Ledger</h3>
          <Link href="/ledger" className="text-xs font-bold text-jade hover:underline min-h-[44px] flex items-center">
            See all →
          </Link>
        </div>

        <div className="space-y-2">
          {recentLedger.map((row) => (
            <div key={row.id} className="bg-paper border border-line p-3 rounded-card flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-jade">{row.note}</p>
                <span className="text-[10px] text-jade/60">{new Date(row.created_at).toLocaleDateString()}</span>
              </div>
              <span className={`text-xs font-extrabold ${row.type === 'income' ? 'text-jade' : 'text-coral'}`}>
                {row.type === 'income' ? '+' : '-'} {formatMoney(row.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Safe Breakdown Sheet */}
      <BottomSheet isOpen={isSafeSheetOpen} onClose={() => setIsSafeSheetOpen(false)} title="Safe to Spend Breakdown">
        {safeToSpend && (
          <div className="space-y-3 text-xs text-jade">
            <div className="flex justify-between border-b border-line pb-2">
              <span>Available Cash</span>
              <span className="font-bold">{formatMoney(availableCash)}</span>
            </div>
            <div className="flex justify-between border-b border-line pb-2 text-coral">
              <span>Minus Bills Due this Cutoff</span>
              <span className="font-bold">- {formatMoney(safeToSpend.committedBills)}</span>
            </div>
            <div className="flex justify-between border-b border-line pb-2 text-coral">
              <span>Minus Unsaved Target Goal</span>
              <span className="font-bold">- {formatMoney(safeToSpend.stillToSave)}</span>
            </div>
            <div className="flex justify-between pt-2 text-sm font-extrabold text-jade">
              <span>Safe Total / {safeToSpend.daysLeft} days</span>
              <span>{formatMoney(safeToSpend.perDay)} / day</span>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* New Cutoff Sheet */}
      <BottomSheet isOpen={isNewCutoffOpen} onClose={() => setIsNewCutoffOpen(false)} title="Start Next Cutoff">
        <form onSubmit={handleCreateCutoff} className="space-y-4">
          <div className="p-3 bg-gold/15 border border-gold/30 rounded-card text-xs space-y-1">
            <span className="font-bold text-jade">What carries over:</span>
            <p className="text-jade/80">Carried in savings: {formatMoney(totalSavings)}</p>
            <p className="text-jade/80">Available cash: {formatMoney(availableCash)}</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-jade mb-1">Start Date</label>
            <input
              type="date"
              required
              value={newStartDate}
              onChange={(e) => setNewStartDate(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-jade mb-1">End Date</label>
            <input
              type="date"
              required
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-jade mb-1">Target Amount (₱)</label>
            <input
              type="number"
              inputMode="decimal"
              required
              value={newTargetAmount}
              onChange={(e) => setNewTargetAmount(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            />
          </div>

          <button type="submit" className="w-full py-3 bg-jade text-paper font-bold rounded-xl text-sm min-h-[44px]">
            Confirm & Extend Ledger
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}