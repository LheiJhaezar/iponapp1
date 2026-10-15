'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import BottomSheet from '@/components/BottomSheet';

export default function BillsPage() {
  const [bills, setBills] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Bill Form Inputs
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [autoDeduct, setAutoDeduct] = useState(true);

  useEffect(() => {
    fetchBills();
  }, []);

  const fetchBills = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.rpc('process_my_due_bills');

    const { data } = await supabase
      .from('recurring_bills')
      .select('*')
      .eq('user_id', user.id)
      .order('next_due_date', { ascending: true });

    if (data) setBills(data);
  };

  const handleAddBill = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !name || !amount || !nextDueDate) return;

    await supabase.from('recurring_bills').insert([
      {
        user_id: user.id,
        name,
        expected_amount: parseFloat(amount),
        next_due_date: nextDueDate,
        frequency,
        auto_deduct: autoDeduct,
        active: true,
      },
    ]);

    setName('');
    setAmount('');
    setNextDueDate('');
    setIsAddModalOpen(false);
    fetchBills();
  };

  const handleMarkPaid = async (bill: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get current cutoff
    const { data: cutoff } = await supabase
      .from('cutoffs')
      .select('*')
      .eq('user_id', user.id)
      .order('start_date', { ascending: false })
      .limit(1)
      .single();

    if (cutoff) {
      await supabase.from('allocations').insert([
        {
          user_id: user.id,
          cutoff_id: cutoff.id,
          category: 'bills',
          amount: bill.expected_amount,
          note: `${bill.name} (manual)`,
          bill_id: bill.id,
          due_date: bill.next_due_date,
        },
      ]);
    }

    // Advance due date
    const d = new Date(bill.next_due_date);
    if (bill.frequency === 'weekly') d.setDate(d.getDate() + 7);
    else if (bill.frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);

    await supabase
      .from('recurring_bills')
      .update({ next_due_date: d.toISOString().split('T')[0] })
      .eq('id', bill.id);

    fetchBills();
  };

  // Compute 30-day projection
  const totalNext30Days = bills.reduce((acc, b) => acc + Number(b.expected_amount || 0), 0);

  return (
    <div className="p-4 space-y-5">
      <div className="flex justify-between items-center">
        <h1 className="font-serif text-2xl font-bold text-[#143f34]">Recurring Bills</h1>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-xs min-h-[44px]"
        >
          + Add Bill
        </button>
      </div>

      {/* Header Projection Card */}
      <div className="bg-[#1f5d4c] text-[#f6f3ea] p-5 rounded-3xl shadow-lg space-y-1">
        <span className="text-[11px] text-[#e2a63f] font-bold uppercase tracking-wider">Next 30 Days Forecast</span>
        <h2 className="font-serif text-3xl font-extrabold">{formatMoney(totalNext30Days)}</h2>
        <p className="text-xs text-[#f6f3ea]/80">Auto-deducts automatically from Available cash on due date.</p>
      </div>

      {/* Bills List */}
      <div className="space-y-3">
        {bills.map((b) => (
          <div key={b.id} className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold text-sm text-[#143f34]">{b.name}</p>
                <p className="text-xs text-[#143f34]/60">
                  {b.next_due_date} · {b.frequency}
                </p>
              </div>
              <span className="font-serif font-extrabold text-[#c85c46] text-sm">
                {formatMoney(Number(b.expected_amount))}
              </span>
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

      {/* Add Bill Bottom Sheet */}
      <BottomSheet isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Recurring Bill">
        <form onSubmit={handleAddBill} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Bill Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Fiber Internet"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34] focus:outline-none focus:border-[#1f5d4c]"
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
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34] focus:outline-none focus:border-[#1f5d4c]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Next Due Date</label>
            <input
              type="date"
              required
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34] focus:outline-none focus:border-[#1f5d4c]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Frequency</label>
            <select
              value={frequency}
              onChange={(e: any) => setFrequency(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34] focus:outline-none focus:border-[#1f5d4c]"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          <div className="flex items-center justify-between p-3 bg-[#1f5d4c]/10 rounded-2xl">
            <span className="text-xs font-bold text-[#143f34]">Auto-deduct on due date</span>
            <input
              type="checkbox"
              checked={autoDeduct}
              onChange={(e) => setAutoDeduct(e.target.checked)}
              className="w-5 h-5 accent-[#1f5d4c]"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]"
          >
            Save Recurring Bill
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}