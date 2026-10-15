"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import NavTabs from "@/components/NavTabs";

type FoodEntry = {
  id: string;
  log_date: string;
  breakfast: string | null;
  brunch: string | null;
  lunch: string | null;
  merienda: string | null;
  dinner: string | null;
  extra: string | null;
};

type MealKey = "breakfast" | "brunch" | "lunch" | "merienda" | "dinner" | "extra";

const MEALS: { key: MealKey; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "brunch", label: "Brunch" },
  { key: "lunch", label: "Lunch" },
  { key: "merienda", label: "Merienda" },
  { key: "dinner", label: "Dinner" },
  { key: "extra", label: "Extra & notes" },
];

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}
function fmtDow(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-PH", { weekday: "long" });
}

export default function FoodLogPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? null;
    setUserId(uid);
    if (!uid) { setLoading(false); return; }
    const { data } = await supabase.from("food_entries").select("*").eq("user_id", uid).order("log_date", { ascending: false }).limit(60);
    setEntries(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function addToday() {
    if (!userId) return;
    const today = new Date().toISOString().split("T")[0];
    if (entries.find((e) => e.log_date === today)) return;
    const { data } = await supabase.from("food_entries").insert({ user_id: userId, log_date: today }).select().single();
    if (data) setEntries((p) => [data, ...p]);
  }

  async function saveCell(entry: FoodEntry, field: MealKey, value: string) {
    const trimmed = value.trim();
    setEntries((p) => p.map((e) => e.id === entry.id ? { ...e, [field]: trimmed || null } : e));
    await supabase.from("food_entries").update({ [field]: trimmed || null }).eq("id", entry.id);
  }

  if (loading) return <div className="max-w-5xl mx-auto px-5 py-10 text-sm" style={{ color: "var(--ink-soft)" }}>Loading food log...</div>;

  const thStyle: React.CSSProperties = {
    textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--jade-deep)",
    textTransform: "uppercase", letterSpacing: "0.05em",
    padding: "11px 14px", background: "var(--sage)", whiteSpace: "nowrap",
  };
  const tdBorder: React.CSSProperties = { borderBottom: "1px solid var(--line)", borderRight: "1px solid var(--line)", verticalAlign: "top", padding: 0 };

  return (
    <div className="max-w-5xl mx-auto px-5 py-8">
      <div className="flex items-baseline gap-2 mb-5">
        <span className="font-display font-semibold text-xl">Ipon</span>
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>your cutoff, tracked</span>
      </div>
      <NavTabs />

      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display font-semibold text-2xl">Food log</h1>
        <button onClick={addToday}
          className="font-bold rounded-xl px-4 py-2 text-sm text-white"
          style={{ background: "var(--jade)" }}>+ Add today</button>
      </div>
      <p className="text-sm mb-5" style={{ color: "var(--ink-soft)" }}>
        Click any cell to fill it in. Nothing's required — leave blank on days you skip a meal.
      </p>

      {entries.length === 0 ? (
        <div className="border border-dashed rounded-card p-12 text-center" style={{ borderColor: "var(--line)" }}>
          <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>No food entries yet.</p>
          <button onClick={addToday} className="font-bold rounded-xl px-5 py-2.5 text-sm text-white" style={{ background: "var(--jade)" }}>
            Start today's log
          </button>
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 18, background: "var(--paper-raised)" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 860 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, minWidth: 100 }}>Date</th>
                {MEALS.map((m) => (
                  <th key={m.key} style={{ ...thStyle, minWidth: m.key === "extra" ? 180 : 130 }}>{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, ri) => (
                <tr key={entry.id}>
                  <td style={{ ...tdBorder, background: "var(--paper)", padding: "12px 14px", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", borderBottom: ri === entries.length - 1 ? "none" : undefined }}>
                    {fmtDate(entry.log_date)}
                    <span style={{ display: "block", fontWeight: 400, fontSize: 11, color: "var(--ink-soft)", marginTop: 1 }}>{fmtDow(entry.log_date)}</span>
                  </td>
                  {MEALS.map((m, ci) => (
                    <td key={m.key} style={{ ...tdBorder, borderRight: ci === MEALS.length - 1 ? "none" : undefined, borderBottom: ri === entries.length - 1 ? "none" : undefined }}>
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        data-placeholder="—"
                        onBlur={(e) => saveCell(entry, m.key, e.currentTarget.textContent ?? "")}
                        style={{
                          padding: "11px 13px", fontSize: 13, outline: "none", minHeight: 44,
                          lineHeight: 1.4, display: "block", cursor: "text",
                          fontStyle: m.key === "extra" ? "italic" : "normal",
                          color: m.key === "extra" ? "var(--ink-soft)" : "var(--ink)",
                        }}
                      >
                        {entry[m.key] ?? ""}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs mt-4" style={{ color: "var(--ink-soft)" }}>
        💡 Tip: click any cell and start typing. Changes save automatically when you click away.
      </p>
    </div>
  );
}
