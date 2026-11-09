"use client";
import {
  webCommon,
  localText,
  webErrorText,
  originalText,
  type WebNotice,
  type WebText
} from "@/i18n/catalog";

import { useWebText } from "@/i18n/client";
import { webTask } from "@/i18n/messages/task";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HttpError } from "@tsz/api-client";
import type {
  CreateLearningPlan,
  PreviewLearningPlan,
  LearningTaskType,
  LearningQuestionType,
  LearningPlan,
  StartLearningRun,
  Wordlist
} from "@tsz/types";
import { BookOpen, Minus, Plus, X } from "lucide-react";
import { Button, Input } from "@tsz/ui/components";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import {
  PageShell,
  PageHeader,
  PageNotice,
  Segmented
} from "@/features/shell/Page";
import { PlanSourcePicker, type SelectedSource } from "./PlanSourcePicker";
import { ChoiceUnavailableItems } from "./ChoiceScopePreview";
import { PlanDateRange, type PlanDates } from "./PlanDateRange";
import { missingPlans } from "./plan-api";
export function LearningPlanCreator({
  userId,
  wordlistId,
  owned = false,
  directPractice = false
}: {
  userId: string;
  wordlistId?: string;
  owned?: boolean;
  directPractice?: boolean;
}) {
  if (!wordlistId) return <PlanForm userId={userId} />;
  return (
    <PreselectedPlan
      userId={userId}
      wordlistId={wordlistId}
      owned={owned}
      directPractice={directPractice}
    />
  );
}
function PreselectedPlan({
  userId,
  wordlistId,
  owned,
  directPractice
}: {
  userId: string;
  wordlistId: string;
  owned: boolean;
  directPractice: boolean;
}) {
  const uiText = useWebText(webTask);
  const back = directPractice
    ? {
        href: `${owned ? "/account" : ""}/wordlists/${wordlistId}`,
        label: localText(webTask, "webTask:back_to_word_list")
      }
    : {
        href: "/student/practice",
        label: localText(webTask, "webTask:my_tasks")
      };
  const source = useQuery({
    queryKey: ["learning-plan-source", userId, wordlistId, owned],
    queryFn: ({ signal }) =>
      owned
        ? api.wordList.myDetail(wordlistId, { signal })
        : api.wordList.get(wordlistId, { signal }),
    retry: false,
    refetchOnWindowFocus: false
  });
  if (!source.data)
    return (
      <PageShell>
        <PageHeader
          title={
            directPractice
              ? uiText("webTask:start_practice")
              : uiText("webTask:create_task")
          }
          back={{ ...back, label: uiText(back.label) }}
        />
        {source.isError ? (
          <PageNotice tone="error">
            {uiText(
              "webTask:the_word_list_does_not_exist_is_inaccessible_or_cannot_be_loaded"
            )}
            <Button variant="link" onClick={() => void source.refetch()}>
              {uiText("webTask:retry")}
            </Button>
            <Button asChild variant="link">
              <Link href={directPractice ? "/wordlists" : "/student/tasks/new"}>
                {uiText("webTask:choose_another_word_list")}
              </Link>
            </Button>
          </PageNotice>
        ) : (
          <PageNotice>{uiText("webTask:loading_current_word_list")}</PageNotice>
        )}
      </PageShell>
    );
  return (
    <PlanForm
      userId={userId}
      initialWordlist={source.data}
      sourceError={source.isError}
      onRetrySource={() => void source.refetch()}
      directPractice={directPractice}
      back={back}
    />
  );
}
function suggestedPracticeName(source: string, text: WebText<typeof webTask>) {
  const suffixLength = [...text("webTask:v0_practice", { v0: "" })].length;
  return text("webTask:v0_practice", {
    v0: [...source].slice(0, Math.max(0, 50 - suffixLength)).join("")
  });
}

function PlanForm({
  userId,
  initialWordlist,
  sourceError = false,
  onRetrySource,
  directPractice = false,
  back = {
    href: "/student/practice",
    label: localText(webTask, "webTask:my_tasks")
  }
}: {
  userId: string;
  initialWordlist?: Wordlist;
  sourceError?: boolean;
  onRetrySource?: () => void;
  directPractice?: boolean;
  back?: { href: string; label: WebNotice };
}) {
  const uiText = useWebText(webTask);
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(() =>
    initialWordlist ? suggestedPracticeName(initialWordlist.name, uiText) : ""
  );
  const [editingName, setEditingName] = useState(!initialWordlist);
  const nameEdited = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<LearningTaskType>(
    directPractice ? "longterm" : "daily"
  );
  const selectionKey =
    directPractice && initialWordlist
      ? `wordlist-practice-types:${userId}:${initialWordlist.id}`
      : null;
  const [questionTypes, setQuestionTypes] = useState<LearningQuestionType[]>(
    () => {
      if (selectionKey && typeof window !== "undefined") {
        try {
          const saved: unknown = JSON.parse(
            sessionStorage.getItem(selectionKey) ?? "null"
          );
          if (
            Array.isArray(saved) &&
            saved.length > 0 &&
            saved.length <= 2 &&
            new Set(saved).size === saved.length &&
            saved.every(
              (type) =>
                type === "spelling_zh_to_en" || type === "choice_zh_to_en"
            )
          ) {
            return saved as LearningQuestionType[];
          }
        } catch {
          // Browser storage is optional; the server owns practice progress.
        }
      }
      return ["spelling_zh_to_en"];
    }
  );
  useEffect(() => {
    if (!selectionKey) return;
    try {
      sessionStorage.setItem(selectionKey, JSON.stringify(questionTypes));
    } catch {
      // A storage restriction must not prevent starting the server-backed practice.
    }
  }, [selectionKey, questionTypes]);
  const questionType = questionTypes.includes("choice_zh_to_en")
    ? "choice_zh_to_en"
    : "spelling_zh_to_en";
  const mixedPractice = questionTypes.length === 2;
  const validQuestionTypes = questionTypes.length > 0;
  const capabilities = useQuery({
    queryKey: ["learning", userId, "capabilities"],
    queryFn: ({ signal }) => api.learning.capabilities({ signal }),
    retry: false
  });
  const capabilitiesFailed =
    capabilities.isError &&
    !(
      capabilities.error instanceof HttpError &&
      capabilities.error.status === 404
    );
  const advertisedCapabilities = capabilities.isError
    ? undefined
    : capabilities.data;
  const masterySupported =
    advertisedCapabilities?.practice_modes?.includes("mastery_v1") === true;
  const choiceSupported =
    advertisedCapabilities?.question_types.includes("choice_zh_to_en") ===
      true &&
    advertisedCapabilities.choice_policies?.includes("strict_tiered_v1") ===
      true;
  const mixedSupported =
    advertisedCapabilities?.choice_policies?.includes("mixed_tiered_v1") ===
    true;
  const directSupported =
    advertisedCapabilities?.practice_features?.includes(
      "resume_wordlist_v1"
    ) === true;
  const unsupportedSelection =
    (questionType === "choice_zh_to_en" && !choiceSupported) ||
    (mixedPractice && !mixedSupported) ||
    (directPractice && !directSupported);
  const [selected, setSelected] = useState<SelectedSource[]>(
    initialWordlist ? [{ wordlist: initialWordlist }] : []
  );
  const sourceUnavailable =
    sourceError && selected.some((s) => s.wordlist.id === initialWordlist?.id);
  const [picker, setPicker] = useState(false);
  const [count, setCount] = useState("10");
  const [dates, setDates] = useState<PlanDates | null>(null);
  const [error, setError] = useState<WebNotice>("");
  const [acceptedPreview, setAcceptedPreview] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const intent = useRef<CreateLearningPlan | null>(null);
  const [createdPlan, setCreatedPlan] = useState<LearningPlan | null>(null);
  const startIntent = useRef<StartLearningRun | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    return () => c.abort();
  }, []);
  const current = () =>
    !controller.current?.signal.aborted &&
    useUserStore.getState().user?.id === userId;
  const n = Number(count);
  const validCount =
    kind === "longterm" ||
    (Number.isInteger(n) &&
      n >= 1 &&
      n <= (masterySupported ? 20 : 200) &&
      count.trim() !== "");
  const errors: Record<string, string | undefined> = {
    "question-types": !validQuestionTypes
      ? uiText("webTask:select_at_least_one_question_type")
      : undefined,
    name:
      submitted && (!name.trim() || [...name.trim()].length > 50)
        ? uiText("webTask:enter_a_task_name_of_1_50_characters")
        : undefined,
    sources:
      submitted && !selected.length
        ? uiText("webTask:select_1_5_word_lists")
        : undefined,
    count: !validCount
      ? uiText("webTask:daily_question_count_must_be_an_integer_from_1_to_v0", {
          v0: masterySupported ? 20 : 200
        })
      : undefined
  };
  const input: PreviewLearningPlan = {
    ...(masterySupported ? { practice_mode: "mastery_v1" as const } : {}),
    ...(questionType === "choice_zh_to_en"
      ? {
          question_type: questionType,
          choice_policy: mixedPractice
            ? ("mixed_tiered_v1" as const)
            : ("strict_tiered_v1" as const)
        }
      : {}),
    task_type: kind,
    wordlist_ids: selected.map((s) => s.wordlist.id),
    daily_question_count: kind === "daily" ? n : null,
    schedule: kind === "daily" ? dates : null
  };
  const serialized = JSON.stringify(input);
  const [debounced, setDebounced] = useState(serialized);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(serialized), 250);
    return () => clearTimeout(t);
  }, [serialized]);
  const preview = useQuery({
    queryKey: ["learning-plans", userId, "v1", "preview", debounced],
    enabled:
      !sourceUnavailable &&
      !unknown &&
      !busy &&
      !createdPlan &&
      !capabilities.isPending &&
      !capabilitiesFailed &&
      !unsupportedSelection &&
      selected.length > 0 &&
      validCount &&
      validQuestionTypes &&
      debounced === serialized,
    queryFn: ({ signal }) =>
      api.learningPlans.preview(JSON.parse(debounced) as PreviewLearningPlan, {
        signal
      }),
    retry: false,
    refetchOnWindowFocus: "always"
  });
  const pendingPreview =
    capabilities.isPending ||
    capabilitiesFailed ||
    debounced !== serialized ||
    preview.isFetching;
  const locked = busy || unknown || !!createdPlan;
  const partialChoice = (preview.data?.choice?.unavailable_count ?? 0) > 0;
  const acceptedChoice = acceptedPreview === preview.data?.preview_fingerprint;
  async function submit() {
    if (busy || (sourceUnavailable && !intent.current)) return;
    setError("");
    if (!intent.current) {
      setSubmitted(true);
      if (
        !name.trim() ||
        [...name.trim()].length > 50 ||
        !selected.length ||
        !validCount ||
        !validQuestionTypes ||
        unsupportedSelection ||
        (questionType === "choice_zh_to_en" && !choiceSupported)
      ) {
        requestAnimationFrame(() =>
          form.current
            ?.querySelector<HTMLElement>('[aria-invalid="true"]')
            ?.focus()
        );
        return;
      }
      if (!preview.data?.can_create || pendingPreview) {
        setError(
          directPractice
            ? localText(
                webTask,
                "webTask:wait_for_the_eligible_question_preview_before_starting"
              )
            : localText(
                webTask,
                "webTask:wait_for_the_eligible_question_preview_before_creating"
              )
        );
        return;
      }
      if (partialChoice && !acceptedChoice) {
        setError(
          directPractice
            ? localText(
                webTask,
                "webTask:check_unavailable_content_and_confirm_you_will_practise_only_available_c"
              )
            : localText(
                webTask,
                "webTask:check_unavailable_content_and_confirm_the_task_will_use_only_available_c"
              )
        );
        return;
      }
      intent.current = {
        ...input,
        ...(directPractice ? { reuse_active: true } : {}),
        ...(partialChoice ? { accept_partial_choice: true } : {}),
        name: name.trim(),
        idempotency_key: crypto.randomUUID(),
        preview_fingerprint: preview.data.preview_fingerprint
      };
    }
    setBusy(true);
    let result = createdPlan;
    try {
      if (result && !startIntent.current) {
        result = await api.learningPlans.detail(result.task.id, {
          signal: controller.current?.signal
        });
      }
      result ??= await api.learningPlans.create(intent.current, {
        signal: controller.current?.signal
      });
      if (!current()) return;
      if (directPractice) {
        setCreatedPlan(result);
        if (result.current_run?.state === "active") {
          router.push(`/student/practice/${result.current_run.id}`);
          return;
        }
        if (result.can_start === false) {
          router.push(`/student/tasks/${result.task.id}`);
          return;
        }
        startIntent.current ??= {
          idempotency_key: crypto.randomUUID(),
          expected_revision: result.task.revision,
          after_run_id: result.current_run?.id ?? null
        };
        const run = await api.learningPlans.start(
          result.task.id,
          startIntent.current,
          { signal: controller.current?.signal }
        );
        if (current()) router.push(`/student/practice/${run.id}`);
      } else {
        router.push(`/student/tasks/${result.task.id}`);
      }
    } catch (e) {
      if (current()) {
        setError(
          missingPlans(e)
            ? directPractice
              ? localText(
                  webTask,
                  "webTask:practice_is_not_available_yet_try_again_later"
                )
              : localText(
                  webTask,
                  "webTask:coverage_tasks_are_not_available_yet_your_draft_is_preserved_try_again_l"
                )
            : e instanceof Error
              ? originalText(e.message)
              : directPractice
                ? localText(webTask, "webTask:could_not_start_try_again")
                : localText(webTask, "webTask:could_not_create_try_again")
        );
        const definite =
          e instanceof HttpError && e.status < 500 && e.status !== 408;
        setUnknown(!definite);
        if (definite && !result) {
          intent.current = null;
          if (e.status === 409) await preview.refetch();
        } else if (definite && result) {
          startIntent.current = null;
        }
      }
    } finally {
      if (current()) setBusy(false);
    }
  }
  const field = (id: string) => ({
    id: `plan-${id}`,
    "aria-invalid": !!errors[id],
    "aria-describedby":
      errors[id] || (id === "name" && [...name].length >= 40) || id === "count"
        ? `plan-${id}-message`
        : undefined
  });
  const rowClass =
    "grid gap-3 border-b border-border/60 py-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-4";
  const captionClass = "text-sm font-medium sm:pt-3";
  const exclusionLabels = {
    unavailable_entries: localText(webTask, "webTask:entry_unavailable"),
    context_dependent: localText(webTask, "webTask:context_required"),
    no_chinese_definition: localText(
      webTask,
      "webTask:missing_chinese_definition"
    ),
    no_base_form: localText(
      webTask,
      "webTask:the_spelling_cannot_be_used_for_practice"
    ),
    answer_in_prompt: localText(
      webTask,
      "webTask:the_prompt_contains_the_answer"
    )
  };
  return (
    <PageShell size="lg">
      <div className="mx-auto max-w-[800px]">
        <PageHeader
          back={{ ...back, label: uiText(back.label) }}
          title={
            directPractice
              ? initialWordlist!.name
              : uiText("webTask:create_task")
          }
        />
        {capabilitiesFailed && (
          <PageNotice tone="error">
            {uiText(
              "webTask:could_not_load_practice_options_retry_before_starting"
            )}
            <Button variant="link" onClick={() => void capabilities.refetch()}>
              {uiText("webTask:reload_practice_options")}
            </Button>
          </PageNotice>
        )}
        {!capabilities.isPending &&
          !capabilitiesFailed &&
          unsupportedSelection && (
            <PageNotice tone="error">
              {directPractice && !directSupported
                ? uiText(
                    "webTask:this_service_does_not_support_resuming_word_list_practice_yet_continue_e"
                  )
                : !choiceSupported
                  ? uiText(
                      "webTask:this_service_does_not_support_multiple_choice_yet_choose_spelling_first"
                    )
                  : uiText(
                      "webTask:this_service_does_not_support_combined_question_types_yet_choose_one_typ"
                    )}
              {directPractice && !directSupported && (
                <Button asChild variant="link">
                  <Link href="/student/practice">
                    {uiText("webTask:my_tasks")}
                  </Link>
                </Button>
              )}
            </PageNotice>
          )}
        {sourceUnavailable && (
          <PageNotice tone="error">
            {directPractice
              ? uiText(
                  "webTask:could_not_confirm_word_list_availability_try_again"
                )
              : uiText(
                  "webTask:could_not_confirm_word_list_availability_your_draft_is_preserved_retry_o"
                )}
            <Button variant="link" onClick={onRetrySource}>
              {uiText("webTask:retry")}
            </Button>
          </PageNotice>
        )}
        <form
          ref={form}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="rounded-2xl border border-border bg-surface px-5 pt-2 sm:px-7"
        >
          {!directPractice && (
            <>
              <section aria-labelledby="sources-title" className={rowClass}>
                <h2 id="sources-title" className={captionClass}>
                  {uiText("webTask:word_lists_2")}
                </h2>
                <div className="min-w-0">
                  {selected.length > 0 && (
                    <ul className="space-y-3">
                      {selected.map(({ wordlist: w, personalName }) => (
                        <li key={w.id} className="flex items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
                            <BookOpen className="size-5" aria-hidden />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-sm font-medium"
                              title={w.name}
                            >
                              {w.name}
                            </p>
                            {personalName && personalName !== w.name && (
                              <p className="truncate text-xs text-foreground-muted">
                                {uiText("webTask:note_v0_2", {
                                  v0: personalName
                                })}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-foreground-muted">
                              {uiText("webTask:v0_entries_2", {
                                v0: w.item_count
                              })}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={locked}
                            aria-label={uiText("webTask:remove_v0", {
                              v0: w.name
                            })}
                            onClick={() =>
                              setSelected((old) =>
                                old.filter((s) => s.wordlist.id !== w.id)
                              )
                            }
                          >
                            <X className="size-4" aria-hidden />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button
                    {...field("sources")}
                    type="button"
                    size="compact"
                    variant={selected.length ? "link" : "outline"}
                    disabled={locked}
                    onClick={() => setPicker(true)}
                    className={
                      selected.length
                        ? "mt-1 px-0"
                        : "w-full justify-start rounded-xl"
                    }
                  >
                    {selected.length
                      ? uiText("webTask:change_word_lists_v0_5", {
                          v0: selected.length
                        })
                      : uiText("webTask:choose_word_lists")}
                  </Button>
                  {errors.sources && (
                    <p
                      id="plan-sources-message"
                      className="mt-2 text-xs text-danger"
                    >
                      {errors.sources}
                    </p>
                  )}
                </div>
              </section>
              <section className={rowClass}>
                <h2 className={captionClass}>{uiText("webTask:task_type")}</h2>
                <div>
                  <Segmented
                    label={uiText("webTask:task_type")}
                    value={kind}
                    options={[
                      { value: "daily", label: uiText("webTask:daily_task") },
                      {
                        value: "longterm",
                        label: uiText("webTask:long_term_task")
                      }
                    ]}
                    onChange={setKind}
                    disabled={locked}
                  />
                  {kind === "longterm" && (
                    <p className="mt-2 text-xs text-foreground-muted">
                      {uiText(
                        "webTask:no_daily_limit_continue_whenever_you_like"
                      )}
                    </p>
                  )}
                </div>
              </section>
            </>
          )}
          <section className={rowClass}>
            <div className="flex items-center justify-between sm:block">
              <h2 id="plan-types-label" className={captionClass}>
                {uiText("webTask:question_types")}
              </h2>
              <span className="text-xs text-foreground-muted sm:mt-1 sm:block">
                {uiText("webTask:select_one_or_more")}
              </span>
            </div>
            <div>
              <fieldset
                disabled={locked}
                aria-labelledby="plan-types-label"
                aria-describedby={
                  errors["question-types"]
                    ? "plan-question-types-message"
                    : undefined
                }
                className="grid grid-cols-2 gap-3"
              >
                {(
                  [
                    [
                      "choice_zh_to_en",
                      localText(webTask, "webTask:multiple_choice"),
                      localText(webTask, "webTask:read_chinese_choose_english")
                    ],
                    [
                      "spelling_zh_to_en",
                      localText(webTask, "webTask:spelling"),
                      localText(webTask, "webTask:read_chinese_write_english")
                    ]
                  ] as const
                ).map(([value, label, description]) => (
                  <label
                    key={value}
                    className="flex min-h-16 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 has-checked:border-primary has-checked:bg-primary-muted has-disabled:cursor-not-allowed has-disabled:opacity-60 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
                  >
                    <input
                      type="checkbox"
                      name="question-type"
                      value={value}
                      className="size-4 shrink-0 accent-primary"
                      checked={questionTypes.includes(value)}
                      disabled={
                        value === "choice_zh_to_en" &&
                        !choiceSupported &&
                        !questionTypes.includes(value)
                      }
                      aria-invalid={!validQuestionTypes}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setQuestionTypes((old) =>
                          checked
                            ? [...old, value]
                            : old.filter((type) => type !== value)
                        );
                      }}
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        {uiText(label)}
                      </span>{" "}
                      <span className="mt-1 block text-xs text-foreground-muted">
                        {uiText(description)}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {!choiceSupported && !capabilitiesFailed && (
                <p className="mt-2 text-xs text-foreground-muted">
                  {capabilities.isPending
                    ? uiText("webTask:checking_multiple_choice_availability")
                    : directPractice
                      ? uiText(
                          "webTask:multiple_choice_is_not_ready_yet_you_can_practise_spelling"
                        )
                      : uiText(
                          "webTask:multiple_choice_is_not_ready_yet_you_can_create_a_spelling_task"
                        )}
                </p>
              )}
              {errors["question-types"] && (
                <p
                  id="plan-question-types-message"
                  className="mt-2 text-xs text-danger"
                >
                  {errors["question-types"]}
                </p>
              )}
            </div>
          </section>
          {kind === "daily" && (
            <>
              <section className={rowClass}>
                <label htmlFor="plan-count" className={captionClass}>
                  {uiText("webTask:daily_questions")}
                </label>
                <div>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center overflow-hidden rounded-xl border border-border">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="rounded-none"
                        aria-label={uiText("webTask:reduce_daily_questions")}
                        disabled={locked || (validCount && n <= 1)}
                        onClick={() =>
                          setCount(
                            String(
                              Math.max(
                                1,
                                Math.min(
                                  masterySupported ? 20 : 200,
                                  (Number.isFinite(n) ? Math.ceil(n) : 2) - 1
                                )
                              )
                            )
                          )
                        }
                      >
                        <Minus className="size-4" aria-hidden />
                      </Button>
                      <Input
                        {...field("count")}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={masterySupported ? 20 : 200}
                        step={1}
                        disabled={locked}
                        value={count}
                        onChange={(e) => setCount(e.target.value)}
                        className="w-14 rounded-none border-0 px-0 text-center shadow-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="rounded-none"
                        aria-label={uiText("webTask:increase_daily_questions")}
                        disabled={
                          locked ||
                          (validCount && n >= (masterySupported ? 20 : 200))
                        }
                        onClick={() =>
                          setCount(
                            String(
                              Math.max(
                                1,
                                Math.min(
                                  masterySupported ? 20 : 200,
                                  (Number.isFinite(n) ? Math.floor(n) : 0) + 1
                                )
                              )
                            )
                          )
                        }
                      >
                        <Plus className="size-4" aria-hidden />
                      </Button>
                    </div>
                    <span className="text-sm text-foreground-muted">
                      {uiText("webTask:questions_day")}
                    </span>
                  </div>
                  <p
                    id="plan-count-message"
                    className={`mt-2 text-xs ${errors.count ? "text-danger" : "text-foreground-muted"}`}
                  >
                    {errors.count ??
                      (masterySupported
                        ? uiText(
                            "webTask:retries_of_incorrect_answers_are_additional"
                          )
                        : uiText(
                            "webTask:1_200_questions_per_day_if_fewer_remain_in_a_cycle_complete_only_those"
                          ))}
                  </p>
                </div>
              </section>
              <section className={rowClass}>
                <div className="flex items-center justify-between sm:block">
                  <h2 className={captionClass}>
                    {uiText("webTask:start_and_end_dates")}
                  </h2>
                  <span className="text-xs text-foreground-muted sm:mt-1 sm:block">
                    {uiText("webTask:optional")}
                  </span>
                </div>
                <PlanDateRange
                  value={dates}
                  disabled={locked}
                  onChange={setDates}
                />
              </section>
            </>
          )}
          {!directPractice && (
            <section className={rowClass}>
              <label htmlFor="plan-name" className={captionClass}>
                {uiText("webTask:task_name")}
              </label>
              <div>
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    {...field("name")}
                    ref={nameInput}
                    readOnly={!editingName && !errors.name}
                    value={name}
                    disabled={locked}
                    placeholder={uiText("webTask:enter_a_task_name")}
                    className={`min-w-0 flex-1 rounded-xl ${!editingName && !errors.name ? "border-transparent bg-transparent px-0 text-foreground-muted shadow-none" : ""}`}
                    onChange={(e) => {
                      nameEdited.current = true;
                      setName(e.target.value);
                    }}
                  />
                  <Button
                    type="button"
                    variant="link"
                    size="compact"
                    className="shrink-0 px-0"
                    disabled={locked}
                    onClick={() => {
                      if (editingName) {
                        if (name.trim() && [...name.trim()].length <= 50)
                          setEditingName(false);
                        else {
                          setSubmitted(true);
                          nameInput.current?.focus();
                        }
                      } else {
                        setEditingName(true);
                        nameInput.current?.focus();
                      }
                    }}
                  >
                    {editingName
                      ? uiText("webTask:done")
                      : uiText("webTask:edit")}
                  </Button>
                </div>
                {(errors.name || [...name].length >= 40) && (
                  <p
                    id="plan-name-message"
                    className={`mt-1 text-xs ${errors.name ? "text-danger" : "text-foreground-muted"}`}
                  >
                    {errors.name ??
                      uiText("webTask:v0_50_characters", {
                        v0: [...name].length
                      })}
                  </p>
                )}
              </div>
            </section>
          )}
          {selected.length > 0 &&
            !capabilitiesFailed &&
            !unsupportedSelection && (
              <section
                aria-label={uiText("webTask:question_preview")}
                aria-live="polite"
                className="border-b border-border py-4 text-sm"
              >
                {pendingPreview ? (
                  <p role="status" className="text-foreground-muted">
                    {uiText("webTask:calculating_eligible_questions")}
                  </p>
                ) : preview.isError ? (
                  <PageNotice tone="error">
                    {missingPlans(preview.error)
                      ? directPractice
                        ? uiText(
                            "webTask:practice_is_not_available_yet_try_again_later"
                          )
                        : uiText(
                            "webTask:coverage_tasks_are_not_ready_yet_your_draft_is_preserved"
                          )
                      : preview.error instanceof Error
                        ? uiText(
                            webErrorText(
                              preview.error,
                              localText(
                                webCommon,
                                "webCommon:response_unavailable"
                              )
                            )
                          )
                        : uiText("webTask:preview_failed")}
                    <Button
                      variant="link"
                      type="button"
                      onClick={() => void preview.refetch()}
                    >
                      {uiText("webTask:recalculate")}
                    </Button>
                  </PageNotice>
                ) : (
                  preview.data && (
                    <>
                      <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                        <p className="pt-1 font-medium">
                          {uiText("webTask:available_for_practice_v0", {
                            v0: preview.data.eligible_count
                          })}
                        </p>
                        <details className="min-w-0 flex-1 basis-44 text-xs text-foreground-muted">
                          <summary className="w-fit cursor-pointer py-1">
                            {uiText("webTask:view_excluded_content_and_rules")}
                          </summary>
                          <div className="mt-2 space-y-2 rounded-xl bg-muted p-3">
                            {Object.entries(preview.data.exclusions)
                              .filter(([, v]) => v > 0)
                              .map(([key, count]) => (
                                <p key={key}>
                                  {uiText(
                                    exclusionLabels[
                                      key as keyof typeof exclusionLabels
                                    ]
                                  )}
                                  ：{count}
                                </p>
                              ))}
                            {preview.data.choice && (
                              <ChoiceUnavailableItems
                                preview={preview.data.choice}
                              />
                            )}
                            <p>
                              {uiText(
                                "webTask:v0_v1_includes_v2_custom_words",
                                {
                                  v0: preview.data.settings.cefr_level,
                                  v1: preview.data.settings.english_variant,
                                  v2: preview.data.custom_word_count
                                }
                              )}
                            </p>
                            {mixedPractice ? (
                              <p>
                                {uiText(
                                  "webTask:multiple_choice_is_preferred_content_without_reliable_options_uses_spell"
                                )}
                              </p>
                            ) : (
                              questionType === "choice_zh_to_en" && (
                                <p>
                                  {uiText(
                                    "webTask:practise_only_content_with_reliable_multiple_choice_options_without_swit"
                                  )}
                                </p>
                              )
                            )}
                            <p>
                              {masterySupported
                                ? uiText(
                                    "webTask:new_words_reviews_and_retries_follow_mastery_each_practice_starts_with_u"
                                  )
                                : kind === "daily"
                                  ? uiText(
                                      "webTask:cover_a_cycle_using_the_daily_question_count_the_final_day_covers_only_t"
                                    )
                                  : uiText(
                                      "webTask:cover_a_full_cycle_continue_across_days"
                                    )}
                            </p>
                            {kind === "daily" &&
                              preview.data.estimated_learning_days != null && (
                                <p>
                                  {uiText(
                                    "webTask:at_the_planned_daily_rate_this_cycle_takes_about_v0_learning_days",
                                    { v0: preview.data.estimated_learning_days }
                                  )}
                                </p>
                              )}
                          </div>
                        </details>
                      </div>
                      {partialChoice && preview.data.can_create && (
                        <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1 size-4 shrink-0 accent-primary"
                            disabled={locked || pendingPreview}
                            checked={acceptedChoice}
                            onChange={(e) =>
                              setAcceptedPreview(
                                e.target.checked
                                  ? preview.data!.preview_fingerprint
                                  : null
                              )
                            }
                          />
                          {uiText(
                            "webTask:use_only_these_v0_items_eligible_for_multiple_choice",
                            {
                              v0: preview.data.eligible_count
                            }
                          )}
                        </label>
                      )}
                      {preview.data.reasons.map((reason) => (
                        <p className="mt-2 text-sm text-danger" key={reason}>
                          {reason}
                        </p>
                      ))}
                    </>
                  )
                )}
              </section>
            )}
          <div className="space-y-3 py-4">
            {error && (
              <p role="alert" className="text-sm text-danger">
                {uiText(error)}
              </p>
            )}
            {unknown && (
              <p className="text-sm text-foreground-muted">
                {directPractice
                  ? uiText(
                      "webTask:the_start_result_is_unconfirmed_retry_no_duplicate_practice_will_be_crea"
                    )
                  : uiText(
                      "webTask:the_creation_result_is_unconfirmed_your_draft_is_locked_retrying_uses_th"
                    )}
              </p>
            )}
            {directPractice && createdPlan && error && (
              <Button asChild variant="link">
                <Link href={`/student/tasks/${createdPlan.task.id}`}>
                  {uiText("webTask:view_saved_practice")}
                </Link>
              </Button>
            )}
            <div className="flex justify-end gap-2">
              <Button asChild variant="ghost">
                <Link href={back.href}>{uiText("webTask:cancel")}</Link>
              </Button>
              <Button
                type="submit"
                className="rounded-xl"
                disabled={
                  busy ||
                  (!unknown &&
                    !createdPlan &&
                    (sourceUnavailable ||
                      pendingPreview ||
                      !validQuestionTypes ||
                      unsupportedSelection ||
                      !preview.data?.can_create ||
                      (partialChoice && !acceptedChoice)))
                }
              >
                {directPractice
                  ? busy
                    ? uiText("webTask:starting")
                    : unknown || createdPlan
                      ? uiText("webTask:retry_starting_practice")
                      : uiText("webTask:start_practice")
                  : busy
                    ? uiText("webTask:creating")
                    : unknown
                      ? uiText("webTask:retry_original_creation_request")
                      : uiText("webTask:create_task")}
              </Button>
            </div>
          </div>
        </form>
      </div>
      {picker && (
        <PlanSourcePicker
          userId={userId}
          selected={selected}
          onClose={() => setPicker(false)}
          onConfirm={(items) => {
            setSelected(items);
            if (!nameEdited.current && !name && items[0]) {
              setName(suggestedPracticeName(items[0].wordlist.name, uiText));
              setEditingName(false);
            }
            setPicker(false);
          }}
        />
      )}
    </PageShell>
  );
}
