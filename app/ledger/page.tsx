'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import BottomSheet from '@/components/BottomSheet';
import { useDataVersion } from '@/components/DataContext';

export default function LedgerPage() {
  const { dataVersion, notifyDataChanged } = useDataVersion();
  const [entries, setEntries] = useState<any[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editDate, setEditDate] = useState('');

  useEffect(() => {
    fetchLedger(0, true);
  }, [dataVersion]);

  const fetchLedger = async (currentOffset: number, reset = false) => {
    const { data } = await supabase.rpc('get_ledger', {
      p_limit: 50,
      p_offset: currentOffset,
      p_deleted: false,
    });

    if (data) {
      if (reset) setEntries(data);
      else setEntries((prev) => [...prev, ...data]);

      setHasMore(data.length === 50);
      setOffset(currentOffset + 50);
    }
  };

  const handleRowClick = (entry: any) => {
    setSelectedEntry(entry);
    setEditAmount(String(entry.amount));
    setEditNote(entry.note);
    setEditDate(entry.entry_date);
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntry) return;

    const table = selectedEntry.kind === 'income' ? 'income_entries' : 'allocations';
    await supabase
      .from(table)
      .update({
        amount: parseFloat(editAmount),
        note: editNote,
        entry_date: editDate,
      })
      .eq('id', selectedEntry.id);

    setSelectedEntry(null);
    notifyDataChanged();
  };

  const handleSoftDelete = async () => {
    if (!selectedEntry) return;

    const table = selectedEntry.kind === 'income' ? 'income_entries' : 'allocations';
    await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', selectedEntry.id);

    setSelectedEntry(null);
    notifyDataChanged();
  };

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-xs font-bold text-jade hover:underline">
          ← Dashboard
        </Link>
        <h1 className="font-display font-semibold text-xl text-jade">Continuous Ledger</h1>
      </div>

      <div className="space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.id}
            onClick={() => handleRowClick(entry)}
            className="bg-paper border border-line p-3 rounded-card flex justify-between items-center cursor-pointer hover:bg-jade/5"
          >
            <div>
              <p className="text-xs font-bold text-jade">{entry.note}</p>
              <span className="text-[10px] text-jade/60">{entry.entry_date}</span>
            </div>
            <div className="text-right">
              <span className={`text-xs font-extrabold ${entry.kind === 'income' ? 'text-jade' : 'text-coral'}`}>
                {entry.kind === 'income' ? '+' : '-'} {formatMoney(Number(entry.amount))}
              </span>
              <p className="text-[10px] text-jade/50">Bal: {formatMoney(Number(entry.running_available))}</p>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => fetchLedger(offset)}
          className="w-full py-3 bg-jade/10 text-jade font-bold rounded-xl text-xs min-h-[44px]"
        >
          Load More
        </button>
      )}

      {/* Edit Entry Sheet */}
      <BottomSheet isOpen={!!selectedEntry} onClose={() => setSelectedEntry(null)} title="Edit Entry">
        <form onSubmit={handleSaveEntry} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-jade mb-1">Date</label>
            <input
              type="date"
              required
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-jade mb-1">Amount (₱)</label>
            <input
              type="number"
              inputMode="decimal"
              required
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-jade mb-1">Note</label>
            <input
              type="text"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" className="flex-1 py-3 bg-jade text-paper font-bold rounded-xl text-xs min-h-[44px]">
              Save Entry
            </button>
            <button
              type="button"
              onClick={handleSoftDelete}
              className="px-4 py-3 bg-coral/15 text-coral font-bold rounded-xl text-xs min-h-[44px]"
            >
              Delete
            </button>
          </div>
        </form>
      </BottomSheet>
    </div>
  );
}