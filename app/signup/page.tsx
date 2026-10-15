"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 text-center" style={{ background: "var(--paper)" }}>
        <div className="max-w-sm">
          <h1 className="font-display text-2xl font-semibold mb-3" style={{ color: "var(--ink)" }}>Check your email</h1>
          <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then log in.
          </p>
          <Link href="/login" className="font-bold text-sm" style={{ color: "var(--jade)" }}>Back to login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5" style={{ background: "var(--paper)" }}>
      <div className="w-full max-w-sm">
        <h1 className="font-display font-semibold text-4xl mb-1" style={{ color: "var(--ink)" }}>Ipon</h1>
        <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>Create your account to start tracking.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Full name</label>
            <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm border"
              style={{ borderColor: "var(--line)", background: "var(--paper-raised)", color: "var(--ink)" }} />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm border"
              style={{ borderColor: "var(--line)", background: "var(--paper-raised)", color: "var(--ink)" }} />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Password</label>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm border"
              style={{ borderColor: "var(--line)", background: "var(--paper-raised)", color: "var(--ink)" }} />
          </div>

          {error && <p className="text-sm" style={{ color: "var(--coral)" }}>{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full font-bold rounded-xl py-3 text-sm text-white mt-1 disabled:opacity-60"
            style={{ background: "var(--jade)" }}>
            {loading ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <p className="text-sm mt-6" style={{ color: "var(--ink-soft)" }}>
          Already have an account?{" "}
          <Link href="/login" className="font-bold" style={{ color: "var(--jade)" }}>Log in</Link>
        </p>
      </div>
    </div>
  );
}
