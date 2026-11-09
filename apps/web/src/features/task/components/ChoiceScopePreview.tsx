"use client";

import { localText } from "@/i18n/catalog";
import { useWebText } from "@/i18n/client";
import { webTask } from "@/i18n/messages/task";
import type { ChoicePlanPreview } from "@tsz/types";

const reasons: Record<
  ChoicePlanPreview["unavailable_items"][number]["reason"],
  import("@/i18n/catalog").WebNotice
> = {
  target_ineligible: localText(
    webTask,
    "webTask:no_meanings_or_forms_apply_to_the_current_level_or_tier"
  ),
  evidence_incomplete: localText(
    webTask,
    "webTask:meaning_data_are_incomplete_reliable_options_cannot_be_generated_yet"
  ),
  target_unaligned: localText(
    webTask,
    "webTask:the_current_meaning_cannot_be_matched_reliably"
  ),
  insufficient_distractors: localText(
    webTask,
    "webTask:three_reliable_distractors_could_not_be_found"
  ),
  custom_source_unsupported: localText(
    webTask,
    "webTask:custom_words_do_not_support_multiple_choice_yet_create_a_spelling_task_i"
  )
};

export function ChoiceScopePreview({
  preview,
  eligibleCount
}: {
  preview: ChoicePlanPreview;
  eligibleCount: number;
}) {
  const uiText = useWebText(webTask);
  return (
    <div className="space-y-3">
      <p className="text-lg font-semibold">
        {uiText(
          "webTask:v0_target_meanings_v1_available_for_multiple_choice_v2_unavailable",
          {
            v0: preview.total_count,
            v1: eligibleCount,
            v2: preview.unavailable_count
          }
        )}
      </p>
      {preview.unavailable_count > 0 && (
        <details className="rounded-2xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {uiText("webTask:view_unavailable_content_and_reasons")}
          </summary>
          <ChoiceUnavailableItems preview={preview} />
        </details>
      )}
    </div>
  );
}

export function ChoiceUnavailableItems({
  preview
}: {
  preview: ChoicePlanPreview;
}) {
  const uiText = useWebText(webTask);
  return (
    <>
      <ul className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-2 text-sm">
        {preview.unavailable_items.map((item) => (
          <li key={item.unit_key} className="break-words">
            <p className="font-medium">
              {item.spelling} · {item.definition}
            </p>
            <p className="text-foreground-muted">
              {uiText(reasons[item.reason])}
            </p>
          </li>
        ))}
      </ul>
      {preview.unavailable_truncated && (
        <p className="mt-3 text-xs text-foreground-muted">
          {uiText(
            "webTask:showing_the_first_v0_items_v1_unavailable_in_total",
            {
              v0: preview.unavailable_items.length,
              v1: preview.unavailable_count
            }
          )}
        </p>
      )}
    </>
  );
}
