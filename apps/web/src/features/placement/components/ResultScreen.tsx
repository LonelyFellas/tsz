"use client";

import { cn } from "@tsz/ui/lib/cn";
import { primaryButtonClass } from "@/features/shell/Page";
import { BAND_DESC, VOCAB_RANGE } from "../lib/content";
import { MAX_TESTS, type QuotaState } from "../lib/quota";
import { BANDS, type Band } from "../lib/types";

// 结果屏:定级徽章 + 六档刻度 + 应用等级 CTA。
// fresh=false 表示查看留存结果(次数用尽后从引导屏进入)。

interface ResultScreenProps {
  band: Band;
  quota: QuotaState;
  fresh: boolean;
  onboarded: boolean;
  onApply: () => void;
  onRetest: () => void;
}

export function ResultScreen({
  band,
  quota,
  fresh,
  onboarded,
  onApply,
  onRetest
}: ResultScreenProps) {
  const left = MAX_TESTS - quota.used;
  const bandIdx = BANDS.indexOf(band);

  return (
    <div className="flex min-h-full flex-1 flex-col text-center">
      <div className="flex-1" />
      <p className="text-xs font-medium tracking-[0.2em] text-foreground-muted">
        你的词汇等级
      </p>
      <div className="relative mx-auto mt-5 mb-4 flex h-36 w-36 items-center justify-center rounded-full bg-primary-muted">
        <span
          aria-hidden
          className="absolute -inset-2 rounded-full border border-dashed border-primary/40"
        />
        <span className="text-5xl font-bold tracking-tight text-primary">
          {band}
        </span>
      </div>
      <p className="text-base font-semibold tabular-nums">
        {VOCAB_RANGE[band]}
      </p>
      <p className="mx-auto mt-2 max-w-[30ch] text-sm text-foreground-muted">
        {BAND_DESC[band]}
      </p>
      <p className="mt-1 text-xs text-foreground-subtle">
        第 {quota.used}/{MAX_TESTS} 次测试
      </p>

      <div className="mt-6 mb-1 grid grid-cols-6 gap-1.5">
        {BANDS.map((b, i) => (
          <span
            key={b}
            aria-hidden
            className={cn(
              "h-1.5 rounded-full",
              i <= bandIdx ? "bg-primary" : "bg-muted"
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-6 font-mono text-[10px] text-foreground-subtle">
        {BANDS.map((b, i) => (
          <span
            key={b}
            className={i === bandIdx ? "font-bold text-primary" : undefined}
          >
            {b}
          </span>
        ))}
      </div>

      <div className="flex-1" />
      <button
        type="button"
        onClick={onApply}
        className={cn(primaryButtonClass, "w-full")}
      >
        {onboarded ? "返回学习" : "应用该等级，继续设置"}
      </button>
      {onboarded && (
        <p className="mt-3 text-xs leading-6 text-foreground-muted">
          测评结果仅供参考，不会修改已保存的学习难度。
        </p>
      )}
      {left > 0 ? (
        <button
          type="button"
          onClick={onRetest}
          className="mt-2 min-h-11 w-full rounded-full text-sm text-foreground-muted transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          重新测试
        </button>
      ) : null}
      <p className="mt-3 text-xs text-foreground-subtle">
        {left > 0
          ? `剩余 ${left} 次机会 · 以最后一次结果为准`
          : fresh
            ? "测试机会已用完 · 以本次结果为准"
            : "测试机会已用完 · 以最后一次结果为准"}
      </p>
    </div>
  );
}
