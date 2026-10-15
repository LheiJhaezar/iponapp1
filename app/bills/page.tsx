"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import NavTabs from "@/components/NavTabs";
import Drawer from "@/components/Drawer";

type DueSchedule = "end_of_month" | "specific_days" | "per_cutoff" | "custom_date";

type Bill = {
  id: string;
  name: string;
  category: string;
  expected_amount: number;
  due_schedule: DueSchedule;
  due_days: number[] | null;
  due_custom_date: string | null;
  shared: boolean;
  icon: string;
  note: string | null;
};

const SCHEDULES: { key: DueSchedule; icon: string; label: string; sub: string }[] = [
  { key: "end_of_month", icon: "📅", label: "End of month", sub: "Always last day" },
  { key: "specific_days", icon: "🗓", label: "Specific day(s)", sub: "e.g. 10th, 15th" },
  { key: "per_cutoff", icon: "✂️", label: "Per cutoff", sub: "15th & 30th" },
  { key: "custom_date", icon: "✏️", label: "Custom date", sub: "Pick exact date" },
];

function getDaysUntilDue(bill: Bill): number | null {
  const today = new Date();
  const d = today.getDate();
  const dim = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  if (bill.due_schedule === "end_of_month") return dim - d;
  if (bill.due_schedule === "per_cutoff") { const n = d <= 15 ? 15 : 30; return n - d; }
  if (bill.due_schedule === "specific_days" && bill.due_days?.length) {
    const opts = bill.due_days.map((x) => x >= d ? x - d : dim - d + x).sort((a, b) => a - b);
    return opts[0] ?? null;
  }
  if (bill.due_schedule === "custom_date" && bill.due_custom_date) {
    return Math.round((new Date(bill.due_custom_date).getTime() - today.getTime()) / 86400000);
  }
  return null;
}

function getDueLabel(bill: Bill): string {
  if (bill.due_schedule === "end_of_month") return "Due end of month";
  if (bill.due_schedule === "per_cutoff") return "Due 15th & 30th";
  if (bill.due_schedule === "specific_days" && bill.due_days?.length)
    return `Due on ${bill.due_days.sort((a,b)=>a-b).map((d) => `${d}th`).join(", ")}`;
  if (bill.due_schedule === "custom_date" && bill.due_custom_date) return `Due ${bill.due_custom_date}`;
  return "";
}

const S = { background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--line)" };

export default function BillsPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editScope, setEditScope] = useState<"once" | "forward">("once");

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Utilities");
  const [schedule, setSchedule] = useState<DueSchedule>("end_of_month");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [customDate, setCustomDate] = useState("");
  const [shared, setShared] = useState(true);
  const [billNote, setBillNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? null;
    setUserId(uid);
    if (!uid) { setLoading(false); return; }
    const { data } = await supabase.from("recurring_bills").select("*").eq("user_id", uid).eq("active", true).order("created_at", { ascending: false });
    setBills(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  function toggleDay(d: number) {
    setSelectedDays((p) => p.includes(d) ? p.filter((x) => x !== d) : [...p, d]);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !name || !amount) return;
    await supabase.from("recurring_bills").insert({
      user_id: userId, name, category,
      expected_amount: Number(amount),
      due_schedule: schedule,
      due_days: schedule === "specific_days" ? selectedDays : null,
      due_custom_date: schedule === "custom_date" ? customDate : null,
      shared, note: billNote || null,
    });
    setName(""); setAmount(""); setCategory("Utilities"); setSchedule("end_of_month");
    setSelectedDays([]); setCustomDate(""); setShared(true); setBillNote("");
    setDrawerOpen(false);
    load();
  }

  async function handleSaveEdit() {
    if (!editingBill || !userId) return;
    const n = Number(editAmount);
    if (editScope === "forward") {
      await supabase.from("recurring_bills").update({ expected_amount: n }).eq("id", editingBill.id);
    } else {
      const { data: cuts } = await supabase.from("cutoffs").select("id").eq("user_id", userId).order("start_date", { ascending: false }).limit(1);
      const cid = cuts?.[0]?.id;
      if (cid) await supabase.from("allocations").insert({ user_id: userId, cutoff_id: cid, category: "bills", amount: n, bill_id: editingBill.id, shared: editingBill.shared, note: `${editingBill.name} — adjusted` });
    }
    setEditingBill(null);
    load();
  }

  const sorted = [...bills].sort((a, b) => (getDaysUntilDue(a) ?? 999) - (getDaysUntilDue(b) ?? 999));
  const dueSoon = sorted.filter((b) => { const d = getDaysUntilDue(b); return d !== null && d <= 7; });

  if (loading) return <div className="max-w-3xl mx-auto px-5 py-10 text-sm" style={{ color: "var(--ink-soft)" }}>Loading bills...</div>;

  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      <div className="flex items-baseline gap-2 mb-5">
        <span className="font-display font-semibold text-xl">Ipon</span>
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>your cutoff, tracked</span>
      </div>
      <NavTabs />

      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display font-semibold text-2xl">Bills &amp; dues</h1>
        <button onClick={() => setDrawerOpen(true)}
          className="font-bold rounded-xl px-4 py-2 text-sm text-white"
          style={{ background: "var(--jade)" }}>+ Add bill</button>
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>Set flexible due dates per bill — end of month, specific days, per cutoff, or an exact date.</p>

      {/* Due soon */}
      {dueSoon.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>Due soon</p>
          <div className="flex flex-col gap-2.5">
            {dueSoon.map((b) => {
              const d = getDaysUntilDue(b);
              const overdue = d !== null && d < 0;
              return (
                <div key={b.id} className="flex items-center gap-3 rounded-card px-4 py-3.5 border"
                  style={{ background: "var(--paper-raised)", borderColor: "var(--line)", borderLeft: `3px solid ${overdue ? "var(--coral)" : "var(--gold)"}` }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ background: "var(--sage)" }}>{b.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{b.name}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: overdue ? "var(--coral-soft)" : "#fef3c7", color: overdue ? "var(--coral)" : "#92400e" }}>
                        {overdue ? "Overdue" : `Due in ${d} day${d !== 1 ? "s" : ""}`}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>{getDueLabel(b)} · {b.shared ? "Shared" : "Personal"}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-display font-semibold">₱{Number(b.expected_amount).toLocaleString()}</p>
                  </div>
                  <button onClick={() => { setEditingBill(b); setEditAmount(String(b.expected_amount)); setEditScope("once"); }}
                    className="w-8 h-8 border rounded-lg text-sm flex-shrink-0 flex items-center justify-center"
                    style={{ borderColor: "var(--line)", color: "var(--ink-soft)" }}>✎</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All bills */}
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--ink-soft)" }}>All bills</p>
      <div className="flex flex-col gap-2.5">
        {sorted.length === 0 && <p className="text-sm" style={{ color: "var(--ink-soft)" }}>No bills yet — add one above.</p>}
        {sorted.map((b) => {
          const d = getDaysUntilDue(b);
          return (
            <div key={b.id} className="flex items-center gap-3 rounded-card px-4 py-3.5 border"
              style={{ background: "var(--paper-raised)", borderColor: "var(--line)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ background: "var(--sage)" }}>{b.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{b.name}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: b.shared ? "var(--sage)" : "var(--line)", color: b.shared ? "var(--jade-deep)" : "var(--ink-soft)" }}>
                    {b.shared ? "Shared" : "Personal"}
                  </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>{getDueLabel(b)} · {b.category}</p>
                {b.note && <p className="text-xs mt-0.5 italic" style={{ color: "var(--ink-soft)" }}>{b.note}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-display font-semibold">₱{Number(b.expected_amount).toLocaleString()}</p>
                {d !== null && <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>{d < 0 ? "Overdue" : d === 0 ? "Due today" : `${d}d away`}</p>}
              </div>
              <button onClick={() => { setEditingBill(b); setEditAmount(String(b.expected_amount)); setEditScope("once"); }}
                className="w-8 h-8 border rounded-lg text-sm flex-shrink-0 flex items-center justify-center"
                style={{ borderColor: "var(--line)", color: "var(--ink-soft)" }}>✎</button>
            </div>
          );
        })}
      </div>

      {/* Add bill drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Add a bill" subtitle="Set the amount and exactly when it's due each month.">
        <form onSubmit={handleAdd} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Bill name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Home Credit Loan"
              className="w-full rounded-xl px-3 py-2.5 text-sm border" style={S} />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Expected amount (₱)</label>
            <input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm border" style={S} />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm border" style={S}>
              <option>Utilities</option><option>Housing</option>
              <option>Loan / PayLater</option><option>Subscription</option><option>Other</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold block mb-2" style={{ color: "var(--ink-soft)" }}>Due date schedule</label>
            <div className="grid grid-cols-2 gap-2">
              {SCHEDULES.map((s) => (
                <button type="button" key={s.key} onClick={() => setSchedule(s.key)}
                  className="border rounded-xl p-3 text-left transition"
                  style={{ borderColor: schedule === s.key ? "var(--jade)" : "var(--line)", background: schedule === s.key ? "var(--sage)" : "var(--paper)" }}>
                  <span className="text-lg block mb-1">{s.icon}</span>
                  <span className="font-bold text-xs block">{s.label}</span>
                  <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{s.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {schedule === "specific_days" && (
            <div>
              <label className="text-xs font-bold block mb-2" style={{ color: "var(--ink-soft)" }}>Which day(s) of the month?</label>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <button type="button" key={d} onClick={() => toggleDay(d)}
                    className="w-8 h-8 rounded-full text-xs font-bold border transition"
                    style={{ borderColor: selectedDays.includes(d) ? "var(--jade)" : "var(--line)", background: selectedDays.includes(d) ? "var(--jade)" : "var(--paper)", color: selectedDays.includes(d) ? "#fff" : "var(--ink)" }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {schedule === "custom_date" && (
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Exact due date</label>
              <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm border" style={S} />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            Shared with buddy
          </label>

          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Notes (optional)</label>
            <textarea value={billNote} onChange={(e) => setBillNote(e.target.value)}
              placeholder="e.g. auto-deducted from GCash"
              className="w-full rounded-xl px-3 py-2.5 text-sm border resize-none h-16" style={S} />
          </div>

          <button type="submit" className="w-full font-bold rounded-xl py-3 text-sm text-white mt-1" style={{ background: "var(--jade)" }}>Save bill</button>
        </form>
      </Drawer>

      {/* Edit modal */}
      {editingBill && (
        <div className="fixed inset-0 flex items-center justify-center px-5 z-50" style={{ background: "rgba(10,16,13,0.45)" }}>
          <div className="w-full max-w-sm rounded-card p-6" style={{ background: "var(--paper-raised)" }}>
            <h3 className="font-display font-semibold text-lg mb-1">Edit {editingBill.name}</h3>
            <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>Expected ₱{Number(editingBill.expected_amount).toLocaleString()}</p>
            <div className="flex flex-col gap-2 mb-4">
              {(["once", "forward"] as const).map((s) => (
                <label key={s} className="border rounded-xl px-3.5 py-3 flex gap-2.5 items-start cursor-pointer"
                  style={{ borderColor: editScope === s ? "var(--jade)" : "var(--line)", background: editScope === s ? "var(--sage)" : "var(--paper-raised)" }}>
                  <input type="radio" checked={editScope === s} onChange={() => setEditScope(s)} className="mt-0.5" />
                  <span>
                    <strong className="block text-sm">{s === "once" ? "Just this bill" : "Going forward"}</strong>
                    <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                      {s === "once" ? "Fix this cutoff only — reverts next time." : "Price changed permanently."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Actual amount</label>
            <input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm border mb-4" style={S} />
            <div className="flex gap-2">
              <button onClick={() => setEditingBill(null)} className="flex-1 border rounded-xl py-2.5 text-sm font-semibold" style={{ borderColor: "var(--line)" }}>Cancel</button>
              <button onClick={handleSaveEdit} className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white" style={{ background: "var(--jade)" }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
