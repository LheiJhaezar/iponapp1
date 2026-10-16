'use client';

import React, { useState, useEffect } from 'react';
import BottomSheet from '@/components/BottomSheet';
import { supabase } from '@/lib/supabase/client';

interface EntrySheetProps {
  isOpen: boolean;
  onClose: () => void;
  entry: any;
  accounts: any[];
  onSaveSuccess: () => void;
  onDeleteSuccess: (deletedItem: any) => void;
}

export default function EntrySheet({
  isOpen,
  onClose,
  entry,
  accounts,
  onSaveSuccess,
  onDeleteSuccess,
}: EntrySheetProps) {
  const [amount, setAmount] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [category, setCategory] = useState('savings');
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (entry) {
      setAmount(String(entry.amount || ''));
      setEntryDate(entry.entry_date || '');
      setCategory(entry.category || 'savings');
      setNote(entry.note || '');
      setAccountId(entry.account_id || accounts[0]?.account_id || '');
      setErrorMsg('');
      setShowHistory(false);
      fetchHistory(entry.id);
    }
  }, [entry, accounts]);

  const fetchHistory = async (id: string) => {
    if (!id) return;
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .eq('row_id', id)
      .order('changed_at', { ascending: false })
      .limit(3);

    if (data) setHistory(data);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry) return;
    setLoading(true);
    setErrorMsg('');

    const table =
      entry.kind === 'income'
        ? 'income_entries'
        : entry.kind === 'transfer'
        ? 'transfers'
        : 'allocations';

    let payload: any = {
      amount: parseFloat(amount),
      entry_date: entryDate,
      note,
    };

    if (entry.kind === 'income') {
      payload.source = note;
      payload.account_id = accountId || null;
    } else if (entry.kind === 'allocation') {
      payload.category = category;
      payload.account_id = accountId || null;
    }

    const { error } = await supabase.from(table).update(payload).eq('id', entry.id);

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
    } else {
      setLoading(false);
      onClose();
      onSaveSuccess();
    }
  };

  const handleDelete = async () => {
    if (!entry) return;
    if (!window.confirm('Are you sure you want to delete this entry?')) return;

    const table =
      entry.kind === 'income'
        ? 'income_entries'
        : entry.kind === 'transfer'
        ? 'transfers'
        : 'allocations';

    const { error } = await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', entry.id);

    if (error) {
      setErrorMsg(error.message);
    } else {
      onClose();
      onDeleteSuccess(entry);
    }
  };

  if (!entry) return null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={`Edit ${entry.kind || 'Entry'}`}>
      <form onSubmit={handleSave} className="space-y-4">
        {errorMsg && (
          <p className="text-xs text-[#c85c46] font-bold p-2.5 bg-[#c85c46]/10 rounded-xl">
            {errorMsg}
          </p>
        )}

        {entry.kind === 'allocation' && (
          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            >
              <option value="savings">Savings Target</option>
              <option value="bills">Bills</option>
              <option value="groceries">Groceries</option>
              <option value="other">Other Expense</option>
            </select>
          </div>
        )}

        {entry.kind !== 'transfer' && (
          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Account</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            >
              {accounts.map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {a.name} ({a.kind})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-[#143f34] mb-1">Date</label>
          <input
            type="date"
            required
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-[#143f34] mb-1">Amount (₱)</label>
          <input
            type="number"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-[#143f34] mb-1">Note / Source</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />
        </div>

        {/* Audit Log History Accordion */}
        {history.length > 0 && (
          <div className="pt-2 border-t border-[#1f5d4c]/10 space-y-2">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs font-bold text-[#1f5d4c] hover:underline flex items-center justify-between w-full"
            >
              <span>Audit History ({history.length})</span>
              <span>{showHistory ? '▲' : '▼'}</span>
            </button>

            {showHistory && (
              <div className="space-y-1.5 text-[11px] text-[#143f34]/70 bg-[#1f5d4c]/5 p-3 rounded-xl">
                {history.map((h) => (
                  <div key={h.id} className="flex justify-between border-b border-[#1f5d4c]/10 pb-1 last:border-0">
                    <span className="uppercase font-bold">{h.action}</span>
                    <span>{new Date(h.changed_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={loading || !amount || parseFloat(amount) <= 0}
            className="flex-1 py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-xs min-h-[44px] disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-3 bg-[#c85c46]/15 text-[#c85c46] font-bold rounded-xl text-xs min-h-[44px]"
          >
            Delete
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}