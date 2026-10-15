'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { computeRunningBalances, formatMoney, ProcessedLedgerEntry } from '@/lib/money';

export default function LedgerPage() {
  const [entries, setEntries] = useState<ProcessedLedgerEntry[]>([]);
  const [cutoffs, setCutoffs] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'income' | 'savings' | 'bills' | 'other'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Trigger process due bills RPC
    await supabase.rpc('process_my_due_bills');

    const [{ data: incData }, { data: allocData }, { data: cutData }] = await Promise.all([
      supabase.from('income_entries').select('*').eq('user_id', user.id),
      supabase.from('allocations').select('*').eq('user_id', user.id),
      supabase.from('cutoffs').select('*').eq('user_id', user.id).order('start_date', { ascending: true }),
    ]);

    setCutoffs(cutData || []);

    const rawIncomes = (incData || []).map((i) => ({
      id: i.id,
      created_at: i.created_at,
      type: 'income' as const,
      amount: Number(i.amount),
      category: 'income',
      note: i.source || i.note || 'Income Deposit',
      cutoff_id: i.cutoff_id,
    }));

    const rawAllocations = (allocData || []).map((a) => ({
      id: a.id,
      created_at: a.created_at,
      type: 'allocation' as const,
      amount: Number(a.amount),
      category: a.category,
      note: a.note || a.category,
      cutoff_id: a.cutoff_id,
      due_date: a.due_date,
    }));

    const processed = computeRunningBalances([...rawIncomes, ...rawAllocations]);
    setEntries(processed);
    setLoading(false);
  };

  const filteredEntries = entries.filter((e) => {
    if (filter === 'all') return true;
    if (filter === 'income') return e.type === 'income';
    if (filter === 'savings') return e.category === 'savings';
    if (filter === 'bills') return e.category === 'bills';
    return e.category !== 'savings' && e.category !== 'bills' && e.type !== 'income';
  });

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-xs font-bold text-[#1f5d4c] hover:underline flex items-center gap-1 min-h-[44px]">
          ← Back to Dashboard
        </Link>
        <h1 className="font-serif text-xl font-bold text-[#143f34]">Continuous Ledger</h1>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {(['all', 'income', 'savings', 'bills', 'other'] as const).map((chip) => (
          <button
            key={chip}
            onClick={() => setFilter(chip)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold capitalize transition min-h-[44px] ${
              filter === chip
                ? 'bg-[#1f5d4c] text-[#f6f3ea]'
                : 'bg-[#1f5d4c]/10 text-[#143f34]/70 hover:bg-[#1f5d4c]/20'
            }`}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Ledger Table / List View */}
      {loading ? (
        <div className="p-8 text-center text-xs text-[#143f34]/60">Loading ledger data...</div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry, idx) => {
            // Cutoff Divider Logic
            const cutoffStart = cutoffs.find(
              (c) => c.id === entry.cutoff_id && idx === filteredEntries.findIndex((x) => x.cutoff_id === c.id)
            );

            return (
              <React.Fragment key={entry.id}>
                {cutoffStart && (
                  <div className="my-3 p-3 bg-[#e2a63f]/15 border border-[#e2a63f]/30 rounded-xl text-xs font-bold text-[#143f34] flex justify-between items-center">
                    <span>
                      Cutoff {cutoffStart.start_date} – {cutoffStart.end_date} Started
                    </span>
                    <span className="text-[10px] text-[#143f34]/60">
                      Carried In: {formatMoney(Number(cutoffStart.carried_in_savings || 0))}
                    </span>
                  </div>
                )}

                <div className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl flex items-center justify-between shadow-xs">
                  <div className="space-y-1">
                    <p className="font-bold text-sm text-[#143f34]">{entry.note}</p>
                    <div className="flex items-center gap-2 text-[11px] text-[#143f34]/60">
                      <span>{new Date(entry.created_at).toLocaleDateString()}</span>
                      <span>•</span>
                      <span className="capitalize font-medium">{entry.category}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`text-sm font-extrabold ${
                        entry.type === 'income' ? 'text-[#1f5d4c]' : 'text-[#c85c46]'
                      }`}
                    >
                      {entry.type === 'income' ? '+' : '-'} {formatMoney(entry.amount)}
                    </span>
                    <p className="text-[10px] text-[#143f34]/50 mt-0.5">
                      Bal: {formatMoney(entry.runningAvailableBalance)}
                    </p>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}