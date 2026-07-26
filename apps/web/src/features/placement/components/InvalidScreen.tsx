"use client";

// 作答无效屏(假词误报过多):文案给台阶,不指责;无效不消耗测试机会。

interface InvalidScreenProps {
  onRetry: () => void;
  onManual: () => void;
}

export function InvalidScreen({ onRetry, onManual }: InvalidScreenProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col text-center">
      <div className="flex-1" />
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 font-serif text-2xl font-bold text-amber-600 dark:text-amber-400">
        ?
      </div>
      <h1 className="mt-4 text-xl font-bold">这次作答不太稳定</h1>
      <p className="mx-auto mt-2 max-w-[28ch] text-sm leading-relaxed text-foreground-muted">
        部分题目的作答模式不一致，结果可能不准。认真再测一次，只需 1 分钟。
      </p>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onRetry}
        className="w-full rounded-full bg-primary py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        再测一次
      </button>
      <button
        type="button"
        onClick={onManual}
        className="mt-2 w-full py-2 text-sm text-foreground-muted transition-colors hover:text-foreground"
      >
        跳过，手动选择等级
      </button>
      <p className="mt-3 text-xs text-foreground-subtle">无效测试不计入次数</p>
    </div>
  );
}
