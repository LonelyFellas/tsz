"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@tsz/ui/components";

export function LibraryDialog({
  title,
  children,
  onClose,
  busy = false
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-border bg-surface p-6 text-foreground shadow-float backdrop:bg-black/30"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
          关闭
        </Button>
      </div>
      {children}
    </dialog>
  );
}
