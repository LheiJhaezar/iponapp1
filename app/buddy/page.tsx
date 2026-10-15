"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import NavTabs from "@/components/NavTabs";

type BuddyLink = { id: string; requester_id: string; addressee_id: string; status: "pending" | "accepted" | "declined" };
type Profile = { id: string; email: string; full_name: string | null };
type Side = { label: string; income: number; savings: number; bills: number; groceries: number; other: number; target: number; available: number };

async function loadSide(supabase: ReturnType<typeof createClient>, uid: string, label: string): Promise<Side> {
  const { data: cuts } = await supabase.from("cutoffs").select("id, target_amount").eq("user_id", uid).order("start_date", { ascending: false }).limit(1);
  const cur = cuts?.[0];
  if (!cur) return { label, income: 0, savings: 0, bills: 0, groceries: 0, other: 0, target: 0, available: 0 };

  const { data: inc } = await supabase.from("income_entries").select("amount").eq("user_id", uid).eq("cutoff_id", cur.id);
  const { data: alc } = await supabase.from("allocations").select("category, amount").eq("user_id", uid).eq("cutoff_id", cur.id);
  const { data: allInc } = await supabase.from("income_entries").select("amount").eq("user_id", uid);
  const { data: allAlc } = await supabase.from("allocations").select("amount").eq("user_id", uid);

  const sum = (cat: string) => (alc ?? []).filter((a) => a.category === cat).reduce((s, a) => s + Number(a.amount), 0);
  const totalInc = (allInc ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const totalAlc = (allAlc ?? []).reduce((s, r) => s + Number(r.amount), 0);

  return {
    label,
    income: (inc ?? []).reduce((s, r) => s + Number(r.amount), 0),
    savings: sum("savings"),
    bills: sum("bills"),
    groceries: sum("groceries"),
    other: sum("other"),
    target: Number(cur.target_amount),
    available: totalInc - totalAlc,
  };
}

const S = { background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--line)" };

export default function BuddyPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [links, setLinks] = useState<BuddyLink[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [sides, setSides] = useState<Record<string, [Side, Side]>>({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? null;
    setUserId(uid);
    if (!uid) { setLoading(false); return; }

    const { data: rows } = await supabase.from("buddy_links").select("*").or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
    setLinks(rows ?? []);

    const others = (rows ?? []).map((l) => l.requester_id === uid ? l.addressee_id : l.requester_id);
    if (others.length) {
      const { data: profs } = await supabase.from("profiles").select("id, email, full_name").in("id", others);
      const map: Record<string, Profile> = {};
      (profs ?? []).forEach((p) => (map[p.id] = p));
      setProfiles(map);

      const accepted = (rows ?? []).filter((l) => l.status === "accepted");
      const sideMap: Record<string, [Side, Side]> = {};
      for (const l of accepted) {
        const otherId = l.requester_id === uid ? l.addressee_id : l.requester_id;
        const [mine, theirs] = await Promise.all([
          loadSide(supabase, uid, "You"),
          loadSide(supabase, otherId, map[otherId]?.full_name ?? map[otherId]?.email ?? "Buddy"),
        ]);
        sideMap[l.id] = [mine, theirs];
      }
      setSides(sideMap);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!userId || !inviteEmail) return;
    const { data: found } = await supabase.from("profiles").select("id").eq("email", inviteEmail).maybeSingle();
    if (!found) { setMsg("No Ipon account found with that email."); return; }
    if (found.id === userId) { setMsg("You can't invite yourself."); return; }
    const { error } = await supabase.from("buddy_links").insert({ requester_id: userId, addressee_id: found.id, status: "pending" });
    if (error) { setMsg("Could not send invite — you may already have a link with them."); return; }
    setMsg("✓ Invite sent!"); setInviteEmail(""); load();
  }

  async function respond(linkId: string, status: "accepted" | "declined") {
    await supabase.from("buddy_links").update({ status }).eq("id", linkId);
    load();
  }

  async function unlink(linkId: string) {
    await supabase.from("buddy_links").delete().eq("id", linkId);
    load();
  }

  const incoming = links.filter((l) => l.status === "pending" && l.addressee_id === userId);
  const outgoing = links.filter((l) => l.status === "pending" && l.requester_id === userId);
  const accepted = links.filter((l) => l.status === "accepted");

  if (loading) return <div className="max-w-3xl mx-auto px-5 py-10 text-sm" style={{ color: "var(--ink-soft)" }}>Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      <div className="flex items-baseline gap-2 mb-5">
        <span className="font-display font-semibold text-xl">Ipon</span>
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>your cutoff, tracked</span>
      </div>
      <NavTabs />

      <h1 className="font-display font-semibold text-2xl mb-5">Buddy</h1>

      {/* Invite form */}
      <div className="rounded-card border p-5 mb-5" style={{ background: "var(--paper-raised)", borderColor: "var(--line)" }}>
        <p className="font-semibold text-sm mb-3">Invite a buddy</p>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Their Ipon account email"
            className="flex-1 rounded-xl px-3 py-2.5 text-sm border" style={S} />
          <button type="submit" className="font-bold rounded-xl px-4 text-sm text-white" style={{ background: "var(--jade)" }}>Invite</button>
        </form>
        {msg && <p className="text-sm mt-2" style={{ color: msg.startsWith("✓") ? "var(--jade)" : "var(--coral)" }}>{msg}</p>}
      </div>

      {/* Incoming invites */}
      {incoming.map((l) => (
        <div key={l.id} className="rounded-card border p-4 mb-3 flex items-center justify-between"
          style={{ background: "var(--plum-soft)", borderColor: "var(--plum)" }}>
          <p className="text-sm">
            <strong>{profiles[l.requester_id]?.full_name ?? profiles[l.requester_id]?.email}</strong> wants to be your buddy
          </p>
          <div className="flex gap-2">
            <button onClick={() => respond(l.id, "accepted")}
              className="text-sm font-bold rounded-lg px-3 py-1.5 text-white" style={{ background: "var(--jade)" }}>Accept</button>
            <button onClick={() => respond(l.id, "declined")}
              className="text-sm font-semibold rounded-lg px-3 py-1.5 border" style={{ borderColor: "var(--line)" }}>Decline</button>
          </div>
        </div>
      ))}

      {/* Outgoing pending */}
      {outgoing.map((l) => (
        <div key={l.id} className="rounded-card border border-dashed p-4 mb-3 text-sm" style={{ borderColor: "var(--line)", color: "var(--ink-soft)" }}>
          Invite sent to <strong>{profiles[l.addressee_id]?.email}</strong> — waiting for them to accept.
        </div>
      ))}

      {/* No connections */}
      {accepted.length === 0 && incoming.length === 0 && outgoing.length === 0 && (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>No buddy linked yet. Invite someone above to get started.</p>
      )}

      {/* Accepted — combined dashboard */}
      {accepted.map((l) => {
        const otherId = l.requester_id === userId ? l.addressee_id : l.requester_id;
        const buddy = profiles[otherId];
        const pair = sides[l.id];
        const combinedSaved = pair ? pair[0].savings + pair[1].savings : 0;
        const combinedTarget = pair ? pair[0].target + pair[1].target : 0;

        return (
          <div key={l.id} className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-sm">Linked with {buddy?.full_name ?? buddy?.email}</p>
              <button onClick={() => unlink(l.id)} className="text-xs font-bold" style={{ color: "var(--coral)" }}>Unlink</button>
            </div>

            {/* Combined hero */}
            <div className="rounded-3xl p-6 text-white mb-4" style={{ background: "linear-gradient(135deg, var(--jade-deep), var(--jade) 80%)" }}>
              <p className="text-xs opacity-80 mb-1">Combined, this cutoff</p>
              <h2 className="font-display font-semibold mb-1" style={{ fontSize: "clamp(18px,3vw,24px)" }}>
                ₱{combinedSaved.toLocaleString()} saved of ₱{combinedTarget.toLocaleString()}
              </h2>
            </div>

            {/* Side by side */}
            {pair && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {pair.map((side, i) => (
                  <div key={i} className="rounded-card border p-5"
                    style={{ background: "var(--paper-raised)", borderColor: "var(--line)", borderTop: `3px solid ${i === 0 ? "var(--jade)" : "var(--plum)"}` }}>
                    <p className="font-bold text-sm mb-3">{side.label}</p>
                    {[
                      { label: "Income logged", val: side.income, bold: true },
                      { label: "Savings", val: side.savings, color: "var(--jade)" },
                      { label: "Bills", val: side.bills },
                      { label: "Groceries", val: side.groceries },
                      { label: "Available cash", val: side.available, color: "var(--gold-deep)" },
                    ].map((row) => (
                      <div key={row.label} className="flex justify-between items-baseline py-1.5 border-b last:border-b-0" style={{ borderColor: "var(--line)" }}>
                        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{row.label}</span>
                        <span className="font-semibold text-sm" style={{ color: row.color ?? "var(--ink)", fontFamily: row.bold ? "var(--font-display, Fraunces, serif)" : undefined }}>
                          ₱{row.val.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
