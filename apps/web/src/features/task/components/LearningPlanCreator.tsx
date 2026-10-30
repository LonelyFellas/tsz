"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { HttpError } from "@tsz/api-client";
import type {
  CreateLearningPlan,
  PreviewLearningPlan,
  LearningTaskType,
  LearningQuestionType
} from "@tsz/types";
import { Button, Input, FormField } from "@tsz/ui/components";
import { api } from "@/lib/request";
import { useUserStore } from "@/stores/user";
import {
  PageShell,
  PageHeader,
  PageNotice,
  Segmented
} from "@/features/shell/Page";
import { PlanSourcePicker, type SelectedSource } from "./PlanSourcePicker";
import { missingPlans } from "./plan-api";
export function LearningPlanCreator({ userId }: { userId: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LearningTaskType>("daily");
  const [questionType, setQuestionType] =
    useState<LearningQuestionType>("spelling_zh_to_en");
  const capabilities = useQuery({
    queryKey: ["learning", userId, "capabilities"],
    queryFn: ({ signal }) => api.learning.capabilities({ signal }),
    retry: false
  });
  const choiceSupported =
    capabilities.data?.question_types.includes("choice_zh_to_en") === true;
  const [selected, setSelected] = useState<SelectedSource[]>([]);
  const [picker, setPicker] = useState(false);
  const [count, setCount] = useState("10");
  const [scheduled, setScheduled] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const intent = useRef<CreateLearningPlan | null>(null);
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
    (Number.isInteger(n) && n >= 1 && n <= 200 && count.trim() !== "");
  const validSchedule =
    kind === "longterm" || !scheduled || !!(start && end && end >= start);
  const errors: Record<string, string | undefined> = {
    name:
      submitted && (!name.trim() || [...name.trim()].length > 50)
        ? "请输入 1–50 字的任务名称。"
        : undefined,
    sources: submitted && !selected.length ? "请选择 1–5 份词表。" : undefined,
    count: !validCount ? "每日题量须为 1–200 的整数。" : undefined,
    start: !validSchedule
      ? "请填写完整日期，结束日期不得早于开始日期。"
      : undefined
  };
  const input: PreviewLearningPlan = {
    ...(questionType === "choice_zh_to_en"
      ? { question_type: questionType }
      : {}),
    task_type: kind,
    wordlist_ids: selected.map((s) => s.wordlist.id),
    daily_question_count: kind === "daily" ? n : null,
    schedule:
      kind === "daily" && scheduled
        ? { start_date: start, end_date: end }
        : null
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
      !unknown &&
      !busy &&
      selected.length > 0 &&
      validCount &&
      validSchedule &&
      debounced === serialized,
    queryFn: ({ signal }) =>
      api.learningPlans.preview(JSON.parse(debounced) as PreviewLearningPlan, {
        signal
      }),
    retry: false,
    refetchOnWindowFocus: "always"
  });
  const pendingPreview = debounced !== serialized || preview.isFetching;
  const locked = busy || unknown;
  async function submit() {
    setError("");
    if (!intent.current) {
      setSubmitted(true);
      if (
        !name.trim() ||
        [...name.trim()].length > 50 ||
        !selected.length ||
        !validCount ||
        !validSchedule ||
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
        setError("请等待有效题量预览后再创建。");
        return;
      }
      intent.current = {
        ...input,
        name: name.trim(),
        idempotency_key: crypto.randomUUID(),
        preview_fingerprint: preview.data.preview_fingerprint
      };
    }
    setBusy(true);
    try {
      const result = await api.learningPlans.create(intent.current, {
        signal: controller.current?.signal
      });
      if (current()) router.push(`/student/tasks/${result.task.id}`);
    } catch (e) {
      if (current()) {
        setError(
          missingPlans(e)
            ? "覆盖任务功能尚未就绪，草稿已保留。请稍后重试。"
            : e instanceof Error
              ? e.message
              : "创建失败，请重试。"
        );
        const definite =
          e instanceof HttpError && e.status < 500 && e.status !== 408;
        setUnknown(!definite);
        if (definite) {
          intent.current = null;
          if (e.status === 409) await preview.refetch();
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
      errors[id] || id === "name" || id === "count"
        ? `plan-${id}-message`
        : undefined
  });
  return (
    <PageShell>
      <PageHeader
        back={{ href: "/student/practice", label: "我的任务" }}
        eyebrow="自主学习"
        title="创建学习任务"
        description="选择拼写或单选练习。每轮覆盖所选内容，答错也计入覆盖。"
      />
      <form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-6 pb-4"
        noValidate
      >
        <div className="glass rounded-3xl p-2">
          <div className="space-y-6 rounded-[20px] bg-surface/70 p-6 sm:p-8">
            <FormField
              htmlFor="plan-name"
              label="任务名称"
              hint={`${[...name].length}/50 字`}
              error={errors.name}
            >
              <Input
                {...field("name")}
                value={name}
                disabled={locked}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：七年级词汇拼写"
              />
            </FormField>
            <fieldset disabled={locked}>
              <legend className="mb-2 ml-4 text-sm font-medium">
                任务类型
              </legend>
              <Segmented
                label="任务类型"
                value={kind}
                options={[
                  { value: "daily", label: "每日任务" },
                  { value: "longterm", label: "长期任务" }
                ]}
                onChange={setKind}
              />
              <p className="mx-4 mt-2 text-xs leading-5 text-foreground-muted">
                {kind === "daily"
                  ? "按每日题量覆盖一轮，最后一个学习日只做剩余题量。"
                  : "完整覆盖一轮，可跨天继续，不设每日额度。"}
              </p>
            </fieldset>
            <section aria-labelledby="sources-title" className="space-y-3">
              <h2 id="sources-title" className="text-lg font-semibold">
                来源词表
              </h2>
              <Button
                {...field("sources")}
                type="button"
                variant="outline"
                disabled={locked}
                onClick={() => setPicker(true)}
              >
                选择词表（{selected.length}/5）
              </Button>
              {errors.sources && (
                <p id="plan-sources-message" className="text-sm text-danger">
                  {errors.sources}
                </p>
              )}
              <ul className="space-y-3">
                {selected.map(({ wordlist: w, personalName }) => (
                  <li
                    key={w.id}
                    className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/50 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 break-words font-medium">
                        {w.name}
                      </p>
                      {personalName && personalName !== w.name && (
                        <p className="text-xs text-foreground-muted">
                          备注：{personalName}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-foreground-muted">
                        {w.owner_name} ·{" "}
                        {w.state === "published" ? "公开" : "非公开"} ·{" "}
                        {w.item_count} 个词条
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={locked}
                      aria-label={`移除 ${w.name}`}
                      onClick={() =>
                        setSelected((old) =>
                          old.filter((s) => s.wordlist.id !== w.id)
                        )
                      }
                    >
                      移除
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
            <fieldset disabled={locked} className="space-y-3">
              <legend className="mb-2 text-sm font-medium">练习题型</legend>
              {(
                [
                  ["spelling_zh_to_en", "拼写题 · 看中文，写英文"],
                  ["choice_zh_to_en", "单选题 · 看中文，选英文"]
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex min-h-12 items-center gap-3 rounded-2xl border border-border p-4 has-checked:border-primary has-checked:bg-primary-muted has-disabled:opacity-60"
                >
                  <input
                    type="radio"
                    name="question-type"
                    value={value}
                    className="size-4 accent-primary"
                    checked={questionType === value}
                    disabled={value === "choice_zh_to_en" && !choiceSupported}
                    onChange={() => setQuestionType(value)}
                  />
                  <span className="text-sm font-medium">{label}</span>
                </label>
              ))}
              {!choiceSupported && (
                <p className="text-xs text-foreground-muted">
                  {capabilities.isPending
                    ? "正在确认单选题是否可用…"
                    : "当前单选题功能尚未就绪，可先创建拼写任务。"}
                </p>
              )}
              <p className="mt-1 text-xs text-foreground-muted">
                {questionType === "choice_zh_to_en"
                  ? "按所选词表和学习设置自动出题，单选成绩不影响拼写掌握度。"
                  : "采用当前学习设置。"}
                自定义词暂不参与出题。
              </p>
            </fieldset>
            {kind === "daily" && (
              <>
                <FormField
                  htmlFor="plan-count"
                  label="每日题量"
                  hint="每天 1–200 题；本轮不足一天时只做剩余题量。"
                  error={errors.count}
                >
                  <Input
                    {...field("count")}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={200}
                    step={1}
                    disabled={locked}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                  />
                </FormField>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={scheduled}
                    onChange={(e) => setScheduled(e.target.checked)}
                  />
                  设置日期计划（可选）
                </label>
                {scheduled ? (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField
                      htmlFor="plan-start"
                      label="开始学习日"
                      error={errors.start}
                    >
                      <Input
                        {...field("start")}
                        type="date"
                        disabled={locked}
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                      />
                    </FormField>
                    <FormField
                      htmlFor="plan-end"
                      label="结束学习日"
                      hint="含首尾两天；以北京时间 04:00 划分学习日。"
                    >
                      <Input
                        id="plan-end"
                        type="date"
                        aria-invalid={!!errors.start}
                        aria-describedby={
                          errors.start
                            ? "plan-start-message plan-end-message"
                            : "plan-end-message"
                        }
                        min={start}
                        disabled={locked}
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                      />
                    </FormField>
                  </div>
                ) : (
                  <p className="text-sm text-foreground-muted">
                    保存后即可开始，没有结束日期。北京时间 04:00
                    前仍计入前一学习日。
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        {selected.length > 0 && (
          <section
            aria-label="题量预览"
            className="rounded-3xl border border-border bg-surface/80 p-6"
            aria-live="polite"
          >
            {pendingPreview ? (
              <p role="status">正在计算可出题数量…</p>
            ) : preview.isError ? (
              <PageNotice tone="error">
                {missingPlans(preview.error)
                  ? "覆盖任务功能尚未就绪，草稿已保留。"
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
                  <p className="text-lg font-semibold">
                    {preview.data.entry_count} 个平台词条 ·{" "}
                    {preview.data.eligible_count} 道可出题内容
                  </p>
                  {kind === "daily" && (
                    <p className="mt-2 text-sm text-foreground-muted">
                      按每天完成计划量，预计{" "}
                      {preview.data.estimated_learning_days} 个学习日完成本轮。
                    </p>
                  )}
                  <p className="mt-2 text-xs text-foreground-muted">
                    {preview.data.settings.cefr_level} /{" "}
                    {preview.data.settings.english_variant} · 自定义词{" "}
                    {preview.data.custom_word_count} 个，不参与出题
                  </p>
                  {Object.entries(preview.data.exclusions).some(
                    ([, v]) => v > 0
                  ) && (
                    <p className="mt-2 text-xs text-foreground-muted">
                      排除：词条不可用{" "}
                      {preview.data.exclusions.unavailable_entries}；依赖上下文{" "}
                      {preview.data.exclusions.context_dependent}
                      ；无适配中文释义{" "}
                      {preview.data.exclusions.no_chinese_definition}
                      ；无合法原形 {preview.data.exclusions.no_base_form}
                      ；题面包含答案 {preview.data.exclusions.answer_in_prompt}
                      。
                    </p>
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
        <div className="sticky bottom-0 z-10 space-y-3 rounded-2xl border border-border bg-surface/95 p-4 shadow-glass backdrop-blur-sm">
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {unknown && (
            <p className="text-sm text-foreground-muted">
              创建结果尚未确认，草稿已锁定；重试沿用同一请求，不会重复创建。
            </p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={
              busy ||
              (!unknown && (pendingPreview || !preview.data?.can_create))
            }
          >
            {busy ? "正在创建…" : unknown ? "重试原创建请求" : "完成创建"}
          </Button>
        </div>
      </form>
      {picker && (
        <PlanSourcePicker
          userId={userId}
          selected={selected}
          onClose={() => setPicker(false)}
          onConfirm={(items) => {
            setSelected(items);
            setPicker(false);
          }}
        />
      )}
    </PageShell>
  );
}
