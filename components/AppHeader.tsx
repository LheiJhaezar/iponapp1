'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isAuthPage = pathname?.startsWith('/login') || pathname?.startsWith('/signup');

  useEffect(() => {
    if (!isAuthPage) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) setUserEmail(user.email || '');
      });
    }
  }, [pathname]);

  if (isAuthPage) return null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  const initial = userEmail ? userEmail.charAt(0).toUpperCase() : 'U';

  return (
    <header className="sticky top-0 z-30 bg-paper/90 backdrop-blur-md border-b border-line px-4 h-16 flex items-center justify-between">
      <h1 className="font-display font-semibold text-2xl text-jade">ipon</h1>

      <div className="relative">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="w-10 h-10 rounded-full bg-jade text-paper font-bold text-sm flex items-center justify-center border-2 border-gold min-w-[44px] min-h-[44px]"
        >
          {initial}
        </button>

        {isMenuOpen && (
          <div className="absolute right-0 mt-2 w-56 bg-paper border border-line rounded-card p-3 shadow-xl space-y-3 z-50">
            <div className="border-b border-line pb-2">
              <p className="text-[10px] uppercase font-bold text-jade/60">Signed in as</p>
              <p className="text-xs font-bold text-jade truncate">{userEmail}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full text-left py-2 px-3 text-xs font-bold text-coral hover:bg-coral/10 rounded-xl transition min-h-[44px] flex items-center"
            >
              Log Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}