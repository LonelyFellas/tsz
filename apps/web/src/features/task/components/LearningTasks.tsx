"use client";
import { localText, type WebNotice, webErrorText } from "@/i18n/catalog";
import { useWebLocale, useWebText } from "@/i18n/client";

import { webTask } from "@/i18n/messages/task";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClientResponseError,
  RequestTimeoutError,
  HttpError
} from "@tsz/api-client";
import type {
  LearningRunState,
  LearningQuestionType,
  StartLearningRun,
  SubmitLearningAnswer
} from "@tsz/types";
import { api } from "@/lib/request";
import { cn } from "@tsz/ui/lib/cn";
import { LearningProgressBar as ProgressBar } from "./LearningProgressBar";
import { LearningPlanCreator } from "./LearningPlanCreator";
import { ChoiceAnswerField } from "./ChoiceAnswerField";
import { PlanCoverage, planStatusLabels } from "./PlanCoverage";
import { listPlans, detailPlan, historyPlans } from "./plan-api";
import { LearningAnswerAudio } from "./LearningAnswerAudio";
import { LearningRewardSummary } from "@/features/coins/LearningRewardSummary";
import { useUserStore } from "@/stores/user";
import { buttonClass, primaryButtonClass } from "@/features/wordlist/reading";
import {
  PageHeader,
  PageNotice,
  PageShell,
  Pager,
  Segmented,
  listCardClass,
  panelClass
} from "@/features/shell/Page";
const field =
  "mt-2 block min-h-11 w-full rounded-2xl border border-border bg-surface px-4 text-sm text-foreground transition-shadow placeholder:text-foreground-subtle focus-visible:border-primary/50 focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-primary/15 disabled:opacity-50";
const box = `${panelClass} space-y-6`;
const sectionTitle = "text-lg font-bold tracking-tight text-foreground";
const alertText = "text-sm text-danger";
const hintText = "text-sm leading-6 text-foreground-muted";
const retryLink =
  "ml-1 font-medium text-primary underline-offset-4 hover:underline";
function questionTypeLabel(type?: string, types?: LearningQuestionType[]) {
  if (types?.includes("choice_zh_to_en") && types.includes("spelling_zh_to_en"))
    return localText(
      webTask,
      "webTask:chinese_definition_multiple_choice_and_spelling"
    );
  return type === "choice_zh_to_en"
    ? localText(webTask, "webTask:chinese_definition_multiple_choice")
    : localText(webTask, "webTask:chinese_definition_spelling");
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted/70 px-4 py-3">
      <dt className="text-xs text-foreground-muted">{label}</dt>
      <dd className="mt-1 text-xl font-bold tabular-nums tracking-tight text-foreground">
        {value}
      </dd>
    </div>
  );
}

export const runLabels: Record<LearningRunState, WebNotice> = {
  active: localText(webTask, "webTask:in_progress"),
  completed: localText(webTask, "webTask:completed"),
  expired: localText(webTask, "webTask:expired"),
  invalidated: localText(webTask, "webTask:source_invalidated"),
  cancelled: localText(webTask, "webTask:cancelled")
};
export function learningError(error: unknown) {
  if (error instanceof HttpError && error.status === 404)
    return localText(
      webTask,
      "webTask:learning_is_not_ready_or_the_record_does_not_exist_try_again_later"
    );
  return webErrorText(
    error,
    localText(webTask, "webTask:request_failed_try_again")
  );
}
/** 恢复动作只读传输类型和稳定错误码，不依赖后端 detail 的语言。 */
export function learningReloadSuggested(error: unknown): boolean {
  return (
    error instanceof ClientResponseError ||
    (error instanceof RequestTimeoutError &&
      !["GET", "HEAD"].includes(error.method)) ||
    (error instanceof HttpError &&
      ["learning_task_conflict", "learning_run_unavailable"].includes(
        error.code ?? ""
      ))
  );
}

function Student({ children }: { children: (id: string) => ReactNode }) {
  const uiText = useWebText(webTask);
  const user = useUserStore((s) => s.user);
  if (!user) return null;
  if (!user.roles.includes("student"))
    return (
      <PageShell>
        <PageNotice tone="error">
          {uiText("webTask:you_need_a_student_role_to_use_learning_tasks")}
        </PageNotice>
      </PageShell>
    );
  return children(user.id);
}
function useOperation(userId: string) {
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    return () => c.abort();
  }, []);
  return {
    options: () => ({ signal: controller.current?.signal }),
    current: () =>
      !controller.current?.signal.aborted &&
      useUserStore.getState().user?.id === userId
  };
}
export function LearningTaskList() {
  return <Student>{(id) => <TaskList key={id} userId={id} />}</Student>;
}
function TaskList({ userId }: { userId: string }) {
  const uiText = useWebText(webTask);
  const [page, setPage] = useState(1);
  const [archived, setArchived] = useState(false);
  const q = useQuery({
    queryKey: [
      "learning-plans",
      userId,
      "v1-with-legacy",
      "tasks",
      page,
      archived
    ],
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    queryFn: ({ signal }) =>
      listPlans({ page, state: archived ? "archived" : "active" }, { signal })
  });
  return (
    <PageShell>
      <PageHeader
        eyebrow={uiText("webTask:my_learning")}
        title={uiText("webTask:my_learning_tasks")}
        description={uiText(
          "webTask:read_chinese_definitions_and_practise_spelling_or_choosing_english_answe"
        )}
        actions={
          <Link
            className={cn(primaryButtonClass, "min-h-10 px-5")}
            href="/student/tasks/new"
          >
            {uiText("webTask:create_task")}
          </Link>
        }
      />
      <div className="space-y-6">
        <LearningRewardSummary key={userId} userId={userId} taskList />
        <Segmented
          label={uiText("webTask:task_status")}
          value={archived}
          options={[
            { value: false, label: uiText("webTask:in_progress") },
            { value: true, label: uiText("webTask:archived") }
          ]}
          onChange={(value) => {
            setArchived(value);
            setPage(1);
          }}
        />
        {q.isError ? (
          <PageNotice tone="error">
            {uiText(learningError(q.error))}
            <button className={retryLink} onClick={() => void q.refetch()}>
              {uiText("webTask:retry")}
            </button>
          </PageNotice>
        ) : q.isPending ? (
          <PageNotice>{uiText("webTask:loading_tasks")}</PageNotice>
        ) : (
          <>
            {q.data.items.length === 0 && (
              <PageNotice>
                {uiText(
                  "webTask:no_tasks_yet_choose_a_word_list_to_create_one"
                )}
              </PageNotice>
            )}
            <ul className="space-y-4">
              {q.data.items.map((plan) => {
                const { task, current_run: r, current_cycle: c } = plan;
                return (
                  <li key={task.id}>
                    <Link
                      className={`${listCardClass} group`}
                      href={`/student/tasks/${task.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-xs font-medium tracking-[0.2em] text-foreground-muted">
                            {task.task_type === "daily"
                              ? uiText("webTask:daily_task")
                              : uiText("webTask:long_term_task")}
                            {uiText("webTask:v0_v1_word_lists", {
                              v0: uiText(
                                questionTypeLabel(
                                  task.question_type,
                                  plan.question_types
                                )
                              ),
                              v1: task.wordlist_ids.length
                            })}
                          </p>
                          <h2 className="mt-2 truncate text-xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                            {task.name}
                          </h2>
                        </div>
                        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground-muted">
                          {plan.mode !== "legacy_v1"
                            ? uiText(planStatusLabels[plan.status])
                            : r
                              ? uiText(runLabels[r.state])
                              : task.task_type === "daily"
                                ? uiText("webTask:not_started_today")
                                : uiText("webTask:not_started")}
                        </span>
                      </div>
                      {c ? (
                        <div className="mt-5 space-y-2">
                          <ProgressBar
                            value={c.covered_count}
                            max={c.total_count}
                            label={uiText(
                              "webTask:v0_coverage_progress_this_cycle",
                              {
                                v0: task.name
                              }
                            )}
                          />
                          <p className="text-sm text-foreground-muted">
                            {plan.mastery
                              ? uiText("webTask:confirmed_across_days_3")
                              : uiText("webTask:covered_this_cycle")}{" "}
                            {c.covered_count}/{c.total_count}{" "}
                            {plan.mastery
                              ? uiText("webTask:meanings")
                              : uiText("webTask:questions_2")}
                            {c.blocked_count > 0 &&
                              uiText("webTask:v0_unavailable_questions", {
                                v0: c.blocked_count
                              })}
                          </p>
                          {task.task_type === "daily" && r && (
                            <p className="text-sm text-foreground-muted">
                              {uiText("webTask:answered_today_v0_v1", {
                                v0: r.answered_count,
                                v1: r.target_count
                              })}
                            </p>
                          )}
                        </div>
                      ) : r ? (
                        <div className="mt-5 space-y-2">
                          <ProgressBar
                            value={r.answered_count}
                            max={r.target_count}
                            label={uiText("webTask:v0_progress_this_round", {
                              v0: task.name
                            })}
                          />
                          <p className="text-sm tabular-nums text-foreground-muted">
                            {uiText("webTask:v0_v1_questions", {
                              v0: r.answered_count,
                              v1: r.target_count
                            })}
                          </p>
                        </div>
                      ) : (
                        task.task_type === "daily" && (
                          <p className="mt-5 text-sm text-foreground-muted">
                            {uiText("webTask:daily_v0_questions", {
                              v0: task.daily_question_count!
                            })}
                          </p>
                        )
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Pager
              page={page}
              total={q.data.pagination.total_pages}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </PageShell>
  );
}
export function LearningTaskCreator({
  wordlistId,
  owned = false,
  directPractice = false
}: {
  wordlistId?: string;
  owned?: boolean;
  directPractice?: boolean;
} = {}) {
  return (
    <Student>
      {(id) => (
        <LearningPlanCreator
          key={`${id}:${wordlistId ?? "manual"}:${owned}:${directPractice}`}
          userId={id}
          wordlistId={wordlistId}
          owned={owned}
          directPractice={directPractice}
        />
      )}
    </Student>
  );
}
export function LearningTaskPage({ id }: { id: string }) {
  return (
    <Student>
      {(userId) => (
        <TaskDetail key={`${userId}:${id}`} userId={userId} id={id} />
      )}
    </Student>
  );
}
function TaskDetail({ userId, id }: { userId: string; id: string }) {
  const locale = useWebLocale();
  const uiText = useWebText(webTask);
  const router = useRouter();
  const op = useOperation(userId);
  const [page, setPage] = useState(1);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<WebNotice>("");
  const intent = useRef<StartLearningRun | null>(null);
  const q = useQuery({
    queryKey: ["learning-plans", userId, "v1-with-legacy", "task", id],
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    queryFn: ({ signal }) => detailPlan(id, { signal })
  });
  const history = useQuery({
    queryKey: ["learning-plans", userId, "v1-with-legacy", "history", id, page],
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    queryFn: ({ signal }) => historyPlans(id, { page }, { signal })
  });
  async function start(after: string | null) {
    if (!q.data) return;
    setBusy(true);
    setError("");
    try {
      intent.current ??= {
        idempotency_key: crypto.randomUUID(),
        expected_revision: q.data.task.revision,
        after_run_id: after
      };
      const r = await (
        q.data.mode !== "legacy_v1" ? api.learningPlans : api.learning
      ).start(id, intent.current, op.options());
      if (op.current()) router.push(`/student/practice/${r.id}`);
    } catch (e) {
      if (op.current()) {
        setError(learningError(e));
        if (e instanceof HttpError && e.status < 500 && e.status !== 408)
          intent.current = null;
        await q.refetch();
      }
    } finally {
      if (op.current()) setBusy(false);
    }
  }
  async function update(archive = false) {
    if (!q.data) return;
    setBusy(true);
    setError("");
    try {
      if (archive)
        await (
          q.data.mode !== "legacy_v1" ? api.learningPlans : api.learning
        ).archive(
          id,
          { expected_revision: q.data.task.revision },
          op.options()
        );
      else
        await (
          q.data.mode !== "legacy_v1" ? api.learningPlans : api.learning
        ).rename(
          id,
          { expected_revision: q.data.task.revision, name },
          op.options()
        );
      if (op.current()) {
        setName("");
        await q.refetch();
        await history.refetch();
      }
    } catch (e) {
      if (op.current()) setError(learningError(e));
    } finally {
      if (op.current()) setBusy(false);
    }
  }
  if (q.isError)
    return (
      <PageShell>
        <PageNotice tone="error">
          {uiText(learningError(q.error))}
          <button className={retryLink} onClick={() => void q.refetch()}>
            {uiText("webTask:retry")}
          </button>
        </PageNotice>
      </PageShell>
    );
  if (!q.data)
    return (
      <PageShell>
        <PageNotice>{uiText("webTask:loading_tasks")}</PageNotice>
      </PageShell>
    );
  const { task, current_run: r } = q.data;
  return (
    <PageShell>
      <PageHeader
        back={{ href: "/student/practice", label: uiText("webTask:my_tasks") }}
        eyebrow={`${task.task_type === "daily" ? uiText("webTask:daily_task") : uiText("webTask:long_term_task")} · ${uiText(questionTypeLabel(task.question_type, q.data.question_types))}`}
        title={task.name}
        description={
          <>
            {q.data.mastery
              ? uiText(
                  "webTask:new_words_and_due_reviews_follow_your_mastery_with_up_to_30_questions_in"
                )
              : task.task_type === "daily"
                ? uiText(
                    "webTask:v0_questions_daily_day_changes_at_04_00_beijing_time",
                    {
                      v0: task.daily_question_count!
                    }
                  )
                : uiText(
                    "webTask:long_term_task_each_cycle_covers_all_eligible_content"
                  )}
            {task.ends_at && (
              <>
                <br />
                {uiText("webTask:ends")}
                {new Date(task.ends_at).toLocaleString(locale, {
                  timeZone: "Asia/Shanghai"
                })}
                {uiText("webTask:beijing_time")}
              </>
            )}
          </>
        }
      />
      <div className="space-y-6">
        <div className={box}>
          <PlanCoverage
            plan={q.data}
            userId={userId}
            refresh={() => q.refetch()}
          />
          {q.data.mode === "legacy_v1" && (
            <>
              <div className="flex items-center justify-between gap-3">
                <h2 className={sectionTitle}>
                  {uiText("webTask:progress_this_round")}
                </h2>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground-muted">
                  {r
                    ? uiText(runLabels[r.state])
                    : uiText("webTask:not_started")}
                </span>
              </div>
              {r ? (
                <>
                  <dl className="grid grid-cols-3 gap-3">
                    <Stat
                      label={uiText("webTask:answered")}
                      value={r.answered_count}
                    />
                    <Stat
                      label={uiText("webTask:target")}
                      value={r.target_count}
                    />
                    <Stat
                      label={uiText("webTask:correct")}
                      value={r.correct_count}
                    />
                  </dl>
                  <ProgressBar
                    value={r.answered_count}
                    max={r.target_count}
                    label={
                      r.practice_mode
                        ? uiText("webTask:progress_this_practice")
                        : uiText("webTask:progress_this_round")
                    }
                  />
                </>
              ) : (
                <p className={hintText}>
                  {uiText(
                    "webTask:progress_and_accuracy_appear_here_after_you_start"
                  )}
                </p>
              )}
              {r?.state === "invalidated" && (
                <p className={hintText}>
                  {uiText(
                    "webTask:entry_or_word_list_sources_changed_so_this_round_cannot_continue_submitt"
                  )}
                </p>
              )}
            </>
          )}
          <div className="flex flex-wrap gap-3">
            {r && (
              <Link
                className={
                  r.state === "active" && q.data.can_start
                    ? primaryButtonClass
                    : buttonClass
                }
                href={`/student/practice/${r.id}`}
              >
                {r.state === "active" && q.data.can_start
                  ? uiText("webTask:continue_practice")
                  : uiText("webTask:view_records")}
              </Link>
            )}
            {task.state === "active" &&
              (q.data.mode !== "legacy_v1"
                ? q.data.can_start &&
                  (!r || (q.data.mode === "mastery_v1" && r.state !== "active"))
                : !r ||
                  ([
                    "completed",
                    "expired",
                    "invalidated",
                    "cancelled"
                  ].includes(r.state) &&
                    !(
                      task.task_type === "daily" && r.state === "completed"
                    ))) && (
                <button
                  className={r ? buttonClass : primaryButtonClass}
                  disabled={busy}
                  onClick={() => void start(r?.id ?? null)}
                >
                  {r
                    ? q.data.mode === "mastery_v1"
                      ? uiText("webTask:start_next_practice")
                      : uiText("webTask:restart_a_round")
                    : uiText("webTask:start_practice")}
                </button>
              )}
          </div>
          {error && (
            <p role="alert" className={alertText}>
              {uiText(error)}
            </p>
          )}
          {task.state === "active" && (
            <details className="group border-t border-border/60 pt-5">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-foreground-muted transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                {uiText("webTask:manage_task")}
                <span
                  className="transition-transform group-open:rotate-90"
                  aria-hidden
                >
                  ›
                </span>
              </summary>
              <div className="mt-5 space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <input
                    className={cn(field, "mt-0 flex-1")}
                    maxLength={q.data.mode !== "legacy_v1" ? undefined : 100}
                    aria-label={uiText("webTask:new_task_name")}
                    placeholder={uiText("webTask:new_task_name")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <button
                    disabled={busy || !name.trim()}
                    className={buttonClass}
                    onClick={() => void update()}
                  >
                    {uiText("webTask:rename")}
                  </button>
                </div>
                <div className="flex flex-col gap-3 rounded-2xl bg-muted/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className={hintText}>
                    {uiText(
                      "webTask:archiving_cancels_unfinished_rounds_and_preserves_completed_history"
                    )}
                  </p>
                  <button
                    disabled={busy}
                    className={cn(buttonClass, "text-danger")}
                    onClick={() => void update(true)}
                  >
                    {uiText("webTask:archive_task")}
                  </button>
                </div>
              </div>
            </details>
          )}
        </div>
        <div className={box}>
          <h2 className={sectionTitle}>{uiText("webTask:learning_history")}</h2>
          {history.isError ? (
            <p role="alert" className={alertText}>
              {uiText("webTask:could_not_load_history")}
            </p>
          ) : history.data?.items.length === 0 ? (
            <p className={hintText}>
              {uiText("webTask:no_learning_records_yet")}
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {history.data?.items.map(({ run: h, cycle_id }) => (
                <li key={h.id}>
                  <Link
                    className="-mx-3 flex items-center justify-between gap-4 rounded-2xl px-3 py-3.5 transition-colors hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-primary"
                    href={`/student/practice/${h.id}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium tabular-nums text-foreground">
                        {h.business_day ??
                          new Date(h.started_at).toLocaleDateString(locale, {
                            timeZone:
                              Intl.DateTimeFormat().resolvedOptions().timeZone
                          })}
                      </span>
                      <span className="text-xs text-foreground-muted">
                        {uiText(runLabels[h.state])}
                        {cycle_id &&
                          (h.practice_mode
                            ? uiText("webTask:mastery_practice")
                            : uiText("webTask:coverage_plan_batch"))}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-foreground-muted">
                      {uiText("webTask:v0_v1_answered_v2_correct", {
                        v0: h.answered_count,
                        v1: h.target_count,
                        v2: h.correct_count
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {history.data && (
            <Pager
              page={page}
              total={history.data.pagination.total_pages}
              onChange={setPage}
            />
          )}
        </div>
      </div>
    </PageShell>
  );
}
export function LearningPractice({ id }: { id: string }) {
  return (
    <Student>
      {(userId) => <Practice key={`${userId}:${id}`} userId={userId} id={id} />}
    </Student>
  );
}
function Practice({ userId, id }: { userId: string; id: string }) {
  const locale = useWebLocale();
  const uiText = useWebText(webTask);
  const client = useQueryClient();
  const op = useOperation(userId);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<{
    questionId: string;
    value: string;
  } | null>(null);
  const [error, updateError] = useState<WebNotice>("");
  const [reloadSuggested, setReloadSuggested] = useState(false);
  const setError = (notice: WebNotice, cause?: unknown) => {
    updateError(notice);
    setReloadSuggested(learningReloadSuggested(cause));
  };
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [pending, setPending] = useState<SubmitLearningAnswer | null>(null);
  const run = useQuery({
    queryKey: ["learning", userId, "run", id],
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    queryFn: ({ signal }) => api.learning.run(id, { signal })
  });
  const qs = useQuery({
    queryKey: ["learning", userId, "questions", id, page],
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    queryFn: ({ signal }) =>
      api.learning.questions(id, { page, page_size: 50 }, { signal })
  });
  const plan = useQuery({
    queryKey: [
      "learning-plans",
      userId,
      "v1-with-legacy",
      "practice",
      run.data?.task_id,
      run.data?.answered_count
    ],
    enabled: !!run.data?.task_id,
    queryFn: ({ signal }) => detailPlan(run.data!.task_id, { signal }),
    retry: false
  });
  async function locate() {
    if (!qs.data) return;
    setLocating(true);
    setError("");
    try {
      for (let p = 1; p <= qs.data.pagination.total_pages; p++) {
        const result =
          p === page
            ? qs.data
            : await api.learning.questions(
                id,
                { page: p, page_size: 50 },
                op.options()
              );
        if (!op.current()) return;
        if (result.items.some((q) => !q.answered && q.content_available)) {
          client.setQueryData(["learning", userId, "questions", id, p], result);
          setPage(p);
          return;
        }
      }
      setError(
        localText(
          webTask,
          "webTask:no_valid_unanswered_content_in_this_batch_progress_is_preserved_check_th"
        )
      );
    } catch (e) {
      if (op.current()) setError(learningError(e), e);
    } finally {
      if (op.current()) setLocating(false);
    }
  }
  const next = qs.data?.items.find((q) => !q.answered && q.content_available);
  const pendingAccepted =
    !!pending &&
    !!qs.data?.items.some((q) => q.id === pending.question_id && q.answered);
  const uncertain = !!pending && !pendingAccepted && !busy;
  const answer = draft?.questionId === next?.id ? (draft?.value ?? "") : "";
  async function submit(unsure = false) {
    const submittedValue = unsure ? "不确定" : answer;
    const replaying = !!pending && !pendingAccepted;
    if (submitting.current || (!replaying && run.data?.state !== "active"))
      return;
    const isChoice = !!next?.options;
    if (
      (!pending || pendingAccepted) &&
      (!submittedValue.trim() ||
        (isChoice &&
          !unsure &&
          !next?.options?.some((option) => option.option_id === answer)))
    )
      return;
    const submission =
      pending && !pendingAccepted
        ? pending
        : next
          ? {
              idempotency_key: crypto.randomUUID(),
              question_id: next.id,
              answer: submittedValue
            }
          : null;
    if (!submission) return;
    submitting.current = true;
    setPending(submission);
    setBusy(true);
    setError("");
    try {
      await api.learning.answer(id, submission, op.options());
      if (op.current()) {
        setPending(null);
        setDraft(null);
        await Promise.all([run.refetch(), qs.refetch()]);
      }
    } catch (e) {
      if (op.current()) {
        setError(learningError(e), e);
        const [, refreshed] = await Promise.all([run.refetch(), qs.refetch()]);
        if (!op.current()) return;
        const accepted = refreshed.data?.items.some(
          (q) => q.id === submission.question_id && q.answered
        );
        if (accepted) {
          setDraft(null);
          setError("");
        }
        if (
          (e instanceof HttpError && e.status < 500 && e.status !== 408) ||
          accepted
        ) {
          setPending(null);
        }
      }
    } finally {
      submitting.current = false;
      if (op.current()) setBusy(false);
    }
  }
  if (run.isError || qs.isError)
    return (
      <PageShell>
        <PageNotice tone="error">
          {uiText(learningError(run.error ?? qs.error))}
          <button
            className={retryLink}
            onClick={() => void Promise.all([run.refetch(), qs.refetch()])}
          >
            {uiText("webTask:retry")}
          </button>
        </PageNotice>
      </PageShell>
    );
  if (!run.data || !qs.data)
    return (
      <PageShell>
        <PageNotice>
          {uiText("webTask:restoring_progress_from_the_server")}
        </PageNotice>
      </PageShell>
    );
  const r = run.data;
  const choice = !!next?.options;
  const choiceTask = r.question_type === "choice_zh_to_en";
  const includesSpelling =
    !choiceTask ||
    plan.data?.question_types?.includes("spelling_zh_to_en") === true ||
    qs.data.items.some((q) => q.answered && q.content_available && !q.options);
  const records = qs.data.items.filter(
    (q) => q.answered || !q.content_available
  );
  return (
    <PageShell>
      <PageHeader
        back={{
          href: `/student/tasks/${r.task_id}`,
          label:
            r.state === "invalidated"
              ? uiText("webTask:back_to_task_to_restart")
              : uiText("webTask:task_and_history")
        }}
        eyebrow={`${uiText(runLabels[r.state])} · ${r.settings.cefr_level} / ${r.settings.english_variant}`}
        title={
          r.state === "completed"
            ? uiText("webTask:batch_completed")
            : choiceTask && next && !choice
              ? uiText("webTask:chinese_definition_spelling")
              : uiText(questionTypeLabel(r.question_type))
        }
        description={
          <>
            {r.practice_mode
              ? uiText(
                  "webTask:up_to_30_questions_including_retries_per_practice_an_incorrect_question"
                )
              : uiText("webTask:completion_counts_valid_answers")}
            {choice &&
              uiText(
                "webTask:choose_an_english_option_and_submit_multiple_choice_results_do_not_affec"
              )}
            {choiceTask &&
              next &&
              !choice &&
              uiText(
                "webTask:no_suitable_multiple_choice_options_for_this_question_it_has_switched_to"
              )}
            {r.expires_at && (
              <>
                {uiText("webTask:deadline")}
                {new Date(r.expires_at).toLocaleString(locale, {
                  timeZone: "Asia/Shanghai"
                })}
                {uiText("webTask:beijing_time")}
              </>
            )}
          </>
        }
      />
      <div className="space-y-6">
        {r.state === "completed" && includesSpelling && (
          <Link className={buttonClass} href="/student/review">
            {uiText("webTask:view_consolidation_and_review_schedule")}
          </Link>
        )}
        {r.task_type === "daily" &&
          plan.data?.current_cycle &&
          !r.practice_mode && (
            <div className="rounded-2xl bg-muted/70 p-4 text-sm">
              <p>
                {uiText("webTask:task_cycle_v0_v1_v2_covered_v3_unavailable", {
                  v0: plan.data.current_cycle.cycle_number,
                  v1: plan.data.current_cycle.covered_count,
                  v2: plan.data.current_cycle.total_count,
                  v3: plan.data.current_cycle.blocked_count
                })}
              </p>
              {r.task_type === "daily" && (
                <p>
                  {uiText(
                    "webTask:today_s_batch_and_cycle_coverage_are_tracked_separately_partial_valid_an"
                  )}
                </p>
              )}
            </div>
          )}
        <div className="glass rounded-3xl p-2">
          <div className="space-y-8 rounded-[20px] bg-surface/70 px-6 py-8 sm:px-10 sm:py-10">
            <div className="space-y-3">
              <ProgressBar
                value={r.answered_count}
                max={r.target_count}
                label={
                  r.practice_mode
                    ? uiText("webTask:progress_this_practice")
                    : uiText("webTask:progress_this_round")
                }
              />
              <div className="flex flex-wrap justify-between gap-2 text-sm tabular-nums text-foreground-muted">
                <p>
                  {uiText("webTask:answered_v0_v1_correct_v2", {
                    v0: r.answered_count,
                    v1: r.target_count,
                    v2: r.correct_count
                  })}
                  {r.practice_mode &&
                    r.state === "active" &&
                    uiText("webTask:up_to_30_questions_this_practice")}
                </p>
                <p className="font-medium text-foreground">
                  {uiText("webTask:accuracy")}{" "}
                  {r.answered_count
                    ? Math.round((r.correct_count / r.answered_count) * 100)
                    : 0}
                  %
                </p>
              </div>
            </div>
            {r.state === "active" && next ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
                className="space-y-6 text-center"
              >
                <div>
                  <h2 className="mx-auto max-w-xl text-balance">
                    <span className="block text-xs font-medium tracking-[0.2em] text-foreground-muted">
                      {uiText("webTask:question_v0", { v0: next.position + 1 })}
                      {next.practice_kind === "retry"
                        ? uiText("webTask:retry_incorrect_answer")
                        : next.practice_kind === "review"
                          ? uiText("webTask:due_review")
                          : ""}
                      {next.prompt?.part_of_speech &&
                        ` · ${next.prompt.part_of_speech}`}
                    </span>
                    <span className="mt-4 block text-2xl font-bold leading-snug tracking-tight text-foreground sm:text-[32px]">
                      {next.prompt?.definition}
                    </span>
                  </h2>
                  <div
                    className="mx-auto mt-5 h-1 w-10 rounded-full bg-primary"
                    aria-hidden
                  />
                </div>
                {choice ? (
                  <ChoiceAnswerField
                    question={next}
                    value={answer}
                    disabled={busy || uncertain}
                    onChange={(value) =>
                      setDraft({ questionId: next.id, value })
                    }
                  />
                ) : (
                  <input
                    className="mx-auto block min-h-14 w-full max-w-md rounded-full border border-border bg-surface px-6 text-center text-xl font-medium tracking-wide text-foreground transition-shadow placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-foreground-subtle focus-visible:border-primary/50 focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-primary/15 disabled:opacity-50"
                    aria-label={uiText("webTask:english_spelling")}
                    placeholder={uiText("webTask:enter_the_english_spelling")}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={200}
                    value={answer}
                    disabled={busy || uncertain}
                    onChange={(e) =>
                      setDraft({ questionId: next.id, value: e.target.value })
                    }
                  />
                )}
                {r.practice_mode && !uncertain && (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void submit(true)}
                  >
                    {uiText("webTask:not_sure")}
                  </button>
                )}
                {!uncertain && (
                  <button
                    className={`${primaryButtonClass} min-w-40`}
                    disabled={busy || !answer.trim()}
                    type="submit"
                  >
                    {busy
                      ? uiText("webTask:submitting")
                      : uiText("webTask:submit_answer")}
                  </button>
                )}
              </form>
            ) : (
              <p className="py-6 text-center text-base text-foreground-muted">
                {r.state === "active"
                  ? uiText(
                      "webTask:no_valid_unanswered_questions_on_this_page_locate_questions_on_other_pag"
                    )
                  : r.state === "invalidated"
                    ? uiText(
                        "webTask:entry_or_word_list_sources_changed_so_this_round_cannot_continue_submitt_2"
                      )
                    : r.state !== "completed"
                      ? uiText(
                          "webTask:this_round_cannot_continue_answer_history_is_available_return_to_the_tas"
                        )
                      : r.practice_mode
                        ? uiText(
                            "webTask:practice_completed_correct_words_await_confirmation_on_later_days_unfini"
                          )
                        : uiText("webTask:round_completion_saved")}
              </p>
            )}
            {r.state === "active" && !next && (
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy || uncertain || locating}
                  onClick={() => void locate()}
                >
                  {locating
                    ? uiText("webTask:locating")
                    : uiText("webTask:locate_answerable_question")}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy || uncertain}
                  onClick={() =>
                    void Promise.all([
                      run.refetch(),
                      qs.refetch(),
                      plan.refetch()
                    ])
                  }
                >
                  {uiText("webTask:check_sources")}
                </button>
              </div>
            )}
            {error && !pendingAccepted && (
              <p role="alert" className={`${alertText} text-center`}>
                {uiText(error)}
              </p>
            )}
            {reloadSuggested && (
              <button
                className={buttonClass}
                type="button"
                onClick={() => {
                  if (
                    !draft?.value ||
                    window.confirm(
                      uiText(
                        "webTask:reloading_discards_your_unsubmitted_answer_reload"
                      )
                    )
                  )
                    window.location.reload();
                }}
              >
                {uiText("webTask:reload_page")}
              </button>
            )}
            {uncertain && (
              <div className="space-y-3 text-center">
                <button
                  className={primaryButtonClass}
                  type="button"
                  onClick={() => void submit()}
                >
                  {uiText("webTask:retry_original_answer")}
                </button>
                <p className={hintText}>
                  {uiText(
                    "webTask:the_result_is_unconfirmed_your_original_answer_is_preserved_and_the_same"
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
        {r.task_type === "daily" && r.business_day && (
          <LearningRewardSummary
            key={`${userId}:${r.business_day}`}
            userId={userId}
            businessDay={r.business_day}
            completionId={r.completion_id}
          />
        )}
        <div className={box}>
          <h2 className={sectionTitle}>
            {r.practice_mode
              ? uiText("webTask:practice_records")
              : uiText("webTask:round_records")}
          </h2>
          {records.length === 0 && (
            <p className={hintText}>
              {uiText("webTask:no_answer_records_on_this_page_yet")}
            </p>
          )}
          <ul className="space-y-3" aria-live="polite">
            {records.map((q) => (
              <li
                className={`rounded-2xl border px-4 py-3.5 ${
                  !q.feedback
                    ? "border-border bg-muted/50"
                    : q.feedback.is_correct
                      ? "border-success/25 bg-success/5"
                      : "border-danger/25 bg-danger/5"
                }`}
                key={q.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-foreground">
                    <span className="mr-2 tabular-nums text-foreground-muted">
                      {q.position + 1}.
                    </span>
                    {q.prompt?.definition ??
                      uiText(
                        "webTask:source_content_is_currently_inaccessible"
                      )}
                  </p>
                  {q.feedback && (
                    <span
                      className={`shrink-0 text-xs font-medium ${
                        q.feedback.is_correct ? "text-success" : "text-danger"
                      }`}
                    >
                      {q.feedback.is_correct
                        ? uiText("webTask:correct_2")
                        : uiText("webTask:incorrect")}
                    </span>
                  )}
                </div>
                {q.feedback && (
                  <p className="mt-2 text-xs leading-5 text-foreground-muted">
                    {uiText("webTask:your_answer")}
                    <span className="font-medium text-foreground">
                      {q.options
                        ? (q.options?.find(
                            (option) =>
                              option.option_id === q.feedback?.submitted_answer
                          )?.spelling ?? q.feedback.submitted_answer)
                        : q.feedback.submitted_answer}
                    </span>
                    <span className="mx-2">·</span>
                    {q.options
                      ? uiText("webTask:correct_answer")
                      : uiText("webTask:accepted_spellings")}
                    {q.feedback.accepted_answers.join(" / ")}
                  </p>
                )}
                {q.answered && q.feedback && (
                  <LearningAnswerAudio
                    runId={id}
                    questionId={q.id}
                    userId={userId}
                    available={q.content_available}
                    accent={r.settings.english_variant === "AmE" ? "us" : "uk"}
                  />
                )}
                {q.feedback?.explanation && (
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-foreground-muted">
                    {q.feedback.explanation}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <Pager
            page={page}
            total={qs.data.pagination.total_pages}
            disabled={busy || uncertain}
            onChange={(p) => {
              setPending(null);
              setPage(p);
              setDraft(null);
              setError("");
            }}
          />
        </div>
      </div>
    </PageShell>
  );
}
