'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import BottomSheet from '@/components/BottomSheet';

export default function BuddyPage() {
  const [user, setUser] = useState<any>(null);
  const [mySavings, setMySavings] = useState(0);
  const [buddySavings, setBuddySavings] = useState(0);
  const [buddyProfile, setBuddyProfile] = useState<any>(null);
  const [activeLink, setActiveLink] = useState<any>(null);

  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchBuddyData();
    markNotificationsRead();
  }, []);

  const markNotificationsRead = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id);
  };

  const fetchBuddyData = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;
    setUser(currentUser);

    const { data: myAllocations } = await supabase
      .from('allocations')
      .select('amount')
      .eq('user_id', currentUser.id)
      .eq('category', 'savings');

    const totalMine = (myAllocations || []).reduce((acc, curr) => acc + Number(curr.amount), 0);
    setMySavings(totalMine);

    const { data: link } = await supabase
      .from('buddy_links')
      .select('*')
      .or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`)
      .limit(1)
      .maybeSingle();

    setActiveLink(link);

    if (link && link.status === 'accepted') {
      const buddyId = link.requester_id === currentUser.id ? link.addressee_id : link.requester_id;

      const { data: bProf } = await supabase.from('profiles').select('*').eq('id', buddyId).maybeSingle();
      setBuddyProfile(bProf);

      const { data: buddyAllocations } = await supabase
        .from('allocations')
        .select('amount')
        .eq('user_id', buddyId)
        .eq('category', 'savings');

      const totalBuddy = (buddyAllocations || []).reduce((acc, curr) => acc + Number(curr.amount), 0);
      setBuddySavings(totalBuddy);
    } else {
      setBuddyProfile(null);
      setBuddySavings(0);
    }

    const { data: requests } = await supabase
      .from('buddy_links')
      .select('*, profiles!requester_id(email)')
      .eq('addressee_id', currentUser.id)
      .eq('status', 'pending');

    setPendingRequests(requests || []);
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !inviteEmail.trim()) return;

    setLoading(true);
    setStatusMsg('');

    const { data: foundUser, error: searchErr } = await supabase.rpc('find_user_by_email', {
      p_email: inviteEmail.trim(),
    });

    const targetUser = foundUser?.[0];

    if (searchErr || !targetUser) {
      setStatusMsg('No account found with that email address.');
      setLoading(false);
      return;
    }

    const { error: insertErr } = await supabase.from('buddy_links').insert([
      { requester_id: user.id, addressee_id: targetUser.id, status: 'pending' },
    ]);

    if (insertErr) {
      if (insertErr.code === '23505') {
        setStatusMsg('An invite is already pending or a link already exists.');
      } else {
        setStatusMsg(insertErr.message);
      }
    } else {
      setStatusMsg('Invite sent successfully!');
      setInviteEmail('');
      fetchBuddyData();
    }
    setLoading(false);
  };

  const handleAccept = async (id: string) => {
    await supabase.from('buddy_links').update({ status: 'accepted' }).eq('id', id);
    fetchBuddyData();
  };

  const handleDecline = async (id: string) => {
    await supabase.from('buddy_links').update({ status: 'declined' }).eq('id', id);
    fetchBuddyData();
  };

  const handleUnlink = async () => {
    if (activeLink) {
      await supabase.from('buddy_links').delete().eq('id', activeLink.id);
      fetchBuddyData();
    }
  };

  const jointSavings = mySavings + buddySavings;

  return (
    <div className="p-4 space-y-5">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-display font-semibold text-2xl text-jade">Buddy Tracker</h1>
          <p className="text-xs text-jade/60 font-medium">Shared Savings Journey</p>
        </div>
        {!activeLink && (
          <button
            onClick={() => setIsInviteOpen(true)}
            className="px-4 py-2 bg-jade text-paper font-bold rounded-xl text-xs min-h-[44px]"
          >
            + Link Buddy
          </button>
        )}
      </div>

      {pendingRequests.length > 0 && (
        <div className="p-4 bg-gold/20 border border-gold/40 rounded-card space-y-3">
          <span className="text-xs font-bold text-jade uppercase tracking-wider block">Incoming Invitations</span>
          {pendingRequests.map((req) => (
            <div key={req.id} className="flex items-center justify-between bg-paper p-3 rounded-xl border border-line">
              <span className="text-xs font-semibold text-jade">{req.profiles?.email || 'A user'}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(req.id)}
                  className="px-3 py-1 bg-jade text-paper text-xs font-bold rounded-lg min-h-[36px]"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleDecline(req.id)}
                  className="px-3 py-1 bg-coral/20 text-coral text-xs font-bold rounded-lg min-h-[36px]"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-jade text-paper p-6 rounded-card shadow-xl space-y-2">
        <span className="text-[11px] uppercase tracking-wider text-gold font-bold">Joint Total Savings</span>
        <h2 className="font-display font-semibold text-4xl">{formatMoney(jointSavings)}</h2>
        <p className="text-xs text-paper/80">
          {buddyProfile ? `Linked with ${buddyProfile.email}` : 'Link a buddy account to compare total savings.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-paper border border-line p-4 rounded-card space-y-1">
          <span className="text-[10px] uppercase font-bold text-jade">Your Balance</span>
          <p className="text-lg font-bold text-jade">{formatMoney(mySavings)}</p>
        </div>

        <div className="bg-paper border border-line p-4 rounded-card space-y-1">
          <span className="text-[10px] uppercase font-bold text-gold">
            {buddyProfile ? buddyProfile.email.split('@')[0] : 'No Buddy'}
          </span>
          <p className="text-lg font-bold text-jade">{formatMoney(buddySavings)}</p>
        </div>
      </div>

      {activeLink && activeLink.status === 'accepted' && (
        <div className="pt-2 flex justify-end">
          <button onClick={handleUnlink} className="px-4 py-2 bg-coral/15 text-coral font-bold text-xs rounded-xl min-h-[44px]">
            Unlink Buddy
          </button>
        </div>
      )}

      <BottomSheet isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)} title="Link Savings Buddy">
        <form onSubmit={handleSendInvite} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-jade mb-1">Buddy Email Address</label>
            <input
              type="email"
              required
              placeholder="buddy@gmail.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full bg-paper border border-line rounded-xl p-3 text-base text-jade"
            />
          </div>

          {statusMsg && <p className="text-xs font-bold text-coral">{statusMsg}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-jade text-paper font-bold rounded-xl text-sm min-h-[44px] disabled:opacity-50"
          >
            {loading ? 'Sending Request...' : 'Send Request'}
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}