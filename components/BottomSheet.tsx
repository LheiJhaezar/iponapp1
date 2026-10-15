'use client';

import React, { useEffect } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export default function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-[480px] bg-[#f6f3ea] rounded-t-3xl md:rounded-2xl p-6 shadow-2xl border-t md:border border-[#1f5d4c]/20 max-h-[85vh] flex flex-col z-10 animate-in slide-in-from-bottom duration-300">
        {/* Mobile Drag Handle Bar */}
        <div className="w-12 h-1.5 bg-[#1f5d4c]/20 rounded-full mx-auto mb-4 md:hidden" />

        {title && (
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#1f5d4c]/10">
            <h3 className="font-serif text-xl font-bold text-[#143f34]">{title}</h3>
            <button
              onClick={onClose}
              className="p-2 text-[#143f34]/60 hover:text-[#143f34] min-w-[44px] min-h-[44px] flex items-center justify-center text-lg font-bold"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}