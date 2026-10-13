"use client";

import { cn } from "@tsz/ui/lib/cn";
import { primaryButtonClass } from "@/features/shell/Page";
import { VOCAB_RANGE } from "../lib/content";
import { MAX_TESTS, type QuotaState } from "../lib/quota";

// 引导屏两态:新用户看卖点;已有结果的用户看词汇档案 + 重测入口。

// 内联 transform:多段位移+旋转组合,Tailwind 平移工具类会互相覆盖同名变量
const FAN_CARDS = [
  {
    word: "apple",
    tag: "A1",
    transform: "translate(-50%, -50%) translate(-92px, 22px) rotate(-10deg)"
  },
  {
    word: "achieve",
    tag: "B1",
    z: true,
    transform: "translate(-50%, -50%) translate(0, -10px) rotate(-1deg)"
  },
  {
    word: "ubiquitous",
    tag: "C2",
    transform: "translate(-50%, -50%) translate(92px, 24px) rotate(10deg)"
  }
];

interface WelcomeScreenProps {
  quota: QuotaState;
  starting: boolean;
  error: string;
  onboarded: boolean;
  onStart: () => void;
  onSkip: () => void;
}

export function WelcomeScreen({
  quota,
  starting,
  error,
  onboarded,
  onStart,
  onSkip
}: WelcomeScreenProps) {
  const left = MAX_TESTS - quota.used;
  const hasResult = quota.last !== null;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <p className="text-xs font-medium tracking-[0.2em] text-foreground-muted">
        词汇定级
      </p>

      {/* 三张示例词卡:一眼传达测试覆盖 A1 → C2 */}
      <div className="relative mx-auto my-8 h-36 w-full max-w-xs" aria-hidden>
        {FAN_CARDS.map(({ word, tag, z, transform }) => (
          <div
            key={word}
            style={{ transform }}
            className={cn(
              "absolute top-1/2 left-1/2 flex h-24 w-40 flex-col items-center justify-center gap-1 rounded-2xl border border-border/60 bg-surface shadow-glass",
              z && "z-10"
            )}
          >
            <span className="tsz-words">{word}</span>
            <span className="font-mono text-[10px] tracking-widest text-foreground-subtle">
              {tag}
            </span>
          </div>
        ))}
      </div>

      {hasResult && quota.last ? (
        <>
          <h1 className="text-3xl font-bold tracking-tight">你的词汇档案</h1>
          <p className="mt-2 text-sm leading-6 text-foreground-muted">
            {onboarded
              ? "测评记录仅作参考，不会修改已保存的学习难度。"
              : "等级决定词书推荐与每日计划。"}
          </p>
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/70 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-muted font-serif text-lg font-bold text-primary">
              {quota.last.band}
            </span>
            <div className="min-w-0 text-sm">
              <div className="font-medium">
                当前等级 {quota.last.band} · {VOCAB_RANGE[quota.last.band]}
              </div>
              <div className="text-xs text-foreground-subtle">
                第 {quota.used}/{MAX_TESTS} 次测试
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold tracking-tight">
            1 分钟，测出你的词汇量
          </h1>
          <p className="mt-2 text-sm leading-6 text-foreground-muted">
            {onboarded
              ? "了解当前词汇水平，学习难度不会随测评结果改变。"
              : "根据结果为你推荐合适的难度与学习计划。"}
          </p>
          <ul className="mt-6 space-y-3 text-sm leading-6">
            {[
              ["看词滑卡，凭直觉作答", "认识左滑，不认识右滑"],
              ["15–30 题，难度自动调整", "答得越稳，结束得越快"],
              ["请如实作答", "系统能识别乱猜，结果只影响推荐"]
            ].map(([title, sub]) => (
              <li key={title} className="flex gap-3">
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                  aria-hidden
                />
                <span>
                  <b className="font-semibold">{title}</b>
                  <span className="text-foreground-muted"> · {sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-auto pt-8">
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <button
          type="button"
          onClick={onStart}
          // 次数用尽且无留存结果(损坏的本地存储被 readQuota 清洗后可能出现):
          // 此时既不能开测也无结果可看,禁用避免「点了没反应」的死按钮。
          disabled={starting || (left <= 0 && !hasResult)}
          className={cn(primaryButtonClass, "w-full")}
        >
          {starting
            ? "准备中..."
            : hasResult
              ? left > 0
                ? "重新测试"
                : "查看结果"
              : "开始测试"}
        </button>
        {!hasResult && (
          <button
            type="button"
            onClick={onSkip}
            className="mt-2 min-h-11 w-full rounded-full text-sm text-foreground-muted transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {onboarded ? "返回学习" : "跳过，手动选择等级"}
          </button>
        )}
        <p className="mt-3 text-center text-xs text-foreground-subtle">
          {left > 0
            ? `共 ${MAX_TESTS} 次测试机会，剩余 ${left} 次 · 以最后一次结果为准`
            : "测试机会已用完 · 以最后一次结果为准"}
        </p>
      </div>
    </div>
  );
}
