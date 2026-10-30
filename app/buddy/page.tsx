'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/money';
import BottomSheet from '@/components/BottomSheet';
import { useDataVersion } from '@/components/DataContext';
import { todayLocal, frequencyLabel } from '@/lib/dates';

export default function BuddyPage() {
  const { dataVersion, notifyDataChanged } = useDataVersion();
  const [user, setUser] = useState<any>(null);
  const [buddyProfile, setBuddyProfile] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [activeLink, setActiveLink] = useState<any>(null);

  // Pending Invites State
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [sentInvites, setSentInvites] = useState<any[]>([]);

  // Modals and Forms
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  // Joint Goals State & Modals
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<any>(null);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDueDate, setGoalDueDate] = useState('');
  const [goalErrorMsg, setGoalErrorMsg] = useState('');

  // Privacy Sharing Settings
  const [shareSavings, setShareSavings] = useState(true);
  const [shareProgress, setShareProgress] = useState(true);
  const [shareAvailable, setShareAvailable] = useState(false);
  const [shareBills, setShareBills] = useState(false);
  const [shareMood, setShareMood] = useState(false);

  // Optional Sections Data
  const [historyBars, setHistoryBars] = useState<any[]>([]);
  const [sharedBills, setSharedBills] = useState<any[]>([]);
  const [buddyMoods, setBuddyMoods] = useState<any[]>([]);
  const [buddyGoals, setBuddyGoals] = useState<any[]>([]);

  // Status and Error Messages
  const [statusMsg, setStatusMsg] = useState('');
  const [inviteStatusMsg, setInviteStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchBuddyData();
    markNotificationsRead();
  }, [dataVersion]);

  const markNotificationsRead = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id);
  };

  const fetchBuddyData = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;
    setUser(currentUser);

    // 1. Fetch Active Accepted Buddy Link
    const { data: link } = await supabase
      .from('buddy_links')
      .select('*')
      .or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`)
      .eq('status', 'accepted')
      .maybeSingle();

    setActiveLink(link);

    if (link) {
      const buddyId = link.requester_id === currentUser.id ? link.addressee_id : link.requester_id;

      // Fetch Buddy Profile
      const { data: bProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', buddyId)
        .maybeSingle();

      setBuddyProfile(bProfile);

      // Fetch Side-by-Side Overview via RPC
      const { data: ovData, error: ovErr } = await supabase.rpc('get_buddy_overview', {
        p_buddy: buddyId,
      });

      if (ovErr) {
        setStatusMsg(ovErr.message);
      } else if (ovData?.[0]) {
        setOverview(ovData[0]);
      }

      // Fetch Optional Sections Data via RPCs
      const [{ data: hData }, { data: bData }, { data: mData }, { data: gData }] = await Promise.all([
        supabase.rpc('get_buddy_history', { p_buddy: buddyId, p_limit: 6 }),
        supabase.rpc('get_buddy_shared_bills', { p_buddy: buddyId }),
        supabase.rpc('get_buddy_mood', { p_buddy: buddyId }),
        supabase.rpc('get_buddy_goals', { p_buddy: buddyId }),
      ]);

      if (hData) setHistoryBars(hData);
      if (bData) setSharedBills(bData);
      if (mData) setBuddyMoods(mData);
      if (gData) setBuddyGoals(gData);
    } else {
      setBuddyProfile(null);
      setOverview(null);
      setHistoryBars([]);
      setSharedBills([]);
      setBuddyMoods([]);
      setBuddyGoals([]);
    }

    // 2. Fetch Pending Incoming & Sent Requests
    const [{ data: requests }, { data: sent }] = await Promise.all([
      supabase
        .from('buddy_links')
        .select('*, profiles!requester_id(email, display_name)')
        .eq('addressee_id', currentUser.id)
        .eq('status', 'pending'),
      supabase
        .from('buddy_links')
        .select('*, profiles!addressee_id(email, display_name)')
        .eq('requester_id', currentUser.id)
        .eq('status', 'pending'),
    ]);

    setPendingRequests(requests || []);
    setSentInvites(sent || []);

    // 3. Fetch Privacy Settings
    const { data: sharing } = await supabase
      .from('buddy_sharing')
      .select('*')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (sharing) {
      setShareSavings(sharing.share_savings);
      setShareProgress(sharing.share_progress);
      setShareAvailable(sharing.share_available);
      setShareBills(sharing.share_bills);
      setShareMood(sharing.share_mood);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !inviteEmail.trim()) return;

    setLoading(true);
    setInviteStatusMsg('');

    const { data: foundUser, error: searchErr } = await supabase.rpc('find_user_by_email', {
      p_email: inviteEmail.trim().toLowerCase(),
    });

    const targetUser = foundUser?.[0];

    if (searchErr || !targetUser) {
      setInviteStatusMsg('No account found with that email address.');
      setLoading(false);
      return;
    }

    if (targetUser.id === user.id) {
      setInviteStatusMsg('You cannot send a buddy invite to yourself.');
      setLoading(false);
      return;
    }

    const { error: insertErr } = await supabase.from('buddy_links').insert([
      { requester_id: user.id, addressee_id: targetUser.id, status: 'pending' },
    ]);

    if (insertErr) {
      if (insertErr.code === '23505') {
        setInviteStatusMsg('An invite is already pending or a link already exists.');
      } else {
        setInviteStatusMsg(insertErr.message);
      }
    } else {
      setInviteStatusMsg('Invitation sent successfully!');
      setInviteEmail('');
      setIsInviteModalOpen(false);
      notifyDataChanged();
    }
    setLoading(false);
  };

  const handleAcceptRequest = async (linkId: string) => {
    const { error } = await supabase.from('buddy_links').update({ status: 'accepted' }).eq('id', linkId);
    if (error) setStatusMsg(error.message);
    else notifyDataChanged();
  };

  const handleDeclineRequest = async (linkId: string) => {
    const { error } = await supabase.from('buddy_links').update({ status: 'declined' }).eq('id', linkId);
    if (error) setStatusMsg(error.message);
    else notifyDataChanged();
  };

  const handleCancelInvite = async (linkId: string) => {
    const { error } = await supabase.from('buddy_links').delete().eq('id', linkId);
    if (error) setStatusMsg(error.message);
    else notifyDataChanged();
  };

  const handleUnlink = async () => {
    if (!activeLink) return;
    if (!window.confirm('Are you sure you want to unlink your buddy?')) return;

    const { error } = await supabase.from('buddy_links').delete().eq('id', activeLink.id);
    if (error) setStatusMsg(error.message);
    else notifyDataChanged();
  };

  const handleSaveSharing = async () => {
    if (!user) return;
    const { error } = await supabase.from('buddy_sharing').upsert(
      {
        user_id: user.id,
        share_savings: shareSavings,
        share_progress: shareProgress,
        share_available: shareAvailable,
        share_bills: shareBills,
        share_mood: shareMood,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) setStatusMsg(error.message);
    else {
      setIsSettingsModalOpen(false);
      notifyDataChanged();
    }
  };

  const handleSendCheer = async (message: string) => {
    if (!buddyProfile) return;
    const { error } = await supabase.rpc('send_buddy_cheer', {
      p_buddy: buddyProfile.id,
      p_message: message,
    });

    if (error) {
      setStatusMsg(error.message);
    } else {
      setStatusMsg('Cheer sent successfully!');
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  // Goal Modal Handlers
  const openNewGoalModal = () => {
    setEditingGoal(null);
    setGoalName('');
    setGoalTarget('');
    setGoalDueDate('');
    setGoalErrorMsg('');
    setIsGoalModalOpen(true);
  };

  const openEditGoalModal = (g: any) => {
    setEditingGoal(g);
    setGoalName(g.name || '');
    setGoalTarget(String(g.target_amount || ''));
    setGoalDueDate(g.due_date || '');
    setGoalErrorMsg('');
    setIsGoalModalOpen(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setGoalErrorMsg('');

    const targetVal = parseFloat(goalTarget);
    if (isNaN(targetVal) || targetVal <= 0) {
      setGoalErrorMsg('Target amount must be greater than 0.');
      return;
    }

    if (!activeLink) {
      setGoalErrorMsg('No active buddy link found.');
      return;
    }

    if (editingGoal) {
      const { error } = await supabase
        .from('buddy_goals')
        .update({
          name: goalName,
          target_amount: targetVal,
          due_date: goalDueDate || null,
        })
        .eq('id', editingGoal.goal_id);

      if (error) {
        setGoalErrorMsg(error.message);
      } else {
        setIsGoalModalOpen(false);
        notifyDataChanged();
      }
    } else {
      const { error } = await supabase.from('buddy_goals').insert([
        {
          link_id: activeLink.id,
          name: goalName,
          target_amount: targetVal,
          due_date: goalDueDate || null,
          created_by: user.id,
          start_date: todayLocal(),
        },
      ]);

      if (error) {
        setGoalErrorMsg(error.message);
      } else {
        setIsGoalModalOpen(false);
        notifyDataChanged();
      }
    }
  };

  const handleArchiveGoal = async () => {
    if (!editingGoal) return;
    setGoalErrorMsg('');

    const { error } = await supabase
      .from('buddy_goals')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', editingGoal.goal_id);

    if (error) {
      setGoalErrorMsg(error.message);
    } else {
      setIsGoalModalOpen(false);
      notifyDataChanged();
    }
  };

  const handleDeleteGoal = async () => {
    if (!editingGoal) return;
    if (!window.confirm(`Delete joint goal "${editingGoal.name}"?`)) return;

    setGoalErrorMsg('');

    const { error } = await supabase
      .from('buddy_goals')
      .delete()
      .eq('id', editingGoal.goal_id);

    if (error) {
      setGoalErrorMsg(error.message);
    } else {
      setIsGoalModalOpen(false);
      notifyDataChanged();
    }
  };

  const getComparisonLine = () => {
    if (!overview || overview.b_cutoff_saved === null) return null;
    const diff = Number(overview.my_cutoff_saved) - Number(overview.b_cutoff_saved);
    if (diff > 0) return `You're ${formatMoney(diff)} ahead this cutoff`;
    if (diff < 0) return `Your buddy is ${formatMoney(Math.abs(diff))} ahead, you've got this`;
    return 'Neck and neck';
  };

  const myProgressPercent = overview?.my_cutoff_target
    ? Math.min(100, Math.round((Number(overview.my_cutoff_saved) / Number(overview.my_cutoff_target)) * 100))
    : 0;

  const buddyProgressPercent = overview?.b_cutoff_target
    ? Math.min(100, Math.round((Number(overview.b_cutoff_saved) / Number(overview.b_cutoff_target)) * 100))
    : 0;

  // Explicitly Typed Settings Configuration to avoid TS2349
  const privacyControls: Array<{
    label: string;
    state: boolean;
    set: (val: boolean) => void;
  }> = [
    { label: 'Share my total savings', state: shareSavings, set: setShareSavings },
    { label: 'Share my cutoff progress & streak', state: shareProgress, set: setShareProgress },
    { label: 'Share my available balance', state: shareAvailable, set: setShareAvailable },
    { label: 'Share my shared bills', state: shareBills, set: setShareBills },
    { label: 'Share my mood entries', state: shareMood, set: setShareMood },
  ];

  return (
    <div className="p-4 space-y-5">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#143f34]">Buddy Tracker</h1>
          <p className="text-xs text-[#143f34]/60 font-medium">Shared Savings & Accountability</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="p-2 bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl text-xs font-bold text-[#1f5d4c] hover:bg-[#1f5d4c]/5 min-h-[44px]"
          >
            ⚙️ Settings
          </button>
          {!activeLink && (
            <button
              onClick={() => { setInviteStatusMsg(''); setIsInviteModalOpen(true); }}
              className="px-4 py-2 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-xs min-h-[44px]"
            >
              + Link Buddy
            </button>
          )}
        </div>
      </div>

      {statusMsg && (
        <p className="text-xs p-3 rounded-xl font-bold bg-[#1f5d4c]/10 text-[#143f34] border border-[#1f5d4c]/20">
          {statusMsg}
        </p>
      )}

      {/* Pending Incoming Requests */}
      {pendingRequests.length > 0 && (
        <div className="p-4 bg-[#e2a63f]/20 border border-[#e2a63f]/40 rounded-2xl space-y-3">
          <span className="text-xs font-bold text-[#143f34] uppercase tracking-wider block">
            Incoming Buddy Requests ({pendingRequests.length})
          </span>
          {pendingRequests.map((req) => (
            <div key={req.id} className="flex items-center justify-between bg-[#f6f3ea] p-3 rounded-xl border border-[#1f5d4c]/10">
              <span className="text-xs font-semibold text-[#143f34]">
                {req.profiles?.display_name || req.profiles?.email || 'A user'} wants to link as your savings buddy
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAcceptRequest(req.id)}
                  className="px-3 py-1 bg-[#1f5d4c] text-[#f6f3ea] text-xs font-bold rounded-lg min-h-[36px]"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleDeclineRequest(req.id)}
                  className="px-3 py-1 bg-[#c85c46]/20 text-[#c85c46] text-xs font-bold rounded-lg min-h-[36px]"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending Sent Invites */}
      {sentInvites.length > 0 && !activeLink && (
        <div className="p-4 bg-[#f6f3ea] border border-[#1f5d4c]/15 rounded-2xl space-y-3">
          <span className="text-xs font-bold text-[#143f34] uppercase tracking-wider block">
            Sent Invites ({sentInvites.length})
          </span>
          {sentInvites.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between bg-[#f6f3ea] p-3 rounded-xl border border-[#1f5d4c]/10">
              <span className="text-xs font-semibold text-[#143f34]">
                Invite sent to {inv.profiles?.display_name || inv.profiles?.email || 'User'}
              </span>
              <button
                onClick={() => handleCancelInvite(inv.id)}
                className="px-3 py-1 bg-[#c85c46]/15 text-[#c85c46] text-xs font-bold rounded-lg min-h-[36px]"
              >
                Cancel Invite
              </button>
            </div>
          ))}
        </div>
      )}

      {/* You vs Buddy Card */}
      {activeLink && overview ? (
        <div className="bg-[#1f5d4c] text-[#f6f3ea] p-6 rounded-3xl shadow-xl space-y-5">
          <div className="flex justify-between items-center border-b border-[#f6f3ea]/15 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#e2a63f]">You vs Buddy</span>
            <button onClick={handleUnlink} className="text-xs text-[#c85c46] hover:underline font-bold">
              Unlink
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* You Column */}
            <div className="space-y-3 border-r border-[#f6f3ea]/15 pr-2">
              <span className="text-xs font-bold text-[#e2a63f] block truncate">You</span>
              <div>
                <span className="text-[10px] uppercase text-[#f6f3ea]/60 block font-bold">Total Savings</span>
                <p className="text-lg font-bold">{formatMoney(Number(overview.my_total_savings))}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-[#f6f3ea]/60 block font-bold">Available</span>
                <p className="text-sm font-semibold">{formatMoney(Number(overview.my_available))}</p>
              </div>
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[10px]">
                  <span>Cutoff Progress</span>
                  <span>{myProgressPercent}%</span>
                </div>
                <div className="w-full bg-[#143f34] rounded-full h-2 overflow-hidden">
                  <div className="bg-[#e2a63f] h-full rounded-full" style={{ width: `${myProgressPercent}%` }} />
                </div>
                <span className="text-[10px] text-[#f6f3ea]/70 block">
                  {formatMoney(Number(overview.my_cutoff_saved))} of {formatMoney(Number(overview.my_cutoff_target))}
                </span>
              </div>
              <span className="text-xs block pt-1 font-bold">🔥 Streak: {overview.my_streak}</span>
            </div>

            {/* Buddy Column */}
            <div className="space-y-3 pl-2">
              <span className="text-xs font-bold text-[#e2a63f] block truncate">
                {buddyProfile?.display_name || buddyProfile?.email?.split('@')[0] || 'Buddy'}
              </span>

              <div>
                <span className="text-[10px] uppercase text-[#f6f3ea]/60 block font-bold">Total Savings</span>
                <p className="text-lg font-bold">
                  {overview.b_total_savings !== null ? (
                    formatMoney(Number(overview.b_total_savings))
                  ) : (
                    <span className="text-xs bg-[#143f34] px-2 py-0.5 rounded-full text-[#e2a63f]">🔒 Not shared</span>
                  )}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase text-[#f6f3ea]/60 block font-bold">Available</span>
                <p className="text-sm font-semibold">
                  {overview.b_available !== null ? (
                    formatMoney(Number(overview.b_available))
                  ) : (
                    <span className="text-xs bg-[#143f34] px-2 py-0.5 rounded-full text-[#e2a63f]">🔒 Not shared</span>
                  )}
                </p>
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[10px]">
                  <span>Cutoff Progress</span>
                  <span>{overview.b_cutoff_saved !== null ? `${buddyProgressPercent}%` : '🔒'}</span>
                </div>
                <div className="w-full bg-[#143f34] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#e2a63f] h-full rounded-full"
                    style={{ width: `${overview.b_cutoff_saved !== null ? buddyProgressPercent : 0}%` }}
                  />
                </div>
                <span className="text-[10px] text-[#f6f3ea]/70 block">
                  {overview.b_cutoff_saved !== null ? (
                    `${formatMoney(Number(overview.b_cutoff_saved))} of ${formatMoney(Number(overview.b_cutoff_target))}`
                  ) : (
                    <span className="text-[10px] bg-[#143f34] px-1.5 py-0.5 rounded text-[#e2a63f]">🔒 Not shared</span>
                  )}
                </span>
              </div>

              <span className="text-xs block pt-1 font-bold">
                {overview.b_streak !== null ? `🔥 Streak: ${overview.b_streak}` : '🔒 Streak private'}
              </span>
            </div>
          </div>

          {/* Friendly Comparison Banner */}
          {getComparisonLine() && (
            <div className="bg-[#143f34] p-3 rounded-2xl text-center border border-[#e2a63f]/20">
              <p className="text-xs font-bold text-[#e2a63f]">{getComparisonLine()}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-6 rounded-3xl text-center space-y-3">
          <span className="text-3xl block">🤝</span>
          <h2 className="font-serif text-lg font-bold text-[#143f34]">No Buddy Linked</h2>
          <p className="text-xs text-[#143f34]/70 max-w-xs mx-auto">
            Link accounts with a partner or friend to compare savings progress, shared goals, and hold each other accountable.
          </p>
          <button
            onClick={() => { setInviteStatusMsg(''); setIsInviteModalOpen(true); }}
            className="px-4 py-2 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-xs min-h-[44px]"
          >
            + Link Savings Buddy
          </button>
        </div>
      )}

      {/* Cheers Controls */}
      {activeLink && buddyProfile && (
        <div className="space-y-2">
          <h2 className="font-serif text-sm font-bold text-[#143f34]">Send Encouragement</h2>
          <div className="flex gap-2">
            <button
              onClick={() => handleSendCheer('👏 Great job on saving!')}
              className="flex-1 py-2.5 bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl text-xs font-bold text-[#1f5d4c] hover:bg-[#1f5d4c]/5 min-h-[44px]"
            >
              👏 Cheer
            </button>
            <button
              onClick={() => handleSendCheer('💪 Keep up the streak!')}
              className="flex-1 py-2.5 bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl text-xs font-bold text-[#1f5d4c] hover:bg-[#1f5d4c]/5 min-h-[44px]"
            >
              💪 Nudge
            </button>
            <button
              onClick={() => handleSendCheer('🎉 Let’s celebrate!')}
              className="flex-1 py-2.5 bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl text-xs font-bold text-[#1f5d4c] hover:bg-[#1f5d4c]/5 min-h-[44px]"
            >
              🎉 Celebrate
            </button>
          </div>
        </div>
      )}

      {/* Joint Goals Section */}
      {activeLink && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-serif text-sm font-bold text-[#143f34]">Joint Savings Goals</h2>
            <button
              onClick={openNewGoalModal}
              className="text-xs font-bold text-[#1f5d4c] hover:underline min-h-[36px]"
            >
              + New Goal
            </button>
          </div>

          {buddyGoals.length === 0 ? (
            <p className="text-xs text-[#143f34]/60 bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl text-center">
              No joint goals yet. Create one to save together!
            </p>
          ) : (
            <div className="space-y-3">
              {buddyGoals.map((g) => {
                const targetNum = Number(g.target_amount || 1);
                const totalNum = Number(g.total_saved || 0);
                const mySavedNum = Number(g.my_saved || 0);
                const buddySavedNum = g.buddy_saved !== null ? Number(g.buddy_saved) : null;
                const progressPct = Math.min(100, Math.round((totalNum / targetNum) * 100));

                return (
                  <div key={g.goal_id} className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-sm text-[#143f34]">{g.name}</p>
                        {g.due_date && (
                          <span className="text-[10px] text-[#143f34]/60">Due: {g.due_date}</span>
                        )}
                      </div>
                      <div className="text-right space-y-1">
                        <span className="font-serif font-extrabold text-[#1f5d4c] text-sm block">
                          {formatMoney(totalNum)} / {formatMoney(targetNum)}
                        </span>
                        <button
                          onClick={() => openEditGoalModal(g)}
                          className="px-2 py-0.5 bg-[#1f5d4c]/10 text-[#1f5d4c] text-[10px] font-bold rounded-lg min-h-[36px]"
                        >
                          ✏️ Edit
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 pt-1">
                      <div className="w-full bg-[#143f34]/10 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-[#1f5d4c] h-full rounded-full transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-semibold text-[#143f34]/70">
                        You {formatMoney(mySavedNum)} · Buddy {buddySavedNum !== null ? formatMoney(buddySavedNum) : 'Not shared'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Optional Section: History Chart */}
      {activeLink && historyBars.length > 0 && (
        <div className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl space-y-3">
          <h2 className="font-serif text-xs font-bold text-[#143f34] uppercase tracking-wider">
            Savings History (Last {historyBars.length} Cutoffs)
          </h2>
          <div className="space-y-2 text-xs">
            {historyBars.map((h, idx) => (
              <div key={idx} className="flex justify-between items-center border-b border-[#1f5d4c]/10 pb-1.5 last:border-0">
                <span className="font-medium text-[#143f34]/70">{h.my_start || `Cutoff ${h.idx}`}</span>
                <div className="flex gap-3 font-bold">
                  <span className="text-[#1f5d4c]">Mine: {formatMoney(Number(h.my_saved || 0))}</span>
                  <span className="text-[#e2a63f]">
                    Buddy: {h.b_saved !== null ? formatMoney(Number(h.b_saved)) : '🔒'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optional Section: Shared Bills */}
      {activeLink && sharedBills.length > 0 && (
        <div className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl space-y-3">
          <h2 className="font-serif text-xs font-bold text-[#143f34] uppercase tracking-wider">
            Buddy's Shared Bills ({sharedBills.length})
          </h2>
          <div className="space-y-2 text-xs">
            {sharedBills.map((b, idx) => (
              <div key={idx} className="flex justify-between items-center border-b border-[#1f5d4c]/10 pb-1.5 last:border-0">
                <div>
                  <p className="font-bold text-[#143f34]">{b.name}</p>
                  <span className="text-[10px] text-[#143f34]/60">Due {b.next_due_date} · {frequencyLabel(b.frequency)}</span>
                </div>
                <div className="text-right">
                  <span className="font-extrabold text-[#c85c46] block">{formatMoney(Number(b.expected_amount))}</span>
                  <span className="text-[10px] text-[#1f5d4c] font-bold">Split 50/50: {formatMoney(Number(b.expected_amount) / 2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optional Section: 7-Day Mood Strip */}
      {activeLink && buddyMoods.length > 0 && (
        <div className="bg-[#f6f3ea] border border-[#1f5d4c]/15 p-4 rounded-2xl space-y-2">
          <h2 className="font-serif text-xs font-bold text-[#143f34] uppercase tracking-wider">
            Buddy's 7-Day Mood Log
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {buddyMoods.map((m, idx) => (
              <div key={idx} className="min-w-[65px] bg-[#f6f3ea] border border-[#1f5d4c]/15 p-2 rounded-xl text-center space-y-1">
                <span className="text-sm font-bold text-[#1f5d4c] block">{m.mood}</span>
                <span className="text-[10px] text-[#143f34]/60 block">{m.log_date?.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Joint Goal Sheet */}
      <BottomSheet
        isOpen={isGoalModalOpen}
        onClose={() => setIsGoalModalOpen(false)}
        title={editingGoal ? 'Edit Joint Goal' : 'New Joint Goal'}
      >
        <form onSubmit={handleSaveGoal} className="space-y-4">
          {goalErrorMsg && (
            <p className="text-xs text-[#c85c46] font-bold p-2.5 bg-[#c85c46]/10 rounded-xl">
              {goalErrorMsg}
            </p>
          )}

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Goal Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Japan Vacation Fund"
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Target Amount (₱)</label>
            <input
              type="number"
              inputMode="decimal"
              required
              placeholder="50000"
              value={goalTarget}
              onChange={(e) => setGoalTarget(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Due Date (Optional)</label>
            <input
              type="date"
              value={goalDueDate}
              onChange={(e) => setGoalDueDate(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]"
          >
            {editingGoal ? 'Save Goal Changes' : 'Create Joint Goal'}
          </button>

          {editingGoal && (
            <div className="flex gap-2 pt-2 border-t border-[#1f5d4c]/10">
              <button
                type="button"
                onClick={handleArchiveGoal}
                className="flex-1 py-2 px-3 bg-[#e2a63f]/20 text-[#143f34] font-bold rounded-xl text-xs min-h-[44px]"
              >
                Archive
              </button>
              <button
                type="button"
                onClick={handleDeleteGoal}
                className="flex-1 py-2 px-3 bg-[#c85c46]/15 text-[#c85c46] font-bold rounded-xl text-xs min-h-[44px]"
              >
                Delete Goal
              </button>
            </div>
          )}
        </form>
      </BottomSheet>

      {/* Link Buddy Sheet */}
      <BottomSheet isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} title="Link Savings Buddy">
        <form onSubmit={handleSendInvite} className="space-y-4">
          <p className="text-xs text-[#143f34]/70">
            Enter your buddy's email address. They must have an account to accept your request.
          </p>

          <div>
            <label className="block text-xs font-bold text-[#143f34] mb-1">Buddy Email Address</label>
            <input
              type="email"
              required
              placeholder="buddy@gmail.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
            />
          </div>

          {inviteStatusMsg && (
            <p className="text-xs p-2.5 rounded-xl border font-medium bg-[#1f5d4c]/10 text-[#143f34] border-[#1f5d4c]/20">
              {inviteStatusMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px] disabled:opacity-50"
          >
            {loading ? 'Sending Request...' : 'Send Buddy Request'}
          </button>
        </form>
      </BottomSheet>

      {/* Sharing Settings Sheet */}
      <BottomSheet isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="Buddy Privacy Controls">
        <div className="space-y-4">
          <p className="text-xs text-[#143f34]/80">
            Your buddy only sees what you switch on. They never see your income, individual entries or notes.
          </p>

          <div className="space-y-2">
            {privacyControls.map(({ label, state, set }) => (
              <div key={label} className="flex justify-between items-center p-3 bg-[#f6f3ea] border border-[#1f5d4c]/15 rounded-xl">
                <span className="text-xs font-bold text-[#143f34]">{label}</span>
                <input
                  type="checkbox"
                  checked={state}
                  onChange={(e) => set(e.target.checked)}
                  className="w-5 h-5 accent-[#1f5d4c]"
                />
              </div>
            ))}
          </div>

          <button
            onClick={handleSaveSharing}
            className="w-full py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-sm min-h-[44px]"
          >
            Save Privacy Settings
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}