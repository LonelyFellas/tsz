"use client";
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
  const back = directPractice
    ? {
        href: `${owned ? "/account" : ""}/wordlists/${wordlistId}`,
        label: "返回词表"
      }
    : { href: "/student/practice", label: "我的任务" };
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
          title={directPractice ? "开始练习" : "创建任务"}
          back={back}
        />
        {source.isError ? (
          <PageNotice tone="error">
            词表不存在、不可访问或暂时无法加载。
            <Button variant="link" onClick={() => void source.refetch()}>
              重试
            </Button>
            <Button asChild variant="link">
              <Link href={directPractice ? "/wordlists" : "/student/tasks/new"}>
                重新选择词表
              </Link>
            </Button>
          </PageNotice>
        ) : (
          <PageNotice>正在读取当前词表…</PageNotice>
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
function PlanForm({
  userId,
  initialWordlist,
  sourceError = false,
  onRetrySource,
  directPractice = false,
  back = { href: "/student/practice", label: "我的任务" }
}: {
  userId: string;
  initialWordlist?: Wordlist;
  sourceError?: boolean;
  onRetrySource?: () => void;
  directPractice?: boolean;
  back?: { href: string; label: string };
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(
    initialWordlist
      ? `${[...initialWordlist.name].slice(0, 48).join("")}练习`
      : ""
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
  const [error, setError] = useState("");
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
      ? "请至少选择一种练习题型。"
      : undefined,
    name:
      submitted && (!name.trim() || [...name.trim()].length > 50)
        ? "请输入 1–50 字的任务名称。"
        : undefined,
    sources: submitted && !selected.length ? "请选择 1–5 份词表。" : undefined,
    count: !validCount
      ? `每日题量须为 1–${masterySupported ? 20 : 200} 的整数。`
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
            ? "请等待有效题量预览后再开始。"
            : "请等待有效题量预览后再创建。"
        );
        return;
      }
      if (partialChoice && !acceptedChoice) {
        setError(
          directPractice
            ? "请先核对暂不可用内容，并确认仅练习可用内容。"
            : "请先核对暂不可用内容，并确认仅使用可用内容创建。"
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
              ? "练习功能尚未就绪，请稍后重试。"
              : "覆盖任务功能尚未就绪，草稿已保留。请稍后重试。"
            : e instanceof Error
              ? e.message
              : directPractice
                ? "开始失败，请重试。"
                : "创建失败，请重试。"
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
    unavailable_entries: "词条不可用",
    context_dependent: "需要上下文",
    no_chinese_definition: "缺少中文释义",
    no_base_form: "词面无法用于拼写",
    answer_in_prompt: "题干包含答案"
  };
  return (
    <PageShell size="lg">
      <div className="mx-auto max-w-[800px]">
        <PageHeader
          back={back}
          title={directPractice ? initialWordlist!.name : "创建任务"}
        />
        {capabilitiesFailed && (
          <PageNotice tone="error">
            练习选项暂时无法加载，请重试后再开始。
            <Button variant="link" onClick={() => void capabilities.refetch()}>
              重新加载练习选项
            </Button>
          </PageNotice>
        )}
        {!capabilities.isPending &&
          !capabilitiesFailed &&
          unsupportedSelection && (
            <PageNotice tone="error">
              {directPractice && !directSupported
                ? "当前服务尚未支持词表续练，请从我的任务继续已有练习。"
                : !choiceSupported
                  ? "当前服务尚未支持单选题，请先选择拼写题。"
                  : "当前服务尚未支持组合题型，请先单独选择一种题型。"}
              {directPractice && !directSupported && (
                <Button asChild variant="link">
                  <Link href="/student/practice">我的任务</Link>
                </Button>
              )}
            </PageNotice>
          )}
        {sourceUnavailable && (
          <PageNotice tone="error">
            {directPractice
              ? "暂时无法确认词表是否可用，请重试。"
              : "暂时无法确认词表是否可用，草稿已保留。请重试或移除此词表后再创建。"}
            <Button variant="link" onClick={onRetrySource}>
              重试
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
                  词表
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
                                备注：{personalName}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-foreground-muted">
                              {w.item_count} 个词条
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={locked}
                            aria-label={`移除 ${w.name}`}
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
                      ? `更换词表（${selected.length}/5）`
                      : "选择词表"}
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
                <h2 className={captionClass}>任务类型</h2>
                <div>
                  <Segmented
                    label="任务类型"
                    value={kind}
                    options={[
                      { value: "daily", label: "每日任务" },
                      { value: "longterm", label: "长期任务" }
                    ]}
                    onChange={setKind}
                    disabled={locked}
                  />
                  {kind === "longterm" && (
                    <p className="mt-2 text-xs text-foreground-muted">
                      不设每日题量，随时接着练
                    </p>
                  )}
                </div>
              </section>
            </>
          )}
          <section className={rowClass}>
            <div className="flex items-center justify-between sm:block">
              <h2 id="plan-types-label" className={captionClass}>
                题型
              </h2>
              <span className="text-xs text-foreground-muted sm:mt-1 sm:block">
                可多选
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
                    ["choice_zh_to_en", "单选", "看中文，选英文"],
                    ["spelling_zh_to_en", "拼写", "看中文，写英文"]
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
                      <span className="block text-sm font-medium">{label}</span>{" "}
                      <span className="mt-1 block text-xs text-foreground-muted">
                        {description}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {!choiceSupported && !capabilitiesFailed && (
                <p className="mt-2 text-xs text-foreground-muted">
                  {capabilities.isPending
                    ? "正在确认单选题是否可用…"
                    : directPractice
                      ? "当前单选题功能尚未就绪，可先进行拼写练习。"
                      : "当前单选题功能尚未就绪，可先创建拼写任务。"}
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
                  每日题量
                </label>
                <div>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center overflow-hidden rounded-xl border border-border">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="rounded-none"
                        aria-label="减少每日题量"
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
                        aria-label="增加每日题量"
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
                      题 / 天
                    </span>
                  </div>
                  <p
                    id="plan-count-message"
                    className={`mt-2 text-xs ${errors.count ? "text-danger" : "text-foreground-muted"}`}
                  >
                    {errors.count ??
                      (masterySupported
                        ? "错题重练另计"
                        : "每天 1–200 题；本轮不足一天时只做剩余题量。")}
                  </p>
                </div>
              </section>
              <section className={rowClass}>
                <div className="flex items-center justify-between sm:block">
                  <h2 className={captionClass}>起止日期</h2>
                  <span className="text-xs text-foreground-muted sm:mt-1 sm:block">
                    可选
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
                任务名称
              </label>
              <div>
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    {...field("name")}
                    ref={nameInput}
                    readOnly={!editingName && !errors.name}
                    value={name}
                    disabled={locked}
                    placeholder="填写任务名称"
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
                    {editingName ? "完成" : "编辑"}
                  </Button>
                </div>
                {(errors.name || [...name].length >= 40) && (
                  <p
                    id="plan-name-message"
                    className={`mt-1 text-xs ${errors.name ? "text-danger" : "text-foreground-muted"}`}
                  >
                    {errors.name ?? `${[...name].length}/50 字`}
                  </p>
                )}
              </div>
            </section>
          )}
          {selected.length > 0 &&
            !capabilitiesFailed &&
            !unsupportedSelection && (
              <section
                aria-label="题量预览"
                aria-live="polite"
                className="border-b border-border py-4 text-sm"
              >
                {pendingPreview ? (
                  <p role="status" className="text-foreground-muted">
                    正在计算可出题数量…
                  </p>
                ) : preview.isError ? (
                  <PageNotice tone="error">
                    {missingPlans(preview.error)
                      ? directPractice
                        ? "练习功能尚未就绪，请稍后重试。"
                        : "覆盖任务功能尚未就绪，草稿已保留。"
                      : preview.error instanceof Error
                        ? preview.error.message
                        : "预览失败"}
                    <Button
                      variant="link"
                      type="button"
                      onClick={() => void preview.refetch()}
                    >
                      重新计算
                    </Button>
                  </PageNotice>
                ) : (
                  preview.data && (
                    <>
                      <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                        <p className="pt-1 font-medium">
                          可练习 {preview.data.eligible_count} 项内容
                        </p>
                        <details className="min-w-0 flex-1 basis-44 text-xs text-foreground-muted">
                          <summary className="w-fit cursor-pointer py-1">
                            查看未纳入内容与规则
                          </summary>
                          <div className="mt-2 space-y-2 rounded-xl bg-muted p-3">
                            {Object.entries(preview.data.exclusions)
                              .filter(([, v]) => v > 0)
                              .map(([key, count]) => (
                                <p key={key}>
                                  {
                                    exclusionLabels[
                                      key as keyof typeof exclusionLabels
                                    ]
                                  }
                                  ：{count}
                                </p>
                              ))}
                            {preview.data.choice && (
                              <ChoiceUnavailableItems
                                preview={preview.data.choice}
                              />
                            )}
                            <p>
                              {preview.data.settings.cefr_level} /{" "}
                              {preview.data.settings.english_variant} · 含{" "}
                              {preview.data.custom_word_count} 个自定义词
                            </p>
                            {mixedPractice ? (
                              <p>
                                优先出单选题，无法可靠出单选的内容使用拼写题。
                              </p>
                            ) : (
                              questionType === "choice_zh_to_en" && (
                                <p>
                                  仅练习可出单选的内容，不改为拼写。单选成绩不影响拼写掌握度。
                                </p>
                              )
                            )}
                            <p>
                              {masterySupported
                                ? "按掌握情况安排新学、复习和错题重练；每次先安排最多 20 题，含重练最多 30 题。"
                                : kind === "daily"
                                  ? "按每日题量覆盖一轮，最后一天只练剩余内容。"
                                  : "完整覆盖一轮，可跨天继续。"}
                            </p>
                            {kind === "daily" &&
                              preview.data.estimated_learning_days != null && (
                                <p>
                                  按每天完成计划量，预计{" "}
                                  {preview.data.estimated_learning_days}{" "}
                                  个学习日完成本轮。
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
                          仅使用这 {preview.data.eligible_count}{" "}
                          项可出单选的内容
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
                {error}
              </p>
            )}
            {unknown && (
              <p className="text-sm text-foreground-muted">
                {directPractice
                  ? "开始结果尚未确认，请重试，不会重复创建练习。"
                  : "创建结果尚未确认，草稿已锁定；重试沿用同一请求，不会重复创建。"}
              </p>
            )}
            {directPractice && createdPlan && error && (
              <Button asChild variant="link">
                <Link href={`/student/tasks/${createdPlan.task.id}`}>
                  查看已保存的练习
                </Link>
              </Button>
            )}
            <div className="flex justify-end gap-2">
              <Button asChild variant="ghost">
                <Link href={back.href}>取消</Link>
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
                    ? "正在开始…"
                    : unknown || createdPlan
                      ? "重试开始练习"
                      : "开始练习"
                  : busy
                    ? "正在创建…"
                    : unknown
                      ? "重试原创建请求"
                      : "创建任务"}
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
              setName(
                `${[...items[0].wordlist.name].slice(0, 48).join("")}练习`
              );
              setEditingName(false);
            }
            setPicker(false);
          }}
        />
      )}
    </PageShell>
  );
}
