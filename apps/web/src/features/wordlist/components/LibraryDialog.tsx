"use client";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { Button } from "@tsz/ui/components";

export function LibraryDialog({
  title,
  children,
  onClose,
  busy = false,
  returnFocusRef
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = returnFocusRef?.current ?? document.activeElement;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [returnFocusRef]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (busy || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-border bg-surface p-6 text-foreground shadow-float backdrop:bg-foreground/30 backdrop:backdrop-blur-sm"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="关闭"
          disabled={busy}
          onClick={onClose}
        >
          <X className="size-5" aria-hidden />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
