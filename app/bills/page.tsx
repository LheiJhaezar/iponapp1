'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import BottomSheet from '@/components/BottomSheet';
import { todayLocal, addDays, advanceDue, frequencyLabel, FREQUENCY_OPTIONS, type Frequency } from '@/lib/dates';
import { useDataVersion } from '@/components/DataContext';

export default function BillsPage() {
  const { dataVersion, notifyDataChanged } = useDataVersion();
  const [bills, setBills] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  // Sheet States
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<any>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [dayA, setDayA] = useState('15');
  const [dayB, setDayB] = useState('31');
  const [autoDeduct, setAutoDeduct] = useState(true);
  const [accountId, setAccountId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchData();
  }, [dataVersion]);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.rpc('process_my_due_bills');

    const [{ data: billsData }, { data: accsData }] = await Promise.all([
      supabase
        .from('recurring_bills')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('next_due_date', { ascending: true }),
      supabase.rpc('get_account_balances'),
    ]);

    if (billsData) setBills(billsData);
    if (accsData) {
      setAccounts(accsData);
      const def = accsData.find((a: any) => a.is_default) || accsData[0];
      if (def && !accountId) setAccountId(def.account_id);
    }
  };

  const openAddSheet = () => {
    setEditingBill(null);
    setName('');
    setAmount('');
    setNextDueDate('');
    setFrequency('monthly');
    setDayA('15');
    setDayB('31');
    setAutoDeduct(true);
    const def = accounts.find((a: any) => a.is_default) || accounts[0];
    setAccountId(def?.account_id || '');
    setErrorMsg('');
    setIsSheetOpen(true);
  };

  const openEditSheet = (bill: any) => {
    setEditingBill(bill);
    setName(bill.name);
    setAmount(String(bill.expected_amount));
    setNextDueDate(bill.next_due_date || '');
    setFrequency(bill.frequency || 'monthly');
    const dd = Array.isArray(bill.due_days) ? bill.due_days : [];
    setDayA(String(dd[0] ?? 15));
    setDayB(String(dd[1] ?? 31));
    setAutoDeduct(bill.auto_deduct ?? true);
    setAccountId(bill.account_id || (accounts[0]?.account_id || ''));
    setErrorMsg('');
    setIsSheetOpen(true);
  };

  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let anchorDay = nextDueDate ? parseInt(nextDueDate.split('-')[2], 10) : 1;
    let dueDays: number[] | null = null;
    if (frequency === 'semimonthly') {
      const a = parseInt(dayA, 10);
      const b = parseInt(dayB, 10);
      const valid = (n: number) => Number.isInteger(n) && n >= 1 && n <= 31;
      if (!valid(a) || !valid(b) || a === b) {
        setErrorMsg('Pick two different days between 1 and 31 (31 = last day of the month).');
        return;
      }
      dueDays = [a, b].sort((x, y) => x - y);
      anchorDay = dueDays[0];
    }

    if (editingBill) {
      const { error } = await supabase
        .from('recurring_bills')
        .update({
          name,
          expected_amount: parseFloat(amount),
          next_due_date: nextDueDate,
          frequency,
          auto_deduct: autoDeduct,
          account_id: accountId || null,
          due_anchor_day: anchorDay,
          due_days: dueDays,
        })
        .eq('id', editingBill.id);

      if (error) {
        setErrorMsg(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('recurring_bills').insert([
        {
          user_id: user.id,
          name,
          expected_amount: parseFloat(amount),
          next_due_date: nextDueDate,
          frequency,
          auto_deduct: autoDeduct,
          account_id: accountId || null,
          due_anchor_day: anchorDay,
          due_days: dueDays,
          active: true,
        },
      ]);

      if (error) {
        setErrorMsg(error.message);
        return;
      }
    }

    setIsSheetOpen(false);
    notifyDataChanged();
  };

  const handleSkipMonth = async () => {
    if (!editingBill) return;
    const nextDate = advanceDue(
      editingBill.next_due_date,
      editingBill.frequency,
      editingBill.due_anchor_day,
      editingBill.due_days
    );

    const { error } = await supabase
      .from('recurring_bills')
      .update({ next_due_date: nextDate })
      .eq('id', editingBill.id);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setIsSheetOpen(false);
      notifyDataChanged();
    }
  };

  const handleTogglePause = async (billToToggle?: any) => {
    const target = billToToggle || editingBill;
    if (!target) return;

    const { error } = await supabase
      .from('recurring_bills')
      .update({ active: !target.active })
      .eq('id', target.id);

    if (error && !billToToggle) {
      setErrorMsg(error.message);
    } else {
      setIsSheetOpen(false);
      notifyDataChanged();
    }
  };

  const handleDeleteBill = async () => {
    if (!editingBill) return;
    if (!window.confirm(`Are you sure you want to delete "${editingBill.name}"?`)) return;

    const { error } = await supabase
      .from('recurring_bills')
      .update({ active: false, deleted_at: new Date().toISOString() })
      .eq('id', editingBill.id);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setIsSheetOpen(false);
      notifyDataChanged();
    }
  };

  const handleMarkPaid = async (bill: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: cutoff } = await supabase
      .from('cutoffs')
      .select('id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cutoff) {
      const { error: insertErr } = await supabase.from('allocations').insert([
        {
          user_id: user.id,
          cutoff_id: cutoff.id,
          category: 'bills',
          amount: bill.expected_amount,
          note: `${bill.name} (manual)`,
          bill_id: bill.id,
          due_date: bill.next_due_date,
          account_id: bill.account_id || null,
        },
      ]);
      if (insertErr) {
        alert(insertErr.message);
        return;
      }
    }

    const nextDate = advanceDue(bill.next_due_date, bill.frequency, bill.due_anchor_day, bill.due_days);

    const { error: updateErr } = await supabase
      .from('recurring_bills')
      .update({ next_due_date: nextDate })
      .eq('id', bill.id);

    if (updateErr) {
      alert(updateErr.message);
      return;
    }

    notifyDataChanged();
  };

  const activeBills = bills.filter((b) => b.active);
  const pausedBills = bills.filter((b) => !b.active);
  // how many times each bill falls due in the next 30 days (twice-a-month bills count twice, yearly ones usually zero)
  const horizon = addDays(todayLocal(), 30);
  const countDue = (b: any) => {
    let d: string = b.next_due_date;
    if (!d) return 0;
    let n = 0;
    for (let i = 0; i < 60 && d <= horizon; i++) {
      n++;
      d = advanceDue(d, b.frequency, b.due_anchor_day, b.due_days);
    }
    return n;
  };
  const totalNext30Days = activeBills.reduce(
    (acc, b) => acc + Number(b.expected_amount || 0) * countDue(b),
    0
  );

  return (
    <div className="p-4 space-y-5">
      <div className="flex justify-between items-center">
        <h1 className="font-serif text-2xl font-bold text-[#143f34]">Recurring Bills</h1>
        <button
          onClick={openAddSheet}
          className="px-4 py-2 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-xs min-h-[44px]"
        >
          + Add Bill
        </button>
      </div>

      {/* Forecast Header */}
      <div className="bg-[#1f5d4c] text-[#f6f3ea] p-5 rounded-3xl shadow-lg space-y-1">
        <span className="text-[11px] text-[#e2a63f] font-bold uppercase tracking-wider">Next 30 Days Forecast</span>
        <h2 className="font-serif text-3xl font-extrabold">{formatMoney(totalNext30Days)}</h2>
        <p className="text-xs text-[#f6f3ea]/80">Active recurring bills projected over the next 30 days.</p>
      </div>

      {/* Active Bills List */}
      <div className="space-y-3">
        <h2 className="font-serif text-sm font-bold text-[#143f34]">Active Bills ({activeBills.length})</h2>
        {activeBills.map((b) => (
          <div key={b.id} className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold text-sm text-[#143f34]">{b.name}</p>
                <p className="text-xs text-[#143f34]/60">
                  {b.next_due_date} · {frequencyLabel(b.frequency, b.due_days)}
                </p>
              </div>
              <div className="text-right space-y-1">
                <span className="font-serif font-extrabold text-[#c85c46] text-sm block">
                  {formatMoney(Number(b.expected_amount))}
                </span>
                <button
                  onClick={() => openEditSheet(b)}
                  className="px-3 py-1 bg-[#1f5d4c]/10 text-[#1f5d4c] font-bold rounded-lg text-xs min-h-[44px]"
                >
                  Edit
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#1f5d4c]/10 text-xs">
              <span className={`font-semibold ${b.auto_deduct ? 'text-[#1f5d4c]' : 'text-[#e2a63f]'}`}>
                {b.auto_deduct ? '⚡ Auto-deduct ON' : '🖐 Manual pay'}
              </span>

              {!b.auto_deduct && (
                <button
                  onClick={() => handleMarkPaid(b)}
                  className="px-3 py-1.5 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-lg text-xs min-h-[44px]"
                >
                  Mark Paid
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Paused Bills Group */}
      {pausedBills.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-[#1f5d4c]/10">
          <h2 className="font-serif text-sm font-bold text-[#143f34]/60">Paused Bills ({pausedBills.length})</h2>
          {pausedBills.map((b) => (
            <div key={b.id} className="bg-[#f6f3ea]/50 border border-[#1f5d4c]/15 p-4 rounded-2xl flex justify-between items-center opacity-70">
              <div>
                <p className="font-bold text-sm text-[#143f34]/80">{b.name}</p>
                <span className="text-xs text-[#143f34]/50">{formatMoney(Number(b.expected_amount))} · Paused</span>
              </div>
              <button
                onClick={() => handleTogglePause(b)}
                className="px-4 py-2 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-xs min-h-[44px]"
              >
                Resume
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Bill Sheet */}
      <BottomSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        title={editingBill ? 'Edit bill' : 'Add Recurring Bill'}
      >
        <form onSubmit={handleSaveBill} className="space-y-4">
          {errorMsg && <p className="text-xs text-[#c85c46] font-bold p-2 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>}

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Bill Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Fiber Internet"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Expected Amount (₱)</label>
            <input
              type="number"
              inputMode="decimal"
              required
              placeholder="e.g. 1699"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Payment Account</label>
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

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Next Due Date</label>
            <input
              type="date"
              required
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Frequency</label>
            <select
              value={frequency}
              onChange={(e: any) => setFrequency(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            >
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {frequency === 'semimonthly' && (
            <div>
              <label className="block text-xs font-bold text-[#143f34] mb-1">Days of the month</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={dayA}
                  onChange={(e) => setDayA(e.target.value)}
                  className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={dayB}
                  onChange={(e) => setDayB(e.target.value)}
                  className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
                />
              </div>
              <p className="text-[11px] text-[#143f34]/60 mt-1">
                e.g. 15 and 31. Use 31 for the last day of the month. Set Next Due Date to the first one you want.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between p-3 bg-[#1f5d4c]/10 rounded-2xl">
            <span className="text-xs font-bold text-[#143f34]">Auto-deduct on due date</span>
            <input
              type="checkbox"
              checked={autoDeduct}
              onChange={(e) => setAutoDeduct(e.target.checked)}
              className="w-5 h-5 accent-[#1f5d4c]"
            />
          </div>

          <button type="submit" className="w-full py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]">
            {editingBill ? 'Save Changes' : 'Save Recurring Bill'}
          </button>

          {editingBill && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#1f5d4c]/10">
              <button
                type="button"
                onClick={handleSkipMonth}
                className="py-2 px-1 bg-[#e2a63f]/15 text-[#143f34] font-bold rounded-xl text-xs min-h-[44px]"
              >
                Skip Next
              </button>
              <button
                type="button"
                onClick={() => handleTogglePause()}
                className="py-2 px-1 bg-[#1f5d4c]/10 text-[#143f34] font-bold rounded-xl text-xs min-h-[44px]"
              >
                {editingBill.active ? 'Pause' : 'Resume'}
              </button>
              <button
                type="button"
                onClick={handleDeleteBill}
                className="py-2 px-1 bg-[#c85c46]/15 text-[#c85c46] font-bold rounded-xl text-xs min-h-[44px]"
              >
                Delete
              </button>
            </div>
          )}
        </form>
      </BottomSheet>
    </div>
  );
}