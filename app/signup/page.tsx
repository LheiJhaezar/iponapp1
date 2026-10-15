'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    if (data?.session) {
      router.replace('/dashboard');
      router.refresh();
    } else {
      setSuccessMsg('Account created! Please check your email inbox to confirm your account.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-paper border border-line rounded-card max-w-sm w-full p-6 space-y-5 shadow-xl">
        <div>
          <h1 className="font-display font-semibold text-2xl text-jade">Create Ipon Account</h1>
          <p className="text-xs text-jade/60 mt-1">Start your continuous savings ledger.</p>
        </div>

        {errorMsg && <p className="text-xs text-coral font-bold bg-coral/10 p-2.5 rounded-xl">{errorMsg}</p>}
        {successMsg && <p className="text-xs text-jade font-bold bg-jade/10 p-2.5 rounded-xl">{successMsg}</p>}

        <form onSubmit={handleSignUp} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
          />
          <input
            type="password"
            required
            minLength={6}
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
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>
        </form>

        <p className="text-center text-xs text-jade/60">
          Already have an account?{' '}
          <Link href="/login" className="text-jade font-bold hover:underline">
            Log In
          </Link>
        </p>
      </div>
    </div>
  );
}