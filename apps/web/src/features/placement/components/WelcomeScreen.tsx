"use client";
import { localText } from "@/i18n/catalog";
import { useWebText } from "@/i18n/client";
import { webPlacement } from "@/i18n/messages/placement";

import { cn } from "@tsz/ui/lib/cn";
import { primaryButtonClass } from "@/features/shell/Page";

import { MAX_TESTS, type QuotaState } from "../lib/quota";

const vocabularyRangeMessages = {
  A1: localText(webPlacement, "webPlacement:about_500_1_000_words"),
  A2: localText(webPlacement, "webPlacement:about_1_000_2_000_words"),
  B1: localText(webPlacement, "webPlacement:about_2_000_3_000_words"),
  B2: localText(webPlacement, "webPlacement:about_3_000_4_500_words"),
  C1: localText(webPlacement, "webPlacement:about_4_500_8_000_words"),
  C2: localText(webPlacement, "webPlacement:8_000_words")
};

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
  error: import("@/i18n/catalog").WebNotice;
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
  const uiText = useWebText(webPlacement);
  const left = MAX_TESTS - quota.used;
  const hasResult = quota.last !== null;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <p className="text-xs font-medium tracking-[0.2em] text-foreground-muted">
        {uiText("webPlacement:vocabulary_assessment")}
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
          <h1 className="text-3xl font-bold tracking-tight">
            {uiText("webPlacement:your_vocabulary_profile")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-foreground-muted">
            {onboarded
              ? uiText(
                  "webPlacement:assessment_records_are_a_guide_and_do_not_change_your_saved_learning_lev"
                )
              : uiText(
                  "webPlacement:your_level_guides_book_recommendations_and_daily_plans"
                )}
          </p>
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/70 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-muted font-serif text-lg font-bold text-primary">
              {quota.last.band}
            </span>
            <div className="min-w-0 text-sm">
              <div className="font-medium">
                {uiText("webPlacement:current_level_v0_v1", {
                  v0: quota.last.band,
                  v1: uiText(vocabularyRangeMessages[quota.last.band])
                })}
              </div>
              <div className="text-xs text-foreground-subtle">
                {uiText("webPlacement:assessment_v0_of_v1", {
                  v0: quota.used,
                  v1: MAX_TESTS
                })}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-balance text-3xl font-bold tracking-tight">
            {uiText("webPlacement:check_your_vocabulary_in_one_minute")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-foreground-muted">
            {onboarded
              ? uiText(
                  "webPlacement:check_your_current_vocabulary_the_result_does_not_change_your_learning_l"
                )
              : uiText(
                  "webPlacement:get_a_suggested_level_and_learning_plan_based_on_your_result"
                )}
          </p>
          <ul className="mt-6 space-y-3 text-sm leading-6">
            {[
              [
                localText(
                  webPlacement,
                  "webPlacement:swipe_word_cards_and_answer_from_instinct"
                ),
                localText(
                  webPlacement,
                  "webPlacement:swipe_left_if_you_know_it_right_if_you_don_t"
                )
              ],
              [
                localText(
                  webPlacement,
                  "webPlacement:15_30_questions_with_adaptive_difficulty"
                ),
                localText(
                  webPlacement,
                  "webPlacement:consistent_answers_finish_the_assessment_sooner"
                )
              ],
              [
                localText(webPlacement, "webPlacement:answer_honestly"),
                localText(
                  webPlacement,
                  "webPlacement:random_guessing_can_be_detected_results_only_affect_recommendations"
                )
              ]
            ].map(([title, sub]) => (
              <li key={title!.key} className="flex gap-3">
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                  aria-hidden
                />
                <span>
                  <b className="font-semibold">{uiText(title)}</b>
                  <span className="text-foreground-muted">
                    {" "}
                    · {uiText(sub)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-auto pt-8">
        {error && <p className="mb-3 text-sm text-danger">{uiText(error)}</p>}
        <button
          type="button"
          onClick={onStart}
          // 次数用尽且无留存结果(损坏的本地存储被 readQuota 清洗后可能出现):
          // 此时既不能开测也无结果可看,禁用避免「点了没反应」的死按钮。
          disabled={starting || (left <= 0 && !hasResult)}
          className={cn(primaryButtonClass, "w-full")}
        >
          {starting
            ? uiText("webPlacement:preparing")
            : hasResult
              ? left > 0
                ? uiText("webPlacement:retake_assessment")
                : uiText("webPlacement:view_result")
              : uiText("webPlacement:start_assessment")}
        </button>
        {!hasResult && (
          <button
            type="button"
            onClick={onSkip}
            className="mt-2 min-h-11 w-full rounded-full text-sm text-foreground-muted transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {onboarded
              ? uiText("webPlacement:back_to_learning")
              : uiText("webPlacement:skip_and_choose_a_level")}
          </button>
        )}
        <p className="mt-3 text-center text-xs text-foreground-subtle">
          {left > 0
            ? uiText(
                "webPlacement:v0_total_attempts_v1_left_the_latest_result_is_used",
                { v0: MAX_TESTS, v1: left }
              )
            : uiText("webPlacement:no_attempts_left_the_latest_result_is_used")}
        </p>
      </div>
    </div>
  );
}
