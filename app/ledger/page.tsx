'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import EntrySheet from '@/components/crud/EntrySheet';
import UndoToast from '@/components/crud/UndoToast';
import { useDataVersion } from '@/components/DataContext';

export default function LedgerPage() {
  const { dataVersion, notifyDataChanged } = useDataVersion();
  const [entries, setEntries] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [recentlyDeleted, setRecentlyDeleted] = useState<any>(null);

  useEffect(() => {
    fetchInitialData();
  }, [dataVersion]);

  const fetchInitialData = async () => {
    const [{ data: lData }, { data: aData }] = await Promise.all([
      supabase.rpc('get_ledger', { p_limit: 50, p_offset: 0, p_deleted: false }),
      supabase.rpc('get_account_balances'),
    ]);

    if (lData) {
      setEntries(lData);
      setHasMore(lData.length === 50);
      setOffset(50);
    }
    if (aData) setAccounts(aData);
  };

  const loadMore = async () => {
    const { data } = await supabase.rpc('get_ledger', { p_limit: 50, p_offset: offset, p_deleted: false });
    if (data) {
      setEntries((prev) => [...prev, ...data]);
      setHasMore(data.length === 50);
      setOffset(offset + 50);
    }
  };

  const handleUndo = async () => {
    if (!recentlyDeleted) return;
    const table = recentlyDeleted.kind === 'income' ? 'income_entries' : recentlyDeleted.kind === 'transfer' ? 'transfers' : 'allocations';

    await supabase.from(table).update({ deleted_at: null }).eq('id', recentlyDeleted.id);
    setRecentlyDeleted(null);
    notifyDataChanged();
  };

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-xs font-bold text-[#1f5d4c] hover:underline">
          ← Dashboard
        </Link>
        <h1 className="font-serif text-xl font-bold text-[#143f34]">Continuous Ledger</h1>
      </div>

      <div className="space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-3 rounded-2xl flex justify-between items-center"
          >
            <div>
              <p className="text-xs font-bold text-[#143f34]">{entry.note}</p>
              <span className="text-[10px] text-[#143f34]/60">{entry.entry_date}</span>
            </div>
            <div className="text-right space-y-1">
              <span className={`text-xs font-extrabold block ${entry.kind === 'income' ? 'text-[#1f5d4c]' : 'text-[#c85c46]'}`}>
                {entry.kind === 'income' ? '+' : '-'} {formatMoney(Number(entry.amount))}
              </span>
              <div className="flex items-center justify-end gap-2">
                <span className="text-[10px] text-[#143f34]/50">Bal: {formatMoney(Number(entry.running_available))}</span>
                <button
                  onClick={() => setSelectedEntry(entry)}
                  className="px-2 py-0.5 bg-[#1f5d4c]/10 text-[#1f5d4c] text-[10px] font-bold rounded-lg min-h-[36px]"
                >
                  ✏️ Edit
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={loadMore}
          className="w-full py-3 bg-[#1f5d4c]/10 text-[#1f5d4c] font-bold rounded-xl text-xs min-h-[44px]"
        >
          Load More Entries
        </button>
      )}

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