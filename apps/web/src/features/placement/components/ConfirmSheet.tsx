"use client";

import { useEffect } from "react";
import { cn } from "@tsz/ui/lib/cn";
import { buttonClass, primaryButtonClass } from "@/features/shell/Page";

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
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-border/60 bg-surface p-6 shadow-float sm:p-8">
        <h3 className="text-xl font-bold tracking-tight">{title}</h3>
        <p className="mt-2 mb-5 text-sm leading-relaxed text-foreground-muted">
          {desc}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className={cn(buttonClass, "min-h-12")}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onOk}
            className={cn(primaryButtonClass, "px-4")}
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
