'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { formatMoney, computeSafeToSpend, SafeToSpendResult } from '@/lib/money';
import CutoffSheet from '@/components/CutoffSheet';
import EntrySheet from '@/components/crud/EntrySheet';
import UndoToast from '@/components/crud/UndoToast';
import { todayLocal, addDays, daysBetween } from '@/lib/dates';
import { useDataVersion } from '@/components/DataContext';
import { useQuickActions } from '@/components/QuickActionsContext';

interface Banner {
  id: string;
  text: string;
  link: string;
  urgency: number; // Lower = more urgent
}

export default function DashboardPage() {
  const { dataVersion, notifyDataChanged } = useDataVersion();
  const { openSheet } = useQuickActions();
  const [activeCutoff, setActiveCutoff] = useState<any>(null);
  const [allCutoffs, setAllCutoffs] = useState<any[]>([]);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [totalSavings, setTotalSavings] = useState(0);
  const [carriedOverSavings, setCarriedOverSavings] = useState(0);
  const [thisCutoffSavings, setThisCutoffSavings] = useState(0);
  const [availableCash, setAvailableCash] = useState(0);
  const [safeToSpend, setSafeToSpend] = useState<SafeToSpendResult | null>(null);

  const [recentLedger, setRecentLedger] = useState<any[]>([]);
  const [todayMood, setTodayMood] = useState<any>(null);
  const [todayFood, setTodayFood] = useState<any>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Cutoff Sheet Modal States
  const [isCutoffSheetOpen, setIsCutoffSheetOpen] = useState(false);
  const [cutoffSheetMode, setCutoffSheetMode] = useState<'NEW' | 'EDIT'>('NEW');

  // Shared Entry Modal States
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [recentlyDeleted, setRecentlyDeleted] = useState<any>(null);

  useEffect(() => {
    loadDashboardData();
  }, [dataVersion]);

  const loadDashboardData = async () => {
    setErrorMsg('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.rpc('process_my_due_bills');

    const today = todayLocal();

    const [{ data: cutoffs, error: cErr }, { data: accountList, error: aErr }, { data: moodData, error: mErr }, { data: foodData, error: fErr }, { data: billsData, error: bErr }, { data: snapshotData, error: sErr }] = await Promise.all([
      supabase
        .from('cutoffs')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('start_date', { ascending: false }),
      supabase.rpc('get_account_balances'),
      supabase.from('mood_entries').select('*').eq('user_id', user.id).eq('log_date', today).maybeSingle(),
      supabase.from('food_entries').select('*').eq('user_id', user.id).eq('log_date', today).maybeSingle(),
      supabase.from('recurring_bills').select('*').eq('user_id', user.id).eq('active', true).is('deleted_at', null),
      supabase.from('networth_snapshots').select('as_of').eq('user_id', user.id).order('as_of', { ascending: false }).limit(1),
    ]);

    if (cErr) setErrorMsg(cErr.message);
    if (aErr) setErrorMsg(aErr.message);
    if (mErr) setErrorMsg(mErr.message);
    if (fErr) setErrorMsg(fErr.message);
    if (bErr) setErrorMsg(bErr.message);
    if (sErr) setErrorMsg(sErr.message);

    setAllCutoffs(cutoffs || []);
    const currentCut = cutoffs?.[0];
    setActiveCutoff(currentCut);
    setTodayMood(moodData);
    setTodayFood(foodData);

    const { data: summaryData, error: sumErr } = await supabase.rpc('get_money_summary', {
      p_cutoff: currentCut?.id || null,
    });
    if (sumErr) setErrorMsg(sumErr.message);

    const summary = summaryData?.[0];

    if (summary) {
      setTotalSavings(Number(summary.total_savings));
      setThisCutoffSavings(Number(summary.cutoff_savings));
      setCarriedOverSavings(Number(summary.total_savings) - Number(summary.cutoff_savings));
      setAvailableCash(Number(summary.available));
    }

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
    } else {
      setSafeToSpend(null);
    }

    const { data: ledgerData, error: lErr } = await supabase.rpc('get_ledger', {
      p_limit: 3,
      p_offset: 0,
      p_deleted: false,
    });
    if (lErr) setErrorMsg(lErr.message);

    setRecentLedger(ledgerData || []);
    if (accountList) setAccounts(accountList);

    // Compute Banners
    evaluateBanners(today, billsData || [], currentCut, snapshotData?.[0]?.as_of);
  };

  const evaluateBanners = (today: string, activeBills: any[], currentCut: any, latestSnapshotDate?: string) => {
    const list: Banner[] = [];
    const threeDaysOut = addDays(today, 3);

    // 1. Bills due within 3 days
    activeBills.forEach((bill) => {
      if (bill.next_due_date && bill.next_due_date <= threeDaysOut) {
        const id = `bill-due-${bill.id}`;
        if (!localStorage.getItem(`ipon:dismissed:${id}:${today}`)) {
          list.push({
            id,
            text: `🧾 ${bill.name} ${formatMoney(Number(bill.expected_amount))} due ${bill.next_due_date}`,
            link: '/bills',
            urgency: 1,
          });
        }
      }
    });

    // 2. Cutoff ending within 2 days
    if (currentCut && currentCut.end_date) {
      const daysToCutoffEnd = daysBetween(today, currentCut.end_date);
      if (daysToCutoffEnd >= 0 && daysToCutoffEnd <= 2) {
        const id = `cutoff-end-${currentCut.id}`;
        if (!localStorage.getItem(`ipon:dismissed:${id}:${today}`)) {
          list.push({
            id,
            text: `⏳ Cutoff ends in ${daysToCutoffEnd === 0 ? 'today' : `${daysToCutoffEnd} day(s)`} (${currentCut.end_date})`,
            link: '/dashboard',
            urgency: 2,
          });
        }
      }
    }

    // 3. Backup older than 30 days
    const lastBackup = localStorage.getItem('ipon:last-backup');
    if (!lastBackup) {
      const id = 'backup-never';
      if (!localStorage.getItem(`ipon:dismissed:${id}:${today}`)) {
        list.push({
          id,
          text: '💾 You have never made a backup.',
          link: '/more',
          urgency: 3,
        });
      }
    } else if (daysBetween(lastBackup, today) > 30) {
      const id = 'backup-old';
      if (!localStorage.getItem(`ipon:dismissed:${id}:${today}`)) {
        list.push({
          id,
          text: '💾 Backup is older than 30 days.',
          link: '/more',
          urgency: 3,
        });
      }
    }

    // 4. No net-worth snapshot this month
    const currentMonthStr = today.slice(0, 7);
    const snapshotMonthStr = latestSnapshotDate ? latestSnapshotDate.slice(0, 7) : null;

    if (snapshotMonthStr !== currentMonthStr) {
      const id = `no-snapshot-${currentMonthStr}`;
      if (!localStorage.getItem(`ipon:dismissed:${id}:${today}`)) {
        list.push({
          id,
          text: '📊 No net-worth snapshot recorded this month.',
          link: '/wealth',
          urgency: 4,
        });
      }
    }

    // Sort by urgency, cap at 3
    list.sort((a, b) => a.urgency - b.urgency);
    setBanners(list.slice(0, 3));
  };

  const handleDismissBanner = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const today = todayLocal();
    localStorage.setItem(`ipon:dismissed:${id}:${today}`, 'true');
    setBanners((prev) => prev.filter((b) => b.id !== id));
  };

  const openNewCutoff = () => {
    setCutoffSheetMode('NEW');
    setIsCutoffSheetOpen(true);
  };

  const openEditCutoff = () => {
    setCutoffSheetMode('EDIT');
    setIsCutoffSheetOpen(true);
  };

  const handleUndo = async () => {
    if (!recentlyDeleted) return;
    const table = recentlyDeleted.kind === 'income' ? 'income_entries' : recentlyDeleted.kind === 'transfer' ? 'transfers' : 'allocations';

    await supabase.from(table).update({ deleted_at: null }).eq('id', recentlyDeleted.id);
    setRecentlyDeleted(null);
    notifyDataChanged();
  };

  const getMoodEmoji = (m: string) => {
    if (m === 'Happy') return '😊 Happy';
    if (m === 'Okay') return '😐 Okay';
    if (m === 'Stressed') return '😫 Stressed';
    if (m === 'Sad') return '😢 Sad';
    return '😴 Tired';
  };

  const cutoffTarget = Number(activeCutoff?.target_amount || 0);
  const cutoffProgressPercent = activeCutoff
    ? Math.min(100, Math.round((thisCutoffSavings / (cutoffTarget || 1)) * 100))
    : 0;

  return (
    <div className="p-4 space-y-5">
      {errorMsg && <p className="text-xs text-[#c85c46] font-bold p-2.5 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>}

      {/* Dismissible Banners */}
      {banners.length > 0 && (
        <div className="space-y-2">
          {banners.map((b) => (
            <Link
              key={b.id}
              href={b.link}
              className="bg-[#f6f3ea] border border-[#e2a63f]/50 p-3 rounded-2xl flex items-center justify-between shadow-sm hover:bg-[#e2a63f]/10 transition group"
            >
              <span className="text-xs font-bold text-[#143f34] pr-2">{b.text}</span>
              <button
                onClick={(e) => handleDismissBanner(b.id, e)}
                className="text-[#143f34]/40 hover:text-[#c85c46] font-bold text-base p-1 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg"
              >
                ✕
              </button>
            </Link>
          ))}
        </div>
      )}

      {/* Hero Card */}
      <div className="bg-[#1f5d4c] text-[#f6f3ea] p-6 rounded-3xl shadow-xl space-y-4 relative">
        {!activeCutoff ? (
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <span className="text-[11px] uppercase tracking-wider text-[#e2a63f] font-bold">No Active Cutoff</span>
              <h2 className="font-serif text-3xl font-extrabold">Start Your First Cutoff</h2>
              <p className="text-xs text-[#f6f3ea]/80">
                Define a date range and target to track continuous cutoff savings.
              </p>
            </div>
            <button
              onClick={openNewCutoff}
              className="w-full py-3 bg-[#e2a63f] text-[#143f34] font-bold rounded-xl text-xs uppercase tracking-wider transition min-h-[44px]"
            >
              Start Your First Cutoff
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[11px] uppercase tracking-wider text-[#e2a63f] font-bold">
                  Total Continuous Savings
                </span>
                {activeCutoff.closed_at && (
                  <span className="text-[10px] font-bold bg-[#143f34] text-[#e2a63f] px-2 py-0.5 rounded-full border border-[#e2a63f]/30">
                    🔒 Locked
                  </span>
                )}
              </div>
              <h2 className="font-serif text-4xl font-extrabold">{formatMoney(totalSavings)}</h2>
              <p className="text-xs text-[#f6f3ea]/80">
                {formatMoney(carriedOverSavings)} carried over + {formatMoney(thisCutoffSavings)} this cutoff
              </p>
            </div>

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

            <div className="flex gap-2 pt-2">
              <button
                onClick={openNewCutoff}
                className="flex-1 py-3 bg-[#e2a63f] text-[#143f34] font-bold rounded-xl text-xs uppercase tracking-wider transition min-h-[44px]"
              >
                Start Next Cutoff
              </button>
              <button
                onClick={openEditCutoff}
                className="px-4 py-3 bg-[#f6f3ea]/15 text-[#f6f3ea] font-bold rounded-xl text-xs hover:bg-[#f6f3ea]/25 transition min-h-[44px]"
              >
                Edit Cutoff
              </button>
            </div>
          </>
        )}
      </div>

      {/* Today's Check-in Row */}
      <div className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold text-[#143f34]/60 uppercase tracking-wider block">Today's Check-in</span>
          <p className="text-xs font-bold text-[#143f34]">
            {todayMood ? getMoodEmoji(todayMood.mood) : 'No mood logged today'}
          </p>
        </div>
        <button
          onClick={() => openSheet('mood')}
          className="px-3 py-1.5 bg-[#1f5d4c]/10 text-[#1f5d4c] text-xs font-bold rounded-xl hover:bg-[#1f5d4c]/20 min-h-[44px]"
        >
          {todayMood ? 'Edit Mood' : 'Log Mood'}
        </button>
      </div>

      {/* Safe to Spend Card */}
      {safeToSpend && (
        <div className="bg-[#f6f3ea] border border-[#1f5d4c]/20 p-4 rounded-2xl space-y-1">
          <span className="text-xs font-bold uppercase text-[#143f34]">Safe to spend today</span>
          <p className={`text-2xl font-black ${safeToSpend.safeTotal < 0 ? 'text-[#c85c46]' : 'text-[#1f5d4c]'}`}>
            {formatMoney(Math.max(0, safeToSpend.perDay))} / day
          </p>
        </div>
      )}

      {/* Where My Money Is Strip */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <h3 className="font-serif text-xs font-bold text-[#143f34]">Where My Money Is</h3>
          <Link href="/wealth" className="text-xs font-bold text-[#1f5d4c] hover:underline">
            Manage →
          </Link>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {accounts.map((a) => (
            <div key={a.account_id} className="min-w-[130px] bg-[#f6f3ea] border border-[#1f5d4c]/15 p-3 rounded-2xl space-y-1">
              <span className="text-[10px] uppercase font-bold text-[#143f34]/60">{a.name}</span>
              <p className="text-sm font-bold text-[#1f5d4c]">{formatMoney(Number(a.balance))}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Ledger Preview */}
      <div className="space-y-3 pt-2">
        <div className="flex justify-between items-center">
          <h3 className="font-serif text-base font-bold text-[#143f34]">Ledger</h3>
          <Link href="/ledger" className="text-xs font-bold text-[#1f5d4c] hover:underline">
            See all →
          </Link>
        </div>

        <div className="space-y-2">
          {recentLedger.map((row) => (
            <div key={row.id} className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-3 rounded-2xl flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-[#143f34]">{row.note}</p>
                <span className="text-[10px] text-[#143f34]/60">{row.entry_date}</span>
              </div>
              <div className="text-right space-y-1">
                <span className={`text-xs font-extrabold block ${row.kind === 'income' ? 'text-[#1f5d4c]' : 'text-[#c85c46]'}`}>
                  {row.kind === 'income' ? '+' : '-'} {formatMoney(Number(row.amount))}
                </span>
                <button
                  onClick={() => setSelectedEntry(row)}
                  className="px-2 py-0.5 bg-[#1f5d4c]/10 text-[#1f5d4c] text-[10px] font-bold rounded-lg min-h-[36px]"
                >
                  ✏️ Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cutoff Management Sheet */}
      <CutoffSheet
        isOpen={isCutoffSheetOpen}
        onClose={() => setIsCutoffSheetOpen(false)}
        mode={cutoffSheetMode}
        currentCutoff={activeCutoff}
        latestCutoff={allCutoffs[0]}
        allCutoffs={allCutoffs}
      />

      {/* Shared Entry Editing Sheet */}
      <EntrySheet
        isOpen={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        entry={selectedEntry}
        accounts={accounts}
        onSaveSuccess={notifyDataChanged}
        onDeleteSuccess={(item: any) => {
          setRecentlyDeleted(item);
          notifyDataChanged();
        }}
      />

      {/* Undo Toast */}
      {recentlyDeleted && (
        <UndoToast
          message="Entry soft-deleted."
          onUndo={handleUndo}
          onClose={() => setRecentlyDeleted(null)}
        />
      )}
    </div>
  );
}