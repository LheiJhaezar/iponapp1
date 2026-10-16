'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuickActions } from './QuickActionsContext';
import { supabase } from '@/lib/supabase/client';

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { openSheet } = useQuickActions();
  const [hasUnread, setHasUnread] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);

  const isAuthPage = pathname?.startsWith('/login') || pathname?.startsWith('/signup');

  useEffect(() => {
    if (!isAuthPage) {
      checkNotifications();
    }
  }, [pathname]);

  const checkNotifications = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ count: notifCount }, { count: pendingCount }] = await Promise.all([
      supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false),
      supabase.from('buddy_links').select('*', { count: 'exact', head: true }).eq('addressee_id', user.id).eq('status', 'pending'),
    ]);

    setHasUnread((notifCount || 0) > 0 || (pendingCount || 0) > 0);
  };

  if (isAuthPage) return null;

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-paper border-t border-line h-[84px] pb-[env(safe-area-inset-bottom)] flex items-center justify-around max-w-[480px] mx-auto">
        <Link
          href="/dashboard"
          className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] text-xs font-semibold ${
            pathname === '/dashboard' ? 'text-jade font-bold' : 'text-jade/50'
          }`}
        >
          <span className="text-lg">🏠</span>
          <span>Home</span>
        </Link>

        <Link
          href="/bills"
          className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] text-xs font-semibold ${
            pathname === '/bills' ? 'text-jade font-bold' : 'text-jade/50'
          }`}
        >
          <span className="text-lg">🧾</span>
          <span>Bills</span>
        </Link>

        <button
          onClick={() => setIsActionsOpen(!isActionsOpen)}
          className="w-14 h-14 bg-jade hover:bg-[#143f34] text-paper rounded-full flex items-center justify-center text-2xl font-bold shadow-lg transition-transform active:scale-95 border-2 border-gold -mt-5 min-w-[44px] min-h-[44px]"
        >
          +
        </button>

        <Link
          href="/wealth"
          className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] text-xs font-semibold ${
            pathname?.startsWith('/wealth') ? 'text-jade font-bold' : 'text-jade/50'
          }`}
        >
          <span className="text-lg">💎</span>
          <span>Wealth</span>
        </Link>

        <Link
          href="/more"
          className={`relative flex flex-col items-center justify-center min-w-[44px] min-h-[44px] text-xs font-semibold ${
            pathname?.startsWith('/more') ? 'text-jade font-bold' : 'text-jade/50'
          }`}
        >
          {hasUnread && <span className="absolute top-1 right-2 w-2.5 h-2.5 bg-coral rounded-full border border-paper" />}
          <span className="text-lg">⚙️</span>
          <span>More</span>
        </Link>
      </nav>

      {isActionsOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end justify-center pb-24 p-4" onClick={() => setIsActionsOpen(false)}>
          <div className="bg-paper border border-line rounded-card p-4 w-full max-w-[400px] grid grid-cols-2 gap-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { setIsActionsOpen(false); openSheet('income'); }}
              className="p-3 bg-jade/10 rounded-xl flex flex-col items-center gap-1 text-jade font-bold text-xs hover:bg-jade/20 min-h-[64px] justify-center"
            >
              <span className="text-xl">💵</span>
              <span>Log Income</span>
            </button>
            <button
              onClick={() => { setIsActionsOpen(false); openSheet('allocate'); }}
              className="p-3 bg-coral/10 rounded-xl flex flex-col items-center gap-1 text-coral font-bold text-xs hover:bg-coral/20 min-h-[64px] justify-center"
            >
              <span className="text-xl">💸</span>
              <span>Allocate</span>
            </button>
            <button
              onClick={() => { setIsActionsOpen(false); openSheet('transfer'); }}
              className="p-3 bg-gold/15 rounded-xl flex flex-col items-center gap-1 text-jade font-bold text-xs hover:bg-gold/25 min-h-[64px] justify-center"
            >
              <span className="text-xl">🔄</span>
              <span>Transfer</span>
            </button>
            <button
              onClick={() => { setIsActionsOpen(false); openSheet('mood'); }}
              className="p-3 bg-jade/10 rounded-xl flex flex-col items-center gap-1 text-jade font-bold text-xs hover:bg-jade/20 min-h-[64px] justify-center"
            >
              <span className="text-xl">😊</span>
              <span>Log Mood</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}