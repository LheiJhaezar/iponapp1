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

  const [accounts, setAccounts] = useState<any[]>([]);
  const [totalSavings, setTotalSavings] = useState(0);
  const [carriedOverSavings, setCarriedOverSavings] = useState(0);
  const [thisCutoffSavings, setThisCutoffSavings] = useState(0);
  const [availableCash, setAvailableCash] = useState(0);
  const [safeToSpend, setSafeToSpend] = useState<SafeToSpendResult | null>(null);

  const [billsDueCount, setBillsDueCount] = useState(0);
  const [recentLedger, setRecentLedger] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
    recordDailySnapshot();
  }, [dataVersion]);

  const recordDailySnapshot = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const today = todayLocal();
    const { data: net } = await supabase.rpc('get_net_worth');
    const row = net?.[0];

    if (row) {
      await supabase.from('networth_snapshots').upsert(
        {
          user_id: user.id,
          as_of: today,
          cash_total: row.cash_total,
          assets_total: row.assets_total,
          liabilities_total: row.liabilities_total,
          net_worth: row.net_worth,
        },
        { onConflict: 'user_id,as_of' }
      );
    }
  };

  const loadDashboardData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.rpc('process_my_due_bills');

    const [{ data: cutoffs }, { data: accountList }] = await Promise.all([
      supabase.from('cutoffs').select('*').eq('user_id', user.id).is('deleted_at', null).order('start_date', { ascending: false }),
      supabase.rpc('get_account_balances'),
    ]);

    setAccounts(accountList || []);
    const currentCut = cutoffs?.[0];
    setActiveCutoff(currentCut);

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

    const { data: ledgerData } = await supabase.rpc('get_ledger', {
      p_limit: 3,
      p_offset: 0,
      p_deleted: false,
    });
    setRecentLedger(ledgerData || []);
  };

  const cutoffTarget = Number(activeCutoff?.target_amount || 5000);
  const cutoffProgressPercent = Math.min(100, Math.round((thisCutoffSavings / (cutoffTarget || 1)) * 100));

  return (
    <div className="p-4 space-y-5">
      {/* Hero Card */}
      <div className="bg-jade text-paper p-6 rounded-card shadow-xl space-y-4 relative">
        <div className="space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-gold font-bold">Total Continuous Savings</span>
          <h2 className="font-display font-semibold text-4xl">{formatMoney(totalSavings)}</h2>
          <p className="text-xs text-paper/80">
            {formatMoney(carriedOverSavings)} carried over + {formatMoney(thisCutoffSavings)} this cutoff
          </p>
        </div>

        <div className="pt-2 space-y-1.5 border-t border-paper/15">
          <div className="flex justify-between items-center text-xs">
            <span>Cutoff Progress ({cutoffProgressPercent}%)</span>
            <span>Target: {formatMoney(cutoffTarget)}</span>
          </div>
          <div className="w-full bg-[#143f34] rounded-full h-2.5 overflow-hidden">
            <div className="bg-gold h-full rounded-full transition-all duration-500" style={{ width: `${cutoffProgressPercent}%` }} />
          </div>
        </div>
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

      {/* Where My Money Is Strip */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <h3 className="font-display font-semibold text-xs text-jade">Where My Money Is</h3>
          <Link href="/wealth" className="text-xs font-bold text-jade hover:underline">
            Manage →
          </Link>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {accounts.map((a) => (
            <div key={a.account_id} className="min-w-[130px] bg-paper border border-line p-3 rounded-card space-y-1">
              <span className="text-[10px] uppercase font-bold text-jade/60">{a.name}</span>
              <p className="text-sm font-bold text-jade">{formatMoney(Number(a.balance))}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Ledger Preview */}
      <div className="space-y-3 pt-2">
        <div className="flex justify-between items-center">
          <h3 className="font-display font-semibold text-base text-jade">Ledger</h3>
          <Link href="/ledger" className="text-xs font-bold text-jade hover:underline">
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
    </div>
  );
}