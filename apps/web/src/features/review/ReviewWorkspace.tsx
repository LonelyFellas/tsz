"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import type { ReviewAnswerInput, ReviewReceipt, StartReview } from "@tsz/types";
import { Button, Input } from "@tsz/ui/components";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import {
  PageHeader,
  PageNotice,
  PageShell,
  panelClass
} from "@/features/shell/Page";
import { clearPending, readPending, savePending } from "./pending";

function errorText(
  error: unknown,
  context: "overview" | "session" = "overview"
) {
  if (error instanceof HttpError && error.status === 404)
    return context === "session"
      ? "本次复习不存在或已不可访问，请返回今日复习。"
      : "复习功能尚未开放，原有学习任务仍可继续。";
  return error instanceof Error ? error.message : "操作未完成，请重试。";
}
function time(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
const stages: Record<string, string> = {
  unverified: "内容更新，待验证",
  learning: "学习中",
  reviewing: "复习中",
  relearning: "待巩固"
};

export function ReviewWorkspace({ sessionId }: { sessionId?: string }) {
  const user = useUserStore((s) => s.user);
  if (!user) return null;
  if (!user.roles.includes("student"))
    return (
      <PageShell>
        <PageNotice tone="error">需要学生身份才能复习。</PageNotice>
      </PageShell>
    );
  return sessionId ? (
    <Practice key={`${user.id}:${sessionId}`} userId={user.id} id={sessionId} />
  ) : (
    <Overview key={user.id} userId={user.id} />
  );
}
function useReviewOperation(userId: string) {
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    return () => active.abort();
  }, []);
  return {
    options: () => ({ signal: controller.current?.signal }),
    current: () =>
      !!controller.current &&
      !controller.current.signal.aborted &&
      useUserStore.getState().user?.id === userId
  };
}
function Overview({ userId }: { userId: string }) {
  const operation = useReviewOperation(userId);
  const router = useRouter();
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [cursor, setCursor] = useState<{
    profile: string | undefined;
    value: string;
  } | null>(null);
  const overview = useQuery({
    queryKey: ["memory", userId, "overview"],
    queryFn: ({ signal }) => api.memory.overview({ signal }),
    refetchInterval: (query) =>
      query.state.data?.available && query.state.data.enabled ? 30_000 : false,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always"
  });
  const after =
    cursor?.profile === overview.data?.answer_profile
      ? cursor?.value
      : undefined;
  function setAfter(value: string | undefined) {
    setCursor(value ? { profile: overview.data?.answer_profile, value } : null);
  }
  const items = useQuery({
    queryKey: [
      "memory",
      userId,
      "items",
      overview.data?.answer_profile,
      filter,
      after
    ],
    enabled: !!overview.data?.available && !!overview.data?.enabled,
    queryFn: ({ signal }) => api.memory.items(filter, after, { signal }),
    refetchOnMount: "always"
  });
  const current = operation.current;
  async function toggle(enabled: boolean) {
    setBusy(true);
    setError("");
    try {
      await api.memory.enrollment(enabled, operation.options());
      if (current())
        await client.invalidateQueries({ queryKey: ["memory", userId] });
    } catch (e) {
      if (current()) setError(errorText(e));
    } finally {
      if (current()) setBusy(false);
    }
  }
  async function start(mode: "due" | "retest") {
    setBusy(true);
    setError("");
    let requestedKey: string | undefined;
    try {
      const saved = readPending<StartReview>(userId, "start");
      requestedKey = saved?.idempotency_key;
      let session = saved
        ? await api.memory.start(saved, operation.options())
        : null;
      if (!current()) return;
      if (saved) clearPending(userId, "start", saved.idempotency_key);
      if (!session || session.state !== "active") {
        const input: StartReview = {
          idempotency_key: crypto.randomUUID(),
          mode,
          limit: 20
        };
        savePending(userId, "start", input);
        requestedKey = input.idempotency_key;
        session = await api.memory.start(input, operation.options());
        if (!current()) return;
        clearPending(userId, "start", input.idempotency_key);
      }
      router.push(`/student/review/${session.id}`);
    } catch (e) {
      if (current()) {
        if (e instanceof HttpError && e.status === 409) {
          if (requestedKey) clearPending(userId, "start", requestedKey);
          await client.invalidateQueries({ queryKey: ["memory", userId] });
        }
        setError(errorText(e));
      }
    } finally {
      if (current()) setBusy(false);
    }
  }
  async function pause(id: string, paused: boolean, revision: number) {
    setBusy(true);
    setError("");
    try {
      await api.memory.pause(id, paused, revision, operation.options());
      if (current())
        await client.invalidateQueries({ queryKey: ["memory", userId] });
    } catch (e) {
      if (current()) {
        setError(errorText(e));
        if (e instanceof HttpError && e.status === 409)
          await client.invalidateQueries({ queryKey: ["memory", userId] });
      }
    } finally {
      if (current()) setBusy(false);
    }
  }
  const data = overview.data;
  return (
    <PageShell>
      <PageHeader
        title="今日复习"
        back={{ href: "/student/home", label: "学习首页" }}
        description="把学过的词，再记牢一点。换一本词表，也能接着积累。"
      />
      {overview.isPending ? (
        <PageNotice>正在读取复习安排…</PageNotice>
      ) : overview.isError ? (
        <PageNotice tone="error">
          {errorText(overview.error)}{" "}
          <Button variant="link" onClick={() => void overview.refetch()}>
            重新读取
          </Button>
        </PageNotice>
      ) : !data?.available ? (
        <PageNotice>
          复习功能尚未开放。
          <Link className="ml-2 text-primary" href="/student/practice">
            继续学习任务
          </Link>
        </PageNotice>
      ) : (
        <div className="space-y-6">
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {!data.enabled ? (
            <section className={`${panelClass} space-y-5`}>
              <h2 className="text-xl font-semibold">
                从下一次作答开始记住你的进度
              </h2>
              <p className="text-sm leading-7 text-foreground-muted">
                开启后，任务中的首次作答会形成个人记忆，答错的内容会安排巩固。任务结束后仍会提醒复习，你可以随时暂停。
              </p>
              <Button disabled={busy} onClick={() => void toggle(true)}>
                开启个人记忆
              </Button>
              <p className="text-xs text-foreground-muted">
                独立复习和错题重测暂不计天生币，原任务奖励不变。
              </p>
            </section>
          ) : (
            <>
              <section className={`${panelClass} space-y-6`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">
                    这次，从需要再想一想的开始
                  </h2>
                  <span className="text-sm text-foreground-muted">
                    {data.answer_profile === "BrE" ? "英式拼写" : "美式拼写"}
                  </span>
                </div>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt>已到期</dt>
                    <dd>{data.due_count} 项</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>可重测的错题</dt>
                    <dd>{data.relearning_count} 项</dd>
                  </div>
                  <div className="flex justify-between text-foreground-muted">
                    <dt>稍后再复习</dt>
                    <dd>{data.later_count} 项</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-3">
                  {data.current_session_id && (
                    <Button asChild>
                      <Link href={`/student/review/${data.current_session_id}`}>
                        继续本次复习
                      </Link>
                    </Button>
                  )}
                  <Button
                    disabled={
                      busy || (!data.due_count && !data.relearning_count)
                    }
                    onClick={() => void start("due")}
                  >
                    开始复习，最多 20 项
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !data.relearning_count}
                    onClick={() => void start("retest")}
                  >
                    只练待巩固内容
                  </Button>
                </div>
                {!data.due_count && !data.relearning_count && (
                  <p className="text-sm text-foreground-muted">
                    现在没有到期内容。新学的词会按间隔回来，错题至少 10
                    分钟后可重测。
                  </p>
                )}
                {!!data.unavailable_count && (
                  <p className="text-sm text-foreground-muted">
                    {data.unavailable_count}{" "}
                    项来源暂不可用，已保留记忆，暂不出题。
                  </p>
                )}
                <p className="text-xs leading-6 text-foreground-muted">
                  独立复习和错题重测暂不计天生币，也不会改变原任务的首次正确率。
                </p>
              </section>
              <section className="space-y-4" aria-label="个人记忆">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">学过的内容</h2>
                  <label className="text-sm">
                    筛选{" "}
                    <select
                      aria-label="记忆筛选"
                      className="ml-2 rounded-xl border border-border bg-surface p-2"
                      value={filter}
                      onChange={(e) => {
                        setFilter(e.target.value);
                        setAfter(undefined);
                      }}
                    >
                      <option value="all">全部</option>
                      <option value="relearning">待巩固</option>
                      <option value="paused">已暂停</option>
                    </select>
                  </label>
                </div>
                {items.isPending ? (
                  <PageNotice>正在读取…</PageNotice>
                ) : items.isError ? (
                  <PageNotice tone="error">
                    {errorText(items.error)}{" "}
                    <Button variant="link" onClick={() => void items.refetch()}>
                      重试
                    </Button>
                  </PageNotice>
                ) : !items.data?.items.length ? (
                  <PageNotice>
                    这里还没有内容。
                    <Link
                      className="ml-2 text-primary"
                      href="/student/practice"
                    >
                      去做一次学习任务
                    </Link>
                  </PageNotice>
                ) : (
                  <ul className="divide-y divide-border rounded-3xl border border-border bg-surface px-5">
                    {items.data.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-5"
                      >
                        <div className="min-w-0">
                          <p className="tsz-words break-words font-semibold">
                            {item.label ?? "内容暂不可用"}
                          </p>
                          <p className="mt-1 text-xs leading-6 text-foreground-muted">
                            {item.paused
                              ? "已暂停"
                              : (stages[item.stage] ?? item.stage)}{" "}
                            ·{" "}
                            {item.content_available
                              ? `下次 ${time(item.due_at)}`
                              : "来源不可用，已保留进度"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void pause(item.id, !item.paused, item.revision)
                          }
                        >
                          {item.paused ? "恢复复习" : "暂停此项"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-3">
                  {after && (
                    <Button
                      variant="outline"
                      onClick={() => setAfter(undefined)}
                    >
                      返回第一页
                    </Button>
                  )}
                  {items.data?.next_cursor && (
                    <Button
                      variant="outline"
                      onClick={() => setAfter(items.data!.next_cursor!)}
                    >
                      下一页
                    </Button>
                  )}
                </div>
              </section>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void toggle(false)}
              >
                暂停个人记忆与复习
              </Button>
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}
function Practice({ userId, id }: { userId: string; id: string }) {
  const operation = useReviewOperation(userId);
  const client = useQueryClient();
  const [draft, setDraft] = useState<{ itemId: string; value: string } | null>(
    null
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<ReviewReceipt | null>(null);
  const [storedPending, setPending] = useState<ReviewAnswerInput | null>(() =>
    readPending<ReviewAnswerInput>(userId, id)
  );
  const session = useQuery({
    queryKey: ["review", userId, id],
    queryFn: ({ signal }) => api.memory.session(id, { signal }),
    refetchOnMount: "always",
    refetchOnWindowFocus: "always"
  });
  const current = operation.current;
  const pendingAccepted =
    !!storedPending &&
    !!session.data?.items.some(
      (i) => i.id === storedPending.item_id && i.answered
    );
  const pending = pendingAccepted ? null : storedPending;
  useEffect(() => {
    if (pendingAccepted && storedPending)
      clearPending(userId, id, storedPending.idempotency_key);
  }, [pendingAccepted, storedPending, userId, id]);
  const next = session.data?.items.find(
    (i) => !i.answered && i.content_available
  );
  const answer = draft?.itemId === next?.id ? (draft?.value ?? "") : "";
  const sessionKey = ["review", userId, id];
  async function submit() {
    const input =
      pending ??
      (next
        ? { idempotency_key: crypto.randomUUID(), item_id: next.id, answer }
        : null);
    if (!input) return;
    setBusy(true);
    setError("");
    try {
      await client.cancelQueries({ queryKey: sessionKey });
      if (!current()) return;
      savePending(userId, id, input);
      setPending(input);
      const receipt = await api.memory.answer(id, input, operation.options());
      if (!current()) return;
      await client.cancelQueries({ queryKey: sessionKey });
      if (!current()) return;
      clearPending(userId, id, input.idempotency_key);
      setPending(null);
      setDraft(null);
      setFeedback(receipt);
      client.setQueryData(sessionKey, receipt.session);
      await client.invalidateQueries({ queryKey: ["memory", userId] });
    } catch (e) {
      if (current()) {
        setError(errorText(e, "session"));
        if (
          e instanceof HttpError &&
          [400, 403, 404, 409, 422].includes(e.status)
        ) {
          clearPending(userId, id, input.idempotency_key);
          setPending(null);
        }
        await session.refetch();
      }
    } finally {
      if (current()) setBusy(false);
    }
  }
  async function reveal() {
    if (!next) return;
    setBusy(true);
    setError("");
    try {
      await client.cancelQueries({ queryKey: sessionKey });
      if (!current()) return;
      const result = await api.memory.reveal(id, next.id, operation.options());
      if (!current()) return;
      await client.cancelQueries({ queryKey: sessionKey });
      if (current()) client.setQueryData(sessionKey, result);
    } catch (e) {
      if (current()) {
        setError(errorText(e, "session"));
        await session.refetch();
      }
    } finally {
      if (current()) setBusy(false);
    }
  }
  const data = session.data;
  return (
    <PageShell size="sm">
      <PageHeader
        title={
          data?.state === "completed" ? "本次复习已完成" : "再想一想这个词"
        }
        back={{ href: "/student/review", label: "今日复习" }}
        description="每次作答都会保存。随时离开，下次接着来。"
      />
      {session.isPending ? (
        <PageNotice>正在恢复复习进度…</PageNotice>
      ) : session.isError ? (
        <PageNotice tone="error">
          {errorText(session.error, "session")}{" "}
          <Button variant="link" onClick={() => void session.refetch()}>
            重新读取
          </Button>
        </PageNotice>
      ) : (
        data && (
          <div className="space-y-6">
            <p className="text-sm text-foreground-muted">
              本批已答 {data.answered_count}/{data.target_count} 项 ·{" "}
              {data.settings.english_variant === "BrE"
                ? "英式拼写"
                : "美式拼写"}
              （本批次固定）
            </p>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            {feedback ? (
              <section className={`${panelClass} space-y-5`} aria-live="polite">
                <h2 className="text-2xl font-semibold">
                  {feedback.is_correct ? "答对了" : "这次还没记牢"}
                </h2>
                <p className="tsz-words text-xl">
                  {data.items
                    .find((i) => i.id === feedback.item_id)
                    ?.feedback?.accepted_answers.join(" / ")}
                </p>
                <p className="text-sm text-foreground-muted">
                  {feedback.memory_effect === "practice_assisted"
                    ? "已查看答案，本次记作辅助练习。"
                    : feedback.memory_effect === "practice_only_stale"
                      ? "该项已在其他地方更新，保留这次练习记录。"
                      : feedback.memory_effect ===
                          "practice_only_content_changed"
                        ? "内容已更新，下次将重新验证。"
                        : `下次安排：${time(feedback.next_due_at)}`}
                </p>
                <Button onClick={() => setFeedback(null)}>
                  {data.state === "completed" ? "查看本次结果" : "继续下一项"}
                </Button>
              </section>
            ) : data.state === "active" && next ? (
              <section className={panelClass}>
                <form
                  className="space-y-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                >
                  <div>
                    <p className="text-sm text-foreground-muted">
                      {next.kind === "retest" ? "错题巩固" : "到期复习"} ·{" "}
                      {next.prompt?.part_of_speech}
                    </p>
                    <h2 className="mt-4 text-2xl font-semibold leading-relaxed">
                      {next.prompt?.definition}
                    </h2>
                  </div>
                  <div>
                    <label
                      htmlFor="review-answer"
                      className="mb-2 block text-sm"
                    >
                      英文拼写
                    </label>
                    <Input
                      id="review-answer"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={pending?.answer ?? answer}
                      disabled={busy || !!pending}
                      onChange={(e) =>
                        setDraft({ itemId: next.id, value: e.target.value })
                      }
                      maxLength={400}
                    />
                  </div>
                  {next.revealed_answers && (
                    <p className="tsz-words rounded-2xl bg-muted p-4">
                      {next.revealed_answers.join(" / ")}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="submit"
                      disabled={busy || (!pending && !answer.trim())}
                    >
                      {busy
                        ? "正在保存…"
                        : pending
                          ? "核对并重试上次答案"
                          : "确认答案"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || !!pending || next.revealed}
                      onClick={() => void reveal()}
                    >
                      查看答案
                    </Button>
                  </div>
                  {pending && (
                    <p className="text-xs leading-6 text-foreground-muted">
                      上次结果尚未确认，重试使用同一请求，不会重复记录。
                    </p>
                  )}
                </form>
              </section>
            ) : (
              <PageNotice>
                {data.state === "completed"
                  ? "这一批已记录。错题会在合适的间隔后再次出现。"
                  : "本批内容已过期或暂不可用，已保存的作答仍保留。"}
                <div className="mt-4">
                  <Button asChild>
                    <Link href="/student/review">返回今日复习</Link>
                  </Button>
                </div>
              </PageNotice>
            )}
            {data.items.some((i) => i.answered) && (
              <details className="rounded-2xl border border-border p-5">
                <summary className="cursor-pointer text-sm font-medium">
                  本次作答记录
                </summary>
                <ul className="mt-4 space-y-4">
                  {data.items
                    .filter((i) => i.answered)
                    .map((i) => (
                      <li key={i.id} className="text-sm leading-6">
                        {i.feedback ? (
                          <>
                            <p>
                              {i.prompt?.definition} —{" "}
                              {i.feedback.is_correct ? "回答正确" : "回答有误"}
                            </p>
                            <p className="text-foreground-muted">
                              你的答案：{i.feedback.submitted_answer}
                              ；可接受拼写：
                              {i.feedback.accepted_answers.join(" / ")}
                            </p>
                          </>
                        ) : (
                          "该项来源暂不可用，已保留作答统计。"
                        )}
                      </li>
                    ))}
                </ul>
              </details>
            )}
            <p className="text-xs text-foreground-muted">
              本次复习不改变原任务首次正确率，暂不计天生币。
            </p>
          </div>
        )
      )}
    </PageShell>
  );
}
