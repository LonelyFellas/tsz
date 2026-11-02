"use client";

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
const dayLabel = (day: string) =>
  day.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, "$1年$2月$3日");

export function PlanDateRange({
  value,
  disabled,
  onChange
}: {
  value: PlanDates | null;
  disabled: boolean;
  onChange: (value: PlanDates | null) => void;
}) {
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
            : "不限日期"}{" "}
          <span className="text-xs text-foreground-muted">
            {value ? "更改" : "设置"}
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
            清除日期
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
    <LibraryDialog title="选择起止日期" onClose={onClose}>
      <p role="status" className="mb-3 text-xs text-foreground-muted">
        {!start
          ? "先选开始日期"
          : !end
            ? "再选结束日期"
            : `${dayLabel(start)} — ${dayLabel(end)}`}
      </p>
      <div className="mb-3 flex items-center justify-between gap-3">
        <strong className="text-sm">
          {month.replace(/^(\d+)-0?(\d+)$/, "$1年$2月")}
        </strong>
        <div className="flex gap-1">
          {([-1, 1] as const).map((offset) => (
            <Button
              key={offset}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={offset < 0 ? "上个月" : "下个月"}
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
        {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div
        ref={grid}
        role="group"
        aria-label="选择日期"
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
              aria-label={dayLabel(day)}
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
            未来 {days} 天
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onApply(null)}
        >
          不限日期
        </Button>
      </div>
      <p className="mt-2 text-xs text-foreground-muted">
        含首尾两天；以北京时间 04:00 划分学习日。
      </p>
      <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button
          type="button"
          disabled={!start || !end}
          onClick={() => onApply({ start_date: start, end_date: end })}
        >
          应用日期
        </Button>
      </div>
    </LibraryDialog>
  );
}
