'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import BottomSheet from './BottomSheet';
import { supabase } from '@/lib/supabase/client';

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);

  const isAuthPage = pathname?.startsWith('/login') || pathname?.startsWith('/signup');
  if (isAuthPage) return null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#f6f3ea] border-t border-[#1f5d4c]/15 h-[84px] pb-[env(safe-area-inset-bottom)] flex items-center justify-around max-w-[480px] mx-auto">
        <Link
          href="/dashboard"
          className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] text-xs font-semibold ${
            pathname === '/dashboard' ? 'text-[#1f5d4c]' : 'text-[#143f34]/50'
          }`}
        >
          <span className="text-lg">🏠</span>
          <span>Home</span>
        </Link>

        <Link
          href="/bills"
          className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] text-xs font-semibold ${
            pathname === '/bills' ? 'text-[#1f5d4c]' : 'text-[#143f34]/50'
          }`}
        >
          <span className="text-lg">🧾</span>
          <span>Bills</span>
        </Link>

        {/* Center Plus Action Trigger */}
        <button
          onClick={() => setIsPlusMenuOpen(true)}
          className="w-14 h-14 bg-[#1f5d4c] hover:bg-[#143f34] text-[#f6f3ea] rounded-full flex items-center justify-center text-2xl font-bold shadow-lg transition-transform active:scale-95 border-2 border-[#e2a63f] -mt-5"
          aria-label="Quick Actions"
        >
          +
        </button>

        <Link
          href="/food"
          className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] text-xs font-semibold ${
            pathname === '/food' ? 'text-[#1f5d4c]' : 'text-[#143f34]/50'
          }`}
        >
          <span className="text-lg">🍲</span>
          <span>Food</span>
        </Link>

        <Link
          href="/buddy"
          className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] text-xs font-semibold ${
            pathname === '/buddy' ? 'text-[#1f5d4c]' : 'text-[#143f34]/50'
          }`}
        >
          <span className="text-lg">🤝</span>
          <span>Buddy</span>
        </Link>
      </nav>

      {/* Quick Actions Sheet */}
      <BottomSheet
        isOpen={isPlusMenuOpen}
        onClose={() => setIsPlusMenuOpen(false)}
        title="Quick Actions"
      >
        <div className="grid grid-cols-2 gap-3 py-2">
          <button
            onClick={() => { setIsPlusMenuOpen(false); router.push('/dashboard?action=income'); }}
            className="p-4 bg-[#1f5d4c]/10 border border-[#1f5d4c]/20 rounded-2xl flex flex-col items-center gap-2 text-[#143f34] font-bold text-sm hover:bg-[#1f5d4c]/20 transition min-h-[80px] justify-center"
          >
            <span className="text-2xl">💵</span>
            <span>Log Income</span>
          </button>

          <button
            onClick={() => { setIsPlusMenuOpen(false); router.push('/dashboard?action=allocate'); }}
            className="p-4 bg-[#c85c46]/10 border border-[#c85c46]/20 rounded-2xl flex flex-col items-center gap-2 text-[#c85c46] font-bold text-sm hover:bg-[#c85c46]/20 transition min-h-[80px] justify-center"
          >
            <span className="text-2xl">💸</span>
            <span>Allocate</span>
          </button>

          <button
            onClick={() => { setIsPlusMenuOpen(false); router.push('/food?action=log'); }}
            className="p-4 bg-[#e2a63f]/15 border border-[#e2a63f]/30 rounded-2xl flex flex-col items-center gap-2 text-[#143f34] font-bold text-sm hover:bg-[#e2a63f]/25 transition min-h-[80px] justify-center"
          >
            <span className="text-2xl">🍱</span>
            <span>Log Food</span>
          </button>

          <button
            onClick={() => { setIsPlusMenuOpen(false); router.push('/food?action=mood'); }}
            className="p-4 bg-[#1f5d4c]/10 border border-[#1f5d4c]/20 rounded-2xl flex flex-col items-center gap-2 text-[#143f34] font-bold text-sm hover:bg-[#1f5d4c]/20 transition min-h-[80px] justify-center"
          >
            <span className="text-2xl">😊</span>
            <span>Log Mood</span>
          </button>
        </div>

        <div className="pt-4 border-t border-[#1f5d4c]/10 flex justify-between items-center">
          <button
            onClick={handleLogout}
            className="w-full py-3 bg-[#c85c46]/15 hover:bg-[#c85c46]/25 text-[#c85c46] font-bold rounded-xl text-sm transition min-h-[44px]"
          >
            Log Out
          </button>
        </div>
      </BottomSheet>
    </>
  );
}