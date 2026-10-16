'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { formatMoney, computeSafeToSpend, SafeToSpendResult } from '@/lib/money';
import BottomSheet from '@/components/BottomSheet';
import { todayLocal, addDays } from '@/lib/dates';
import { useDataVersion } from '@/components/DataContext';

export default function DashboardPage() {
  const { dataVersion, notifyDataChanged } = useDataVersion();
  const [activeCutoff, setActiveCutoff] = useState<any>(null);

  const [totalSavings, setTotalSavings] = useState(0);
  const [carriedOverSavings, setCarriedOverSavings] = useState(0);
  const [thisCutoffSavings, setThisCutoffSavings] = useState(0);
  const [availableCash, setAvailableCash] = useState(0);
  const [safeToSpend, setSafeToSpend] = useState<SafeToSpendResult | null>(null);

  const [billsDueCount, setBillsDueCount] = useState(0);
  const [upcomingBills, setUpcomingBills] = useState<any[]>([]);
  const [recentLedger, setRecentLedger] = useState<any[]>([]);

  // Cutoff Modal States
  const [isEditCutoffOpen, setIsEditCutoffOpen] = useState(false);
  const [isNewCutoffOpen, setIsNewCutoffOpen] = useState(false);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editTarget, setEditTarget] = useState('5000');

  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newTarget, setNewTarget] = useState('5000');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, [dataVersion]);

  const loadDashboardData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.rpc('process_my_due_bills');

    const { data: cutoffs } = await supabase
      .from('cutoffs')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('start_date', { ascending: false });

    const currentCut = cutoffs?.[0];
    setActiveCutoff(currentCut);

    if (currentCut) {
      setEditStartDate(currentCut.start_date);
      setEditEndDate(currentCut.end_date);
      setEditTarget(String(currentCut.target_amount));
      setNewStartDate(addDays(currentCut.end_date, 1));
    } else {
      setNewStartDate(todayLocal());
    }

    // Database Summaries via RPC
    const { data: summaryData } = await supabase.rpc('get_money_summary', {
      p_cutoff: currentCut?.id || null,
    });

    const summary = summaryData?.[0];

    if (summary) {
      setTotalSavings(Number(summary.total_savings));
      setThisCutoffSavings(Number(summary.cutoff_savings));
      setCarriedOverSavings(Number(summary.total_savings) - Number(summary.cutoff_savings));
      setAvailableCash(Number(summary.available));
    }

    const { data: billsData } = await supabase
      .from('recurring_bills')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', true)
      .is('deleted_at', null);

    if (currentCut && summary) {
      setSafeToSpend(
        computeSafeToSpend(
          Number(summary.available),
          currentCut.end_date,
          Number(currentCut.target_amount || 5000),
          Number(summary.cutoff_savings),
          billsData || []
        )
      );
    }

    const today = todayLocal();
    const dueSoon = (billsData || []).filter((b) => b.next_due_date && b.next_due_date <= today);
    setBillsDueCount(dueSoon.length);
    setUpcomingBills((billsData || []).slice(0, 3));

    const { data: ledgerData } = await supabase.rpc('get_ledger', {
      p_limit: 3,
      p_offset: 0,
      p_deleted: false,
    });
    setRecentLedger(ledgerData || []);
  };

  const handleSaveCutoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCutoff) return;

    const { error } = await supabase
      .from('cutoffs')
      .update({
        start_date: editStartDate,
        end_date: editEndDate,
        target_amount: parseFloat(editTarget),
      })
      .eq('id', activeCutoff.id);

    if (error) setErrorMsg(error.message);
    else {
      setIsEditCutoffOpen(false);
      notifyDataChanged();
    }
  };

  const handleCreateNextCutoff = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('cutoffs').insert([
      {
        user_id: user.id,
        start_date: newStartDate,
        end_date: newEndDate,
        target_amount: parseFloat(newTarget),
      },
    ]);

    if (error) setErrorMsg(error.message);
    else {
      setIsNewCutoffOpen(false);
      notifyDataChanged();
    }
  };

  const handleToggleCloseCutoff = async () => {
    if (!activeCutoff) return;
    const closed = activeCutoff.closed_at ? null : new Date().toISOString();

    await supabase.from('cutoffs').update({ closed_at: closed }).eq('id', activeCutoff.id);
    setIsEditCutoffOpen(false);
    notifyDataChanged();
  };

  const cutoffTarget = Number(activeCutoff?.target_amount || 5000);
  const cutoffProgressPercent = Math.min(100, Math.round((thisCutoffSavings / (cutoffTarget || 1)) * 100));

  return (
    <div className="p-4 space-y-5">
      {/* Hero Card */}
      <div className="bg-jade text-paper p-6 rounded-card shadow-xl space-y-4 relative">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-gold font-bold">
              Total Savings {activeCutoff?.closed_at && '🔒 (Locked)'}
            </span>
            <h2 className="font-display font-semibold text-4xl">{formatMoney(totalSavings)}</h2>
            <p className="text-xs text-paper/80">
              {formatMoney(carriedOverSavings)} carried over + {formatMoney(thisCutoffSavings)} this cutoff
            </p>
          </div>

          <button
            onClick={() => setIsEditCutoffOpen(true)}
            className="p-2 bg-paper/10 rounded-xl text-xs font-bold text-paper border border-paper/20 hover:bg-paper/20"
          >
            ✏️ Edit
          </button>
        </div>

        <div className="pt-2 space-y-1.5 border-t border-paper/15">
          <div className="flex justify-between items-center text-xs">
            <span>Cutoff Target ({cutoffProgressPercent}%)</span>
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
        <div className="bg-paper border border-line p-4 rounded-card space-y-1">
          <span className="text-xs font-bold uppercase text-jade">Safe to spend today</span>
          <p className={`text-2xl font-black ${safeToSpend.safeTotal < 0 ? 'text-coral' : 'text-jade'}`}>
            {formatMoney(Math.max(0, safeToSpend.perDay))} / day
          </p>
        </div>
      )}

      {/* Ledger Preview */}
      <div className="space-y-3 pt-2">
        <div className="flex justify-between items-center">
          <h3 className="font-display font-semibold text-base text-jade">Ledger</h3>
          <Link href="/ledger" className="text-xs font-bold text-jade hover:underline flex items-center">
            See all →
          </Link>
        </div>

        <div className="space-y-2">
          {recentLedger.map((row) => (
            <div key={row.id} className="bg-paper border border-line p-3 rounded-card flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-jade">{row.note}</p>
                <span className="text-[10px] text-jade/60">{row.entry_date}</span>
              </div>
              <span className={`text-xs font-extrabold ${row.kind === 'income' ? 'text-jade' : 'text-coral'}`}>
                {row.kind === 'income' ? '+' : '-'} {formatMoney(Number(row.amount))}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Cutoff Bottom Sheet */}
      <BottomSheet isOpen={isEditCutoffOpen} onClose={() => setIsEditCutoffOpen(false)} title="Edit Current Cutoff">
        <form onSubmit={handleSaveCutoff} className="space-y-4">
          {errorMsg && <p className="text-xs text-coral font-bold">{errorMsg}</p>}
          <div>
            <label className="block text-xs font-bold text-jade mb-1">Start Date</label>
            <input
              type="date"
              required
              value={editStartDate}
              onChange={(e) => setEditStartDate(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-jade mb-1">End Date</label>
            <input
              type="date"
              required
              value={editEndDate}
              onChange={(e) => setEditEndDate(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-jade mb-1">Target Goal (₱)</label>
            <input
              type="number"
              inputMode="decimal"
              required
              value={editTarget}
              onChange={(e) => setEditTarget(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" className="flex-1 py-3 bg-jade text-paper font-bold rounded-xl text-xs min-h-[44px]">
              Save Cutoff
            </button>
            <button
              type="button"
              onClick={handleToggleCloseCutoff}
              className="px-4 py-3 bg-gold/20 text-jade font-bold rounded-xl text-xs min-h-[44px]"
            >
              {activeCutoff?.closed_at ? 'Reopen' : 'Lock Cutoff'}
            </button>
          </div>
        </form>
      </BottomSheet>

      {/* New Cutoff Bottom Sheet */}
      <BottomSheet isOpen={isNewCutoffOpen} onClose={() => setIsNewCutoffOpen(false)} title="Start Next Cutoff">
        <form onSubmit={handleCreateNextCutoff} className="space-y-4">
          {errorMsg && <p className="text-xs text-coral font-bold">{errorMsg}</p>}
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
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            />
          </div>

          <button type="submit" className="w-full py-3 bg-jade text-paper font-bold rounded-xl text-sm min-h-[44px]">
            Confirm New Cutoff
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}