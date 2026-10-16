'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import { todayLocal } from '@/lib/dates';

export default function ReportsPage() {
  const [selectedMonth, setSelectedMonth] = useState(todayLocal().slice(0, 7));
  const [report, setReport] = useState<any>(null);
  const [cutoffHistory, setCutoffHistory] = useState<any[]>([]);

  useEffect(() => {
    fetchReportData();
  }, [selectedMonth]);

  const fetchReportData = async () => {
    const monthDate = `${selectedMonth}-01`;
    const [{ data: repData }, { data: cutData }] = await Promise.all([
      supabase.rpc('get_monthly_report', { p_month: monthDate }),
      supabase.rpc('get_cutoff_history'),
    ]);

    if (repData?.[0]) setReport(repData[0]);
    if (cutData) setCutoffHistory(cutData);
  };

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/more" className="text-xs font-bold text-jade hover:underline">
          ← More
        </Link>
        <h1 className="font-display font-semibold text-xl text-jade">Financial Reports</h1>
      </div>

      <div>
        <label className="block text-xs font-bold text-jade mb-1">Select Month</label>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
        />
      </div>

      {report && (
        <div className="bg-paper border border-line p-5 rounded-card space-y-3">
          <h2 className="font-display font-semibold text-base text-jade">Monthly Summary</h2>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-jade/10 rounded-xl space-y-1">
              <span className="text-jade/60 font-bold uppercase text-[10px]">Income</span>
              <p className="text-base font-bold text-jade">{formatMoney(Number(report.income))}</p>
            </div>
            <div className="p-3 bg-gold/15 rounded-xl space-y-1">
              <span className="text-jade/60 font-bold uppercase text-[10px]">Savings</span>
              <p className="text-base font-bold text-jade">{formatMoney(Number(report.savings))}</p>
            </div>
            <div className="p-3 bg-coral/10 rounded-xl space-y-1">
              <span className="text-coral/80 font-bold uppercase text-[10px]">Bills</span>
              <p className="text-base font-bold text-coral">{formatMoney(Number(report.bills))}</p>
            </div>
            <div className="p-3 bg-coral/10 rounded-xl space-y-1">
              <span className="text-coral/80 font-bold uppercase text-[10px]">Groceries & Other</span>
              <p className="text-base font-bold text-coral">
                {formatMoney(Number(report.groceries) + Number(report.other))}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cutoff History Table */}
      <div className="space-y-3">
        <h2 className="font-display font-semibold text-base text-jade">Cutoff Progress History</h2>
        <div className="space-y-2">
          {cutoffHistory.map((c) => (
            <div key={c.cutoff_id} className="bg-paper border border-line p-3 rounded-card text-xs flex justify-between items-center">
              <div>
                <p className="font-bold text-jade">{c.start_date} to {c.end_date}</p>
                <span className="text-[10px] text-jade/60">Target: {formatMoney(Number(c.target_amount))}</span>
              </div>
              <div className="text-right">
                <p className="font-extrabold text-jade">Saved: {formatMoney(Number(c.saved))}</p>
                <span className={`text-[10px] font-bold ${Number(c.saved) >= Number(c.target_amount) ? 'text-jade' : 'text-gold'}`}>
                  {Number(c.saved) >= Number(c.target_amount) ? 'Target Met ✓' : 'In Progress'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}