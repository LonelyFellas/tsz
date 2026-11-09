"use client";
import { useWebText } from "@/i18n/client";
import { webPlacement } from "@/i18n/messages/placement";

import { cn } from "@tsz/ui/lib/cn";
import { primaryButtonClass } from "@/features/shell/Page";
// 作答无效屏(假词误报过多):文案给台阶,不指责;无效不消耗测试机会。

interface InvalidScreenProps {
  onboarded: boolean;
  onRetry: () => void;
  onManual: () => void;
}

export function InvalidScreen({
  onboarded,
  onRetry,
  onManual
}: InvalidScreenProps) {
  const uiText = useWebText(webPlacement);
  return (
    <div className="flex min-h-full flex-1 flex-col text-center">
      <div className="flex-1" />
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-2xl font-bold text-foreground-muted">
        ?
      </div>
      <h1 className="mt-5 text-2xl font-bold tracking-tight">
        {uiText("这次作答不太稳定")}
      </h1>
      <p className="mx-auto mt-2 max-w-[28ch] text-sm leading-relaxed text-foreground-muted">
        {uiText(
          "部分题目的作答模式不一致，结果可能不准。认真再测一次，只需 1 分钟。"
        )}
      </p>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onRetry}
        className={cn(primaryButtonClass, "w-full")}
      >
        {uiText("再测一次")}
      </button>
      <button
        type="button"
        onClick={onManual}
        className="mt-2 min-h-11 w-full rounded-full text-sm text-foreground-muted transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {onboarded ? uiText("返回学习") : uiText("跳过，手动选择等级")}
      </button>
      <p className="mt-3 text-xs text-foreground-subtle">
        {uiText("无效测试不计入次数")}
      </p>
    </div>
  );
}
