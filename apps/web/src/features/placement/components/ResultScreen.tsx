"use client";
import { localText } from "@/i18n/catalog";
import { useWebText } from "@/i18n/client";
import { webPlacement } from "@/i18n/messages/placement";

import { cn } from "@tsz/ui/lib/cn";
import { primaryButtonClass } from "@/features/shell/Page";

import { MAX_TESTS, type QuotaState } from "../lib/quota";
import { BANDS, type Band } from "../lib/types";

const vocabularyRangeMessages = {
  A1: localText(webPlacement, "webPlacement:about_500_1_000_words"),
  A2: localText(webPlacement, "webPlacement:about_1_000_2_000_words"),
  B1: localText(webPlacement, "webPlacement:about_2_000_3_000_words"),
  B2: localText(webPlacement, "webPlacement:about_3_000_4_500_words"),
  C1: localText(webPlacement, "webPlacement:about_4_500_8_000_words"),
  C2: localText(webPlacement, "webPlacement:8_000_words")
};
const bandDescriptionMessages = {
  A1: localText(
    webPlacement,
    "webPlacement:start_with_common_basic_words_to_build_a_foundation"
  ),
  A2: localText(
    webPlacement,
    "webPlacement:you_know_common_everyday_words_move_on_to_consolidation"
  ),
  B1: localText(
    webPlacement,
    "webPlacement:you_can_manage_most_everyday_contexts_explore_academic_vocabulary"
  ),
  B2: localText(
    webPlacement,
    "webPlacement:a_solid_vocabulary_try_reading_original_english_texts"
  ),
  C1: localText(
    webPlacement,
    "webPlacement:close_to_a_native_speaker_s_everyday_vocabulary"
  ),
  C2: localText(
    webPlacement,
    "webPlacement:your_vocabulary_is_advanced_refine_less_common_words"
  )
};

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
  const uiText = useWebText(webPlacement);
  const left = MAX_TESTS - quota.used;
  const bandIdx = BANDS.indexOf(band);

  return (
    <div className="flex min-h-full flex-1 flex-col text-center">
      <div className="flex-1" />
      <p className="text-xs font-medium tracking-[0.2em] text-foreground-muted">
        {uiText("webPlacement:your_vocabulary_level")}
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
        {uiText(vocabularyRangeMessages[band])}
      </p>
      <p className="mx-auto mt-2 max-w-[30ch] text-sm text-foreground-muted">
        {uiText(bandDescriptionMessages[band])}
      </p>
      <p className="mt-1 text-xs text-foreground-subtle">
        {uiText("webPlacement:assessment_v0_of_v1", {
          v0: quota.used,
          v1: MAX_TESTS
        })}
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
        {onboarded
          ? uiText("webPlacement:back_to_learning")
          : uiText("webPlacement:use_this_level_and_continue_setup")}
      </button>
      {onboarded && (
        <p className="mt-3 text-xs leading-6 text-foreground-muted">
          {uiText(
            "webPlacement:assessment_results_are_a_guide_and_do_not_change_your_saved_learning_lev"
          )}
        </p>
      )}
      {left > 0 ? (
        <button
          type="button"
          onClick={onRetest}
          className="mt-2 min-h-11 w-full rounded-full text-sm text-foreground-muted transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {uiText("webPlacement:retake_assessment")}
        </button>
      ) : null}
      <p className="mt-3 text-xs text-foreground-subtle">
        {left > 0
          ? uiText("webPlacement:v0_attempts_left_the_latest_result_is_used", {
              v0: left
            })
          : fresh
            ? uiText("webPlacement:no_attempts_left_this_result_is_used")
            : uiText("webPlacement:no_attempts_left_the_latest_result_is_used")}
      </p>
    </div>
  );
}
