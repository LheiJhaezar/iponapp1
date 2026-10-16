'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import BottomSheet from '@/components/BottomSheet';
import { todayLocal } from '@/lib/dates';
import { formatMoney } from '@/lib/money';

export default function MorePage() {
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isPinOpen, setIsPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [exportCounts, setExportCounts] = useState<Record<string, number> | null>(null);

  // Restore State
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<any | null>(null);

  // Helper: Paginate Supabase table reads beyond 1000 rows
  const fetchTableAll = async (table: string, userId: string) => {
    let results: any[] = [];
    let from = 0;
    const step = 999;

    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('user_id', userId)
        .range(from, from + step);

      if (error) throw error;
      if (!data || data.length === 0) break;
      results = results.concat(data);
      if (data.length < step + 1) break;
      from += step + 1;
    }
    return results;
  };

  // 1. Export Ledger CSV
  const handleExportCSV = async () => {
    setStatusMsg('Exporting CSV...');
    setExportCounts(null);

    try {
      let rows: any[] = [];

      // Active Ledger Entries
      let offset = 0;
      while (true) {
        const { data, error } = await supabase.rpc('get_ledger', {
          p_limit: 500,
          p_offset: offset,
          p_deleted: false,
        });

        if (error) throw error;
        if (!data || data.length === 0) break;
        rows = rows.concat(data);
        if (data.length < 500) break;
        offset += 500;
      }

      // Deleted Ledger Entries
      offset = 0;
      while (true) {
        const { data, error } = await supabase.rpc('get_ledger', {
          p_limit: 500,
          p_offset: offset,
          p_deleted: true,
        });

        if (error) throw error;
        if (!data || data.length === 0) break;
        rows = rows.concat(data);
        if (data.length < 500) break;
        offset += 500;
      }

      const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const header = 'date,kind,category,amount,note,running_available\n';
      const csvLines = rows.map((r) =>
        [
          escapeCsv(r.entry_date),
          escapeCsv(r.kind),
          escapeCsv(r.category),
          escapeCsv(r.amount),
          escapeCsv(r.note),
          escapeCsv(r.running_available),
        ].join(',')
      );

      const csvContent = header + csvLines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ipon-ledger-${todayLocal()}.csv`;
      a.click();

      setStatusMsg('CSV exported successfully!');
    } catch (err: any) {
      setStatusMsg(`CSV Export Failed: ${err.message}`);
    }
  };

  // 2. Export Complete JSON
  const handleExportJSON = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setStatusMsg('Exporting JSON...');
    setExportCounts(null);

    const tables = [
      'accounts',
      'cutoffs',
      'recurring_bills',
      'income_entries',
      'allocations',
      'transfers',
      'holdings',
      'holding_values',
      'networth_snapshots',
      'food_entries',
      'mood_entries',
    ];

    try {
      const backupData: Record<string, any> = {
        user_id: user.id,
        exported_at: todayLocal(),
      };

      const counts: Record<string, number> = {};

      for (const t of tables) {
        const rows = await fetchTableAll(t, user.id);
        backupData[t] = rows;
        counts[t] = rows.length;
      }

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ipon-full-backup-${todayLocal()}.json`;
      a.click();

      localStorage.setItem('ipon:last-backup', todayLocal());
      setExportCounts(counts);
      setStatusMsg('JSON backup complete!');
    } catch (err: any) {
      setStatusMsg(`JSON Export Failed: ${err.message}`);
    }
  };

  // 3. Restore JSON File Selection and Validation
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreFile(file);
    setStatusMsg('Reading backup file...');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        setRestorePreview(parsed);
        setStatusMsg('File loaded. Ready to restore.');
      } catch (err) {
        setStatusMsg('Invalid JSON file format.');
        setRestorePreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreJSON = async () => {
    if (!restorePreview) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setStatusMsg('Checking account state...');

    try {
      // Ensure current user has zero data before restoring
      const [{ count: incCount }, { count: allocCount }, { count: cutCount }] = await Promise.all([
        supabase.from('income_entries').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('allocations').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('cutoffs').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);

      if ((incCount || 0) > 0 || (allocCount || 0) > 0 || (cutCount || 0) > 0) {
        throw new Error('Restore is allowed only when your account has no cutoffs or financial entries.');
      }

      if (!window.confirm('Restore backup into this account? This operation cannot be undone.')) {
        return;
      }

      setStatusMsg('Restoring tables...');

      const insertTablesInOrder = [
        'accounts',
        'cutoffs',
        'recurring_bills',
        'income_entries',
        'allocations',
        'transfers',
        'holdings',
        'holding_values',
        'food_entries',
        'mood_entries',
      ];

      for (const table of insertTablesInOrder) {
        const rows = restorePreview[table];
        if (!rows || !Array.isArray(rows) || rows.length === 0) continue;

        // Prepare rows for current user
        const preparedRows = rows.map((r: any) => ({
          ...r,
          user_id: user.id,
        }));

        // Insert in batches of 200
        const batchSize = 200;
        for (let i = 0; i < preparedRows.length; i += batchSize) {
          const batch = preparedRows.slice(i, i + batchSize);
          const { error } = await supabase.from(table).insert(batch);
          if (error) {
            throw new Error(`Failed to restore table "${table}": ${error.message}`);
          }
        }
      }

      setStatusMsg('Data restored successfully! Refreshing...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      setStatusMsg(err.message);
    }
  };

  const handleSetPIN = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return;

    const salt = String(Date.now());
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    localStorage.setItem('ipon:pin-hash', hashHex);
    localStorage.setItem('ipon:pin-salt', salt);

    setPinMsg('Security PIN enabled!');
    setPin('');
    setTimeout(() => setIsPinOpen(false), 1200);
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="font-serif text-2xl font-bold text-[#143f34]">More Features</h1>

      <div className="space-y-2">
        <Link href="/ledger" className="block bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl font-bold text-[#143f34] hover:bg-[#1f5d4c]/5">
          📜 Continuous Ledger
        </Link>
        <Link href="/reports" className="block bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl font-bold text-[#143f34] hover:bg-[#1f5d4c]/5">
          📊 Reports & Cutoff History
        </Link>
        <Link href="/trash" className="block bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl font-bold text-[#143f34] hover:bg-[#1f5d4c]/5">
          🗑️ Trash & Restorations
        </Link>
        <Link href="/food" className="block bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl font-bold text-[#143f34] hover:bg-[#1f5d4c]/5">
          🍲 Food & Mood Log
        </Link>
        <Link href="/buddy" className="block bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl font-bold text-[#143f34] hover:bg-[#1f5d4c]/5">
          🤝 Buddy Savings Tracker
        </Link>
        <button onClick={() => setIsBackupOpen(true)} className="w-full text-left bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl font-bold text-[#143f34] hover:bg-[#1f5d4c]/5 min-h-[44px]">
          💾 Backup, Export & Restore
        </button>
        <button onClick={() => setIsPinOpen(true)} className="w-full text-left bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl font-bold text-[#143f34] hover:bg-[#1f5d4c]/5 min-h-[44px]">
          🔒 App Lock Security PIN
        </button>
      </div>

      {/* Backup & Restore Sheet */}
      <BottomSheet isOpen={isBackupOpen} onClose={() => setIsBackupOpen(false)} title="Backup, Export & Restore">
        <div className="space-y-4">
          {statusMsg && <p className="text-xs font-bold text-[#143f34] p-2.5 bg-[#1f5d4c]/10 rounded-xl">{statusMsg}</p>}

          <div className="space-y-2">
            <h3 className="font-bold text-xs text-[#143f34] uppercase tracking-wider">Export Offline Data</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleExportCSV}
                className="py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-xs min-h-[44px]"
              >
                Export Ledger CSV
              </button>
              <button
                onClick={handleExportJSON}
                className="py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-xs min-h-[44px]"
              >
                Export Complete JSON
              </button>
            </div>
          </div>

          {exportCounts && (
            <div className="p-3 bg-[#1f5d4c]/5 rounded-xl space-y-1 border border-[#1f5d4c]/10">
              <span className="text-[10px] font-bold text-[#143f34] uppercase tracking-wider block">Export Row Counts</span>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-[#143f34]/80">
                {Object.entries(exportCounts).map(([tbl, cnt]) => (
                  <div key={tbl} className="flex justify-between">
                    <span>{tbl}:</span>
                    <span className="font-mono font-bold">{cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-[#1f5d4c]/10 space-y-3">
            <h3 className="font-bold text-xs text-[#143f34] uppercase tracking-wider">Restore From Backup</h3>
            <p className="text-xs text-[#143f34]/70">
              Select an offline JSON file. Restore is only permitted when your account has no cutoffs or money entries.
            </p>

            <input
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="w-full text-xs text-[#143f34] file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#1f5d4c] file:text-[#f6f3ea]"
            />

            {restorePreview && (
              <div className="space-y-2">
                <div className="p-3 bg-[#1f5d4c]/5 rounded-xl space-y-1 text-[11px] border border-[#1f5d4c]/10">
                  <span className="font-bold text-[#143f34] block">Backup File Table Preview:</span>
                  {['accounts', 'cutoffs', 'recurring_bills', 'income_entries', 'allocations', 'transfers', 'holdings', 'holding_values', 'food_entries', 'mood_entries'].map((tbl) => (
                    <div key={tbl} className="flex justify-between text-[#143f34]/80">
                      <span>{tbl}:</span>
                      <span className="font-mono font-bold">{restorePreview[tbl]?.length || 0}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleRestoreJSON}
                  className="w-full py-3 bg-[#c85c46] text-[#f6f3ea] font-bold rounded-xl text-xs min-h-[44px]"
                >
                  Confirm & Restore Into Account
                </button>
              </div>
            )}
          </div>
        </div>
      </BottomSheet>

      {/* PIN Security Sheet */}
      <BottomSheet isOpen={isPinOpen} onClose={() => setIsPinOpen(false)} title="App Lock Security PIN">
        <form onSubmit={handleSetPIN} className="space-y-4">
          <p className="text-xs text-[#143f34]/70">
            Note: This lock protects against someone borrowing your phone while the browser is open.
          </p>
          {pinMsg && <p className="text-xs text-[#1f5d4c] font-bold">{pinMsg}</p>}
          <input
            type="password"
            maxLength={6}
            placeholder="Enter 4-6 digit PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />
          <button type="submit" className="w-full py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]">
            Enable Security PIN
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}