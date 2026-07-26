"use client";

import { useEffect } from "react";

// 底部确认抽屉:重测覆盖 / 退出测试共用。Esc 或点遮罩取消。

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  desc: string;
  okLabel: string;
  onOk: () => void;
  onCancel: () => void;
}

export function ConfirmSheet({
  open,
  title,
  desc,
  okLabel,
  onOk,
  onCancel
}: ConfirmSheetProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="mt-2 mb-5 text-sm leading-relaxed text-foreground-muted">
          {desc}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full bg-muted py-2.5 text-sm font-medium transition-colors hover:bg-muted/70"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onOk}
            className="rounded-full bg-primary py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
