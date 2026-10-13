"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HttpError } from "@tsz/api-client";
import type {
  CreateLearningTask,
  LearningPreview,
  LearningRunState,
  StartLearningRun,
  SubmitLearningAnswer
} from "@tsz/types";
import { api } from "@/lib/request";
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
const labelText = "block text-sm font-medium text-foreground";
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

function ProgressBar({ value, max }: { value: number; max: number }) {
  const percent = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label="本轮进度"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500"
        style={{ width: `${percent}%` }}
      />
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
    queryKey: ["learning", userId, "tasks", page, archived],
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      api.learning.list(
        { page, state: archived ? "archived" : "active" },
        { signal }
      )
  });
  return (
    <PageShell>
      <PageHeader
        eyebrow="我的学习"
        title="我的学习任务"
        description="看中文释义，拼写英文。每题有效作答后计入进度，正确率单独统计。每日北京时间 04:00 换日。"
        actions={
          <Link
            className={`${primaryButtonClass} min-h-10 px-5`}
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
              {q.data.items.map(({ task, current_run: r }) => (
                <li key={task.id}>
                  <Link
                    className={`${listCardClass} group`}
                    href={`/student/tasks/${task.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-medium tracking-[0.2em] text-foreground-muted">
                          {task.task_type === "daily" ? "每日任务" : "长期任务"}
                          {" · "}
                          {task.wordlist_ids.length} 个词表
                        </p>
                        <h2 className="mt-2 truncate text-xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                          {task.name}
                        </h2>
                      </div>
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground-muted">
                        {r
                          ? runLabels[r.state]
                          : task.task_type === "daily"
                            ? "今日未开始"
                            : "尚未开始"}
                      </span>
                    </div>
                    {r ? (
                      <div className="mt-5 space-y-2">
                        <ProgressBar
                          value={r.answered_count}
                          max={r.target_count}
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
              ))}
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
  return <Student>{(id) => <Creator key={id} userId={id} />}</Student>;
}
function Creator({ userId }: { userId: string }) {
  const router = useRouter();
  const op = useOperation(userId);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"daily" | "longterm">("daily");
  const [count, setCount] = useState(10);
  const [ends, setEnds] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [mine, setMine] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<LearningPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const intent = useRef<CreateLearningTask | null>(null);
  const lists = useQuery({
    queryKey: ["learning", userId, "sources", mine, page, search],
    queryFn: ({ signal }) =>
      mine
        ? api.wordList.mine({ page, q: search }, { signal })
        : api.wordList.list({ page, q: search }, { signal })
  });
  function change() {
    setPreview(null);
    setError("");
  }
  function payload() {
    return {
      task_type: kind,
      wordlist_ids: ids,
      daily_question_count: kind === "daily" ? count : null,
      ends_at:
        kind === "daily" && ends
          ? new Date(`${ends}:00+08:00`).toISOString()
          : null
    };
  }
  async function check() {
    setBusy(true);
    setError("");
    try {
      const p = await api.learning.preview(payload(), op.options());
      if (op.current()) setPreview(p);
    } catch (e) {
      if (op.current()) setError(learningError(e));
    } finally {
      if (op.current()) setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      intent.current ??= {
        ...payload(),
        name,
        idempotency_key: crypto.randomUUID()
      };
      const task = await api.learning.create(intent.current, op.options());
      if (op.current()) router.push(`/student/tasks/${task.id}`);
    } catch (e) {
      if (op.current()) {
        setError(learningError(e));
        if (e instanceof HttpError && e.status < 500 && e.status !== 408) {
          intent.current = null;
          setUncertain(false);
        } else setUncertain(true);
      }
    } finally {
      if (op.current()) setBusy(false);
    }
  }
  return (
    <PageShell>
      <PageHeader
        back={{ href: "/student/practice", label: "我的任务" }}
        eyebrow="新建任务"
        title="创建学习任务"
        description="选好词表和节奏，系统按你的学习偏好出题。"
      />
      <form
        className={box}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset className="space-y-6" disabled={busy || uncertain}>
          <label className={labelText}>
            任务名称
            <input
              required
              maxLength={100}
              className={field}
              placeholder="例如：七年级上册单词"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="space-y-2">
            <p className={labelText}>任务类型</p>
            <Segmented
              label="任务类型"
              value={kind}
              options={[
                { value: "daily", label: "每日任务" },
                { value: "longterm", label: "长期任务" }
              ]}
              onChange={(value) => {
                setKind(value);
                change();
              }}
            />
          </div>
          {kind === "daily" ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <label className={labelText}>
                每日题量
                <input
                  className={field}
                  type="number"
                  min={1}
                  max={200}
                  required
                  value={count}
                  onChange={(e) => {
                    setCount(Number(e.target.value));
                    change();
                  }}
                />
              </label>
              <label className={labelText}>
                整个任务结束时间
                <span className="ml-1 font-normal text-foreground-muted">
                  （北京时间，可不填）
                </span>
                <input
                  className={field}
                  type="datetime-local"
                  value={ends}
                  onChange={(e) => {
                    setEnds(e.target.value);
                    change();
                  }}
                />
              </label>
            </div>
          ) : (
            <p className={hintText}>
              每轮覆盖开始时全部可出题内容，完成后可主动再开一轮。
            </p>
          )}
          <div className="space-y-4 border-t border-border/60 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className={sectionTitle}>
                选择词表
                <span className="ml-2 text-sm font-normal tabular-nums text-foreground-muted">
                  {ids.length}/5
                </span>
              </h2>
              <Segmented
                label="词表来源"
                value={mine}
                options={[
                  { value: true, label: "我的词表" },
                  { value: false, label: "公开词表" }
                ]}
                onChange={(value) => {
                  setMine(value);
                  setPage(1);
                }}
              />
            </div>
            <input
              className={field}
              placeholder="搜索词表"
              aria-label="搜索词表"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            {lists.isError ? (
              <p role="alert" className={alertText}>
                词表读取失败
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {lists.data?.items.map((w) => (
                  <label
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-primary/40 has-checked:border-primary has-checked:bg-primary-muted has-disabled:cursor-not-allowed has-disabled:opacity-50 has-focus-visible:ring-4 has-focus-visible:ring-primary/15"
                    key={w.id}
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-primary"
                      checked={ids.includes(w.id)}
                      disabled={!ids.includes(w.id) && ids.length >= 5}
                      onChange={(e) => {
                        setIds(
                          e.target.checked
                            ? [...ids, w.id]
                            : ids.filter((id) => id !== w.id)
                        );
                        change();
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {w.name}
                      </span>
                      <span className="text-xs text-foreground-muted">
                        {w.item_count} 个词条
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {lists.data && (
              <Pager
                page={page}
                total={lists.data.pagination.total_pages}
                onChange={setPage}
              />
            )}
          </div>
          <button
            type="button"
            disabled={!ids.length}
            className={buttonClass}
            onClick={() => void check()}
          >
            预览可出题数量
          </button>
        </fieldset>
        {preview && (
          <div className="space-y-4 rounded-3xl bg-muted/70 p-5">
            <dl className="grid grid-cols-3 gap-3">
              <Stat label="词条" value={preview.entry_count} />
              <Stat label="可出题" value={preview.eligible_count} />
              <Stat
                label="难度 / 口音"
                value={
                  <span className="text-base">
                    {preview.settings.cefr_level} /{" "}
                    {preview.settings.english_variant}
                  </span>
                }
              />
            </dl>
            <p className="text-xs leading-5 text-foreground-muted">
              排除：来源不可用 {preview.exclusions.unavailable_entries}
              ，依赖上下文 {preview.exclusions.context_dependent}
              ，无适配中文定义 {preview.exclusions.no_chinese_definition}
              ，无关联原形 {preview.exclusions.no_base_form}，题面含答案{" "}
              {preview.exclusions.answer_in_prompt}。
            </p>
            {!preview.can_start && (
              <p role="alert" className={alertText}>
                题目不足或任务已过期，请调整词表或题量。
              </p>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className={alertText}>
            {error}
          </p>
        )}
        {uncertain && (
          <p className={hintText}>创建结果尚未确认，请使用原请求重试。</p>
        )}
        <button
          className={`${primaryButtonClass} w-full sm:w-auto sm:min-w-40`}
          disabled={busy || !name.trim() || (!uncertain && !preview?.can_start)}
          type="submit"
        >
          {busy ? "处理中…" : uncertain ? "重试原创建请求" : "创建任务"}
        </button>
      </form>
    </PageShell>
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
    queryKey: ["learning", userId, "task", id],
    refetchOnMount: "always",
    queryFn: ({ signal }) => api.learning.detail(id, { signal })
  });
  const history = useQuery({
    queryKey: ["learning", userId, "history", id, page],
    refetchOnMount: "always",
    queryFn: ({ signal }) => api.learning.history(id, { page }, { signal })
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
      const r = await api.learning.start(id, intent.current, op.options());
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
        await api.learning.archive(
          id,
          { expected_revision: q.data.task.revision },
          op.options()
        );
      else
        await api.learning.rename(
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
          <div className="flex flex-wrap gap-3">
            {r && (
              <Link
                className={
                  r.state === "active" ? primaryButtonClass : buttonClass
                }
                href={`/student/practice/${r.id}`}
              >
                {r.state === "active" ? "继续练习" : "查看结果"}
              </Link>
            )}
            {task.state === "active" &&
              (!r ||
                (["completed", "expired", "invalidated", "cancelled"].includes(
                  r.state
                ) &&
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
                    className={`${field} mt-0 flex-1`}
                    maxLength={100}
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
                    className={`${buttonClass} text-danger`}
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
              {history.data?.items.map((h) => (
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
  const op = useOperation(userId);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<{
    questionId: string;
    value: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<SubmitLearningAnswer | null>(null);
  const run = useQuery({
    queryKey: ["learning", userId, "run", id],
    refetchOnMount: "always",
    queryFn: ({ signal }) => api.learning.run(id, { signal }),
    refetchOnWindowFocus: true
  });
  const qs = useQuery({
    queryKey: ["learning", userId, "questions", id, page],
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      api.learning.questions(id, { page, page_size: 20 }, { signal })
  });
  const next = qs.data?.items.find((q) => !q.answered && q.content_available);
  const pendingAccepted =
    !!pending &&
    !!qs.data?.items.some((q) => q.id === pending.question_id && q.answered);
  const uncertain = !!pending && !pendingAccepted && !busy;
  const answer = draft?.questionId === next?.id ? (draft?.value ?? "") : "";
  async function submit() {
    if (!next) return;
    const submission =
      pending && !pendingAccepted
        ? pending
        : {
            idempotency_key: crypto.randomUUID(),
            question_id: next.id,
            answer
          };
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
        back={{ href: `/student/tasks/${r.task_id}`, label: "任务与历史" }}
        eyebrow={`${runLabels[r.state]} · ${r.settings.cefr_level} / ${r.settings.english_variant}`}
        title={r.state === "completed" ? "本轮已完成" : "中文释义拼写"}
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
                <button
                  className={`${primaryButtonClass} min-w-40`}
                  disabled={busy || !answer.trim()}
                  type="submit"
                >
                  {busy ? "提交中…" : uncertain ? "重试原答案" : "提交答案"}
                </button>
              </form>
            ) : (
              <p className="py-6 text-center text-base text-foreground-muted">
                {r.state === "active"
                  ? "本页已答完，请进入下一页继续。"
                  : r.state !== "completed"
                    ? "本轮无法继续。已答记录仍可查看；返回任务页可检查来源后重新开始。"
                    : "已保存本轮完成记录。"}
              </p>
            )}
            {error && !pendingAccepted && (
              <p role="alert" className={`${alertText} text-center`}>
                {error}
              </p>
            )}
            {uncertain && (
              <p className={`${hintText} text-center`}>
                结果未确认，输入已保留；重试将沿用原请求。
              </p>
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
