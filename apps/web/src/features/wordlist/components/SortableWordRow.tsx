"use client";
import { useWebText } from "@/i18n/client";
import { webWordlistEditor as webWordlist } from "@/i18n/messages/wordlist/editor";

import type { CSSProperties, ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowUp, ArrowDown, GripVertical, Trash2 } from "lucide-react";
import { Button } from "@tsz/ui/components";
import { cn } from "@tsz/ui/lib/cn";

export function SortableWordRow({
  id,
  index,
  total,
  editable,
  disabled,
  invalid,
  onMove,
  onRemove,
  children
}: {
  id: string;
  index: number;
  total: number;
  editable: boolean;
  disabled: boolean;
  invalid: boolean;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const uiText = useWebText(webWordlist);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      id={`row-${id}`}
      tabIndex={-1}
      style={
        {
          transform: CSS.Transform.toString(transform),
          "--wordlist-sort-transition": transition
        } as CSSProperties
      }
      className={cn(
        "relative scroll-mt-64 rounded-2xl border border-border/70 bg-surface/60 outline-hidden [transition:var(--wordlist-sort-transition)] motion-reduce:transition-none sm:scroll-mt-40",
        isDragging && "border-dashed border-primary/40 opacity-30",
        invalid && "ring-2 ring-danger"
      )}
    >
      <div className="flex min-h-14 items-center justify-between gap-2 px-4 pt-2 sm:px-5">
        {editable ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            disabled={disabled}
            aria-label={uiText("webWordlistEditor:drag_to_reorder_entry_v0", {
              v0: index
            })}
            aria-roledescription={uiText("webWordlistEditor:sortable_entries")}
            title={uiText("webWordlistEditor:drag_to_reorder")}
            className="-ml-2 inline-flex h-11 min-w-11 touch-manipulation select-none items-center gap-1 rounded-lg px-2 text-xs tabular-nums text-foreground-muted transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary enabled:cursor-grab enabled:active:cursor-grabbing disabled:cursor-default"
          >
            <GripVertical
              className="size-3.5 text-foreground-subtle"
              aria-hidden
            />
            {index}
          </button>
        ) : (
          <span className="text-xs tabular-nums text-foreground-muted">
            {index}
          </span>
        )}
        <label htmlFor={`word-${id}`} className="sr-only">
          {uiText("webWordlistEditor:entry_v0", { v0: index })}
        </label>
        {editable && (
          <div className="flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={uiText("webWordlistEditor:move_up")}
              title={uiText("webWordlistEditor:move_up")}
              disabled={disabled || index === 1}
              onClick={() => onMove(-1)}
            >
              <ArrowUp className="size-4" strokeWidth={1.7} aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={uiText("webWordlistEditor:move_down")}
              title={uiText("webWordlistEditor:move_down")}
              disabled={disabled || index === total}
              onClick={() => onMove(1)}
            >
              <ArrowDown className="size-4" strokeWidth={1.7} aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={uiText("webWordlistEditor:delete")}
              title={uiText("webWordlistEditor:delete_entries")}
              className="text-foreground-muted hover:bg-danger/10 hover:text-danger"
              disabled={total === 1}
              onClick={onRemove}
            >
              <Trash2 className="size-4" strokeWidth={1.7} aria-hidden />
            </Button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
