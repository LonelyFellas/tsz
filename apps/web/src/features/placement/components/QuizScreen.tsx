"use client";

import { useEffect, useRef } from "react";
import { EST_TOTAL } from "../lib/content";
import { SwipeCard, type SwipeCardHandle } from "./SwipeCard";

// 答题屏:进度 + 卡片堆 + 按钮备选输入。
// 块提交(每 5 题)的 loading / 失败重试在此可视化,块边界对用户无感。

interface QuizScreenProps {
  word: string;
  /** 全场已答题数(题号与进度条用)。 */
  answered: number;
  submitting: boolean;
  submitError: boolean;
  showTeach: boolean;
  /** 外部锁(确认弹窗打开时)。 */
  locked: boolean;
  onAnswer: (known: boolean) => void;
  onRetry: () => void;
  onExit: () => void;
}

export function QuizScreen({
  word,
  answered,
  submitting,
  submitError,
  showTeach,
  locked,
  onAnswer,
  onRetry,
  onExit
}: QuizScreenProps) {
  const cardRef = useRef<SwipeCardHandle>(null);
  const busy = submitting || submitError;

  // 键盘备选输入:← 认识,→ 不认识
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") cardRef.current?.fly(true);
      if (e.key === "ArrowRight") cardRef.current?.fly(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const progress = Math.min(96, (answered / EST_TOTAL) * 100);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="退出测试"
          onClick={onExit}
          // 块提交在途时禁用退出:此刻退出无法兑现「不消耗测试机会」的承诺
          // (最后一块的提交可能已在服务端完成计次)。
          disabled={submitting}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          ✕
        </button>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface shadow-xs">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-foreground-muted">
          {/* 块数不固定,长会话(最多 6×5=30 题)会超过预估值:题号封顶,避免「26 / 约 25」 */}
          {String(Math.min(answered + 1, EST_TOTAL)).padStart(2, "0")} / 约{" "}
          {EST_TOTAL}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center py-6">
        <div className="relative h-[min(430px,58vh)] w-full max-w-[300px]">
          {/* 背面两张:卡片堆的连续感 */}
          <div
            aria-hidden
            className="absolute inset-0 translate-y-6 scale-[.89] rounded-3xl bg-surface opacity-40 shadow-sm"
          />
          <div
            aria-hidden
            className="absolute inset-0 translate-y-3 scale-[.945] rounded-3xl bg-surface opacity-70 shadow-sm"
          />

          {submitError ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-3xl bg-surface p-6 text-center shadow-lg">
              <p className="text-sm font-medium">提交失败，请检查网络</p>
              <p className="text-xs text-foreground-muted">
                这一组作答已保留，重试即可继续
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full bg-primary px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                重试
              </button>
            </div>
          ) : submitting ? (
            <div className="absolute inset-0 z-10 flex animate-pulse flex-col items-center justify-center gap-3 rounded-3xl bg-surface shadow-lg">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-3 w-16 rounded bg-muted" />
              <p className="mt-2 text-xs text-foreground-subtle">
                正在准备下一组…
              </p>
            </div>
          ) : (
            <SwipeCard
              ref={cardRef}
              word={word}
              disabled={locked}
              showTeach={showTeach}
              onAnswer={onAnswer}
            />
          )}
        </div>
      </div>

      <div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy || locked}
            onClick={() => cardRef.current?.fly(true)}
            className="rounded-2xl bg-surface py-3.5 text-sm font-semibold shadow-xs transition-colors hover:bg-primary-muted disabled:opacity-40"
          >
            ← 认识
          </button>
          <button
            type="button"
            disabled={busy || locked}
            onClick={() => cardRef.current?.fly(false)}
            className="rounded-2xl bg-surface py-3.5 text-sm font-semibold shadow-xs transition-colors hover:bg-muted disabled:opacity-40"
          >
            不认识 →
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-foreground-subtle">
          滑动卡片作答 · 左滑 认识 · 右滑 不认识
        </p>
      </div>
    </div>
  );
}
