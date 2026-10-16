'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import BottomSheet from '@/components/BottomSheet';
import { todayLocal } from '@/lib/dates';
import { useDataVersion } from '@/components/DataContext';

export default function WealthPage() {
  const { dataVersion, notifyDataChanged } = useDataVersion();
  const [netWorth, setNetWorth] = useState<any>({ cash_total: 0, assets_total: 0, liabilities_total: 0, net_worth: 0 });
  const [accounts, setAccounts] = useState<any[]>([]);
  const [holdings, setHoldings] = useState<any[]>([]);

  // Modals
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isAddHoldingOpen, setIsAddHoldingOpen] = useState(false);
  const [isReconcileOpen, setIsReconcileOpen] = useState(false);

  const [accName, setAccName] = useState('');
  const [accKind, setAccKind] = useState('bank');
  const [accOpenBal, setAccOpenBal] = useState('0');

  const [holdKind, setHoldKind] = useState<'asset' | 'liability'>('asset');
  const [holdName, setHoldName] = useState('');
  const [holdCategory, setHoldCategory] = useState('Emergency Fund');
  const [holdValue, setHoldValue] = useState('');

  const [reconcileAccount, setReconcileAccount] = useState<any>(null);
  const [realBalance, setRealBalance] = useState('');

  useEffect(() => {
    fetchWealthData();
  }, [dataVersion]);

  const fetchWealthData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: net }, { data: accs }, { data: holds }] = await Promise.all([
      supabase.rpc('get_net_worth'),
      supabase.rpc('get_account_balances'),
      supabase.from('holdings').select('*, holding_values(*)').eq('user_id', user.id).is('archived_at', null),
    ]);

    if (net?.[0]) setNetWorth(net[0]);
    if (accs) setAccounts(accs);
    if (holds) setHoldings(holds);
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('accounts').insert([
      { user_id: user.id, name: accName, kind: accKind, opening_balance: parseFloat(accOpenBal) },
    ]);

    setIsAddAccountOpen(false);
    notifyDataChanged();
  };

  const handleAddHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: newHold } = await supabase
      .from('holdings')
      .insert([{ user_id: user.id, kind: holdKind, name: holdName, category: holdCategory }])
      .select()
      .single();

    if (newHold) {
      await supabase.from('holding_values').insert([
        { holding_id: newHold.id, user_id: user.id, value: parseFloat(holdValue), as_of: todayLocal() },
      ]);
    }

    setIsAddHoldingOpen(false);
    notifyDataChanged();
  };

  const handleReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcileAccount) return;

    const diff = parseFloat(realBalance) - Number(reconcileAccount.balance);
    if (diff === 0) {
      setIsReconcileOpen(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (diff > 0) {
      await supabase.from('income_entries').insert([
        { user_id: user.id, account_id: reconcileAccount.account_id, amount: diff, source: 'Reconcile Adjustment', entry_date: todayLocal() },
      ]);
    } else {
      await supabase.from('allocations').insert([
        { user_id: user.id, account_id: reconcileAccount.account_id, category: 'other', amount: Math.abs(diff), note: 'Reconcile Adjustment', entry_date: todayLocal() },
      ]);
    }

    setIsReconcileOpen(false);
    notifyDataChanged();
  };

  return (
    <div className="p-4 space-y-5">
      <h1 className="font-display font-semibold text-2xl text-jade">Wealth & Net Worth</h1>

      {/* Net Worth Card */}
      <div className="bg-jade text-paper p-6 rounded-card shadow-xl space-y-3">
        <span className="text-[11px] uppercase font-bold text-gold">Total Net Worth</span>
        <h2 className="font-display font-semibold text-4xl">{formatMoney(Number(netWorth.net_worth))}</h2>
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-paper/15 text-xs text-paper/80">
          <div>Cash: {formatMoney(Number(netWorth.cash_total))}</div>
          <div>Assets: {formatMoney(Number(netWorth.assets_total))}</div>
          <div>Debts: {formatMoney(Number(netWorth.liabilities_total))}</div>
        </div>
      </div>

      {/* Accounts Section */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-display font-semibold text-base text-jade">Accounts</h2>
          <button onClick={() => setIsAddAccountOpen(true)} className="text-xs font-bold text-jade hover:underline">
            + Add Account
          </button>
        </div>

        <div className="space-y-2">
          {accounts.map((a) => (
            <div key={a.account_id} className="bg-paper border border-line p-3 rounded-card flex justify-between items-center">
              <div>
                <p className="font-bold text-sm text-jade">{a.name}</p>
                <span className="text-[10px] uppercase font-bold text-jade/60">{a.kind}</span>
              </div>
              <div className="text-right space-y-1">
                <p className="font-extrabold text-sm text-jade">{formatMoney(Number(a.balance))}</p>
                <button
                  onClick={() => { setReconcileAccount(a); setRealBalance(String(a.balance)); setIsReconcileOpen(true); }}
                  className="text-[10px] font-bold text-gold hover:underline block"
                >
                  Reconcile
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Assets & Debts Section */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-display font-semibold text-base text-jade">Assets & Debts</h2>
          <button onClick={() => setIsAddHoldingOpen(true)} className="text-xs font-bold text-jade hover:underline">
            + Add Asset/Debt
          </button>
        </div>

        <div className="space-y-2">
          {holdings.map((h) => {
            const latest = h.holding_values?.[0]?.value || 0;
            return (
              <div key={h.id} className="bg-paper border border-line p-3 rounded-card flex justify-between items-center">
                <div>
                  <p className="font-bold text-sm text-jade">{h.name}</p>
                  <span className={`text-[10px] uppercase font-bold ${h.kind === 'asset' ? 'text-jade' : 'text-coral'}`}>{h.kind} · {h.category}</span>
                </div>
                <p className={`font-extrabold text-sm ${h.kind === 'asset' ? 'text-jade' : 'text-coral'}`}>{formatMoney(Number(latest))}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reconcile Sheet */}
      <BottomSheet isOpen={isReconcileOpen} onClose={() => setIsReconcileOpen(false)} title="Reconcile Account Balance">
        <form onSubmit={handleReconcile} className="space-y-4">
          <p className="text-xs text-jade/80">
            Enter the exact balance currently in {reconcileAccount?.name}. An adjustment entry will be created for the difference.
          </p>
          <input
            type="number"
            inputMode="decimal"
            required
            value={realBalance}
            onChange={(e) => setRealBalance(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          />
          <button type="submit" className="w-full py-3 bg-jade text-paper font-bold rounded-xl text-sm min-h-[44px]">
            Confirm Real Balance
          </button>
        </form>
      </BottomSheet>

      {/* Add Account Sheet */}
      <BottomSheet isOpen={isAddAccountOpen} onClose={() => setIsAddAccountOpen(false)} title="Add Account">
        <form onSubmit={handleAddAccount} className="space-y-4">
          <input
            type="text"
            required
            placeholder="Account Name (e.g. BPI Payroll)"
            value={accName}
            onChange={(e) => setAccName(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          />
          <select
            value={accKind}
            onChange={(e) => setAccKind(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          >
            <option value="bank">Bank Account</option>
            <option value="ewallet">E-Wallet (GCash/Maya)</option>
            <option value="cash">Cash / Wallet</option>
            <option value="savings">Dedicated Savings</option>
          </select>
          <input
            type="number"
            inputMode="decimal"
            required
            placeholder="Opening Balance (₱)"
            value={accOpenBal}
            onChange={(e) => setAccOpenBal(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          />
          <button type="submit" className="w-full py-3 bg-jade text-paper font-bold rounded-xl text-sm min-h-[44px]">
            Save Account
          </button>
        </form>
      </BottomSheet>

      {/* Add Holding Sheet */}
      <BottomSheet isOpen={isAddHoldingOpen} onClose={() => setIsAddHoldingOpen(false)} title="Add Asset or Debt">
        <form onSubmit={handleAddHolding} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setHoldKind('asset')}
              className={`py-2 rounded-xl text-xs font-bold border min-h-[44px] ${
                holdKind === 'asset' ? 'bg-jade text-paper' : 'bg-paper text-jade'
              }`}
            >
              Asset
            </button>
            <button
              type="button"
              onClick={() => setHoldKind('liability')}
              className={`py-2 rounded-xl text-xs font-bold border min-h-[44px] ${
                holdKind === 'liability' ? 'bg-coral text-paper' : 'bg-paper text-coral'
              }`}
            >
              Debt / Liability
            </button>
          </div>
          <input
            type="text"
            required
            placeholder="Name (e.g. Emergency Fund)"
            value={holdName}
            onChange={(e) => setHoldName(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          />
          <input
            type="number"
            inputMode="decimal"
            required
            placeholder="Current Value (₱)"
            value={holdValue}
            onChange={(e) => setHoldValue(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          />
          <button type="submit" className="w-full py-3 bg-jade text-paper font-bold rounded-xl text-sm min-h-[44px]">
            Save Holding
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}