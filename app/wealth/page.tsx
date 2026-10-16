'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import BottomSheet from '@/components/BottomSheet';
import { todayLocal, addDays } from '@/lib/dates';
import { useDataVersion } from '@/components/DataContext';

export default function WealthPage() {
  const { dataVersion, notifyDataChanged } = useDataVersion();
  const [netWorth, setNetWorth] = useState<any>({ cash_total: 0, assets_total: 0, liabilities_total: 0, net_worth: 0 });
  const [accounts, setAccounts] = useState<any[]>([]);
  const [archivedAccounts, setArchivedAccounts] = useState<any[]>([]);
  const [holdings, setHoldings] = useState<any[]>([]);

  // Net Worth Snapshots & Chart
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [chartRange, setChartRange] = useState<'3M' | '1Y' | 'ALL'>('3M');
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);

  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  // Modals
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isEditAccountOpen, setIsEditAccountOpen] = useState(false);
  const [isAddHoldingOpen, setIsAddHoldingOpen] = useState(false);
  const [isUpdateHoldingOpen, setIsUpdateHoldingOpen] = useState(false);
  const [isReconcileOpen, setIsReconcileOpen] = useState(false);
  const [isRemoveAccOpen, setIsRemoveAccOpen] = useState(false);

  // Form States
  const [accName, setAccName] = useState('');
  const [accKind, setAccKind] = useState('bank');
  const [accOpenBal, setAccOpenBal] = useState('0');

  const [editingAcc, setEditingAcc] = useState<any>(null);
  const [editAccName, setEditAccName] = useState('');
  const [editAccKind, setEditAccKind] = useState('bank');
  const [editAccOpenBal, setEditAccOpenBal] = useState('0');
  const [editAccIsDefault, setEditAccIsDefault] = useState(false);

  const [holdKind, setHoldKind] = useState<'asset' | 'liability'>('asset');
  const [holdName, setHoldName] = useState('');
  const [holdCategory, setHoldCategory] = useState('Emergency Fund');
  const [holdValue, setHoldValue] = useState('');

  const [selectedHolding, setSelectedHolding] = useState<any>(null);
  const [newValSnapshot, setNewValSnapshot] = useState('');
  const [snapshotAsOf, setSnapshotAsOf] = useState(todayLocal());

  const [reconcileAccount, setReconcileAccount] = useState<any>(null);
  const [realBalance, setRealBalance] = useState('');

  const [selectedAccToRemove, setSelectedAccToRemove] = useState<any>(null);
  const [moveToAccId, setMoveToAccId] = useState('');

  useEffect(() => {
    fetchWealthData();
  }, [dataVersion]);

  const fetchWealthData = async () => {
    setErrorMsg('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: net, error: netErr }, { data: accs, error: accErr }, { data: holds, error: holdErr }, { data: archAccs, error: archErr }, { data: snaps, error: snapErr }] = await Promise.all([
      supabase.rpc('get_net_worth'),
      supabase.rpc('get_account_balances'),
      supabase.from('holdings').select('*, holding_values(*)').eq('user_id', user.id).is('archived_at', null),
      supabase.from('accounts').select('*').eq('user_id', user.id).not('archived_at', 'is', null).order('created_at', { ascending: true }),
      supabase.from('networth_snapshots').select('as_of, net_worth').eq('user_id', user.id).order('as_of', { ascending: true }),
    ]);

    if (netErr) setErrorMsg(netErr.message);
    if (accErr) setErrorMsg(accErr.message);
    if (holdErr) setErrorMsg(holdErr.message);
    if (archErr) setErrorMsg(archErr.message);
    if (snapErr) setErrorMsg(snapErr.message);

    if (net?.[0]) setNetWorth(net[0]);
    if (accs) {
      setAccounts(accs);
      if (accs.length > 1) {
        setMoveToAccId(accs[0].account_id);
      }
    }
    if (holds) setHoldings(holds);
    if (archAccs) setArchivedAccounts(archAccs);
    if (snaps) setSnapshots(snaps);
  };

  const handleTakeSnapshot = async () => {
    setErrorMsg('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: net, error: netErr } = await supabase.rpc('get_net_worth');
    if (netErr || !net?.[0]) {
      setErrorMsg(netErr?.message || 'Failed to fetch net worth.');
      return;
    }

    const row = net[0];
    const today = todayLocal();

    const { error: upsertErr } = await supabase.from('networth_snapshots').upsert(
      {
        user_id: user.id,
        as_of: today,
        cash_total: row.cash_total,
        assets_total: row.assets_total,
        liabilities_total: row.liabilities_total,
        net_worth: row.net_worth,
      },
      { onConflict: 'user_id,as_of' }
    );

    if (upsertErr) {
      setErrorMsg(upsertErr.message);
    } else {
      setToastMsg('Snapshot recorded!');
      setTimeout(() => setToastMsg(''), 3000);
      notifyDataChanged();
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('accounts').insert([
      { user_id: user.id, name: accName, kind: accKind, opening_balance: parseFloat(accOpenBal) },
    ]);

    if (error) setErrorMsg(error.message);
    else {
      setIsAddAccountOpen(false);
      setAccName('');
      setAccKind('bank');
      setAccOpenBal('0');
      notifyDataChanged();
    }
  };

  const openEditAccount = (acc: any) => {
    setErrorMsg('');
    setEditingAcc(acc);
    setEditAccName(acc.name);
    setEditAccKind(acc.kind);
    setEditAccOpenBal(String(acc.opening_balance ?? 0));
    setEditAccIsDefault(acc.is_default || false);
    setIsEditAccountOpen(true);
  };

  const handleSaveEditedAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!editingAcc) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (editAccIsDefault && !editingAcc.is_default) {
      await supabase.from('accounts').update({ is_default: false }).eq('user_id', user.id);
    }

    const { error } = await supabase
      .from('accounts')
      .update({
        name: editAccName,
        kind: editAccKind,
        opening_balance: parseFloat(editAccOpenBal),
        is_default: editAccIsDefault,
      })
      .eq('id', editingAcc.account_id);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setIsEditAccountOpen(false);
      setEditingAcc(null);
      notifyDataChanged();
    }
  };

  const openReconcile = (acc: any) => {
    setErrorMsg('');
    setReconcileAccount(acc);
    setRealBalance(String(acc.balance ?? 0));
    setIsReconcileOpen(true);
  };

  const handleReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!reconcileAccount) return;

    const targetVal = parseFloat(realBalance);
    if (isNaN(targetVal)) {
      setErrorMsg('Please enter a valid target balance.');
      return;
    }

    const curBal = Number(reconcileAccount.balance || 0);
    const diff = targetVal - curBal;

    if (Math.abs(diff) < 0.01) {
      setToastMsg('Already matches');
      setTimeout(() => setToastMsg(''), 3000);
      setIsReconcileOpen(false);
      return;
    }

    const { data, error } = await supabase.rpc('reconcile_account', {
      p_account: reconcileAccount.account_id,
      p_real_balance: targetVal,
    });

    if (error) {
      setErrorMsg(error.message);
    } else {
      const returnedDiff = Number(data);
      const signStr = returnedDiff >= 0 ? `+${formatMoney(returnedDiff)}` : `-${formatMoney(Math.abs(returnedDiff))}`;
      setToastMsg(`Reconciled (${signStr})`);
      setTimeout(() => setToastMsg(''), 4000);
      setIsReconcileOpen(false);
      notifyDataChanged();
    }
  };

  const openRemoveAccount = (acc: any) => {
    setErrorMsg('');
    setSelectedAccToRemove(acc);
    const otherAccs = accounts.filter((a) => a.account_id !== acc.account_id);
    if (otherAccs.length > 0) {
      setMoveToAccId(otherAccs[0].account_id);
    } else {
      setMoveToAccId('');
    }
    setIsRemoveAccOpen(true);
  };

  const handleRemoveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!selectedAccToRemove) return;

    const currentBal = Number(selectedAccToRemove.balance || 0);
    if (currentBal !== 0 && !moveToAccId) {
      setErrorMsg('Account balance is non-zero. Please select an account to move funds to.');
      return;
    }

    const { data, error } = await supabase.rpc('remove_account', {
      p_account: selectedAccToRemove.account_id,
      p_move_to: currentBal !== 0 ? moveToAccId : null,
    });

    if (error) {
      setErrorMsg(error.message);
    } else {
      const resType = String(data);
      if (resType === 'deleted') {
        setToastMsg('Account deleted');
      } else {
        setToastMsg('Account archived (it had history, so it is kept in the archive)');
      }
      setTimeout(() => setToastMsg(''), 4000);
      setIsRemoveAccOpen(false);
      setSelectedAccToRemove(null);
      notifyDataChanged();
    }
  };

  const handleRestoreAccount = async (accId: string) => {
    setErrorMsg('');
    const { error } = await supabase.from('accounts').update({ archived_at: null }).eq('id', accId);
    if (error) {
      setErrorMsg(error.message);
    } else {
      setToastMsg('Account restored');
      setTimeout(() => setToastMsg(''), 3000);
      notifyDataChanged();
    }
  };

  const handleAddHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: newHold, error: hErr } = await supabase
      .from('holdings')
      .insert([{ user_id: user.id, kind: holdKind, name: holdName, category: holdCategory }])
      .select()
      .single();

    if (hErr) {
      setErrorMsg(hErr.message);
      return;
    }

    if (newHold) {
      const { error: vErr } = await supabase.from('holding_values').insert([
        { holding_id: newHold.id, user_id: user.id, value: parseFloat(holdValue), as_of: todayLocal() },
      ]);
      if (vErr) {
        setErrorMsg(vErr.message);
        return;
      }
    }

    setIsAddHoldingOpen(false);
    setHoldName('');
    setHoldValue('');
    notifyDataChanged();
  };

  const openUpdateHolding = (holding: any) => {
    setErrorMsg('');
    setSelectedHolding(holding);
    const latest = holding.holding_values?.[0]?.value || 0;
    setNewValSnapshot(String(latest));
    setSnapshotAsOf(todayLocal());
    setIsUpdateHoldingOpen(true);
  };

  const handleSaveHoldingSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!selectedHolding) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('holding_values').upsert(
      {
        holding_id: selectedHolding.id,
        user_id: user.id,
        value: parseFloat(newValSnapshot),
        as_of: snapshotAsOf,
      },
      { onConflict: 'holding_id,as_of' }
    );

    if (error) {
      setErrorMsg(error.message);
    } else {
      setIsUpdateHoldingOpen(false);
      setSelectedHolding(null);
      notifyDataChanged();
    }
  };

  const handleArchiveHolding = async () => {
    if (!selectedHolding) return;
    if (!window.confirm(`Archive holding "${selectedHolding.name}"?`)) return;

    const { error } = await supabase
      .from('holdings')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', selectedHolding.id);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setIsUpdateHoldingOpen(false);
      setSelectedHolding(null);
      notifyDataChanged();
    }
  };

  // Filter Snapshots by Range
  const todayStr = todayLocal();
  const filteredSnapshots = snapshots.filter((s) => {
    if (chartRange === '3M') {
      const minDate = addDays(todayStr, -90);
      return s.as_of >= minDate;
    }
    if (chartRange === '1Y') {
      const minDate = addDays(todayStr, -365);
      return s.as_of >= minDate;
    }
    return true;
  });

  // SVG Chart Dimensions & Math
  const chartWidth = 320;
  const chartHeight = 120;

  const minVal = filteredSnapshots.length > 0 ? Math.min(...filteredSnapshots.map((s) => Number(s.net_worth))) : 0;
  const maxVal = filteredSnapshots.length > 0 ? Math.max(...filteredSnapshots.map((s) => Number(s.net_worth))) : 0;
  const valSpan = maxVal - minVal || 1;

  const points = filteredSnapshots.map((s, idx) => {
    const x = filteredSnapshots.length > 1 ? (idx / (filteredSnapshots.length - 1)) * (chartWidth - 20) + 10 : chartWidth / 2;
    const y = chartHeight - 15 - ((Number(s.net_worth) - minVal) / valSpan) * (chartHeight - 30);
    return { x, y, date: s.as_of, value: Number(s.net_worth) };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPoints = points.length > 0
    ? `${points[0].x},${chartHeight} ${polylinePoints} ${points[points.length - 1].x},${chartHeight}`
    : '';

  const previewDiff = reconcileAccount
    ? parseFloat(realBalance || '0') - Number(reconcileAccount.balance || 0)
    : 0;

  return (
    <div className="p-4 space-y-5">
      <div className="flex justify-between items-center">
        <h1 className="font-serif text-2xl font-bold text-[#143f34]">Wealth & Net Worth</h1>
        <button
          onClick={handleTakeSnapshot}
          className="px-3 py-1.5 bg-[#e2a63f] text-[#143f34] text-xs font-bold rounded-xl hover:bg-[#e2a63f]/90 transition min-h-[44px]"
        >
          📷 Take Snapshot Now
        </button>
      </div>

      {errorMsg && <p className="text-xs text-[#c85c46] font-bold p-2.5 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>}
      {toastMsg && <p className="text-xs text-[#1f5d4c] font-bold p-2.5 bg-[#1f5d4c]/10 rounded-xl">{toastMsg}</p>}

      {/* Net Worth Summary */}
      <div className="bg-[#1f5d4c] text-[#f6f3ea] p-6 rounded-3xl shadow-xl space-y-4">
        <div className="space-y-1">
          <span className="text-[11px] uppercase font-bold text-[#e2a63f]">Total Net Worth</span>
          <h2 className="font-serif text-4xl font-extrabold">{formatMoney(Number(netWorth.net_worth))}</h2>
        </div>

        {/* SVG Line Chart */}
        <div className="pt-3 border-t border-[#f6f3ea]/15 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-bold text-[#e2a63f]">Net Worth Trend</span>
            <div className="flex gap-1">
              {(['3M', '1Y', 'ALL'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setChartRange(r)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    chartRange === r ? 'bg-[#e2a63f] text-[#143f34]' : 'bg-[#143f34] text-[#f6f3ea]/80'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {filteredSnapshots.length < 2 ? (
            <p className="text-xs text-center text-[#f6f3ea]/60 py-6 italic">
              Your chart starts after the next snapshot
            </p>
          ) : (
            <div className="space-y-1">
              <div className="relative">
                {hoveredPoint && (
                  <div
                    className="absolute bg-[#143f34] text-[#e2a63f] text-[10px] font-bold p-1.5 rounded shadow border border-[#e2a63f]/30 -top-8 transition-all -translate-x-1/2 pointer-events-none"
                    style={{ left: `${(hoveredPoint.x / chartWidth) * 100}%` }}
                  >
                    {hoveredPoint.date}: {formatMoney(hoveredPoint.value)}
                  </div>
                )}

                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-28 overflow-visible">
                  {/* Fill Area */}
                  <polygon points={areaPoints} fill="rgba(226, 166, 63, 0.15)" />

                  {/* Line */}
                  <polyline points={polylinePoints} fill="none" stroke="#e2a63f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                  {/* Points */}
                  {points.map((p, idx) => (
                    <circle
                      key={idx}
                      cx={p.x}
                      cy={p.y}
                      r="4"
                      className="fill-[#e2a63f] stroke-[#1f5d4c] stroke-2 cursor-pointer hover:r-6 transition-all"
                      onMouseEnter={() => setHoveredPoint(p)}
                      onMouseLeave={() => setHoveredPoint(null)}
                      onClick={() => setHoveredPoint(p)}
                    />
                  ))}
                </svg>
              </div>

              <div className="flex justify-between text-[10px] text-[#f6f3ea]/60 pt-1 font-mono">
                <span>{filteredSnapshots[0]?.as_of} ({formatMoney(minVal)})</span>
                <span>{filteredSnapshots[filteredSnapshots.length - 1]?.as_of} ({formatMoney(maxVal)})</span>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#f6f3ea]/15 text-xs text-[#f6f3ea]/80">
          <div>Cash: {formatMoney(Number(netWorth.cash_total))}</div>
          <div>Assets: {formatMoney(Number(netWorth.assets_total))}</div>
          <div>Debts: {formatMoney(Number(netWorth.liabilities_total))}</div>
        </div>
      </div>

      {/* Accounts List */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-serif text-base font-bold text-[#143f34]">Accounts</h2>
          <button onClick={() => { setErrorMsg(''); setIsAddAccountOpen(true); }} className="text-xs font-bold text-[#1f5d4c] hover:underline min-h-[36px]">
            + Add Account
          </button>
        </div>

        <div className="space-y-2">
          {accounts.map((a) => (
            <div key={a.account_id} className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-3 rounded-2xl flex justify-between items-center">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="font-bold text-sm text-[#143f34]">{a.name}</p>
                  {a.is_default && (
                    <span className="text-[9px] bg-[#1f5d4c] text-[#f6f3ea] px-1.5 py-0.5 rounded font-bold uppercase">
                      Default
                    </span>
                  )}
                </div>
                <span className="text-[10px] uppercase font-bold text-[#143f34]/60">{a.kind}</span>
              </div>
              <div className="text-right space-y-1">
                <p className="font-extrabold text-sm text-[#1f5d4c]">{formatMoney(Number(a.balance))}</p>
                <div className="flex justify-end gap-2 text-[10px] font-bold">
                  <button onClick={() => openReconcile(a)} className="text-[#e2a63f] hover:underline min-h-[36px] px-1">
                    Reconcile
                  </button>
                  <button onClick={() => openEditAccount(a)} className="text-[#1f5d4c] hover:underline min-h-[36px] px-1">
                    Edit
                  </button>
                  <button onClick={() => openRemoveAccount(a)} className="text-[#c85c46] hover:underline min-h-[36px] px-1">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Archived Accounts */}
      {archivedAccounts.length > 0 && (
        <div className="space-y-3 pt-2">
          <h2 className="font-serif text-sm font-bold text-[#143f34]/60">Archived Accounts</h2>
          <div className="space-y-2">
            {archivedAccounts.map((a) => (
              <div key={a.id} className="bg-[#f6f3ea]/60 border border-[#1f5d4c]/10 p-3 rounded-2xl flex justify-between items-center opacity-70">
                <div>
                  <p className="font-bold text-sm text-[#143f34]/80">{a.name}</p>
                  <span className="text-[10px] uppercase font-bold text-[#143f34]/50">{a.kind} · Archived</span>
                </div>
                <button
                  onClick={() => handleRestoreAccount(a.id)}
                  className="px-3 py-1.5 bg-[#1f5d4c] text-[#f6f3ea] text-xs font-bold rounded-xl min-h-[36px]"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assets & Debts List */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-serif text-base font-bold text-[#143f34]">Assets & Debts</h2>
          <button onClick={() => { setErrorMsg(''); setIsAddHoldingOpen(true); }} className="text-xs font-bold text-[#1f5d4c] hover:underline min-h-[36px]">
            + Add Holding
          </button>
        </div>

        <div className="space-y-2">
          {holdings.map((h) => {
            const latest = h.holding_values?.[0]?.value || 0;
            return (
              <div key={h.id} className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-3 rounded-2xl flex justify-between items-center">
                <div>
                  <p className="font-bold text-sm text-[#143f34]">{h.name}</p>
                  <span className={`text-[10px] uppercase font-bold ${h.kind === 'asset' ? 'text-[#1f5d4c]' : 'text-[#c85c46]'}`}>{h.kind} · {h.category}</span>
                </div>
                <div className="text-right space-y-1">
                  <p className={`font-extrabold text-sm ${h.kind === 'asset' ? 'text-[#1f5d4c]' : 'text-[#c85c46]'}`}>{formatMoney(Number(latest))}</p>
                  <button
                    onClick={() => openUpdateHolding(h)}
                    className="text-[10px] font-bold text-[#1f5d4c] hover:underline min-h-[36px]"
                  >
                    ✏️ Update Value
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reconcile Sheet */}
      <BottomSheet isOpen={isReconcileOpen} onClose={() => setIsReconcileOpen(false)} title="Reconcile Account Balance">
        <form onSubmit={handleReconcile} className="space-y-4">
          {errorMsg && <p className="text-xs text-[#c85c46] font-bold p-2 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>}
          <div className="text-xs space-y-1 text-[#143f34]">
            <p>Current balance in <strong>{reconcileAccount?.name}</strong>: <strong>{formatMoney(Number(reconcileAccount?.balance || 0))}</strong></p>
            <p className="text-[#143f34]/70">Enter your actual balance. An adjustment entry will be recorded.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Actual Real Balance (₱)</label>
            <input
              type="number"
              inputMode="decimal"
              required
              value={realBalance}
              onChange={(e) => setRealBalance(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            />
          </div>

          <div className="p-3 bg-[#1f5d4c]/10 rounded-xl text-xs font-bold flex justify-between text-[#143f34]">
            <span>Adjustment Preview:</span>
            <span className={previewDiff >= 0 ? 'text-[#1f5d4c]' : 'text-[#c85c46]'}>
              {previewDiff >= 0 ? `+${formatMoney(previewDiff)}` : `-${formatMoney(Math.abs(previewDiff))}`}
            </span>
          </div>

          <button type="submit" className="w-full py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]">
            Confirm Reconciled Balance
          </button>
        </form>
      </BottomSheet>

      {/* Edit Account Sheet */}
      <BottomSheet isOpen={isEditAccountOpen} onClose={() => setIsEditAccountOpen(false)} title="Edit Account">
        <form onSubmit={handleSaveEditedAccount} className="space-y-4">
          {errorMsg && <p className="text-xs text-[#c85c46] font-bold p-2 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>}

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Account Name</label>
            <input
              type="text"
              required
              value={editAccName}
              onChange={(e) => setEditAccName(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Type</label>
            <select
              value={editAccKind}
              onChange={(e) => setEditAccKind(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            >
              <option value="bank">Bank Account</option>
              <option value="ewallet">E-Wallet (GCash/Maya)</option>
              <option value="cash">Cash / Wallet</option>
              <option value="savings">Dedicated Savings</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Opening Balance (₱)</label>
            <input
              type="number"
              inputMode="decimal"
              required
              value={editAccOpenBal}
              onChange={(e) => setEditAccOpenBal(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            />
            <p className="text-[10px] text-[#e2a63f] font-bold mt-1">⚠️ Warning: Changing opening balance alters overall balance.</p>
          </div>

          <div className="flex items-center justify-between p-3 bg-[#1f5d4c]/10 rounded-2xl">
            <span className="text-xs font-bold text-[#143f34]">Make Default Account</span>
            <input
              type="checkbox"
              checked={editAccIsDefault}
              onChange={(e) => setEditAccIsDefault(e.target.checked)}
              className="w-5 h-5 accent-[#1f5d4c]"
            />
          </div>

          <button type="submit" className="w-full py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]">
            Save Changes
          </button>
        </form>
      </BottomSheet>

      {/* Remove Account Sheet */}
      <BottomSheet isOpen={isRemoveAccOpen} onClose={() => setIsRemoveAccOpen(false)} title="Remove Account">
        <form onSubmit={handleRemoveAccount} className="space-y-4">
          {errorMsg && <p className="text-xs text-[#c85c46] font-bold p-2 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>}
          <div className="text-xs space-y-1 text-[#143f34]">
            <p>Are you sure you want to remove <strong>{selectedAccToRemove?.name}</strong>?</p>
            <p>Current balance: <strong>{formatMoney(Number(selectedAccToRemove?.balance || 0))}</strong></p>
          </div>

          {Number(selectedAccToRemove?.balance || 0) !== 0 && (
            <div>
              <label className="block text-xs font-bold text-[#143f34] mb-1">
                Move {formatMoney(Number(selectedAccToRemove?.balance || 0))} balance to:
              </label>
              <select
                required
                value={moveToAccId}
                onChange={(e) => setMoveToAccId(e.target.value)}
                className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
              >
                {accounts
                  .filter((a) => a.account_id !== selectedAccToRemove?.account_id)
                  .map((a) => (
                    <option key={a.account_id} value={a.account_id}>
                      {a.name} ({a.kind})
                    </option>
                  ))}
              </select>
            </div>
          )}

          <button type="submit" className="w-full py-3 bg-[#c85c46] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]">
            Confirm Account Removal
          </button>
        </form>
      </BottomSheet>

      {/* Add Account Sheet */}
      <BottomSheet isOpen={isAddAccountOpen} onClose={() => setIsAddAccountOpen(false)} title="Add Account">
        <form onSubmit={handleAddAccount} className="space-y-4">
          {errorMsg && <p className="text-xs text-[#c85c46] font-bold p-2 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>}
          <input
            type="text"
            required
            placeholder="Account Name"
            value={accName}
            onChange={(e) => setAccName(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />
          <select
            value={accKind}
            onChange={(e) => setAccKind(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          >
            <option value="bank">Bank Account</option>
            <option value="ewallet">E-Wallet (GCash/Maya)</option>
            <option value="cash">Cash / Wallet</option>
            <option value="savings">Dedicated Savings</option>
            <option value="other">Other</option>
          </select>
          <input
            type="number"
            inputMode="decimal"
            required
            placeholder="Opening Balance (₱)"
            value={accOpenBal}
            onChange={(e) => setAccOpenBal(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />
          <button type="submit" className="w-full py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]">
            Save Account
          </button>
        </form>
      </BottomSheet>

      {/* Add Holding Sheet */}
      <BottomSheet isOpen={isAddHoldingOpen} onClose={() => setIsAddHoldingOpen(false)} title="Add Asset or Debt">
        <form onSubmit={handleAddHolding} className="space-y-4">
          {errorMsg && <p className="text-xs text-[#c85c46] font-bold p-2 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setHoldKind('asset')}
              className={`py-2 rounded-xl text-xs font-bold border min-h-[44px] ${
                holdKind === 'asset' ? 'bg-[#1f5d4c] text-[#f6f3ea]' : 'bg-[#f6f3ea] text-[#143f34]'
              }`}
            >
              Asset
            </button>
            <button
              type="button"
              onClick={() => setHoldKind('liability')}
              className={`py-2 rounded-xl text-xs font-bold border min-h-[44px] ${
                holdKind === 'liability' ? 'bg-[#c85c46] text-[#f6f3ea]' : 'bg-[#f6f3ea] text-[#c85c46]'
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
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />
          <input
            type="number"
            inputMode="decimal"
            required
            placeholder="Current Value (₱)"
            value={holdValue}
            onChange={(e) => setHoldValue(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />
          <button type="submit" className="w-full py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]">
            Save Holding
          </button>
        </form>
      </BottomSheet>

      {/* Update Holding Value Sheet */}
      <BottomSheet isOpen={isUpdateHoldingOpen} onClose={() => setIsUpdateHoldingOpen(false)} title={`Update ${selectedHolding?.name || 'Holding'}`}>
        <form onSubmit={handleSaveHoldingSnapshot} className="space-y-4">
          {errorMsg && <p className="text-xs text-[#c85c46] font-bold p-2 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>}

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">As of Date</label>
            <input
              type="date"
              required
              value={snapshotAsOf}
              onChange={(e) => setSnapshotAsOf(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">New Value (₱)</label>
            <input
              type="number"
              inputMode="decimal"
              required
              value={newValSnapshot}
              onChange={(e) => setNewValSnapshot(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" className="flex-1 py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-xs min-h-[44px]">
              Save New Value
            </button>
            <button
              type="button"
              onClick={handleArchiveHolding}
              className="px-4 py-3 bg-[#c85c46]/15 text-[#c85c46] font-bold rounded-xl text-xs min-h-[44px]"
            >
              Archive
            </button>
          </div>
        </form>
      </BottomSheet>
    </div>
  );
}