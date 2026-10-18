"use client";

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
            aria-label={`拖动排序词条 ${index}`}
            aria-roledescription="可排序词条"
            title="拖动排序"
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
          词条 {index}
        </label>
        {editable && (
          <div className="flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="上移"
              title="上移"
              disabled={disabled || index === 1}
              onClick={() => onMove(-1)}
            >
              <ArrowUp className="size-4" strokeWidth={1.7} aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="下移"
              title="下移"
              disabled={disabled || index === total}
              onClick={() => onMove(1)}
            >
              <ArrowDown className="size-4" strokeWidth={1.7} aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="删除"
              title="删除词条"
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
