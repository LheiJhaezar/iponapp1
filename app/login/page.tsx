'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
    } else {
      router.replace('/dashboard');
      router.refresh();
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) setErrorMsg(error.message);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-paper border border-line rounded-card max-w-sm w-full p-6 space-y-5 shadow-xl">
        <div>
          <h1 className="font-display font-semibold text-2xl text-jade">Log in to Ipon</h1>
          <p className="text-xs text-jade/60 mt-1">Access your continuous cutoff ledger.</p>
        </div>

        {errorMsg && <p className="text-xs text-coral font-bold bg-coral/10 p-2.5 rounded-xl">{errorMsg}</p>}

        <button
          onClick={handleGoogleLogin}
          type="button"
          className="w-full flex items-center justify-center gap-2 py-3 bg-paper border border-line text-jade font-semibold rounded-xl text-xs transition min-h-[44px]"
        >
          Continue with Google
        </button>

        <form onSubmit={handleEmailLogin} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-jade text-paper font-bold rounded-xl text-xs min-h-[44px]"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-jade/60">
          Don't have an account?{' '}
          <Link href="/signup" className="text-jade font-bold hover:underline">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}