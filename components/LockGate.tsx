'use client';

import React, { useState, useEffect } from 'react';

export default function LockGate({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);

  useEffect(() => {
    const savedHash = localStorage.getItem('ipon:pin-hash');
    if (savedHash) {
      setIsLocked(true);
    }

    let timeout: NodeJS.Timeout;
    const handleVisibility = () => {
      if (document.hidden && localStorage.getItem('ipon:pin-hash')) {
        timeout = setTimeout(() => setIsLocked(true), 2 * 60 * 1000); // 2 minutes background lock
      } else {
        clearTimeout(timeout);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const hashPin = async (pin: string, salt: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (failedAttempts >= 5) {
      setErrorMsg('Too many attempts. Wait 30 seconds.');
      return;
    }

    const storedHash = localStorage.getItem('ipon:pin-hash');
    const storedSalt = localStorage.getItem('ipon:pin-salt') || 'ipon-salt';

    if (!storedHash) {
      setIsLocked(false);
      return;
    }

    const computed = await hashPin(pinInput, storedSalt);
    if (computed === storedHash) {
      setIsLocked(false);
      setPinInput('');
      setErrorMsg('');
      setFailedAttempts(0);
    } else {
      const nextFail = failedAttempts + 1;
      setFailedAttempts(nextFail);
      if (nextFail >= 5) {
        setTimeout(() => setFailedAttempts(0), 30000);
      }
      setErrorMsg('Incorrect Security PIN.');
    }
  };

  if (!isLocked) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-50 bg-[#1f5d4c] text-[#f6f3ea] flex flex-col items-center justify-center p-6 space-y-6">
      <div className="text-center space-y-2">
        <span className="text-4xl">🔒</span>
        <h2 className="font-display font-semibold text-2xl">Ipon App Locked</h2>
        <p className="text-xs text-[#f6f3ea]/70 max-w-xs">
          Enter your security PIN to access your personal money ledger.
        </p>
      </div>

      <form onSubmit={handleUnlock} className="w-full max-w-xs space-y-4">
        {errorMsg && <p className="text-xs text-[#c85c46] text-center font-bold">{errorMsg}</p>}
        <input
          type="password"
          maxLength={6}
          autoFocus
          value={pinInput}
          onChange={(e) => setPinInput(e.target.value)}
          placeholder="Enter PIN"
          className="w-full text-center bg-[#143f34] border border-[#f6f3ea]/20 rounded-2xl p-4 text-2xl font-mono tracking-widest text-[#f6f3ea] focus:outline-none"
        />
        <button
          type="submit"
          className="w-full py-3 bg-[#e2a63f] text-[#143f34] font-bold rounded-xl text-sm min-h-[44px]"
        >
          Unlock App
        </button>
      </form>
    </div>
  );
}