'use client';

import React, { useState, useEffect } from 'react';
import BottomSheet from '@/components/BottomSheet';
import { supabase } from '@/lib/supabase/client';
import { todayLocal, addDays } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { useDataVersion } from '@/components/DataContext';

interface CutoffSheetProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'NEW' | 'EDIT';
  currentCutoff?: any;
  latestCutoff?: any;
  allCutoffs?: any[];
}

export default function CutoffSheet({
  isOpen,
  onClose,
  mode,
  currentCutoff,
  latestCutoff,
  allCutoffs = [],
}: CutoffSheetProps) {
  const { notifyDataChanged } = useDataVersion();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [targetAmount, setTargetAmount] = useState('5000');
  const [errorMsg, setErrorMsg] = useState('');
  const [warningMsg, setWarningMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setWarningMsg('');
      if (mode === 'EDIT' && currentCutoff) {
        setStartDate(currentCutoff.start_date || '');
        setEndDate(currentCutoff.end_date || '');
        setTargetAmount(String(currentCutoff.target_amount || '5000'));
      } else {
        if (latestCutoff?.end_date) {
          setStartDate(addDays(latestCutoff.end_date, 1));
        } else {
          setStartDate(todayLocal());
        }
        setEndDate('');
        setTargetAmount('5000');
      }
    }
  }, [isOpen, mode, currentCutoff, latestCutoff]);

  useEffect(() => {
    if (mode === 'EDIT' && currentCutoff && startDate && endDate) {
      checkExcludedEntries();
    } else {
      setWarningMsg('');
    }
  }, [startDate, endDate, mode, currentCutoff]);

  const checkExcludedEntries = async () => {
    if (!currentCutoff) return;
    const [{ count: incCount }, { count: allocCount }] = await Promise.all([
      supabase
        .from('income_entries')
        .select('*', { count: 'exact', head: true })
        .eq('cutoff_id', currentCutoff.id)
        .is('deleted_at', null)
        .or(`entry_date.lt.${startDate},entry_date.gt.${endDate}`),
      supabase
        .from('allocations')
        .select('*', { count: 'exact', head: true })
        .eq('cutoff_id', currentCutoff.id)
        .is('deleted_at', null)
        .or(`entry_date.lt.${startDate},entry_date.gt.${endDate}`),
    ]);

    const totalExcluded = (incCount || 0) + (allocCount || 0);
    if (totalExcluded > 0) {
      setWarningMsg(
        `⚠️ ${totalExcluded} ${
          totalExcluded === 1 ? 'entry falls' : 'entries fall'
        } outside the new range. They will stay in this cutoff unless you move them.`
      );
    } else {
      setWarningMsg('');
    }
  };

  const validate = (): boolean => {
    if (!startDate || !endDate) {
      setErrorMsg('Please specify both start and end dates.');
      return false;
    }

    if (endDate < startDate) {
      setErrorMsg('End date must be on or after the start date.');
      return false;
    }

    const targetNum = parseFloat(targetAmount);
    if (isNaN(targetNum) || targetNum < 0) {
      setErrorMsg('Savings target must be a non-negative number.');
      return false;
    }

    // Overlap check with existing non-deleted cutoffs
    const otherCutoffs = allCutoffs.filter(
      (c) => c.id !== (mode === 'EDIT' ? currentCutoff?.id : null)
    );

    for (const c of otherCutoffs) {
      if (startDate <= c.end_date && endDate >= c.start_date) {
        setErrorMsg(
          `Date range overlaps with existing cutoff (${c.start_date} to ${c.end_date}).`
        );
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!validate()) return;

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    if (mode === 'NEW') {
      const { data: summaryData } = await supabase.rpc('get_money_summary', {
        p_cutoff: null,
      });
      const summary = summaryData?.[0];
      const totalSavings = Number(summary?.total_savings || 0);

      const { error } = await supabase.from('cutoffs').insert([
        {
          user_id: user.id,
          start_date: startDate,
          end_date: endDate,
          target_amount: parseFloat(targetAmount),
          carried_in_savings: totalSavings,
        },
      ]);

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }
    } else {
      const { error } = await supabase
        .from('cutoffs')
        .update({
          start_date: startDate,
          end_date: endDate,
          target_amount: parseFloat(targetAmount),
        })
        .eq('id', currentCutoff.id);

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    onClose();
    notifyDataChanged();
  };

  const handleToggleClose = async () => {
    if (!currentCutoff) return;
    setLoading(true);

    const closedAtValue = currentCutoff.closed_at
      ? null
      : new Date().toISOString();

    const { error } = await supabase
      .from('cutoffs')
      .update({ closed_at: closedAtValue })
      .eq('id', currentCutoff.id);

    setLoading(false);
    if (error) {
      setErrorMsg(error.message);
    } else {
      onClose();
      notifyDataChanged();
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'NEW' ? 'Start Cutoff' : 'Edit Cutoff'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <p className="text-xs text-[#c85c46] font-bold p-2.5 bg-[#c85c46]/10 rounded-xl">
            {errorMsg}
          </p>
        )}

        {warningMsg && (
          <p className="text-xs text-[#143f34] font-medium p-3 bg-[#e2a63f]/20 border border-[#e2a63f]/40 rounded-xl">
            {warningMsg}
          </p>
        )}

        <div>
          <label className="block text-xs font-bold text-[#143f34] mb-1">Start Date</label>
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-[#143f34] mb-1">End Date</label>
          <input
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-[#143f34] mb-1">Savings Target (₱)</label>
          <input
            type="number"
            inputMode="decimal"
            required
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            className="w-full bg-[#f6f3ea] border border-[#1f5d4c]/20 rounded-xl p-3 text-base text-[#143f34]"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-3 bg-[#1f5d4c] text-[#f6f3ea] font-bold rounded-xl text-xs min-h-[44px] disabled:opacity-50"
          >
            {loading ? 'Saving...' : mode === 'NEW' ? 'Start Cutoff' : 'Save Cutoff'}
          </button>

          {mode === 'EDIT' && currentCutoff && (
            <button
              type="button"
              onClick={handleToggleClose}
              disabled={loading}
              className="px-4 py-3 bg-[#e2a63f]/20 text-[#143f34] font-bold rounded-xl text-xs min-h-[44px] disabled:opacity-50"
            >
              {currentCutoff.closed_at ? 'Reopen Cutoff' : 'Close Cutoff'}
            </button>
          )}
        </div>
      </form>
    </BottomSheet>
  );
}