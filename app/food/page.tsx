'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { todayLocal, addDays } from '@/lib/dates';
import { useDataVersion } from '@/components/DataContext';
import { useQuickActions } from '@/components/QuickActionsContext';

export default function FoodPage() {
  const { dataVersion, notifyDataChanged } = useDataVersion();
  const { openSheet } = useQuickActions();
  const [foodEntries, setFoodEntries] = useState<any[]>([]);
  const [moodLogs, setMoodLogs] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const today = todayLocal();

  useEffect(() => {
    fetchFoodAndMood();
  }, [dataVersion]);

  const fetchFoodAndMood = async () => {
    setErrorMsg('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const startDate = addDays(today, -13);

    const [{ data: fData, error: fErr }, { data: mData, error: mErr }] = await Promise.all([
      supabase.from('food_entries').select('*').eq('user_id', user.id).order('log_date', { ascending: false }),
      supabase
        .from('mood_entries')
        .select('*')
        .eq('user_id', user.id)
        .gte('log_date', startDate)
        .lte('log_date', today)
        .order('log_date', { ascending: false }),
    ]);

    if (fErr) setErrorMsg(fErr.message);
    if (mErr) setErrorMsg(mErr.message);

    const existingToday = (fData || []).find((e) => e.log_date === today);
    if (!existingToday) {
      setFoodEntries([{ log_date: today, breakfast: '', brunch: '', lunch: '', merienda: '', dinner: '', extra: '' }, ...(fData || [])]);
    } else {
      setFoodEntries(fData || []);
    }

    setMoodLogs(mData || []);
  };

  const handleBlurSave = async (logDate: string, field: string, value: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('food_entries').upsert(
      {
        user_id: user.id,
        log_date: logDate,
        [field]: value,
      },
      { onConflict: 'user_id,log_date' }
    );

    if (error) setErrorMsg(error.message);
  };

  const handleDeleteFoodDay = async (logDate: string) => {
    if (!window.confirm(`Delete food logs for ${logDate}?`)) return;
    setErrorMsg('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('food_entries')
      .delete()
      .eq('user_id', user.id)
      .eq('log_date', logDate);

    if (error) {
      setErrorMsg(error.message);
    } else {
      notifyDataChanged();
    }
  };

  const getEmoji = (m: string) => {
    if (m === 'Happy') return '😊';
    if (m === 'Okay') return '😐';
    if (m === 'Stressed') return '😫';
    if (m === 'Sad') return '😢';
    return '😴';
  };

  const last14Days = Array.from({ length: 14 }).map((_, i) => addDays(today, -i));

  return (
    <div className="p-4 space-y-5">
      <h1 className="font-serif text-2xl font-bold text-[#143f34]">Food & Mood Tracker</h1>

      {errorMsg && <p className="text-xs text-[#c85c46] font-bold p-2.5 bg-[#c85c46]/10 rounded-xl">{errorMsg}</p>}

      {/* 14-Day Mood Strip */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <h2 className="font-serif text-sm font-bold text-[#143f34]">14-Day Mood Log</h2>
          <button
            onClick={() => openSheet('mood')}
            className="text-xs font-bold text-[#1f5d4c] hover:underline min-h-[36px]"
          >
            + Log Mood
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {last14Days.map((dateStr) => {
            const moodObj = moodLogs.find((m) => m.log_date === dateStr);
            return (
              <div
                key={dateStr}
                onClick={() => openSheet('mood', dateStr)}
                className="min-w-[70px] bg-[#f6f3ea] border border-[#1f5d4c]/15 p-2 rounded-2xl text-center cursor-pointer hover:bg-[#1f5d4c]/5 space-y-1"
              >
                <span className="text-xl block">{moodObj ? getEmoji(moodObj.mood) : '➕'}</span>
                <span className="text-[10px] font-bold text-[#143f34] block truncate">
                  {dateStr === today ? 'Today' : dateStr.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Food Day Cards */}
      <div className="space-y-4">
        <h2 className="font-serif text-sm font-bold text-[#143f34]">Daily Meals</h2>
        {foodEntries.map((entry) => (
          <div key={entry.log_date} className="bg-[#f6f3ea] border border-[#1f5d4c]/20 p-4 rounded-2xl space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-[#1f5d4c]">
                {entry.log_date === today ? '📍 Today' : entry.log_date}
              </span>
              {entry.id && (
                <button
                  onClick={() => handleDeleteFoodDay(entry.log_date)}
                  className="text-[10px] text-[#c85c46] font-bold hover:underline min-h-[36px]"
                >
                  Delete Day
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {['breakfast', 'brunch', 'lunch', 'merienda', 'dinner', 'extra'].map((meal) => (
                <div key={meal}>
                  <label className="block text-[10px] uppercase font-bold text-[#143f34]/60 mb-1">{meal}</label>
                  <input
                    type="text"
                    defaultValue={entry[meal] || ''}
                    onBlur={(e) => handleBlurSave(entry.log_date, meal, e.target.value)}
                    placeholder="Log meal..."
                    className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/15 rounded-xl p-2 text-xs text-[#143f34]"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}