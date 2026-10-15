"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import NavTabs from "@/components/NavTabs";
import Drawer from "@/components/Drawer";

type Cutoff = { id: string; start_date: string; end_date: string; target_amount: number };
type Entry = { id: string; type: "income" | "allocation" | "food" | "mood"; label: string; sub: string; amount?: number; icon: string; created_at: string };

const MOODS = ["😔", "😐", "🙂", "😄", "🤩"];

export default function DashboardPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [cutoff, setCutoff] = useState<Cutoff | null>(null);
  const [saved, setSaved] = useState(0);
  const [streak, setStreak] = useState(0);
  const [available, setAvailable] = useState(0);
  const [billsDue, setBillsDue] = useState(0);
  const [todayMoods, setTodayMoods] = useState<string[]>([]);
  const [weekMoods, setWeekMoods] = useState<string[]>([]);
  const [todayFood, setTodayFood] = useState<string[]>([]);
  const [recentEntries, setRecentEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  // Drawer state
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [allocOpen, setAllocOpen] = useState(false);
  const [foodOpen, setFoodOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  const [newCutoffOpen, setNewCutoffOpen] = useState(false);

  // Income form
  const [incomeSource, setIncomeSource] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");

  // Alloc form
  const [allocTitle, setAllocTitle] = useState("");
  const [allocCategory, setAllocCategory] = useState("savings");
  const [allocAmount, setAllocAmount] = useState("");
  const [allocOther, setAllocOther] = useState("");

  // Food form
  const [foodWhat, setFoodWhat] = useState("");
  const [foodMeal, setFoodMeal] = useState("Lunch");

  // Mood form
  const [selectedMood, setSelectedMood] = useState("🙂");
  const [moodNote, setMoodNote] = useState("");

  // New cutoff form
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newTarget, setNewTarget] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setUserId(uid);
    if (!uid) { setLoading(false); return; }

    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", uid).single();
    setUserName(profile?.full_name?.split(" ")[0] ?? "");

    const { data: cutoffs } = await supabase.from("cutoffs").select("*").eq("user_id", uid).order("start_date", { ascending: false });
    const current = cutoffs?.[0] ?? null;
    setCutoff(current);

    // available cash
    const { data: allIncome } = await supabase.from("income_entries").select("amount").eq("user_id", uid);
    const { data: allAllocs } = await supabase.from("allocations").select("amount").eq("user_id", uid);
    const totalIn = (allIncome ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const totalOut = (allAllocs ?? []).reduce((s, r) => s + Number(r.amount), 0);
    setAvailable(totalIn - totalOut);

    if (current) {
      const { data: allocRows } = await supabase.from("allocations").select("amount").eq("user_id", uid).eq("cutoff_id", current.id).eq("category", "savings");
      setSaved((allocRows ?? []).reduce((s, r) => s + Number(r.amount), 0));
    }

    // streak
    if (cutoffs && cutoffs.length > 1) {
      let s = 0;
      for (const c of cutoffs.slice(1)) {
        const { data: sr } = await supabase.from("allocations").select("amount").eq("user_id", uid).eq("cutoff_id", c.id).eq("category", "savings");
        const total = (sr ?? []).reduce((x, r) => x + Number(r.amount), 0);
        if (total >= Number(c.target_amount)) s++; else break;
      }
      setStreak(s);
    }

    // bills due soon
    const { data: bills } = await supabase.from("recurring_bills").select("*").eq("user_id", uid).eq("active", true);
    const today = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    let dueCount = 0;
    (bills ?? []).forEach((b) => {
      let daysAway = 999;
      if (b.due_schedule === "end_of_month") daysAway = daysInMonth - today;
      else if (b.due_schedule === "per_cutoff") { const next = today <= 15 ? 15 : 30; daysAway = next - today; }
      else if (b.due_schedule === "specific_days" && b.due_days?.length) {
        const upcomming = b.due_days.map((d: number) => d >= today ? d - today : daysInMonth - today + d).sort((a: number, z: number) => a - z);
        daysAway = upcomming[0] ?? 999;
      }
      if (daysAway <= 7) dueCount++;
    });
    setBillsDue(dueCount);

    // mood
    const todayStr = new Date().toISOString().split("T")[0];
    const { data: moods } = await supabase.from("mood_entries").select("mood, log_date").eq("user_id", uid).gte("log_date", new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0]).order("log_date", { ascending: true });
    setWeekMoods((moods ?? []).map((m) => m.mood));
    setTodayMoods((moods ?? []).filter((m) => m.log_date === todayStr).map((m) => m.mood));

    // food today
    const { data: foodRow } = await supabase.from("food_entries").select("*").eq("user_id", uid).eq("log_date", todayStr).maybeSingle();
    if (foodRow) {
      const slots = ["breakfast", "brunch", "lunch", "merienda", "dinner"].filter((k) => foodRow[k]);
      setTodayFood(slots);
    } else {
      setTodayFood([]);
    }

    // recent entries feed
    const feed: Entry[] = [];
    if (current) {
      const { data: incomeRows } = await supabase.from("income_entries").select("*").eq("user_id", uid).eq("cutoff_id", current.id).order("created_at", { ascending: false }).limit(5);
      (incomeRows ?? []).forEach((r) => feed.push({ id: r.id, type: "income", icon: "💰", label: r.source ?? "Income", sub: "Income", amount: r.amount, created_at: r.created_at }));
      const { data: allocRowsFeed } = await supabase.from("allocations").select("*").eq("user_id", uid).eq("cutoff_id", current.id).order("created_at", { ascending: false }).limit(8);
      (allocRowsFeed ?? []).forEach((r) => feed.push({ id: r.id, type: "allocation", icon: r.category === "savings" ? "🌱" : r.category === "groceries" ? "🛒" : "📋", label: r.note ?? r.category, sub: r.category.charAt(0).toUpperCase() + r.category.slice(1), amount: r.amount, created_at: r.created_at }));
    }
    const { data: foodFeed } = await supabase.from("food_entries").select("*").eq("user_id", uid).order("log_date", { ascending: false }).limit(3);
    (foodFeed ?? []).forEach((r) => { const meals = ["breakfast","brunch","lunch","merienda","dinner"].filter((k) => r[k]); if (meals.length) feed.push({ id: r.id, type: "food", icon: "🍚", label: meals.map((m) => r[m]).join(", "), sub: `Food · ${r.log_date}`, created_at: r.created_at }); });
    const { data: moodFeed } = await supabase.from("mood_entries").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(3);
    (moodFeed ?? []).forEach((r) => feed.push({ id: r.id, type: "mood", icon: r.mood, label: r.note ?? "Mood check-in", sub: `Mood · ${r.log_date}`, created_at: r.created_at }));
    feed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setRecentEntries(feed.slice(0, 10));

    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function submitIncome(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !cutoff) return;
    await supabase.from("income_entries").insert({ user_id: userId, cutoff_id: cutoff.id, amount: Number(incomeAmount), source: incomeSource || null });
    setIncomeSource(""); setIncomeAmount(""); setIncomeOpen(false); load();
  }

  async function submitAlloc(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !cutoff) return;
    let note = allocTitle.trim();
    if (allocCategory === "other" && allocOther.trim()) note = note ? `${note} — ${allocOther.trim()}` : allocOther.trim();
    await supabase.from("allocations").insert({ user_id: userId, cutoff_id: cutoff.id, category: allocCategory, amount: Number(allocAmount), note: note || null });
    setAllocTitle(""); setAllocAmount(""); setAllocOther(""); setAllocOpen(false); load();
  }

  async function submitFood(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !foodWhat) return;
    const today = new Date().toISOString().split("T")[0];
    const mealKey = foodMeal.toLowerCase();
    const { data: existing } = await supabase.from("food_entries").select("id").eq("user_id", userId).eq("log_date", today).maybeSingle();
    if (existing) {
      await supabase.from("food_entries").update({ [mealKey]: foodWhat }).eq("id", existing.id);
    } else {
      await supabase.from("food_entries").insert({ user_id: userId, log_date: today, [mealKey]: foodWhat });
    }
    setFoodWhat(""); setFoodOpen(false); load();
  }

  async function submitMood(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    const today = new Date().toISOString().split("T")[0];
    const { data: existing } = await supabase.from("mood_entries").select("id").eq("user_id", userId).eq("log_date", today).maybeSingle();
    if (existing) {
      await supabase.from("mood_entries").update({ mood: selectedMood, note: moodNote || null }).eq("id", existing.id);
    } else {
      await supabase.from("mood_entries").insert({ user_id: userId, log_date: today, mood: selectedMood, note: moodNote || null });
    }
    setMoodNote(""); setMoodOpen(false); load();
  }

  async function submitNewCutoff(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    await supabase.from("cutoffs").insert({ user_id: userId, start_date: newStart, end_date: newEnd, target_amount: Number(newTarget) });
    setNewStart(""); setNewEnd(""); setNewTarget(""); setNewCutoffOpen(false); load();
  }

  const target = cutoff ? Number(cutoff.target_amount) : 0;
  const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;

  if (loading) return <div className="max-w-3xl mx-auto px-5 py-10 text-sm" style={{ color: "var(--ink-soft)" }}>Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      {/* Brand */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-baseline gap-2">
          <span className="font-display font-semibold text-xl">Ipon</span>
          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>your cutoff, tracked</span>
        </div>
        <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white" style={{ background: "var(--jade)" }}>
          {userName?.[0]?.toUpperCase() ?? "M"}
        </div>
      </div>

      <NavTabs />

      {/* No cutoff state */}
      {!cutoff && (
        <div className="border border-dashed rounded-card p-10 text-center mb-6" style={{ borderColor: "var(--line)" }}>
          <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>No active cutoff yet. Create one to start tracking.</p>
          <button onClick={() => setNewCutoffOpen(true)} className="font-semibold rounded-xl px-5 py-2.5 text-sm text-white" style={{ background: "var(--jade)" }}>
            Create your first cutoff
          </button>
        </div>
      )}

      {cutoff && (
        <>
          {/* Hero */}
          <div className="rounded-3xl p-6 mb-4 text-white" style={{ background: "linear-gradient(135deg, var(--jade-deep), var(--jade) 80%)" }}>
            <p className="text-xs opacity-80 mb-1">{cutoff.start_date} – {cutoff.end_date}</p>
            <h1 className="font-display font-semibold mb-1" style={{ fontSize: "clamp(20px,4vw,28px)" }}>
              ₱{saved.toLocaleString()} saved of ₱{target.toLocaleString()}
            </h1>
            {/* progress bar */}
            <div className="rounded-full mt-3 overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,0.2)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--gold)" }} />
            </div>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4">
            {[
              { val: `${pct}%`, label: "Progress" },
              { val: `${streak}`, label: "Streak" },
              { val: `₱${available.toLocaleString()}`, label: "Available" },
              { val: `${billsDue}`, label: "Bills due" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl p-4 text-center border" style={{ background: "var(--paper-raised)", borderColor: "var(--line)" }}>
                <div className="font-display font-semibold text-xl">{s.val}</div>
                <div className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mb-5">
            {[
              { icon: "💰", label: "Log income", action: () => setIncomeOpen(true) },
              { icon: "📊", label: "Allocate", action: () => setAllocOpen(true) },
              { icon: "🍚", label: "Log food", action: () => setFoodOpen(true) },
              { icon: "🙂", label: "Log mood", action: () => setMoodOpen(true) },
            ].map((a) => (
              <button key={a.label} onClick={a.action}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold border transition hover:border-jade hover:text-jade"
                style={{ background: "var(--paper-raised)", borderColor: "var(--line)", color: "var(--ink)" }}>
                <span>{a.icon}</span>{a.label}
              </button>
            ))}
            <button onClick={() => setNewCutoffOpen(true)}
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold border transition hover:border-jade hover:text-jade"
              style={{ background: "var(--paper-raised)", borderColor: "var(--line)", color: "var(--ink)" }}>
              ✂️ New cutoff
            </button>
          </div>

          {/* Summary mini-cards */}
          <div className="grid grid-cols-1 gap-3 mb-5 sm:grid-cols-2">
            {/* Food */}
            <div className="rounded-2xl p-4 border" style={{ background: "var(--paper-raised)", borderColor: "var(--line)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-display font-semibold text-sm">Today's food</span>
                {todayFood.length > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--sage)", color: "var(--jade-deep)" }}>{todayFood.length} logged</span>}
              </div>
              {todayFood.length === 0
                ? <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Nothing logged yet today</p>
                : <div className="flex flex-wrap gap-1.5">{todayFood.map((m) => (
                  <span key={m} className="text-xs font-semibold px-2.5 py-1 rounded-lg capitalize" style={{ background: "var(--sage)", color: "var(--jade-deep)" }}>{m}</span>
                ))}</div>
              }
            </div>
            {/* Mood */}
            <div className="rounded-2xl p-4 border" style={{ background: "var(--paper-raised)", borderColor: "var(--line)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-display font-semibold text-sm">Mood, 7 days</span>
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: 7 }).map((_, i) => {
                  const mood = weekMoods[i];
                  const isToday = i === weekMoods.length - 1;
                  return (
                    <div key={i} className="w-8 h-8 rounded-full flex items-center justify-center text-sm border"
                      style={{ background: isToday && mood ? "var(--gold)" : mood ? "var(--paper)" : "var(--sage)", borderColor: isToday && mood ? "var(--gold-deep)" : "var(--line)" }}>
                      {mood ?? ""}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Recent activity feed */}
          <div className="rounded-card border p-5" style={{ background: "var(--paper-raised)", borderColor: "var(--line)" }}>
            <h3 className="font-display font-semibold text-base mb-3">Recent activity</h3>
            {recentEntries.length === 0 && <p className="text-xs" style={{ color: "var(--ink-soft)" }}>No entries yet — log income or allocate to get started.</p>}
            <div className="flex flex-col">
              {recentEntries.map((e) => (
                <div key={e.id + e.type} className="flex items-center gap-3 py-2.5 border-b last:border-b-0" style={{ borderColor: "var(--line)" }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0" style={{ background: "var(--sage)" }}>{e.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{e.label}</div>
                    <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{e.sub}</div>
                  </div>
                  {e.amount !== undefined && (
                    <div className="font-semibold text-sm flex-shrink-0">₱{Number(e.amount).toLocaleString()}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Log income drawer */}
      <Drawer open={incomeOpen} onClose={() => setIncomeOpen(false)} title="Log income" subtitle="This adds to your available cash pool. Allocate it below.">
        <form onSubmit={submitIncome} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Where's this from?</label>
            <input value={incomeSource} onChange={(e) => setIncomeSource(e.target.value)} placeholder="e.g. Salary, Freelance, Gift"
              className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "var(--line)", background: "var(--paper)" }} />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Amount (₱)</label>
            <input type="number" required value={incomeAmount} onChange={(e) => setIncomeAmount(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "var(--line)", background: "var(--paper)" }} />
          </div>
          <button type="submit" className="w-full font-bold rounded-xl py-3 text-sm text-white mt-2" style={{ background: "var(--jade)" }}>Add income</button>
        </form>
      </Drawer>

      {/* Allocate drawer */}
      <Drawer open={allocOpen} onClose={() => setAllocOpen(false)} title="Allocate this cutoff" subtitle="Assign money from your available cash to a category.">
        <form onSubmit={submitAlloc} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>What's this for?</label>
            <input value={allocTitle} onChange={(e) => setAllocTitle(e.target.value)} placeholder="e.g. Weekly groceries, Emergency fund"
              className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "var(--line)", background: "var(--paper)" }} />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Category</label>
            <select value={allocCategory} onChange={(e) => setAllocCategory(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "var(--line)", background: "var(--paper)" }}>
              <option value="savings">Savings</option>
              <option value="bills">Bills</option>
              <option value="groceries">Groceries</option>
              <option value="other">Other</option>
            </select>
          </div>
          {allocCategory === "other" && (
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Where did you spend this?</label>
              <input value={allocOther} onChange={(e) => setAllocOther(e.target.value)} placeholder="e.g. Grab fare, Coffee, Medicine"
                className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "var(--line)", background: "var(--sage)" }} />
            </div>
          )}
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Amount (₱)</label>
            <input type="number" required value={allocAmount} onChange={(e) => setAllocAmount(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "var(--line)", background: "var(--paper)" }} />
          </div>
          <button type="submit" className="w-full font-bold rounded-xl py-3 text-sm text-white mt-2" style={{ background: "var(--jade)" }}>Allocate</button>
        </form>
      </Drawer>

      {/* Food drawer */}
      <Drawer open={foodOpen} onClose={() => setFoodOpen(false)} title="Log food" subtitle="Quick-add a meal for today. For the full log, go to Food log tab.">
        <form onSubmit={submitFood} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>What did you eat?</label>
            <input required value={foodWhat} onChange={(e) => setFoodWhat(e.target.value)} placeholder="e.g. Sinigang + rice"
              className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "var(--line)", background: "var(--paper)" }} />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Meal slot</label>
            <select value={foodMeal} onChange={(e) => setFoodMeal(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "var(--line)", background: "var(--paper)" }}>
              {["Breakfast","Brunch","Lunch","Merienda","Dinner","Extra"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="w-full font-bold rounded-xl py-3 text-sm text-white mt-2" style={{ background: "var(--jade)" }}>Log meal</button>
        </form>
      </Drawer>

      {/* Mood drawer */}
      <Drawer open={moodOpen} onClose={() => setMoodOpen(false)} title="How are you feeling?" subtitle="One check-in per day — updates if you log again today.">
        <form onSubmit={submitMood} className="flex flex-col gap-3">
          <div className="flex gap-2 mb-2">
            {MOODS.map((m) => (
              <button type="button" key={m} onClick={() => setSelectedMood(m)}
                className="w-11 h-11 rounded-full flex items-center justify-center text-xl border-2 transition"
                style={{ borderColor: selectedMood === m ? "var(--gold-deep)" : "var(--line)", background: selectedMood === m ? "var(--gold)" : "var(--paper)" }}>
                {m}
              </button>
            ))}
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Note (optional)</label>
            <input value={moodNote} onChange={(e) => setMoodNote(e.target.value)} placeholder="what's on your mind?"
              className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "var(--line)", background: "var(--paper)" }} />
          </div>
          <button type="submit" className="w-full font-bold rounded-xl py-3 text-sm text-white mt-2" style={{ background: "var(--jade)" }}>Save check-in</button>
        </form>
      </Drawer>

      {/* New cutoff drawer */}
      <Drawer open={newCutoffOpen} onClose={() => setNewCutoffOpen(false)} title="New cutoff" subtitle="Set the date range and your savings target for this period.">
        <form onSubmit={submitNewCutoff} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Start date</label>
            <input type="date" required value={newStart} onChange={(e) => setNewStart(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "var(--line)", background: "var(--paper)" }} />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>End date</label>
            <input type="date" required value={newEnd} onChange={(e) => setNewEnd(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "var(--line)", background: "var(--paper)" }} />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--ink-soft)" }}>Savings target (₱)</label>
            <input type="number" required value={newTarget} onChange={(e) => setNewTarget(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm" style={{ borderColor: "var(--line)", background: "var(--paper)" }} />
          </div>
          <button type="submit" className="w-full font-bold rounded-xl py-3 text-sm text-white mt-2" style={{ background: "var(--jade)" }}>Create cutoff</button>
        </form>
      </Drawer>
    </div>
  );
}
