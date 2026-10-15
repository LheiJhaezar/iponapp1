"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5" style={{ background: "var(--paper)" }}>
      <div className="w-full max-w-sm">
        <h1 className="font-display font-semibold text-4xl mb-1" style={{ color: "var(--ink)" }}>Ipon</h1>
        <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>Welcome back — log in to your dashboard.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm border"
              style={{ borderColor: "var(--line)", background: "var(--paper-raised)", color: "var(--ink)" }} />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm border"
              style={{ borderColor: "var(--line)", background: "var(--paper-raised)", color: "var(--ink)" }} />
          </div>

          {error && <p className="text-sm" style={{ color: "var(--coral)" }}>{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full font-bold rounded-xl py-3 text-sm text-white mt-1 disabled:opacity-60"
            style={{ background: "var(--jade)" }}>
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p className="text-sm mt-6" style={{ color: "var(--ink-soft)" }}>
          No account yet?{" "}
          <Link href="/signup" className="font-bold" style={{ color: "var(--jade)" }}>Sign up</Link>
        </p>
      </div>
    </div>
  );
}
