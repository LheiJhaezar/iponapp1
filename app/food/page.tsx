'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { todayLocal } from '@/lib/dates';

export default function FoodPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const today = todayLocal();

  useEffect(() => {
    fetchFoodEntries();
    window.addEventListener('ipon:data-changed', fetchFoodEntries);
    return () => window.removeEventListener('ipon:data-changed', fetchFoodEntries);
  }, []);

  const fetchFoodEntries = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('food_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('log_date', { ascending: false });

    const existingToday = (data || []).find((e) => e.log_date === today);
    if (!existingToday) {
      setEntries([{ log_date: today, breakfast: '', brunch: '', lunch: '', merienda: '', dinner: '', extra: '' }, ...(data || [])]);
    } else {
      setEntries(data || []);
    }
  };

  const handleBlurSave = async (logDate: string, field: string, value: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('food_entries').upsert(
      {
        user_id: user.id,
        log_date: logDate,
        [field]: value,
      },
      { onConflict: 'user_id,log_date' }
    );
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="font-display font-semibold text-2xl text-jade">Food Tracker</h1>

      <div className="space-y-4">
        {entries.map((entry) => (
          <div key={entry.log_date} className="bg-paper border border-line p-4 rounded-card space-y-3">
            <span className="text-xs font-bold text-jade">
              {entry.log_date === today ? '📍 Today' : entry.log_date}
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {['breakfast', 'brunch', 'lunch', 'merienda', 'dinner', 'extra'].map((meal) => (
                <div key={meal}>
                  <label className="block text-[10px] uppercase font-bold text-jade/60 mb-1">{meal}</label>
                  <input
                    type="text"
                    defaultValue={entry[meal] || ''}
                    onBlur={(e) => handleBlurSave(entry.log_date, meal, e.target.value)}
                    placeholder="Log meal..."
                    className="w-full bg-paper border border-line rounded-xl p-2 text-xs text-jade"
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