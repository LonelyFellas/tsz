import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import type {
  NextAgentInput,
  NextAgentResult,
  NextAgentSection,
  NextDraft,
  PartOfSpeechCatalogResponse
} from "@tsz/types";
import { Alert, Button, Space, Tag, Typography } from "@tsz/ui/admin/display";
import { Drawer } from "@tsz/ui/admin/overlays";
import dayjs from "dayjs";
import { Bot, Sparkles } from "lucide-react";
import {
  externalDictionaries,
  GenerationContext,
  type GenerationTarget
} from "./generationContext";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import { generationSenses } from "./generatedDraft";
import { FormGenerationResult } from "./FormGenerationResult";
import { FormTypeLabelsProvider } from "@/features/dictionary/part-of-speech/FormTypeLabels";
import { PartOfSpeechLabelsProvider } from "@/features/dictionary/part-of-speech/PartOfSpeechLabels";

const entryTarget: GenerationTarget = { section: "all" };
const statuses: Record<string, string> = {
  pending: "待生成",
  running: "生成中",
  failed: "失败",
  completed: "已完成"
};
const failureReasons: Record<string, string> = {
  result_unknown: "上次调用结果未知",
  provider_error: "模型服务未完成请求",
  invalid_output: "候选内容未通过校验",
  missing_senses: "缺少可用词义",
  missing_examples: "缺少可用例句"
};
const sourceStatus: Record<string, string> = {
  found: "已取得参考",
  no_match: "无匹配",
  unavailable: "未能取得资料",
  not_configured: "未配置"
};
type Run = {
  snapshot: string;
  input: NextAgentInput;
  binding: GenerationTarget;
  exampleIds: string[];
};
type Generation = {
  result: NextAgentResult;
  run: Run;
  generatedAt?: string;
};

function matches(result: NextAgentResult, run: Run) {
  return (
    result.run_id === run.input.run_id &&
    result.base_revision === run.input.base_revision &&
    result.snapshot_id === run.input.snapshot_id &&
    result.requires_human_review
  );
}

export function GenerationPanel({
  children,
  visible = true,
  available = true,
  catalog,
  entryId,
  revision,
  draft,
  medium,
  target,
  sections,
  contextVersion,
  examples,
  disabled,
  generate,
  lookup,
  onFill
}: {
  children: ReactNode;
  visible?: boolean;
  available?: boolean;
  catalog?: PartOfSpeechCatalogResponse;
  entryId: string;
  revision: number;
  draft: NextDraft;
  medium: string;
  target: string;
  sections: NextAgentSection[];
  contextVersion: string;
  examples: { id: string; text: string }[];
  disabled: boolean;
  generate: LexiconNextRequests["generate"];
  lookup?: LexiconNextRequests["generationCandidates"];
  onFill: (
    result: NextAgentResult,
    binding: GenerationTarget,
    exampleIds: string[]
  ) => boolean;
}) {
  const { t } = useLexiconEditorTranslation();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<GenerationTarget>(entryTarget);
  const [generated, setGeneration] = useState<Generation>();
  const [stored, setStored] = useState<Generation>();
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState(false);
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [resume, setResume] = useState<Run>();
  const active = useRef<AbortController | undefined>(undefined);
  const snapshot = JSON.stringify([
    entryId,
    revision,
    target,
    medium,
    sections,
    draft,
    contextVersion,
    examples
  ]);
  const locked = disabled || !available || !visible;
  const latest = useRef({ snapshot, onFill, disabled: locked });
  useLayoutEffect(() => {
    latest.current = { snapshot, onFill, disabled: locked };
  }, [snapshot, onFill, locked]);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = undefined;
    },
    []
  );
  useEffect(() => {
    if (!visible || !available) {
      active.current?.abort();
      setOpen(false);
      setGeneration(undefined);
      setStored(undefined);
      setResume(undefined);
      setFeedback("");
      setError("");
    }
  }, [visible, available]);
  function supportsCandidates(binding: GenerationTarget) {
    return (
      !!lookup &&
      (binding.section === "forms" ||
        (binding.section === "grammar" &&
          Boolean(
            binding.pos ||
            draft.form_editor?.pos.length ||
            generationSenses(draft, medium, binding).length
          )))
    );
  }
  const candidateMode = supportsCandidates(selection);
  const currentGeneration = candidateMode
    ? generated?.run.snapshot === snapshot &&
      generated.run.binding === selection
      ? generated
      : undefined
    : generated;
  const currentStored =
    candidateMode &&
    stored?.run.snapshot === snapshot &&
    stored.run.binding === selection
      ? stored
      : undefined;
  const generation = currentGeneration ?? currentStored;
  const result = generation?.result;

  async function prepareRun(binding: GenerationTarget, forceRefresh = false) {
    const section = binding.section;
    const senses = generationSenses(draft, medium, binding);
    const scopedPos =
      binding.pos ?? (binding.senseId ? senses[0]?.pos : undefined);
    const requestedExamples =
      section === "translations" && binding.sentenceId
        ? examples.filter((s) => s.id === binding.sentenceId)
        : section === "all" || section === "translations"
          ? examples.slice(0, 50)
          : [];
    if (
      (binding.senseId && !senses.length) ||
      (section === "groups" && !senses.length) ||
      senses.length > 80 ||
      (section === "translations" && !requestedExamples.length)
    ) {
      throw new Error(
        senses.length > 80
          ? "本次生成的词义超出数量上限，请选择具体板块。"
          : section === "translations"
            ? t("entry_ai_translation_ineligible")
            : "请先添加词性和词义。"
      );
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify([snapshot, binding]))
    );
    return {
      snapshot,
      binding,
      exampleIds: requestedExamples.map((ex) => ex.id),
      input: {
        run_id: crypto.randomUUID(),
        base_revision: revision,
        snapshot_id: Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, "0")
        ).join(""),
        headword: draft.headword,
        target,
        examples: requestedExamples.map((ex) => ex.text),
        existing_pos: scopedPos
          ? [scopedPos]
          : (draft.form_editor?.pos.map((p) => p.pos) ?? []),
        sections: section === "all" ? sections : [section],
        senses: senses.map(({ pos, gloss }) => ({ pos, gloss })),
        ...(forceRefresh ? { force_refresh: true } : {})
      }
    } satisfies Run;
  }

  const readCandidate = useEffectEvent(async (signal: AbortSignal) => {
    if (!lookup) return;
    setLookingUp(true);
    setLookupError(false);
    setStored(undefined);
    try {
      const run = await prepareRun(selection);
      if (signal.aborted) return;
      const { candidate } = await lookup(entryId, run.input, signal);
      if (signal.aborted) return;
      if (candidate) {
        if (!matches(candidate.result, run))
          throw new Error("候选与当前草稿不匹配。");
        setStored({
          result: candidate.result,
          run,
          generatedAt: candidate.generated_at
        });
      }
    } catch {
      if (!signal.aborted) setLookupError(true);
    } finally {
      if (!signal.aborted) setLookingUp(false);
    }
  });

  useEffect(() => {
    if (!open || !candidateMode || locked || pending || currentGeneration)
      return;
    const controller = new AbortController();
    void readCandidate(controller.signal);
    return () => controller.abort();
  }, [
    open,
    candidateMode,
    locked,
    pending,
    snapshot,
    selection,
    currentGeneration,
    lookup,
    lookupAttempt
  ]);

  function fill({ result, run }: Generation) {
    setError("");
    setFeedback("");
    if (
      latest.current.snapshot !== run.snapshot ||
      latest.current.disabled ||
      !matches(result, run)
    ) {
      setFeedback("草稿或编辑状态已变化，请重新生成。");
      return;
    }
    try {
      const changed = latest.current.onFill(
        result,
        run.binding,
        run.exampleIds
      );
      setFeedback(
        changed
          ? "已回填到草稿，请核对后保存。"
          : "已有内容已保留，本次没有可补全的字段。"
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("entry_ai_fill_failed"));
    }
  }

  async function start(
    binding: GenerationTarget,
    old?: Run,
    forceRefresh = false
  ) {
    const section = binding.section;
    if (
      active.current ||
      locked ||
      (section !== "all" && !sections.includes(section))
    )
      return;
    const controller = new AbortController();
    active.current = controller;
    setOpen(true);
    setSelection(old?.binding ?? binding);
    setPending(true);
    setError("");
    setFeedback("");
    if (!old) {
      setGeneration(undefined);
      setResume(undefined);
    }
    try {
      const run = old ?? (await prepareRun(binding, forceRefresh));
      if (controller.signal.aborted) return;
      setResume(run);
      while (!controller.signal.aborted) {
        if (
          latest.current.snapshot !== run.snapshot ||
          latest.current.disabled
        ) {
          setFeedback("草稿或编辑状态已变化，请重新生成。");
          setResume(undefined);
          return;
        }
        const next = await generate(entryId, run.input, controller.signal);
        if (controller.signal.aborted) return;
        if (!matches(next, run)) throw new Error("返回结果与当前草稿不匹配。");
        setGeneration({ result: next, run });
        if (next.done) {
          setResume(undefined);
          if (
            latest.current.snapshot !== run.snapshot ||
            latest.current.disabled
          ) {
            setFeedback("草稿或编辑状态已变化，请重新生成。");
            return;
          }
          if (!Object.values(next.proposals).some((rows) => rows.length)) {
            setFeedback("本次没有可回填的候选。");
            return;
          }
          if (!supportsCandidates(binding)) fill({ result: next, run });
          return;
        }
        if (next.steps.some((s) => s.state === "running"))
          await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "生成失败，请重试。");
    } finally {
      if (active.current === controller) {
        active.current = undefined;
        setPending(false);
      }
    }
  }
  function openAssistant() {
    if (!pending && selection.section !== "all") {
      setSelection(entryTarget);
      setResume(undefined);
      setGeneration(undefined);
      setFeedback("");
      setError("");
    }
    setOpen(true);
  }
  function resumeFor(binding: GenerationTarget) {
    return resume?.snapshot === snapshot &&
      JSON.stringify(binding) === JSON.stringify(resume.binding)
      ? resume
      : undefined;
  }

  function openSection(binding: GenerationTarget) {
    if (!supportsCandidates(binding)) {
      void start(binding, resumeFor(binding));
      return;
    }
    setSelection(binding);
    setGeneration(undefined);
    setStored(undefined);
    setLookupError(false);
    setFeedback("");
    setError("");
    setOpen(true);
  }

  const actions = visible
    ? {
        sections,
        available,
        disabled: locked || pending,
        exampleIds: examples.map((s) => s.id),
        openAssistant,
        generateSection: openSection
      }
    : null;
  const sectionLabel =
    selection.section === "all"
      ? undefined
      : (selection.label ?? t(`entry_ai_${selection.section}`));
  const showForms =
    selection.section === "forms" ||
    (selection.section === "all" &&
      result?.steps.some((step) => step.section === "forms"));

  const generatedTime = generation?.generatedAt && (
    <Typography.Text type="secondary">
      {t("entry_ai_generated_at")}{" "}
      <time dateTime={generation.generatedAt}>
        {dayjs(generation.generatedAt).format("YYYY-MM-DD HH:mm:ss")}
      </time>
    </Typography.Text>
  );

  const resumable = resumeFor(selection);
  const canUse =
    candidateMode &&
    generation &&
    result?.done &&
    selection.section !== "all" &&
    result.proposals[selection.section].length > 0;
  const refresh = candidateMode && !!result?.done && !resumable;

  return (
    <GenerationContext.Provider value={actions}>
      {children}
      {visible && (
        <Drawer
          title={
            <Space>
              {sectionLabel ? (
                <Sparkles aria-hidden="true" />
              ) : (
                <Bot aria-hidden="true" />
              )}
              {sectionLabel
                ? t("entry_ai_generate_section", { section: sectionLabel })
                : t("entry_ai_assistant")}
            </Space>
          }
          open={open}
          onClose={() => setOpen(false)}
          size={showForms ? "min(880px, 100vw)" : "min(440px, 100vw)"}
          destroyOnHidden
        >
          <Space
            direction="vertical"
            size="middle"
            className="lexicon-generation-drawer"
          >
            <Typography.Text strong>
              {draft.headword}
              {selection.senseLabel && ` · ${selection.senseLabel}`}
            </Typography.Text>
            {selection.section === "all" && !result && (
              <div>
                <Typography.Text type="secondary">
                  {t("entry_ai_scope")}
                </Typography.Text>
                <div>
                  <Space wrap size="small">
                    {sections.map((s) => (
                      <Tag key={s}>{t(`entry_ai_${s}`)}</Tag>
                    ))}
                  </Space>
                </div>
              </div>
            )}
            {!available && (
              <Alert type="info" title={t("entry_ai_unavailable")} />
            )}
            <Space wrap>
              <Button
                loading={pending}
                disabled={locked || pending}
                onClick={() => void start(selection, resumable, refresh)}
              >
                {resumable && !pending
                  ? "继续生成"
                  : refresh
                    ? t("entry_ai_refresh")
                    : selection.section === "all"
                      ? t("entry_ai_generate_entry")
                      : t("entry_ai_generate_section", {
                          section: sectionLabel
                        })}
              </Button>
              {canUse && (
                <Button
                  type="primary"
                  disabled={locked || pending}
                  onClick={() => fill(generation)}
                >
                  {t("entry_ai_use_candidates")}
                </Button>
              )}
              {pending && (
                <Button
                  onClick={() => {
                    active.current?.abort();
                    setFeedback("已停止后续板块，可继续本次生成。");
                  }}
                >
                  停止
                </Button>
              )}
            </Space>
            {candidateMode && !pending && !currentGeneration && lookingUp && (
              <Typography.Text type="secondary" role="status">
                {t("entry_ai_lookup_pending")}
              </Typography.Text>
            )}
            {candidateMode && !pending && !currentGeneration && lookupError && (
              <Alert
                type="error"
                title={t("entry_ai_lookup_failed")}
                action={
                  <Button onClick={() => setLookupAttempt((n) => n + 1)}>
                    {t("entry_ai_retry_lookup")}
                  </Button>
                }
              />
            )}
            {!showForms && generatedTime}
            {error && <Alert type="error" title={error} />}
            {feedback && <p role="status">{feedback}</p>}
            {showForms && generation && (
              <PartOfSpeechLabelsProvider items={catalog?.items}>
                <FormTypeLabelsProvider items={catalog?.form_types}>
                  <FormGenerationResult
                    key={generation.result.run_id}
                    headword={generation.run.input.headword}
                    sources={generation.result.sources}
                    forms={generation.result.proposals.forms}
                  />
                </FormTypeLabelsProvider>
              </PartOfSpeechLabelsProvider>
            )}
            {candidateMode &&
              selection.section === "grammar" &&
              !!result?.proposals.grammar.length && (
                <ul>
                  {[
                    ...new Set(
                      result.proposals.grammar.map((row) => row.pattern)
                    )
                  ].map((pattern) => (
                    <li key={pattern}>{pattern}</li>
                  ))}
                </ul>
              )}
            {result && (
              <details
                open={
                  pending ||
                  result.steps.some((s) => s.state === "failed") ||
                  undefined
                }
              >
                <summary>板块进度与来源</summary>
                {showForms && generatedTime}
                <ul>
                  {result.steps.map((s) => (
                    <li key={s.section}>
                      {t(`entry_ai_${s.section}`)} ·{" "}
                      {statuses[s.state] ?? s.state}
                      {s.state === "completed" &&
                        `（${result.proposals[s.section].length} 项）`}
                      {s.error && ` · ${failureReasons[s.error] ?? "未能生成"}`}
                      {s.state === "failed" &&
                        result.done &&
                        sections.includes(s.section) && (
                          <Button
                            type="link"
                            size="small"
                            disabled={disabled || pending}
                            onClick={() => {
                              const binding = {
                                ...selection,
                                section: s.section
                              };
                              void start(
                                binding,
                                undefined,
                                supportsCandidates(binding)
                              );
                            }}
                          >
                            重新生成{t(`entry_ai_${s.section}`)}
                          </Button>
                        )}
                    </li>
                  ))}
                </ul>
                <ul>
                  {result.sources
                    .filter(
                      (source) =>
                        !showForms || !externalDictionaries.has(source.source)
                    )
                    .map((s, i) => (
                      <li key={`${s.source}-${i}`}>
                        {s.locator.startsWith("https://") ? (
                          <a href={s.locator} target="_blank" rel="noreferrer">
                            {s.source}
                          </a>
                        ) : (
                          s.source
                        )}{" "}
                        · {sourceStatus[s.status] ?? s.status}
                        {s.status === "found" && s.excerpt && ` · ${s.excerpt}`}
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </Space>
        </Drawer>
      )}
    </GenerationContext.Provider>
  );
}
