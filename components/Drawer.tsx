"use client";

import { useEffect } from "react";

export default function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Scrim */}
      <div
        className="flex-1 transition-opacity"
        style={{ background: "rgba(10,16,13,0.45)" }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="w-full overflow-y-auto"
        style={{
          maxWidth: 360,
          background: "var(--paper-raised)",
          borderLeft: "1px solid var(--line)",
          padding: "24px 22px 48px",
        }}
      >
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-display text-xl font-semibold" style={{ color: "var(--ink)" }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-2xl leading-none"
            style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer" }}
          >
            ×
          </button>
        </div>
        {subtitle && (
          <p className="text-xs mb-5" style={{ color: "var(--ink-soft)" }}>{subtitle}</p>
        )}
        {children}
      </div>
    </div>
  );
}
