'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import { todayLocal } from '@/lib/dates';
import { useDataVersion } from '@/components/DataContext';
import BottomSheet from '@/components/BottomSheet';

const CATEGORY_LABEL: Record<string, string> = {
  savings: 'Savings',
  bills: 'Bills',
  groceries: 'Groceries',
  other: 'Other',
};

const input = 'w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]';
const label = 'block text-xs font-bold text-[#143f34] mb-1';

// "This cutoff's plan": a checklist of where the money should go, plus a notepad.
// Ticking an item records the real allocation (and updates the linked asset or debt).
export default function CutoffPlan({ cutoff, available }: { cutoff: any; available: number }) {
  const { dataVersion, notifyDataChanged } = useDataVersion();
  const [items, setItems] = useState<any[]>([]);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [notes, setNotes] = useState('');
  const [notesMsg, setNotesMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [setupMissing, setSetupMissing] = useState(false);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('savings');
  const [holdingId, setHoldingId] = useState('');

  const [tickItem, setTickItem] = useState<any>(null);
  const [tickAmount, setTickAmount] = useState('');
  const [tickDate, setTickDate] = useState(todayLocal());
  const [tickAccount, setTickAccount] = useState('');

  const load = async () => {
    if (!cutoff?.id) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [itemsRes, holdRes, accRes] = await Promise.all([
      supabase
        .from('plan_items')
        .select('*, allocation:allocations(deleted_at)')
        .eq('cutoff_id', cutoff.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('holdings').select('id, name, kind').eq('user_id', user.id).is('archived_at', null).order('name', { ascending: true }),
      supabase.rpc('get_account_balances'),
    ]);
    if (itemsRes.error) {
      setSetupMissing(true); // the plan table has not been created yet
      return;
    }
    setSetupMissing(false);
    setItems(itemsRes.data || []);
    setHoldings(holdRes.data || []);
    setAccounts(accRes.data || []);
  };

  useEffect(() => {
    load();
  }, [cutoff?.id, dataVersion]);

  useEffect(() => {
    setNotes(cutoff?.notes || '');
    setNotesMsg('');
  }, [cutoff?.id]);

  // An item only counts as done while its recorded allocation still exists (not deleted from the ledger).
  const isDone = (it: any) => it.status === 'done' && !!it.allocation_id && !!it.allocation && !it.allocation.deleted_at;

  const doneItems = items.filter(isDone);
  const openItems = items.filter((i) => !isDone(i));
  const doneTotal = doneItems.reduce((a, i) => a + Number(i.amount), 0);
  const openTotal = openItems.reduce((a, i) => a + Number(i.amount), 0);
  const total = doneTotal + openTotal;
  const percent = total > 0 ? Math.round((doneTotal / total) * 100) : 0;
  const leftToPlace = available - openTotal;

  const holdingName = (id: string | null) => holdings.find((h) => h.id === id)?.name;

  const openAdd = () => {
    setErrorMsg('');
    setTitle('');
    setAmount('');
    setCategory('savings');
    setHoldingId('');
    setIsAddOpen(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const amt = parseFloat(amount);
    if (!title.trim() || !(amt > 0)) {
      setErrorMsg('Add a name and an amount above zero.');
      return;
    }
    const h = holdings.find((x) => x.id === holdingId);
    const { error } = await supabase.from('plan_items').insert([
      {
        user_id: user.id,
        cutoff_id: cutoff.id,
        title: title.trim(),
        amount: amt,
        category: h ? (h.kind === 'asset' ? 'savings' : 'bills') : category,
        holding_id: h ? h.id : null,
        sort_order: items.length,
      },
    ]);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setIsAddOpen(false);
    notifyDataChanged();
  };

  const openTick = (it: any) => {
    setErrorMsg('');
    setTickItem(it);
    setTickAmount(String(it.amount));
    setTickDate(todayLocal());
    const def = accounts.find((a) => a.is_default) || accounts[0];
    setTickAccount(def?.account_id || '');
  };

  // "I already did this": record the real allocation, then mark the item done.
  const handleDone = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !tickItem) return;
    const amt = parseFloat(tickAmount);
    if (!(amt > 0)) {
      setErrorMsg('Enter the amount you actually moved.');
      return;
    }
    const h = holdings.find((x) => x.id === tickItem.holding_id);
    const { data: alloc, error } = await supabase
      .from('allocations')
      .insert([
        {
          user_id: user.id,
          cutoff_id: cutoff.id,
          account_id: tickAccount || null,
          category: h ? (h.kind === 'asset' ? 'savings' : 'bills') : tickItem.category,
          amount: amt,
          note: tickItem.title,
          entry_date: tickDate,
          holding_id: h ? h.id : null,
        },
      ])
      .select('id')
      .single();
    if (error || !alloc) {
      setErrorMsg(error?.message || 'Could not record it.');
      return;
    }
    const { error: uErr } = await supabase
      .from('plan_items')
      .update({ status: 'done', allocation_id: alloc.id, done_on: tickDate, amount: amt })
      .eq('id', tickItem.id);
    if (uErr) {
      setErrorMsg(uErr.message);
      return;
    }
    setTickItem(null);
    notifyDataChanged();
  };

  const handleUndo = async (it: any) => {
    if (!window.confirm(`Undo "${it.title}"? The recorded entry moves to Trash.`)) return;
    setErrorMsg('');
    if (it.allocation_id) {
      const { error } = await supabase.from('allocations').update({ deleted_at: new Date().toISOString() }).eq('id', it.allocation_id);
      if (error) {
        setErrorMsg(error.message);
        return;
      }
    }
    await supabase.from('plan_items').update({ status: 'planned', allocation_id: null, done_on: null }).eq('id', it.id);
    notifyDataChanged();
  };

  const handleRemove = async (it: any) => {
    if (!window.confirm(`Remove "${it.title}" from the plan?${isDone(it) ? ' The recorded entry stays in your ledger.' : ''}`)) return;
    await supabase.from('plan_items').delete().eq('id', it.id);
    notifyDataChanged();
  };

  const handleCopyLast = async () => {
    setErrorMsg('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: prev } = await supabase
      .from('plan_items')
      .select('title, amount, category, holding_id, cutoff_id, created_at')
      .eq('user_id', user.id)
      .neq('cutoff_id', cutoff.id)
      .order('created_at', { ascending: false })
      .limit(60);
    if (!prev || prev.length === 0) {
      setErrorMsg('There is no earlier plan to copy yet.');
      return;
    }
    const lastCutoff = prev[0].cutoff_id;
    const rows = prev
      .filter((p: any) => p.cutoff_id === lastCutoff)
      .reverse()
      .map((p: any, i: number) => ({
        user_id: user.id,
        cutoff_id: cutoff.id,
        title: p.title,
        amount: p.amount,
        category: p.category,
        holding_id: p.holding_id,
        sort_order: items.length + i,
      }));
    const { error } = await supabase.from('plan_items').insert(rows);
    if (error) setErrorMsg(error.message);
    else notifyDataChanged();
  };

  const saveNotes = async () => {
    if ((cutoff?.notes || '') === notes) return;
    const { error } = await supabase.from('cutoffs').update({ notes }).eq('id', cutoff.id);
    setNotesMsg(error ? error.message : 'Saved');
    if (!error) setTimeout(() => setNotesMsg(''), 2000);
  };

  if (!cutoff) return null;

  if (setupMissing) {
    return (
      <div className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl text-xs text-[#143f34]">
        <p className="font-bold">This cutoff's plan</p>
        <p className="text-[#143f34]/70 mt-1">Run migration_plan_settings.sql in Supabase to switch on the plan and notepad.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-serif text-base font-bold text-[#143f34]">This cutoff's plan</h3>
        <div className="flex gap-3">
          {items.length === 0 && (
            <button onClick={handleCopyLast} className="text-xs font-bold text-[#1f5d4c] hover:underline min-h-[36px]">
              Copy last plan
            </button>
          )}
          <button onClick={openAdd} className="text-xs font-bold text-[#1f5d4c] hover:underline min-h-[36px]">
            + Add
          </button>
        </div>
      </div>

      {errorMsg && !isAddOpen && !tickItem && (
        <p className="text-xs text-[#c85c46] font-bold p-2 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-[#143f34]/60">
          List where this cutoff's money should go, like "MP2 deposit" or "Personal savings". Tick each one once you've really done it.
        </p>
      ) : (
        <>
          <div>
            <div className="flex justify-between text-[11px] font-bold text-[#143f34] mb-1">
              <span>
                {doneItems.length} of {items.length} done
              </span>
              <span>
                {formatMoney(doneTotal)} of {formatMoney(total)}
              </span>
            </div>
            <div className="h-2 bg-[#1f5d4c]/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#1f5d4c] rounded-full" style={{ width: `${percent}%` }} />
            </div>
          </div>

          <div className="space-y-2">
            {items.map((it) => {
              const done = isDone(it);
              const dest = holdingName(it.holding_id);
              return (
                <div key={it.id} className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label={done ? 'Undo' : 'Mark as done'}
                    onClick={() => (done ? handleUndo(it) : openTick(it))}
                    className={`w-8 h-8 shrink-0 rounded-lg border-2 flex items-center justify-center font-bold ${
                      done ? 'bg-[#1f5d4c] border-[#1f5d4c] text-[#f6f3ea]' : 'border-[#1f5d4c]/40 text-transparent'
                    }`}
                  >
                    ✓
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${done ? 'line-through text-[#143f34]/50' : 'text-[#143f34]'}`}>{it.title}</p>
                    <p className="text-[10px] text-[#143f34]/60 truncate">
                      {dest ? `→ ${dest}` : CATEGORY_LABEL[it.category] || it.category}
                      {done && it.done_on ? ` · done ${it.done_on}` : ''}
                    </p>
                  </div>
                  <p className={`text-sm font-extrabold ${done ? 'text-[#143f34]/50' : 'text-[#1f5d4c]'}`}>{formatMoney(Number(it.amount))}</p>
                  <button type="button" aria-label="Remove" onClick={() => handleRemove(it)} className="text-[#143f34]/40 hover:text-[#c85c46] text-sm min-w-[28px] min-h-[36px]">
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <div className="bg-[#1f5d4c]/10 rounded-xl p-3 text-[11px] text-[#143f34] flex justify-between gap-2">
            <span>
              Available {formatMoney(available)} − still planned {formatMoney(openTotal)}
            </span>
            <span className={`font-bold ${leftToPlace < 0 ? 'text-[#c85c46]' : 'text-[#1f5d4c]'}`}>
              {leftToPlace < 0 ? `${formatMoney(Math.abs(leftToPlace))} short` : `${formatMoney(leftToPlace)} left to place`}
            </span>
          </div>
        </>
      )}

      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="text-xs font-bold text-[#143f34]">Notes</label>
          {notesMsg && <span className="text-[10px] font-bold text-[#1f5d4c]">{notesMsg}</span>}
        </div>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="e.g. Deposit MP2 through GCash on payday"
          className="w-full bg-white border border-[#1f5d4c]/20 rounded-xl p-3 text-sm text-[#143f34]"
        />
      </div>

      <BottomSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add to the plan">
        <form onSubmit={handleAdd} className="space-y-4">
          {errorMsg && <p className="text-xs text-[#c85c46] font-bold p-2 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>}
          <div>
            <label className={label}>What is it?</label>
            <input type="text" required placeholder="e.g. MP2 deposit" value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Planned amount (₱)</label>
            <input type="number" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
          </div>
          {holdings.length > 0 && (
            <div>
              <label className={label}>Goes to / Pays down (optional)</label>
              <select value={holdingId} onChange={(e) => setHoldingId(e.target.value)} className={input}>
                <option value="">None</option>
                {holdings.some((h) => h.kind === 'asset') && (
                  <optgroup label="Assets">
                    {holdings.filter((h) => h.kind === 'asset').map((h) => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </optgroup>
                )}
                {holdings.some((h) => h.kind === 'liability') && (
                  <optgroup label="Debts">
                    {holdings.filter((h) => h.kind === 'liability').map((h) => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}
          {!holdingId && (
            <div>
              <label className={label}>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
                <option value="savings">Savings</option>
                <option value="bills">Bills</option>
                <option value="groceries">Groceries</option>
                <option value="other">Other</option>
              </select>
            </div>
          )}
          <button type="submit" className="w-full py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]">
            Add to plan
          </button>
        </form>
      </BottomSheet>

      <BottomSheet isOpen={!!tickItem} onClose={() => setTickItem(null)} title={`Done: ${tickItem?.title || ''}`}>
        <form onSubmit={handleDone} className="space-y-4">
          {errorMsg && <p className="text-xs text-[#c85c46] font-bold p-2 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>}
          <p className="text-xs text-[#143f34]/70">Confirm what really happened. This records it in your ledger.</p>
          <div>
            <label className={label}>Amount you moved (₱)</label>
            <input type="number" inputMode="decimal" required value={tickAmount} onChange={(e) => setTickAmount(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Date</label>
            <input type="date" required value={tickDate} onChange={(e) => setTickDate(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Taken from</label>
            <select value={tickAccount} onChange={(e) => setTickAccount(e.target.value)} className={input}>
              {accounts.map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {a.name} ({a.kind})
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="w-full py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]">
            Record as done
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}
