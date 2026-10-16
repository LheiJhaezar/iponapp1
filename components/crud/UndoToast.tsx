'use client';

import React, { useEffect } from 'react';

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onClose: () => void;
  duration?: number;
}

export default function UndoToast({ message, onUndo, onClose, duration = 8000 }: UndoToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-[420px] px-4">
      <div className="bg-[#143f34] text-[#f6f3ea] px-4 py-3 rounded-2xl shadow-2xl border border-[#e2a63f]/30 flex items-center justify-between text-xs animate-in slide-in-from-bottom duration-200">
        <span className="font-medium">{message}</span>
        <button
          onClick={onUndo}
          className="px-3 py-1 bg-[#e2a63f] text-[#143f34] font-bold rounded-lg hover:bg-[#e2a63f]/90 transition min-h-[36px]"
        >
          Undo
        </button>
      </div>
    </div>
  );
}