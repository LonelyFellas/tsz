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
import { useUserStore } from "@/stores/user";
import { buttonClass } from "@/features/wordlist/reading";
const field = "w-full rounded-xl border border-border bg-background px-3 py-2";
const box = "space-y-5 rounded-3xl border border-border bg-background p-6";
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
    return <p role="alert">需要学生身份才能使用学习任务。</p>;
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
function Pager({
  page,
  total,
  onChange,
  disabled = false
}: {
  page: number;
  total: number;
  disabled?: boolean;
  onChange: (p: number) => void;
}) {
  return total > 1 ? (
    <nav className="flex items-center gap-3" aria-label="分页">
      <button
        className={buttonClass}
        disabled={disabled || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        上一页
      </button>
      <span>
        {page} / {total}
      </span>
      <button
        className={buttonClass}
        disabled={disabled || page >= total}
        onClick={() => onChange(page + 1)}
      >
        下一页
      </button>
    </nav>
  ) : null;
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
    <section className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">我的学习任务</h1>
        <Link className={buttonClass} href="/student/tasks/new">
          创建任务
        </Link>
      </div>
      <p className="text-foreground-subtle">
        看中文释义，拼写英文。每题有效作答后计入进度，正确率单独统计。每日北京时间
        04:00 换日。
      </p>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => {
            setArchived(e.target.checked);
            setPage(1);
          }}
        />
        查看已归档任务
      </label>
      {q.isError ? (
        <p role="alert">
          {learningError(q.error)}{" "}
          <button onClick={() => void q.refetch()}>重试</button>
        </p>
      ) : q.isPending ? (
        <p>正在读取任务…</p>
      ) : (
        <>
          {q.data.items.length === 0 && <p>暂无任务，先选择词表创建一个吧。</p>}
          {q.data.items.map(({ task, current_run: r }) => (
            <Link
              className={`${box} block`}
              href={`/student/tasks/${task.id}`}
              key={task.id}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <h2 className="font-semibold">{task.name}</h2>
                <span>
                  {task.task_type === "daily" ? "每日任务" : "长期任务"}
                </span>
              </div>
              <p>
                {task.wordlist_ids.length} 个词表 ·{" "}
                {r
                  ? `${runLabels[r.state]} · ${r.answered_count}/${r.target_count} 题`
                  : task.task_type === "daily"
                    ? `每日 ${task.daily_question_count} 题 · 今日未开始`
                    : "尚未开始"}
              </p>
            </Link>
          ))}
          <Pager
            page={page}
            total={q.data.pagination.total_pages}
            onChange={setPage}
          />
        </>
      )}
    </section>
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
    <section className="mx-auto max-w-3xl space-y-6 p-4">
      <Link href="/student/practice">← 我的任务</Link>
      <h1 className="text-2xl font-bold">创建学习任务</h1>
      <form
        className={box}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset className="space-y-5" disabled={busy || uncertain}>
          <label className="block">
            任务名称
            <input
              required
              maxLength={100}
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            任务类型
            <select
              className={field}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as typeof kind);
                change();
              }}
            >
              <option value="daily">每日任务</option>
              <option value="longterm">长期任务</option>
            </select>
          </label>
          {kind === "daily" ? (
            <>
              <label className="block">
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
              <label className="block">
                整个任务结束时间（北京时间，可不填）
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
            </>
          ) : (
            <p>每轮覆盖开始时全部可出题内容，完成后可主动再开一轮。</p>
          )}
          <div className="space-y-3">
            <h2 className="font-semibold">选择词表（{ids.length}/5）</h2>
            <div className="flex gap-3">
              <button
                type="button"
                className={buttonClass}
                aria-pressed={mine}
                onClick={() => {
                  setMine(true);
                  setPage(1);
                }}
              >
                我的词表
              </button>
              <button
                type="button"
                className={buttonClass}
                aria-pressed={!mine}
                onClick={() => {
                  setMine(false);
                  setPage(1);
                }}
              >
                公开词表
              </button>
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
              <p role="alert">词表读取失败</p>
            ) : (
              lists.data?.items.map((w) => (
                <label
                  className="flex items-center gap-3 rounded-xl border border-border p-3"
                  key={w.id}
                >
                  <input
                    type="checkbox"
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
                  <span>
                    {w.name} · {w.item_count} 个词条
                  </span>
                </label>
              ))
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
          <div className="rounded-2xl bg-foreground/5 p-4">
            <p>
              {preview.entry_count} 个词条，可出题 {preview.eligible_count} 道（
              {preview.settings.cefr_level} / {preview.settings.english_variant}
              ）
            </p>
            <p className="text-sm">
              排除：来源不可用 {preview.exclusions.unavailable_entries}
              ，依赖上下文 {preview.exclusions.context_dependent}
              ，无适配中文定义 {preview.exclusions.no_chinese_definition}
              ，无关联原形 {preview.exclusions.no_base_form}，题面含答案{" "}
              {preview.exclusions.answer_in_prompt}。
            </p>
            {!preview.can_start && (
              <p role="alert">题目不足或任务已过期，请调整词表或题量。</p>
            )}
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        {uncertain && <p>创建结果尚未确认，请使用原请求重试。</p>}
        <button
          className={`${buttonClass} bg-[#0071e3] text-white`}
          disabled={busy || !name.trim() || (!uncertain && !preview?.can_start)}
          type="submit"
        >
          {busy ? "处理中…" : uncertain ? "重试原创建请求" : "创建任务"}
        </button>
      </form>
    </section>
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
      <p role="alert">
        {learningError(q.error)}{" "}
        <button onClick={() => void q.refetch()}>重试</button>
      </p>
    );
  if (!q.data) return <p>正在读取任务…</p>;
  const { task, current_run: r } = q.data;
  return (
    <section className="mx-auto max-w-3xl space-y-6 p-4">
      <Link href="/student/practice">← 我的任务</Link>
      <div className={box}>
        <h1 className="text-2xl font-bold">{task.name}</h1>
        <p>
          {task.task_type === "daily"
            ? `每日 ${task.daily_question_count} 题 · 北京时间 04:00 换日`
            : "长期任务 · 每轮覆盖全部可出题内容"}
        </p>
        {task.ends_at && (
          <p>
            结束时间：
            {new Date(task.ends_at).toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai"
            })}
            （北京时间）
          </p>
        )}
        <p>
          {r
            ? `${runLabels[r.state]}：${r.answered_count}/${r.target_count} 题，答对 ${r.correct_count} 题`
            : "尚未开始"}
        </p>
        <div className="flex flex-wrap gap-3">
          {r && (
            <Link className={buttonClass} href={`/student/practice/${r.id}`}>
              {r.state === "active" ? "继续练习" : "查看结果"}
            </Link>
          )}
          {task.state === "active" &&
            (!r ||
              (["completed", "expired", "invalidated", "cancelled"].includes(
                r.state
              ) &&
                !(task.task_type === "daily" && r.state === "completed"))) && (
              <button
                className={buttonClass}
                disabled={busy}
                onClick={() => void start(r?.id ?? null)}
              >
                {r ? "重新开始一轮" : "开始练习"}
              </button>
            )}
        </div>
        {task.state === "active" && (
          <details>
            <summary>管理任务</summary>
            <div className="mt-4 space-y-3">
              <input
                className={field}
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
              <p className="text-sm">归档会取消未完成轮次，已完成历史保留。</p>
              <button
                disabled={busy}
                className={buttonClass}
                onClick={() => void update(true)}
              >
                归档任务
              </button>
            </div>
          </details>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      <div className={box}>
        <h2 className="text-xl font-semibold">学习历史</h2>
        {history.isError ? (
          <p role="alert">历史读取失败</p>
        ) : (
          history.data?.items.map((h) => (
            <Link
              key={h.id}
              className="block rounded-xl border border-border p-3"
              href={`/student/practice/${h.id}`}
            >
              {h.business_day ??
                new Date(h.started_at).toLocaleDateString("zh-CN")}{" "}
              · {runLabels[h.state]} · {h.answered_count}/{h.target_count}{" "}
              题，答对 {h.correct_count} 题
            </Link>
          ))
        )}
        {history.data && (
          <Pager
            page={page}
            total={history.data.pagination.total_pages}
            onChange={setPage}
          />
        )}
      </div>
    </section>
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
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const intent = useRef<SubmitLearningAnswer | null>(null);
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
  async function submit() {
    if (!next) return;
    setBusy(true);
    setError("");
    try {
      intent.current ??= {
        idempotency_key: crypto.randomUUID(),
        question_id: next.id,
        answer
      };
      await api.learning.answer(id, intent.current, op.options());
      if (op.current()) {
        intent.current = null;
        setUncertain(false);
        setAnswer("");
        await Promise.all([run.refetch(), qs.refetch()]);
      }
    } catch (e) {
      if (op.current()) {
        setError(learningError(e));
        const [, refreshed] = await Promise.all([run.refetch(), qs.refetch()]);
        if (!op.current()) return;
        const accepted = refreshed.data?.items.some(
          (q) => q.id === intent.current?.question_id && q.answered
        );
        if (accepted) {
          setAnswer("");
          setError("");
        }
        if (
          (e instanceof HttpError && e.status < 500 && e.status !== 408) ||
          accepted
        ) {
          intent.current = null;
          setUncertain(false);
        } else setUncertain(true);
      }
    } finally {
      if (op.current()) setBusy(false);
    }
  }
  if (run.isError || qs.isError)
    return (
      <p role="alert">
        {learningError(run.error ?? qs.error)}{" "}
        <button onClick={() => void Promise.all([run.refetch(), qs.refetch()])}>
          重试
        </button>
      </p>
    );
  if (!run.data || !qs.data) return <p>正在恢复服务器进度…</p>;
  const r = run.data;
  return (
    <section className="mx-auto max-w-3xl space-y-6 p-4">
      <Link href={`/student/tasks/${r.task_id}`}>← 任务与历史</Link>
      <div className={box}>
        <h1 className="text-2xl font-bold">
          {r.state === "completed" ? "本轮已完成" : "中文释义拼写"}
        </h1>
        <p>
          {runLabels[r.state]} · 已答 {r.answered_count}/{r.target_count} 题 ·
          答对 {r.correct_count} 题 · 正确率{" "}
          {r.answered_count
            ? Math.round((r.correct_count / r.answered_count) * 100)
            : 0}
          %
        </p>
        <p className="text-sm">
          本轮设置：{r.settings.cefr_level} / {r.settings.english_variant}
          。完成以有效作答数量为准。
        </p>
        {r.expires_at && (
          <p className="text-sm">
            截止：
            {new Date(r.expires_at).toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai"
            })}
            （北京时间）
          </p>
        )}
        {r.state === "active" && next ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="space-y-4"
          >
            <h2 className="text-xl font-semibold">
              第 {next.position + 1} 题 · {next.prompt?.definition}
            </h2>
            <p>{next.prompt?.part_of_speech}</p>
            <input
              className={field}
              aria-label="英文拼写"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={200}
              value={answer}
              disabled={busy || uncertain}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <button
              className={`${buttonClass} bg-[#0071e3] text-white`}
              disabled={busy || !answer.trim()}
              type="submit"
            >
              {busy ? "提交中…" : uncertain ? "重试原答案" : "提交答案"}
            </button>
          </form>
        ) : r.state === "active" ? (
          <p>本页已答完，请进入下一页继续。</p>
        ) : r.state !== "completed" ? (
          <p>
            本轮无法继续。已答记录仍可查看；返回任务页可检查来源后重新开始。
          </p>
        ) : (
          <p>已保存本轮完成记录。</p>
        )}
        {error && <p role="alert">{error}</p>}
        {uncertain && <p>结果未确认，输入已保留；重试将沿用原请求。</p>}
      </div>
      <div className={box}>
        <h2 className="text-lg font-semibold">本轮记录</h2>
        {qs.data.items
          .filter((q) => q.answered || !q.content_available)
          .map((q) => (
            <div className="rounded-xl border border-border p-4" key={q.id}>
              <p>
                第 {q.position + 1} 题 ·{" "}
                {q.prompt?.definition ?? "来源内容当前不可访问"}
              </p>
              {q.feedback && (
                <>
                  <p>
                    {q.feedback.is_correct ? "正确" : "回答有误"} · 你的答案：
                    {q.feedback.submitted_answer}
                  </p>
                  <p>可接受拼写：{q.feedback.accepted_answers.join(" / ")}</p>
                </>
              )}
            </div>
          ))}
        <Pager
          page={page}
          total={qs.data.pagination.total_pages}
          disabled={busy || uncertain}
          onChange={(p) => {
            setPage(p);
            setAnswer("");
            setError("");
          }}
        />
      </div>
    </section>
  );
}
