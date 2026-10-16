'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import BottomSheet from '@/components/BottomSheet';
import { todayLocal } from '@/lib/dates';

export default function MorePage() {
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isPinOpen, setIsPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinSetMsg, setPinSetMsg] = useState('');

  const handleExportJSON = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: inc }, { data: alloc }, { data: cut }] = await Promise.all([
      supabase.from('income_entries').select('*').eq('user_id', user.id),
      supabase.from('allocations').select('*').eq('user_id', user.id),
      supabase.from('cutoffs').select('*').eq('user_id', user.id),
    ]);

    const backup = { user_id: user.id, exported_at: todayLocal(), income_entries: inc, allocations: alloc, cutoffs: cut };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ipon-backup-${todayLocal()}.json`;
    a.click();
    localStorage.setItem('ipon:last-backup', todayLocal());
  };

  const handleSetPIN = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return;
    localStorage.setItem('ipon:app-pin', pin);
    setPinSetMsg('Security PIN enabled!');
    setPin('');
    setTimeout(() => setIsPinOpen(false), 1000);
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="font-display font-semibold text-2xl text-jade">More Features</h1>

      <div className="space-y-2">
        <Link href="/ledger" className="block bg-paper border border-line p-4 rounded-card font-bold text-jade hover:bg-jade/5">
          📜 Continuous Ledger
        </Link>
        <Link href="/food" className="block bg-paper border border-line p-4 rounded-card font-bold text-jade hover:bg-jade/5">
          🍲 Food & Mood Log
        </Link>
        <Link href="/buddy" className="block bg-paper border border-line p-4 rounded-card font-bold text-jade hover:bg-jade/5">
          🤝 Buddy Savings Tracker
        </Link>
        <button onClick={() => setIsBackupOpen(true)} className="w-full text-left bg-paper border border-line p-4 rounded-card font-bold text-jade hover:bg-jade/5">
          💾 Backup & Data Export
        </button>
        <button onClick={() => setIsPinOpen(true)} className="w-full text-left bg-paper border border-line p-4 rounded-card font-bold text-jade hover:bg-jade/5">
          🔒 App Lock Security PIN
        </button>
      </div>

      <BottomSheet isOpen={isBackupOpen} onClose={() => setIsBackupOpen(false)} title="Backup & Export">
        <div className="space-y-3">
          <p className="text-xs text-jade/80">Export all your continuous ledger entries to an offline JSON backup file.</p>
          <button onClick={handleExportJSON} className="w-full py-3 bg-jade text-paper font-bold rounded-xl text-xs min-h-[44px]">
            Download Full JSON Backup
          </button>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={isPinOpen} onClose={() => setIsPinOpen(false)} title="App Lock Security PIN">
        <form onSubmit={handleSetPIN} className="space-y-4">
          {pinSetMsg && <p className="text-xs text-jade font-bold">{pinSetMsg}</p>}
          <input
            type="password"
            maxLength={6}
            placeholder="Enter 4-6 digit PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          />
          <button type="submit" className="w-full py-3 bg-jade text-paper font-bold rounded-xl text-xs min-h-[44px]">
            Save Security PIN
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}