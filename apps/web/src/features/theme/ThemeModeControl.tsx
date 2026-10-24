"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "./useTheme";

const MODES = [
  { value: "light", label: "浅色", Icon: Sun },
  { value: "dark", label: "深色", Icon: Moon },
  { value: "system", label: "跟随系统", Icon: Monitor }
] as const;

// 外观三段切换：浅色 / 深色 / 跟随系统。
export function ThemeModeControl() {
  const { theme, setTheme } = useTheme();
  return (
    <fieldset>
      <legend className="mb-2 ml-4 text-sm font-medium">外观</legend>
      <div className="grid grid-cols-3 gap-1 rounded-full border border-border/60 bg-muted p-1">
        {MODES.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => setTheme(value)}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium text-foreground-muted transition-[color,background-color,box-shadow] duration-200 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-9 aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:shadow-[0_2px_8px_rgb(0_0_0/0.06)]"
          >
            <Icon className="size-4" strokeWidth={1.5} aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
