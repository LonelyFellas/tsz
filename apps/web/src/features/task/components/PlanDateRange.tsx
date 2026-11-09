"use client";
import { localText } from "@/i18n/catalog";
import { useWebLocale, useWebText } from "@/i18n/client";
import { webTask } from "@/i18n/messages/task";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@tsz/ui/components";
import { LibraryDialog } from "@/features/wordlist/components/LibraryDialog";

export type PlanDates = { start_date: string; end_date: string };
const shift = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const dayLabel = (day: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${day}T00:00:00Z`));

export function PlanDateRange({
  value,
  disabled,
  onChange
}: {
  value: PlanDates | null;
  disabled: boolean;
  onChange: (value: PlanDates | null) => void;
}) {
  const uiText = useWebText(webTask);
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <CalendarDays className="size-4 text-foreground-muted" aria-hidden />
          {value
            ? `${value.start_date.replaceAll("-", "/")} — ${value.end_date.replaceAll("-", "/")}`
            : uiText("webTask:no_date_limit")}{" "}
          <span className="text-xs text-foreground-muted">
            {value ? uiText("webTask:change") : uiText("webTask:set")}
          </span>
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            {uiText("webTask:clear_dates")}
          </Button>
        )}
      </div>
      {open && (
        <RangeCalendar
          value={value}
          onClose={() => setOpen(false)}
          onApply={(dates) => {
            onChange(dates);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function RangeCalendar({
  value,
  onClose,
  onApply
}: {
  value: PlanDates | null;
  onClose: () => void;
  onApply: (value: PlanDates | null) => void;
}) {
  const uiText = useWebText(webTask);
  const locale = useWebLocale();
  // 北京时间 04:00 换日，即 UTC 日期加四小时。
  const [today] = useState(() =>
    new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [start, setStart] = useState(value?.start_date ?? "");
  const [end, setEnd] = useState(value?.end_date ?? "");
  const [month, setMonth] = useState((value?.start_date ?? today).slice(0, 7));
  const [focusDay, setFocusDay] = useState(value?.start_date ?? today);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    grid.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)
      ?.focus();
  }, [focusDay]);
  const first = `${month}-01`;
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const gridStart = shift(first, -((weekday + 6) % 7));
  function moveMonth(offset: number) {
    const date = new Date(`${first}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    const next = date.toISOString().slice(0, 10);
    setMonth(next.slice(0, 7));
    setFocusDay(next);
  }
  return (
    <LibraryDialog
      title={uiText("webTask:choose_start_and_end_dates")}
      onClose={onClose}
    >
      <p role="status" className="mb-3 text-xs text-foreground-muted">
        {!start
          ? uiText("webTask:choose_the_start_date_first")
          : !end
            ? uiText("webTask:then_choose_the_end_date")
            : `${dayLabel(start, locale)} — ${dayLabel(end, locale)}`}
      </p>
      <div className="mb-3 flex items-center justify-between gap-3">
        <strong className="text-sm">
          {new Intl.DateTimeFormat(locale, {
            year: "numeric",
            month: "long",
            timeZone: "UTC"
          }).format(new Date(`${month}-01T00:00:00Z`))}
        </strong>
        <div className="flex gap-1">
          {([-1, 1] as const).map((offset) => (
            <Button
              key={offset}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={
                offset < 0
                  ? uiText("webTask:previous_month")
                  : uiText("webTask:next_month")
              }
              onClick={() => moveMonth(offset)}
            >
              {offset < 0 ? (
                <ChevronLeft className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4" aria-hidden />
              )}
            </Button>
          ))}
        </div>
      </div>
      <div
        className="mb-1 grid grid-cols-7 text-center text-xs text-foreground-muted"
        aria-hidden
      >
        {[
          localText(webTask, "webTask:mon"),
          localText(webTask, "webTask:tue"),
          localText(webTask, "webTask:wed"),
          localText(webTask, "webTask:thu"),
          localText(webTask, "webTask:fri"),
          localText(webTask, "webTask:sat"),
          localText(webTask, "webTask:sun")
        ].map((day) => (
          <span key={day.key}>{uiText(day)}</span>
        ))}
      </div>
      <div
        ref={grid}
        role="group"
        aria-label={uiText("webTask:choose_date")}
        className="grid grid-cols-7"
      >
        {Array.from({ length: 42 }, (_, index) => {
          const day = shift(gridStart, index);
          const boundary = day === start || day === end;
          const inside = start && end && day > start && day < end;
          return (
            <button
              key={day}
              type="button"
              data-day={day}
              tabIndex={day === focusDay ? 0 : -1}
              aria-label={dayLabel(day, locale)}
              aria-pressed={boundary}
              aria-current={day === today ? "date" : undefined}
              className={`min-h-11 rounded-lg text-sm tabular-nums outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-primary ${boundary ? "bg-primary text-primary-foreground" : inside ? "bg-primary-muted text-primary" : day.startsWith(month) ? "text-foreground hover:bg-muted" : "text-foreground-muted hover:bg-muted"}`}
              onClick={() => {
                setFocusDay(day);
                if (!start || end || day < start) {
                  setStart(day);
                  setEnd("");
                } else setEnd(day);
              }}
              onKeyDown={(event) => {
                const offset = {
                  ArrowLeft: -1,
                  ArrowRight: 1,
                  ArrowUp: -7,
                  ArrowDown: 7
                }[event.key];
                if (offset) {
                  event.preventDefault();
                  const next = shift(day, offset);
                  setMonth(next.slice(0, 7));
                  setFocusDay(next);
                }
              }}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-1 border-t border-border pt-3">
        {[7, 14].map((days) => (
          <Button
            key={days}
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setStart(today);
              setEnd(shift(today, days - 1));
              setMonth(today.slice(0, 7));
              setFocusDay(today);
            }}
          >
            {uiText("webTask:next_v0_days", { v0: days })}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onApply(null)}
        >
          {uiText("webTask:no_date_limit")}
        </Button>
      </div>
      <p className="mt-2 text-xs text-foreground-muted">
        {uiText(
          "webTask:includes_both_dates_learning_days_change_at_04_00_beijing_time"
        )}
      </p>
      <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={onClose}>
          {uiText("webTask:cancel")}
        </Button>
        <Button
          type="button"
          disabled={!start || !end}
          onClick={() => onApply({ start_date: start, end_date: end })}
        >
          {uiText("webTask:apply_dates")}
        </Button>
      </div>
    </LibraryDialog>
  );
}
