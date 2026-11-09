"use client";
import { localText, type WebNotice, webErrorText } from "@/i18n/catalog";

import { useWebText } from "@/i18n/client";
import { webTask } from "@/i18n/messages/task";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChoiceScopePreview } from "./ChoiceScopePreview";
import { LearningProgressBar } from "./LearningProgressBar";
import { Pager } from "@/features/shell/Page";
import { HttpError } from "@tsz/api-client";
import type {
  LearningPlan,
  CycleOperation,
  LearningCyclePreview,
  CreateLearningCycle
} from "@tsz/types";
import { Button } from "@tsz/ui/components";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import { LibraryDialog } from "@/features/wordlist/components/LibraryDialog";
export const planStatusLabels: Record<LearningPlan["status"], WebNotice> = {
  archived: localText(webTask, "webTask:archived"),
  schedule_ended: localText(webTask, "webTask:plan_ended"),
  cycle_completed: localText(webTask, "webTask:round_completed"),
  not_started: localText(webTask, "webTask:not_started"),
  today_completed: localText(webTask, "webTask:completed_today"),
  source_blocked: localText(webTask, "webTask:source_blocked"),
  ready: localText(webTask, "webTask:ready_to_learn"),
  review_waiting: localText(webTask, "webTask:waiting_for_the_next_review")
};
export function PlanCoverage({
  plan,
  userId,
  refresh
}: {
  plan: LearningPlan;
  userId: string;
  refresh: () => Promise<unknown>;
}) {
  const uiText = useWebText(webTask);
  const [preview, setPreview] = useState<LearningCyclePreview | null>(null);
  const [acceptedPreview, setAcceptedPreview] = useState<string | null>(null);
  const [operation, setOperation] = useState<CycleOperation>("next");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<WebNotice>("");
  const [unknown, setUnknown] = useState(false);
  const intent = useRef<CreateLearningCycle | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    return () => c.abort();
  }, []);
  const current = () =>
    !controller.current?.signal.aborted &&
    useUserStore.getState().user?.id === userId;
  const c = plan.current_cycle;
  const [historyPage, setHistoryPage] = useState(1);
  const history = useQuery({
    queryKey: [
      "learning-plans",
      userId,
      "v1",
      "cycles",
      plan.task.id,
      c?.id,
      c?.covered_count,
      c?.state,
      historyPage
    ],
    enabled: plan.mode === "coverage_v1",
    queryFn: ({ signal }) =>
      api.learningPlans.cycles(plan.task.id, { page: historyPage }, { signal })
  });
  async function inspect(operation: CycleOperation) {
    if (!c) return;
    setBusy(true);
    setError("");
    setOperation(operation);
    setAcceptedPreview(null);
    try {
      const p = await api.learningPlans.cyclePreview(
        plan.task.id,
        {
          operation,
          after_cycle_id: c.id,
          expected_revision: plan.task.revision
        },
        { signal: controller.current?.signal }
      );
      if (current()) setPreview(p);
    } catch (e) {
      if (current())
        setError(webErrorText(e, localText(webTask, "webTask:preview_failed")));
    } finally {
      if (current()) setBusy(false);
    }
  }
  async function create() {
    if (!c || !preview) return;
    if (
      preview.preview.choice?.unavailable_count &&
      acceptedPreview !== preview.preview.preview_fingerprint &&
      !intent.current
    ) {
      setError(
        localText(
          webTask,
          "webTask:confirm_that_the_new_cycle_will_use_only_available_content"
        )
      );
      return;
    }
    setBusy(true);
    setError("");
    intent.current ??= {
      ...(preview.preview.choice?.unavailable_count
        ? { accept_partial_choice: true }
        : {}),
      operation,
      after_cycle_id: c.id,
      expected_revision: plan.task.revision,
      preview_fingerprint: preview.preview.preview_fingerprint,
      idempotency_key: crypto.randomUUID()
    };
    try {
      await api.learningPlans.cycleCreate(plan.task.id, intent.current, {
        signal: controller.current?.signal
      });
      if (current()) {
        intent.current = null;
        setUnknown(false);
        setPreview(null);
        await refresh();
      }
    } catch (e) {
      if (current()) {
        setError(
          webErrorText(e, localText(webTask, "webTask:creation_failed"))
        );
        const definite =
          e instanceof HttpError && e.status < 500 && e.status !== 408;
        setUnknown(!definite);
        if (definite) {
          intent.current = null;
          setPreview(null);
          await refresh();
        }
      }
    } finally {
      if (current()) setBusy(false);
    }
  }
  const confirmation = preview && c && (
    <LibraryDialog
      title={
        operation === "refresh_sources"
          ? uiText("webTask:reconfirm_sources")
          : operation === "next"
            ? uiText("webTask:start_next_cycle")
            : uiText("webTask:abandon_blocked_cycle")
      }
      busy={busy || unknown}
      onClose={() => setPreview(null)}
    >
      <div className="space-y-4 text-sm">
        <p>
          {operation === "refresh_sources"
            ? uiText("webTask:confirmed_across_days")
            : uiText("webTask:previous_cycle_progress")}
          {uiText("webTask:v0_v1_with_v2_unavailable_questions", {
            v0: preview.previous_covered_count,
            v1: preview.previous_total_count,
            v2: preview.previous_blocked_count
          })}
        </p>
        {operation === "restart_blocked" && (
          <p>
            {uiText(
              "webTask:this_cancels_the_current_cycle_and_unfinished_batches_while_preserving_h"
            )}
          </p>
        )}
        {operation === "refresh_sources" ? (
          <>
            <p>
              {uiText(
                "webTask:this_ends_the_unfinished_batch_and_preserves_all_answer_history_mastery"
              )}
            </p>
            {preview.source_refresh && (
              <p>
                {uiText(
                  "webTask:v0_meanings_can_be_reconfirmed_including_v1_with_changed_content_v2_rema",
                  {
                    v0: preview.source_refresh.refreshed_count,
                    v1: preview.source_refresh.changed_content_count,
                    v2: preview.source_refresh.unavailable_count
                  }
                )}
              </p>
            )}
          </>
        ) : (
          <p>
            {uiText(
              "webTask:new_cycle_v0_questions_starting_no_earlier_than_v1",
              {
                v0: preview.preview.eligible_count,
                v1: preview.earliest_day
              }
            )}
          </p>
        )}
        {preview.preview.choice && (
          <ChoiceScopePreview
            preview={preview.preview.choice}
            eligibleCount={preview.preview.eligible_count}
          />
        )}
        {!!preview.preview.choice?.unavailable_count &&
          preview.preview.can_create && (
            <label className="flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                disabled={busy || unknown}
                checked={
                  acceptedPreview === preview.preview.preview_fingerprint
                }
                onChange={(e) =>
                  setAcceptedPreview(
                    e.target.checked
                      ? preview.preview.preview_fingerprint
                      : null
                  )
                }
              />
              {uiText(
                "webTask:start_a_new_cycle_using_only_content_suitable_for_multiple_choice_exclud"
              )}
            </label>
          )}
        {preview.preview.reasons.map((r) => (
          <p key={r} className="text-danger">
            {r}
          </p>
        ))}
        {error && (
          <p role="alert" className="text-danger">
            {uiText(error)}
          </p>
        )}
        {unknown && (
          <p>
            {uiText(
              "webTask:the_result_is_unconfirmed_retry_the_original_request"
            )}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            disabled={busy || unknown}
            onClick={() => setPreview(null)}
          >
            {uiText("webTask:cancel")}
          </Button>
          <Button
            disabled={busy || !preview.preview.can_create}
            onClick={() => void create()}
          >
            {busy
              ? uiText("webTask:creating")
              : unknown
                ? uiText("webTask:retry_original_request")
                : operation === "refresh_sources"
                  ? uiText("webTask:confirm_source_update")
                  : uiText("webTask:confirm_new_cycle")}
          </Button>
        </div>
      </div>
    </LibraryDialog>
  );
  if (plan.mastery)
    return (
      <section
        aria-label={uiText("webTask:word_mastery")}
        className="space-y-4"
      >
        <h2 className="text-lg font-semibold">
          {uiText(planStatusLabels[plan.status])}
        </h2>
        <LearningProgressBar
          label={uiText("webTask:progress_confirmed_across_days")}
          max={c?.total_count ?? 1}
          value={plan.mastery.mastered_count}
        />
        <p className="text-sm text-foreground-muted">
          {uiText(
            "webTask:unstudied_v0_needs_consolidation_v1_confirmed_across_days_v2",
            {
              v0: plan.mastery.new_count,
              v1: plan.mastery.learning_count,
              v2: plan.mastery.mastered_count
            }
          )}
        </p>
        <p className="text-sm text-foreground-muted">
          {uiText("webTask:due_for_review_v0", { v0: plan.mastery.due_count })}
          {plan.mastery.next_review_day &&
            uiText("webTask:next_review_v0", {
              v0: plan.mastery.next_review_day
            })}
        </p>
        <p className="text-sm text-foreground-muted">
          {uiText(
            "webTask:up_to_20_new_words_per_practice_and_30_questions_including_retries_corre"
          )}
        </p>
        {!!c?.blocked_count && (
          <p className="text-sm text-danger">
            {uiText(
              "webTask:v0_questions_have_unavailable_sources_mastery_progress_is_preserved",
              {
                v0: c.blocked_count
              }
            )}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={busy || unknown}
          onClick={() => void refresh()}
        >
          {uiText("webTask:refresh_learning_schedule")}
        </Button>
        {plan.task.state === "active" && plan.status !== "schedule_ended" && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || unknown || !c}
            onClick={() => void inspect("refresh_sources")}
          >
            {uiText("webTask:reconfirm_sources")}
          </Button>
        )}
        {error && !preview && (
          <p role="alert" className="text-sm text-danger">
            {uiText(error)}
          </p>
        )}
        {confirmation}
      </section>
    );
  if (!c)
    return (
      <p className="text-sm text-foreground-muted">
        {uiText(
          "webTask:original_question_mode_existing_task_and_history_behaviour_is_preserved"
        )}
      </p>
    );
  return (
    <section
      className="space-y-4"
      aria-label={uiText("webTask:coverage_cycle")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {uiText("webTask:cycle_v0_v1", {
            v0: c.cycle_number,
            v1: uiText(planStatusLabels[plan.status])
          })}
        </h2>
        <p className="text-sm text-foreground-muted">
          {uiText("webTask:covered_this_cycle_v0_v1", {
            v0: c.covered_count,
            v1: c.total_count
          })}
        </p>
      </div>
      <LearningProgressBar
        label={uiText("webTask:coverage_progress_this_cycle")}
        max={c.total_count}
        value={c.covered_count}
      />
      <p className="text-sm text-foreground-muted">
        {uiText("webTask:covered_v0_answerable_v1_unavailable_v2", {
          v0: c.covered_count,
          v1: c.available_remaining_count,
          v2: c.blocked_count
        })}
      </p>
      {plan.task.task_type === "daily" && (
        <p className="text-sm text-foreground-muted">
          {plan.current_run
            ? uiText("webTask:answered_today_v0_v1", {
                v0: plan.current_run.answered_count,
                v1: plan.current_run.target_count
              })
            : plan.can_start
              ? uiText("webTask:not_started_today_v0_questions_available", {
                  v0: plan.today_available_count
                })
              : uiText("webTask:cannot_start_today_yet")}
          {plan.estimated_learning_days !== null &&
            uiText("webTask:v1_more_learning_days_from_v0", {
              v0: String(plan.estimate_from_day),
              v1: plan.estimated_learning_days
            })}
        </p>
      )}
      {plan.status === "not_started" && (
        <p className="text-sm">
          {uiText("webTask:first_learning_day_v0", { v0: c.earliest_day })}
        </p>
      )}
      {plan.schedule && (
        <p className="text-sm text-foreground-muted">
          {uiText(
            "webTask:scheduled_dates_v0_to_v1_the_business_day_changes_at_04_00_beijing_time",
            {
              v0: plan.schedule.start_date,
              v1: plan.schedule.end_date
            }
          )}
        </p>
      )}
      {plan.schedule_at_risk && (
        <p className="text-sm text-danger">
          {uiText(
            "webTask:today_s_remaining_allowance_may_be_insufficient_to_cover_all_content_bef"
          )}
        </p>
      )}
      {plan.reasons.map((reason) => (
        <p key={reason} className="text-sm text-foreground-muted">
          {reason}
        </p>
      ))}
      {c.blocked_count > 0 && (
        <p className="text-sm text-foreground-muted">
          {uiText(
            "webTask:unavailable_questions_remain_in_the_cycle_total_other_valid_questions_ca"
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          type="button"
          disabled={busy || unknown}
          onClick={() => void refresh()}
        >
          {uiText("webTask:check_sources")}
        </Button>
        {plan.can_start_next_cycle && (
          <Button
            type="button"
            disabled={busy || unknown}
            onClick={() => void inspect("next")}
          >
            {uiText("webTask:start_next_cycle")}
          </Button>
        )}
        {plan.can_restart_blocked_cycle && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || unknown}
            onClick={() => void inspect("restart_blocked")}
          >
            {uiText("webTask:abandon_this_cycle_and_regenerate")}
          </Button>
        )}
      </div>
      {error && !preview && (
        <p role="alert" className="text-sm text-danger">
          {uiText(error)}
        </p>
      )}
      {confirmation}
      <details className="border-t border-border/60 pt-4">
        <summary className="cursor-pointer text-sm font-medium">
          {uiText("webTask:coverage_cycle_history")}
        </summary>
        {history.isError ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {uiText("webTask:could_not_load_cycle_history")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {history.data?.items.map((h) => (
              <li key={h.id}>
                {uiText("webTask:cycle_v0", { v0: h.cycle_number })}
                {h.state === "completed"
                  ? uiText("webTask:completed")
                  : h.state === "cancelled"
                    ? uiText("webTask:cancelled")
                    : uiText("webTask:in_progress")}
                {uiText("webTask:coverage_v0_v1", {
                  v0: h.covered_count,
                  v1: h.total_count
                })}
              </li>
            ))}
          </ul>
        )}
        {history.data && (
          <Pager
            page={historyPage}
            total={history.data.pagination.total_pages}
            onChange={setHistoryPage}
          />
        )}
      </details>
      {plan.sources.length > 0 && (
        <ul className="space-y-2">
          {plan.sources.map((s) => (
            <li key={s.id} className="rounded-2xl bg-muted/70 p-3 text-sm">
              <p className="line-clamp-2 break-words">
                {s.name ?? uiText("webTask:source_unavailable")}
              </p>
              {s.available && (
                <p className="text-xs text-foreground-muted">
                  {s.personal_note &&
                    s.personal_note !== s.name &&
                    uiText("webTask:note_v0", { v0: s.personal_note })}
                  {s.author_name} ·{" "}
                  {s.state === "published"
                    ? uiText("webTask:public")
                    : uiText("webTask:private")}
                  {uiText("webTask:v0_entries", { v0: s.item_count! })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
