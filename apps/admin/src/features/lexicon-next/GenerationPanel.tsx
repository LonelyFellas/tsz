import {
  useEffect,
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
  onFill: (
    result: NextAgentResult,
    binding: GenerationTarget,
    exampleIds: string[]
  ) => boolean;
}) {
  const { t } = useLexiconEditorTranslation();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<GenerationTarget>(entryTarget);
  const [generation, setGeneration] = useState<{
    result: NextAgentResult;
    headword: string;
  }>();
  const result = generation?.result;
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
      setResume(undefined);
      setFeedback("");
      setError("");
    }
  }, [visible, available]);
  async function start(binding: GenerationTarget, old?: Run) {
    const section = binding.section;
    if (
      active.current ||
      locked ||
      (section !== "all" && !sections.includes(section))
    )
      return;
    const senses = generationSenses(draft, medium, binding);
    const scopedPos =
      binding.pos ?? (binding.senseId ? senses[0]?.pos : undefined);
    const requestedExamples =
      section === "all"
        ? examples
        : section === "translations"
          ? examples.filter(
              (s) => !binding.sentenceId || s.id === binding.sentenceId
            )
          : [];
    setOpen(true);
    setSelection(binding);
    if (
      (binding.senseId && !senses.length) ||
      (section === "groups" && !senses.length) ||
      senses.length > 80 ||
      requestedExamples.length > 50 ||
      (section === "translations" && !requestedExamples.length)
    ) {
      setResume(undefined);
      setGeneration(undefined);
      setFeedback("");
      setError(
        senses.length > 80 || requestedExamples.length > 50
          ? "本次生成的词义或例句超出数量上限，请选择具体板块。"
          : section === "translations"
            ? t("entry_ai_translation_ineligible")
            : "请先添加词性和词义。"
      );
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError("");
    setFeedback("");
    if (!old) setGeneration(undefined);
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify([snapshot, binding]))
      );
      const run = old ?? {
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
          senses: senses.map(({ pos, gloss }) => ({
            pos,
            gloss
          }))
        }
      };
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
        if (
          next.run_id !== run.input.run_id ||
          next.base_revision !== revision ||
          next.snapshot_id !== run.input.snapshot_id ||
          !next.requires_human_review
        )
          throw new Error("返回结果与当前草稿不匹配。");
        setGeneration({ result: next, headword: run.input.headword });
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
          const changed = latest.current.onFill(
            next,
            run.binding,
            run.exampleIds
          );
          setFeedback(
            changed
              ? "已回填到草稿，请核对后保存。"
              : "已有内容已保留，本次没有可补全的字段。"
          );
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
  const actions = visible
    ? {
        sections,
        available,
        disabled: locked || pending,
        exampleIds: examples.map((s) => s.id),
        openAssistant,
        generateSection: (binding: GenerationTarget) =>
          void start(
            binding,
            resume?.snapshot === snapshot &&
              JSON.stringify(binding) === JSON.stringify(resume.binding)
              ? resume
              : undefined
          )
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
                onClick={() =>
                  void start(
                    selection,
                    resume?.snapshot === snapshot ? resume : undefined
                  )
                }
              >
                {resume?.snapshot === snapshot && !pending
                  ? "继续生成"
                  : selection.section === "all"
                    ? t("entry_ai_generate_entry")
                    : t("entry_ai_generate_section", {
                        section: sectionLabel
                      })}
              </Button>
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
            {error && <Alert type="error" title={error} />}
            {feedback && <p role="status">{feedback}</p>}
            {showForms && generation && (
              <PartOfSpeechLabelsProvider items={catalog?.items}>
                <FormTypeLabelsProvider items={catalog?.form_types}>
                  <FormGenerationResult
                    key={generation.result.run_id}
                    headword={generation.headword}
                    sources={generation.result.sources}
                    forms={generation.result.proposals.forms}
                  />
                </FormTypeLabelsProvider>
              </PartOfSpeechLabelsProvider>
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
                              void start({ ...selection, section: s.section });
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
