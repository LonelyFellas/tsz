"use client";
import {
  lookupWebNotice,
  localText,
  type WebNotice,
  webErrorText
} from "@/i18n/catalog";

import { useWebLocale, useWebText } from "@/i18n/client";
import { webReview } from "@/i18n/messages/review";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@tsz/api-client";
import type { InterfaceLocale } from "@tsz/shared/i18n";
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
      ? localText(
          webReview,
          "webReview:this_review_does_not_exist_or_is_no_longer_accessible_return_to_today_s"
        )
      : localText(
          webReview,
          "webReview:reviews_are_not_available_yet_existing_learning_tasks_can_continue"
        );
  return webErrorText(
    error,
    localText(webReview, "webReview:the_action_did_not_complete_try_again")
  );
}
function time(value: string, locale: InterfaceLocale) {
  return new Date(value).toLocaleString(locale, {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
const stages: Record<string, WebNotice> = {
  unverified: localText(
    webReview,
    "webReview:content_updated_verification_pending"
  ),
  learning: localText(webReview, "webReview:learning"),
  reviewing: localText(webReview, "webReview:reviewing"),
  relearning: localText(webReview, "webReview:needs_consolidation")
};

export function ReviewWorkspace({ sessionId }: { sessionId?: string }) {
  const uiText = useWebText(webReview);
  const user = useUserStore((s) => s.user);
  if (!user) return null;
  if (!user.roles.includes("student"))
    return (
      <PageShell>
        <PageNotice tone="error">
          {uiText("webReview:you_need_a_student_role_to_review")}
        </PageNotice>
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
  const locale = useWebLocale();
  const uiText = useWebText(webReview);
  const operation = useReviewOperation(userId);
  const router = useRouter();
  const client = useQueryClient();
  const [error, setError] = useState<WebNotice>("");
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
        title={uiText("webReview:review_today")}
        back={{
          href: "/student/home",
          label: uiText("webReview:learning_home")
        }}
        description={uiText(
          "webReview:strengthen_the_words_you_have_learnt_your_progress_continues_across_word"
        )}
      />
      {overview.isPending ? (
        <PageNotice>{uiText("webReview:loading_review_schedule")}</PageNotice>
      ) : overview.isError ? (
        <PageNotice tone="error">
          {uiText(errorText(overview.error))}{" "}
          <Button variant="link" onClick={() => void overview.refetch()}>
            {uiText("webReview:reload_image")}
          </Button>
        </PageNotice>
      ) : !data?.available ? (
        <PageNotice>
          {uiText("webReview:reviews_are_not_available_yet")}
          <Link className="ml-2 text-primary" href="/student/practice">
            {uiText("webReview:continue_learning_tasks")}
          </Link>
        </PageNotice>
      ) : (
        <div className="space-y-6">
          {error && (
            <p role="alert" className="text-sm text-danger">
              {uiText(error)}
            </p>
          )}
          {!data.enabled ? (
            <section className={`${panelClass} space-y-5`}>
              <h2 className="text-xl font-semibold">
                {uiText(
                  "webReview:remember_your_progress_from_your_next_answer"
                )}
              </h2>
              <p className="text-sm leading-7 text-foreground-muted">
                {uiText(
                  "webReview:when_enabled_first_answers_in_tasks_form_personal_memories_and_incorrect"
                )}
              </p>
              <Button disabled={busy} onClick={() => void toggle(true)}>
                {uiText("webReview:enable_personal_memory")}
              </Button>
              <p className="text-xs text-foreground-muted">
                {uiText(
                  "webReview:independent_reviews_and_retries_do_not_earn_yet_existing_task_rewards_ar"
                )}
              </p>
            </section>
          ) : (
            <>
              <section className={`${panelClass} space-y-6`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">
                    {uiText(
                      "webReview:start_with_words_that_need_another_look"
                    )}
                  </h2>
                  <span className="text-sm text-foreground-muted">
                    {data.answer_profile === "BrE"
                      ? uiText("webReview:british_spelling")
                      : uiText("webReview:american_spelling")}
                  </span>
                </div>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt>{uiText("webReview:due")}</dt>
                    <dd>
                      {uiText("webReview:v0_items", { v0: data.due_count })}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>
                      {uiText("webReview:incorrect_answers_ready_for_retry")}
                    </dt>
                    <dd>
                      {uiText("webReview:v0_items", {
                        v0: data.relearning_count
                      })}
                    </dd>
                  </div>
                  <div className="flex justify-between text-foreground-muted">
                    <dt>{uiText("webReview:review_later")}</dt>
                    <dd>
                      {uiText("webReview:v0_items", { v0: data.later_count })}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-3">
                  {data.current_session_id && (
                    <Button asChild>
                      <Link href={`/student/review/${data.current_session_id}`}>
                        {uiText("webReview:continue_this_review")}
                      </Link>
                    </Button>
                  )}
                  <Button
                    disabled={
                      busy || (!data.due_count && !data.relearning_count)
                    }
                    onClick={() => void start("due")}
                  >
                    {uiText("webReview:start_review_up_to_20_items")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !data.relearning_count}
                    onClick={() => void start("retest")}
                  >
                    {uiText("webReview:practise_only_consolidation_items")}
                  </Button>
                </div>
                {!data.due_count && !data.relearning_count && (
                  <p className="text-sm text-foreground-muted">
                    {uiText(
                      "webReview:nothing_is_due_now_new_words_return_on_a_schedule_incorrect_answers_can"
                    )}
                  </p>
                )}
                {!!data.unavailable_count && (
                  <p className="text-sm text-foreground-muted">
                    {uiText(
                      "webReview:v0_items_have_unavailable_sources_memories_are_preserved_and_questions_a",
                      {
                        v0: data.unavailable_count
                      }
                    )}
                  </p>
                )}
                <p className="text-xs leading-6 text-foreground-muted">
                  {uiText(
                    "webReview:independent_reviews_and_retries_do_not_earn_yet_or_change_the_original_t"
                  )}
                </p>
              </section>
              <section
                className="space-y-4"
                aria-label={uiText("webReview:personal_memory")}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">
                    {uiText("webReview:studied_content")}
                  </h2>
                  <label className="text-sm">
                    {uiText("webReview:filter")}{" "}
                    <select
                      aria-label={uiText("webReview:memory_filter")}
                      className="ml-2 rounded-xl border border-border bg-surface p-2"
                      value={filter}
                      onChange={(e) => {
                        setFilter(e.target.value);
                        setAfter(undefined);
                      }}
                    >
                      <option value="all">{uiText("webReview:all")}</option>
                      <option value="relearning">
                        {uiText("webReview:needs_consolidation")}
                      </option>
                      <option value="paused">
                        {uiText("webReview:paused")}
                      </option>
                    </select>
                  </label>
                </div>
                {items.isPending ? (
                  <PageNotice>{uiText("webReview:loading")}</PageNotice>
                ) : items.isError ? (
                  <PageNotice tone="error">
                    {uiText(errorText(items.error))}{" "}
                    <Button variant="link" onClick={() => void items.refetch()}>
                      {uiText("webReview:retry")}
                    </Button>
                  </PageNotice>
                ) : !items.data?.items.length ? (
                  <PageNotice>
                    {uiText("webReview:no_content_here_yet")}
                    <Link
                      className="ml-2 text-primary"
                      href="/student/practice"
                    >
                      {uiText("webReview:complete_a_learning_task")}
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
                            {item.label ??
                              uiText("webReview:content_unavailable")}
                          </p>
                          <p className="mt-1 text-xs leading-6 text-foreground-muted">
                            {item.paused
                              ? uiText("webReview:paused")
                              : uiText(lookupWebNotice(stages, item.stage)) ||
                                item.stage}{" "}
                            ·{" "}
                            {item.content_available
                              ? uiText("webReview:next_v0", {
                                  v0: time(item.due_at, locale)
                                })
                              : uiText(
                                  "webReview:source_unavailable_progress_preserved"
                                )}
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
                          {item.paused
                            ? uiText("webReview:resume_review")
                            : uiText("webReview:pause_this_item")}
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
                      {uiText("webReview:back_to_first_page")}
                    </Button>
                  )}
                  {items.data?.next_cursor && (
                    <Button
                      variant="outline"
                      onClick={() => setAfter(items.data!.next_cursor!)}
                    >
                      {uiText("webReview:next_page")}
                    </Button>
                  )}
                </div>
              </section>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void toggle(false)}
              >
                {uiText("webReview:pause_personal_memory_and_reviews")}
              </Button>
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}
function Practice({ userId, id }: { userId: string; id: string }) {
  const locale = useWebLocale();
  const uiText = useWebText(webReview);
  const operation = useReviewOperation(userId);
  const client = useQueryClient();
  const [draft, setDraft] = useState<{ itemId: string; value: string } | null>(
    null
  );
  const [error, setError] = useState<WebNotice>("");
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
          data?.state === "completed"
            ? uiText("webReview:review_completed")
            : uiText("webReview:think_about_this_word_again")
        }
        back={{
          href: "/student/review",
          label: uiText("webReview:review_today")
        }}
        description={uiText(
          "webReview:each_answer_is_saved_leave_at_any_time_and_continue_next_time"
        )}
      />
      {session.isPending ? (
        <PageNotice>{uiText("webReview:restoring_review_progress")}</PageNotice>
      ) : session.isError ? (
        <PageNotice tone="error">
          {uiText(errorText(session.error, "session"))}{" "}
          <Button variant="link" onClick={() => void session.refetch()}>
            {uiText("webReview:reload_image")}
          </Button>
        </PageNotice>
      ) : (
        data && (
          <div className="space-y-6">
            <p className="text-sm text-foreground-muted">
              {uiText("webReview:answered_this_batch_v0_v1", {
                v0: data.answered_count,
                v1: data.target_count
              })}
              {data.settings.english_variant === "BrE"
                ? uiText("webReview:british_spelling")
                : uiText("webReview:american_spelling")}
              {uiText("webReview:fixed_for_this_batch")}
            </p>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {uiText(error)}
              </p>
            )}
            {feedback ? (
              <section className={`${panelClass} space-y-5`} aria-live="polite">
                <h2 className="text-2xl font-semibold">
                  {feedback.is_correct
                    ? uiText("webReview:correct")
                    : uiText("webReview:not_remembered_yet")}
                </h2>
                <p className="tsz-words text-xl">
                  {data.items
                    .find((i) => i.id === feedback.item_id)
                    ?.feedback?.accepted_answers.join(" / ")}
                </p>
                <p className="text-sm text-foreground-muted">
                  {feedback.memory_effect === "practice_assisted"
                    ? uiText(
                        "webReview:you_viewed_the_answer_this_counts_as_assisted_practice"
                      )
                    : feedback.memory_effect === "practice_only_stale"
                      ? uiText(
                          "webReview:this_item_was_updated_elsewhere_this_practice_record_is_kept"
                        )
                      : feedback.memory_effect ===
                          "practice_only_content_changed"
                        ? uiText(
                            "webReview:content_updated_it_will_be_verified_again_next_time"
                          )
                        : uiText("webReview:next_scheduled_review_v0", {
                            v0: time(feedback.next_due_at, locale)
                          })}
                </p>
                <Button onClick={() => setFeedback(null)}>
                  {data.state === "completed"
                    ? uiText("webReview:view_results")
                    : uiText("webReview:continue_to_next_item")}
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
                      {next.kind === "retest"
                        ? uiText("webReview:consolidate_incorrect_answers")
                        : uiText("webReview:due_review")}{" "}
                      · {next.prompt?.part_of_speech}
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
                      {uiText("webReview:english_spelling")}
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
                        ? uiText("webReview:saving")
                        : pending
                          ? uiText("webReview:check_and_retry_previous_answer")
                          : uiText("webReview:confirm_answer")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || !!pending || next.revealed}
                      onClick={() => void reveal()}
                    >
                      {uiText("webReview:show_answer")}
                    </Button>
                  </div>
                  {pending && (
                    <p className="text-xs leading-6 text-foreground-muted">
                      {uiText(
                        "webReview:the_previous_result_is_unconfirmed_retrying_uses_the_same_request_withou"
                      )}
                    </p>
                  )}
                </form>
              </section>
            ) : (
              <PageNotice>
                {data.state === "completed"
                  ? uiText(
                      "webReview:this_batch_is_recorded_incorrect_answers_return_after_a_suitable_interva"
                    )
                  : uiText(
                      "webReview:this_batch_has_expired_or_is_unavailable_saved_answers_are_preserved"
                    )}
                <div className="mt-4">
                  <Button asChild>
                    <Link href="/student/review">
                      {uiText("webReview:back_to_today_s_review")}
                    </Link>
                  </Button>
                </div>
              </PageNotice>
            )}
            {data.items.some((i) => i.answered) && (
              <details className="rounded-2xl border border-border p-5">
                <summary className="cursor-pointer text-sm font-medium">
                  {uiText("webReview:answer_records")}
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
                              {i.feedback.is_correct
                                ? uiText("webReview:correct_answer")
                                : uiText("webReview:incorrect_answer")}
                            </p>
                            <p className="text-foreground-muted">
                              {uiText(
                                "webReview:your_answer_v0_accepted_spellings",
                                {
                                  v0: i.feedback.submitted_answer
                                }
                              )}
                              {i.feedback.accepted_answers.join(" / ")}
                            </p>
                          </>
                        ) : (
                          uiText(
                            "webReview:this_source_is_unavailable_answer_statistics_are_preserved"
                          )
                        )}
                      </li>
                    ))}
                </ul>
              </details>
            )}
            <p className="text-xs text-foreground-muted">
              {uiText(
                "webReview:this_review_does_not_change_the_original_task_s_first_answer_accuracy_an"
              )}
            </p>
          </div>
        )
      )}
    </PageShell>
  );
}
