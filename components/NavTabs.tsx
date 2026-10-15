"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/bills", label: "Bills" },
  { href: "/food", label: "Food log" },
  { href: "/buddy", label: "Buddy" },
];

export default function NavTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between mb-5 gap-3">
      <div className="flex gap-1 p-1 rounded-full flex-1" style={{ background: "var(--sage)" }}>
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex-1 text-center px-2 py-2 rounded-full text-xs font-semibold transition"
            style={{
              background: pathname.startsWith(tab.href) ? "var(--paper-raised)" : "transparent",
              color: "var(--jade-deep)",
              boxShadow: pathname.startsWith(tab.href) ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            }}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <button
        onClick={handleLogout}
        className="text-xs font-semibold rounded-full px-3 py-2 border transition"
        style={{ borderColor: "var(--line)", color: "var(--ink-soft)" }}
      >
        Log out
      </button>
    </div>
  );
}
