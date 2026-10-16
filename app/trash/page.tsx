'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import { useDataVersion } from '@/components/DataContext';

export default function TrashPage() {
  const { notifyDataChanged } = useDataVersion();
  const [deletedEntries, setDeletedEntries] = useState<any[]>([]);

  useEffect(() => {
    fetchTrash();
  }, []);

  const fetchTrash = async () => {
    const { data } = await supabase.rpc('get_ledger', {
      p_limit: 100,
      p_offset: 0,
      p_deleted: true,
    });
    setDeletedEntries(data || []);
  };

  const handleRestore = async (entry: any) => {
    const table = entry.kind === 'income' ? 'income_entries' : 'allocations';
    await supabase.from(table).update({ deleted_at: null }).eq('id', entry.id);
    fetchTrash();
    notifyDataChanged();
  };

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/more" className="text-xs font-bold text-jade hover:underline">
          ← More
        </Link>
        <h1 className="font-display font-semibold text-xl text-jade">Trash & Deleted Items</h1>
      </div>

      <div className="space-y-2">
        {deletedEntries.length === 0 ? (
          <p className="text-xs text-center text-jade/60 py-8">Trash is empty.</p>
        ) : (
          deletedEntries.map((item) => (
            <div key={item.id} className="bg-paper border border-line p-3 rounded-card flex justify-between items-center text-xs">
              <div>
                <p className="font-bold text-jade">{item.note}</p>
                <span className="text-[10px] text-jade/60">{item.entry_date} · {formatMoney(Number(item.amount))}</span>
              </div>
              <button
                onClick={() => handleRestore(item)}
                className="px-3 py-1.5 bg-jade text-paper font-bold rounded-lg text-xs min-h-[36px]"
              >
                Restore
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}