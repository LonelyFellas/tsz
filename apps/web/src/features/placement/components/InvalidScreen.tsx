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
        {uiText("webPlacement:these_answers_were_inconsistent")}
      </h1>
      <p className="mx-auto mt-2 max-w-[28ch] text-sm leading-relaxed text-foreground-muted">
        {uiText(
          "webPlacement:some_answer_patterns_were_inconsistent_so_the_result_may_be_inaccurate_t"
        )}
      </p>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onRetry}
        className={cn(primaryButtonClass, "w-full")}
      >
        {uiText("webPlacement:try_again")}
      </button>
      <button
        type="button"
        onClick={onManual}
        className="mt-2 min-h-11 w-full rounded-full text-sm text-foreground-muted transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {onboarded
          ? uiText("webPlacement:back_to_learning")
          : uiText("webPlacement:skip_and_choose_a_level")}
      </button>
      <p className="mt-3 text-xs text-foreground-subtle">
        {uiText("webPlacement:invalid_assessments_do_not_use_an_attempt")}
      </p>
    </div>
  );
}
