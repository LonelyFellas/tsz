import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

const WIDTH = { md: "max-w-3xl", lg: "max-w-5xl" } as const;

// 功能页外框：统一宽度、页边距与入场动画。
export function PageShell({
  size = "md",
  children
}: {
  size?: keyof typeof WIDTH;
  children: ReactNode;
}) {
  return (
    <div
      className={`animate-in mx-auto w-full ${WIDTH[size]} px-6 pb-16 pt-8 sm:pt-12`}
    >
      {children}
    </div>
  );
}

// 功能页页头：返回入口 → 小标 → 粗体标题 → 说明，右侧放页面级操作。
export function PageHeader({
  back,
  eyebrow,
  title,
  description,
  actions
}: {
  back?: { href: string; label: string };
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8">
      {back && (
        <Link
          href={back.href}
          className="-ml-3 mb-5 inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm text-foreground-muted transition-colors hover:bg-surface/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-3 text-xs font-medium tracking-[0.2em] text-foreground-muted">
              {eyebrow}
            </p>
          )}
          <h1 className="break-words text-3xl font-bold tracking-tight text-foreground sm:text-[34px]">
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-xl text-sm leading-6 text-foreground-muted">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

// 毛玻璃内容卡；子区块之间用 space-y 控制节奏。
export const panelClass = "glass rounded-3xl p-6 sm:p-8";

// 可点击的列表卡片：悬停浮起阴影、描边提亮。
export const listCardClass =
  "glass block rounded-3xl p-6 outline-hidden transition-[box-shadow,border-color] duration-300 hover:border-primary/30 hover:shadow-float focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// 空态、失败态的统一容器。
export function PageNotice({
  tone = "neutral",
  children
}: {
  tone?: "neutral" | "error";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className="rounded-3xl border border-dashed border-border bg-muted/50 px-6 py-12 text-center text-sm leading-6 text-foreground-muted"
    >
      {children}
    </div>
  );
}

// 分段切换：同一组互斥筛选，选中项白底轻阴影。
export function Segmented<T extends string | boolean>({
  label,
  value,
  options,
  onChange,
  disabled
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-1 rounded-full border border-border/60 bg-muted p-1"
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          disabled={disabled}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className="inline-flex min-h-9 items-center rounded-full px-4 text-[13px] font-medium tracking-wide text-foreground-muted transition-[color,background-color,box-shadow] duration-200 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:shadow-[0_2px_8px_rgb(0_0_0/0.06)]"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// 翻页：只有一页时不渲染。
export function Pager({
  page,
  total,
  onChange,
  disabled = false
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}) {
  if (total <= 1) return null;
  const button =
    "inline-flex min-h-10 items-center rounded-full border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <nav
      className="mt-8 flex items-center justify-center gap-3"
      aria-label="分页"
    >
      <button
        type="button"
        className={button}
        disabled={disabled || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        上一页
      </button>
      <span className="min-w-16 text-center text-sm tabular-nums text-foreground-muted">
        {page} / {total}
      </span>
      <button
        type="button"
        className={button}
        disabled={disabled || page >= total}
        onClick={() => onChange(page + 1)}
      >
        下一页
      </button>
    </nav>
  );
}
