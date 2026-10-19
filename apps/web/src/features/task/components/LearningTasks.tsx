"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HttpError } from "@tsz/api-client";
import type {
  LearningRunState,
  StartLearningRun,
  SubmitLearningAnswer
} from "@tsz/types";
import { api } from "@/lib/request";
import { cn } from "@tsz/ui/lib/cn";
import { LearningProgressBar as ProgressBar } from "./LearningProgressBar";
import { LearningPlanCreator } from "./LearningPlanCreator";
import { PlanCoverage, planStatusLabels } from "./PlanCoverage";
import { listPlans, detailPlan, historyPlans } from "./plan-api";
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

export const runLabels: Record<LearningRunState, string> = {
  active: "进行中",
  completed: "已完成",
  expired: "已过期",
  invalidated: "来源已失效",
  cancelled: "已取消"
};
export function learningError(error: unknown) {
  if (error instanceof HttpError && error.status === 404)
    return "学习功能尚未就绪或该记录不存在，请稍后重试。";
  return error instanceof Error ? error.message : "请求失败，请重试。";
}
function Student({ children }: { children: (id: string) => ReactNode }) {
  const user = useUserStore((s) => s.user);
  if (!user) return null;
  if (!user.roles.includes("student"))
    return (
      <PageShell>
        <PageNotice tone="error">需要学生身份才能使用学习任务。</PageNotice>
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
        eyebrow="我的学习"
        title="我的学习任务"
        description="看中文释义，拼写英文。每题有效作答后计入进度，正确率单独统计。每日北京时间 04:00 换日。"
        actions={
          <Link
            className={cn(primaryButtonClass, "min-h-10 px-5")}
            href="/student/tasks/new"
          >
            创建任务
          </Link>
        }
      />
      <div className="space-y-6">
        <LearningRewardSummary key={userId} userId={userId} />
        <Segmented
          label="任务状态"
          value={archived}
          options={[
            { value: false, label: "进行中" },
            { value: true, label: "已归档" }
          ]}
          onChange={(value) => {
            setArchived(value);
            setPage(1);
          }}
        />
        {q.isError ? (
          <PageNotice tone="error">
            {learningError(q.error)}
            <button className={retryLink} onClick={() => void q.refetch()}>
              重试
            </button>
          </PageNotice>
        ) : q.isPending ? (
          <PageNotice>正在读取任务…</PageNotice>
        ) : (
          <>
            {q.data.items.length === 0 && (
              <PageNotice>暂无任务，先选择词表创建一个吧。</PageNotice>
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
                              ? "每日任务"
                              : "长期任务"}
                            {" · "}
                            {task.wordlist_ids.length} 个词表
                          </p>
                          <h2 className="mt-2 truncate text-xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                            {task.name}
                          </h2>
                        </div>
                        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground-muted">
                          {plan.mode === "coverage_v1"
                            ? planStatusLabels[plan.status]
                            : r
                              ? runLabels[r.state]
                              : task.task_type === "daily"
                                ? "今日未开始"
                                : "尚未开始"}
                        </span>
                      </div>
                      {c ? (
                        <div className="mt-5 space-y-2">
                          <ProgressBar
                            value={c.covered_count}
                            max={c.total_count}
                            label={`${task.name} 本轮覆盖进度`}
                          />
                          <p className="text-sm text-foreground-muted">
                            本轮已覆盖 {c.covered_count}/{c.total_count} 题
                            {c.blocked_count > 0 &&
                              ` · 不可用 ${c.blocked_count} 题`}
                          </p>
                          {task.task_type === "daily" && r && (
                            <p className="text-sm text-foreground-muted">
                              今日已答 {r.answered_count}/{r.target_count} 题
                            </p>
                          )}
                        </div>
                      ) : r ? (
                        <div className="mt-5 space-y-2">
                          <ProgressBar
                            value={r.answered_count}
                            max={r.target_count}
                            label={`${task.name} 本轮进度`}
                          />
                          <p className="text-sm tabular-nums text-foreground-muted">
                            {r.answered_count}/{r.target_count} 题
                          </p>
                        </div>
                      ) : (
                        task.task_type === "daily" && (
                          <p className="mt-5 text-sm text-foreground-muted">
                            每日 {task.daily_question_count} 题
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
export function LearningTaskCreator() {
  return (
    <Student>{(id) => <LearningPlanCreator key={id} userId={id} />}</Student>
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
  const router = useRouter();
  const op = useOperation(userId);
  const [page, setPage] = useState(1);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
        q.data.mode === "coverage_v1" ? api.learningPlans : api.learning
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
          q.data.mode === "coverage_v1" ? api.learningPlans : api.learning
        ).archive(
          id,
          { expected_revision: q.data.task.revision },
          op.options()
        );
      else
        await (
          q.data.mode === "coverage_v1" ? api.learningPlans : api.learning
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
          {learningError(q.error)}
          <button className={retryLink} onClick={() => void q.refetch()}>
            重试
          </button>
        </PageNotice>
      </PageShell>
    );
  if (!q.data)
    return (
      <PageShell>
        <PageNotice>正在读取任务…</PageNotice>
      </PageShell>
    );
  const { task, current_run: r } = q.data;
  return (
    <PageShell>
      <PageHeader
        back={{ href: "/student/practice", label: "我的任务" }}
        eyebrow={task.task_type === "daily" ? "每日任务" : "长期任务"}
        title={task.name}
        description={
          <>
            {task.task_type === "daily"
              ? `每日 ${task.daily_question_count} 题 · 北京时间 04:00 换日`
              : "长期任务 · 每轮覆盖全部可出题内容"}
            {task.ends_at && (
              <>
                <br />
                结束时间：
                {new Date(task.ends_at).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai"
                })}
                （北京时间）
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
                <h2 className={sectionTitle}>本轮进度</h2>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground-muted">
                  {r ? runLabels[r.state] : "尚未开始"}
                </span>
              </div>
              {r ? (
                <>
                  <dl className="grid grid-cols-3 gap-3">
                    <Stat label="已答" value={r.answered_count} />
                    <Stat label="目标" value={r.target_count} />
                    <Stat label="答对" value={r.correct_count} />
                  </dl>
                  <ProgressBar value={r.answered_count} max={r.target_count} />
                </>
              ) : (
                <p className={hintText}>开始后，进度和正确率会显示在这里。</p>
              )}
              {r?.state === "invalidated" && (
                <p className={hintText}>
                  本轮词条或词表来源发生变化，无法继续。已提交的作答记录仍保留；请检查来源后重新开始一轮。恢复词条不会自动恢复旧轮次。
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
                  ? "继续练习"
                  : "查看记录"}
              </Link>
            )}
            {task.state === "active" &&
              (q.data.mode === "coverage_v1"
                ? q.data.can_start && !r
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
                  {r ? "重新开始一轮" : "开始练习"}
                </button>
              )}
          </div>
          {error && (
            <p role="alert" className={alertText}>
              {error}
            </p>
          )}
          {task.state === "active" && (
            <details className="group border-t border-border/60 pt-5">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-foreground-muted transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                管理任务
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
                    maxLength={q.data.mode === "coverage_v1" ? undefined : 100}
                    aria-label="新任务名称"
                    placeholder="新任务名称"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <button
                    disabled={busy || !name.trim()}
                    className={buttonClass}
                    onClick={() => void update()}
                  >
                    重命名
                  </button>
                </div>
                <div className="flex flex-col gap-3 rounded-2xl bg-muted/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className={hintText}>
                    归档会取消未完成轮次，已完成历史保留。
                  </p>
                  <button
                    disabled={busy}
                    className={cn(buttonClass, "text-danger")}
                    onClick={() => void update(true)}
                  >
                    归档任务
                  </button>
                </div>
              </div>
            </details>
          )}
        </div>
        <div className={box}>
          <h2 className={sectionTitle}>学习历史</h2>
          {history.isError ? (
            <p role="alert" className={alertText}>
              历史读取失败
            </p>
          ) : history.data?.items.length === 0 ? (
            <p className={hintText}>还没有学习记录。</p>
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
                          new Date(h.started_at).toLocaleDateString("zh-CN")}
                      </span>
                      <span className="text-xs text-foreground-muted">
                        {runLabels[h.state]}
                        {cycle_id && " · 覆盖计划批次"}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-foreground-muted">
                      {h.answered_count}/{h.target_count} 题，答对{" "}
                      {h.correct_count} 题
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
  const client = useQueryClient();
  const op = useOperation(userId);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<{
    questionId: string;
    value: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
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
      api.learning.questions(id, { page, page_size: 20 }, { signal })
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
                { page: p, page_size: 20 },
                op.options()
              );
        if (!op.current()) return;
        if (result.items.some((q) => !q.answered && q.content_available)) {
          client.setQueryData(["learning", userId, "questions", id, p], result);
          setPage(p);
          return;
        }
      }
      setError("当前批次没有合法待答内容；已保留进度，请检查来源。");
    } catch (e) {
      if (op.current()) setError(learningError(e));
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
  async function submit() {
    const submission =
      pending && !pendingAccepted
        ? pending
        : next
          ? {
              idempotency_key: crypto.randomUUID(),
              question_id: next.id,
              answer
            }
          : null;
    if (!submission) return;
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
        setError(learningError(e));
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
      if (op.current()) setBusy(false);
    }
  }
  if (run.isError || qs.isError)
    return (
      <PageShell>
        <PageNotice tone="error">
          {learningError(run.error ?? qs.error)}
          <button
            className={retryLink}
            onClick={() => void Promise.all([run.refetch(), qs.refetch()])}
          >
            重试
          </button>
        </PageNotice>
      </PageShell>
    );
  if (!run.data || !qs.data)
    return (
      <PageShell>
        <PageNotice>正在恢复服务器进度…</PageNotice>
      </PageShell>
    );
  const r = run.data;
  const records = qs.data.items.filter(
    (q) => q.answered || !q.content_available
  );
  return (
    <PageShell>
      <PageHeader
        back={{
          href: `/student/tasks/${r.task_id}`,
          label: r.state === "invalidated" ? "返回任务重新开始" : "任务与历史"
        }}
        eyebrow={`${runLabels[r.state]} · ${r.settings.cefr_level} / ${r.settings.english_variant}`}
        title={r.state === "completed" ? "本批次已完成" : "中文释义拼写"}
        description={
          <>
            完成以有效作答数量为准。
            {r.expires_at && (
              <>
                截止：
                {new Date(r.expires_at).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai"
                })}
                （北京时间）
              </>
            )}
          </>
        }
      />
      <div className="space-y-6">
        {r.task_type === "daily" && plan.data?.current_cycle && (
          <div className="rounded-2xl bg-muted/70 p-4 text-sm">
            <p>
              任务当前第 {plan.data.current_cycle.cycle_number} 轮已覆盖{" "}
              {plan.data.current_cycle.covered_count}/
              {plan.data.current_cycle.total_count} 题 · 不可用{" "}
              {plan.data.current_cycle.blocked_count} 题
            </p>
            {r.task_type === "daily" && (
              <p>
                今日批次与本轮覆盖分开统计；部分有效作答会保留覆盖，奖励仅统计完成批次。
              </p>
            )}
          </div>
        )}
        <div className="glass rounded-3xl p-2">
          <div className="space-y-8 rounded-[20px] bg-surface/70 px-6 py-8 sm:px-10 sm:py-10">
            <div className="space-y-3">
              <ProgressBar value={r.answered_count} max={r.target_count} />
              <div className="flex flex-wrap justify-between gap-2 text-sm tabular-nums text-foreground-muted">
                <p>
                  已答 {r.answered_count}/{r.target_count} 题 · 答对{" "}
                  {r.correct_count} 题
                </p>
                <p className="font-medium text-foreground">
                  正确率{" "}
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
                      第 {next.position + 1} 题
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
                <input
                  className="mx-auto block min-h-14 w-full max-w-md rounded-full border border-border bg-surface px-6 text-center text-xl font-medium tracking-wide text-foreground transition-shadow placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-foreground-subtle focus-visible:border-primary/50 focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-primary/15 disabled:opacity-50"
                  aria-label="英文拼写"
                  placeholder="输入英文拼写"
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
                {!uncertain && (
                  <button
                    className={`${primaryButtonClass} min-w-40`}
                    disabled={busy || !answer.trim()}
                    type="submit"
                  >
                    {busy ? "提交中…" : "提交答案"}
                  </button>
                )}
              </form>
            ) : (
              <p className="py-6 text-center text-base text-foreground-muted">
                {r.state === "active"
                  ? "本页没有合法待答题；可定位其他页面的待答题，或检查来源。"
                  : r.state === "invalidated"
                    ? "本轮词条或词表来源发生变化，无法继续。已提交的作答记录仍保留；返回任务页可检查来源后重新开始。恢复词条不会自动恢复旧轮次。"
                    : r.state !== "completed"
                      ? "本轮无法继续。已答记录仍可查看；返回任务页可检查来源后重新开始。"
                      : "已保存本轮完成记录。"}
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
                  {locating ? "正在定位…" : "定位可答题"}
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
                  检查来源
                </button>
              </div>
            )}
            {error && !pendingAccepted && (
              <p role="alert" className={`${alertText} text-center`}>
                {error}
              </p>
            )}
            {error.includes("刷新") && (
              <button
                className={buttonClass}
                type="button"
                onClick={() => {
                  if (
                    !draft?.value ||
                    window.confirm(
                      "刷新会丢弃未提交拼写，请先复制保存。确认刷新？"
                    )
                  )
                    window.location.reload();
                }}
              >
                刷新页面
              </button>
            )}
            {uncertain && (
              <div className="space-y-3 text-center">
                <button
                  className={primaryButtonClass}
                  type="button"
                  onClick={() => void submit()}
                >
                  重试原答案
                </button>
                <p className={hintText}>
                  结果未确认，原答案已保留；重试将沿用原请求。
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
          <h2 className={sectionTitle}>本轮记录</h2>
          {records.length === 0 && (
            <p className={hintText}>本页还没有作答记录。</p>
          )}
          <ul className="space-y-3">
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
                    {q.prompt?.definition ?? "来源内容当前不可访问"}
                  </p>
                  {q.feedback && (
                    <span
                      className={`shrink-0 text-xs font-medium ${
                        q.feedback.is_correct ? "text-success" : "text-danger"
                      }`}
                    >
                      {q.feedback.is_correct ? "正确" : "回答有误"}
                    </span>
                  )}
                </div>
                {q.feedback && (
                  <p className="mt-2 text-xs leading-5 text-foreground-muted">
                    你的答案：
                    <span className="font-medium text-foreground">
                      {q.feedback.submitted_answer}
                    </span>
                    <span className="mx-2">·</span>
                    可接受拼写：{q.feedback.accepted_answers.join(" / ")}
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
