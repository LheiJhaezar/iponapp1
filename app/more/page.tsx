'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import BottomSheet from '@/components/BottomSheet';
import { todayLocal } from '@/lib/dates';

export default function MorePage() {
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isPinOpen, setIsPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const fetchTableAll = async (table: string, userId: string) => {
    let results: any[] = [];
    let from = 0;
    const step = 999;

    while (true) {
      const { data } = await supabase.from(table).select('*').eq('user_id', userId).range(from, from + step);
      if (!data || data.length === 0) break;
      results = results.concat(data);
      if (data.length < step + 1) break;
      from += step + 1;
    }
    return results;
  };

  const handleExportJSON = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setStatusMsg('Exporting data...');

    const tables = [
      'cutoffs',
      'income_entries',
      'allocations',
      'recurring_bills',
      'accounts',
      'transfers',
      'holdings',
      'holding_values',
      'networth_snapshots',
      'food_entries',
      'mood_entries',
    ];

    const exportData: Record<string, any> = { user_id: user.id, exported_at: todayLocal() };

    for (const t of tables) {
      exportData[t] = await fetchTableAll(t, user.id);
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ipon-full-backup-${todayLocal()}.json`;
    a.click();

    localStorage.setItem('ipon:last-backup', todayLocal());
    setStatusMsg('Export complete!');
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
      <h1 className="font-display font-semibold text-2xl text-jade">More Features</h1>

      <div className="space-y-2">
        <Link href="/ledger" className="block bg-paper border border-line p-4 rounded-card font-bold text-jade hover:bg-jade/5">
          📜 Continuous Ledger
        </Link>
        <Link href="/reports" className="block bg-paper border border-line p-4 rounded-card font-bold text-jade hover:bg-jade/5">
          📊 Reports & Cutoff History
        </Link>
        <Link href="/trash" className="block bg-paper border border-line p-4 rounded-card font-bold text-jade hover:bg-jade/5">
          🗑️ Trash & Restorations
        </Link>
        <Link href="/food" className="block bg-paper border border-line p-4 rounded-card font-bold text-jade hover:bg-jade/5">
          🍲 Food & Mood Log
        </Link>
        <Link href="/buddy" className="block bg-paper border border-line p-4 rounded-card font-bold text-jade hover:bg-jade/5">
          🤝 Buddy Savings Tracker
        </Link>
        <button onClick={() => setIsBackupOpen(true)} className="w-full text-left bg-paper border border-line p-4 rounded-card font-bold text-jade hover:bg-jade/5">
          💾 Full Backup & JSON Export
        </button>
        <button onClick={() => setIsPinOpen(true)} className="w-full text-left bg-paper border border-line p-4 rounded-card font-bold text-jade hover:bg-jade/5">
          🔒 App Lock Security PIN
        </button>
      </div>

      <BottomSheet isOpen={isBackupOpen} onClose={() => setIsBackupOpen(false)} title="Full JSON Backup">
        <div className="space-y-3">
          <p className="text-xs text-jade/80">
            Download an offline JSON file containing your cutoffs, entries, recurring bills, accounts, and net worth history.
          </p>
          {statusMsg && <p className="text-xs font-bold text-jade">{statusMsg}</p>}
          <button onClick={handleExportJSON} className="w-full py-3 bg-jade text-paper font-bold rounded-xl text-xs min-h-[44px]">
            Download Full JSON Backup
          </button>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={isPinOpen} onClose={() => setIsPinOpen(false)} title="App Lock Security PIN">
        <form onSubmit={handleSetPIN} className="space-y-4">
          <p className="text-xs text-jade/70">
            Note: This lock protects against someone borrowing your phone while the browser is open.
          </p>
          {pinMsg && <p className="text-xs text-jade font-bold">{pinMsg}</p>}
          <input
            type="password"
            maxLength={6}
            placeholder="Enter 4-6 digit PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          />
          <button type="submit" className="w-full py-3 bg-jade text-paper font-bold rounded-xl text-xs min-h-[44px]">
            Enable Security PIN
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}