import {
  useWorkspaceTranslation,
  type WorkspaceMessage
} from "@/features/dictionary/i18n/workspace";
import { primaryRegionalVariant } from "@tsz/shared";
import { Alert, Button, Flex } from "@tsz/ui/admin/display";
import { Popconfirm } from "@tsz/ui/admin/overlays";
import type {
  AdminWordV3,
  PartOfSpeechCatalogItem,
  PartOfSpeechCatalogResponse,
  FormsStepRepresentationV3,
  DraftMeaningsStepContentWritableV3,
  V3DraftValidationIssue,
  WordCreationStep
} from "@tsz/types";
import { expandFormContents } from "@tsz/shared";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { DraftComparison } from "../DraftComparison";
import { LexiconAssistant } from "../assistant/LexiconAssistant";
import { toWritableMeanings } from "./meaningsModel";
import { WordCreationLayout } from "../word-creation/WordCreationLayout";
import { V3ProductProgressList } from "./components/V3ProductProgressList";
import { V3ReferenceList } from "./components/V3ReferenceList";
import { useV3ReferenceGuard } from "./referenceGuardContext";
import type { V3Problem } from "./problem";
import { buildV3ProductProgress, v3ProductProgressBadge } from "./readiness";
import { v3IssueMessages } from "./presentationErrors";
import "./v3-layout.css";

const STEP_TITLE: Record<WordCreationStep, WorkspaceMessage> = {
  basics: "basics",
  forms: "forms",
  meanings: "meanings",
  preview: "review_publish"
};

export type V3ConflictComparison = (
  | {
      step: "forms";
      baseRevision: number;
      localForms: AdminWordV3["forms"];
    }
  | {
      step: "meanings";
      baseRevision: number;
      localMeanings: DraftMeaningsStepContentWritableV3;
    }
) & { serverWord?: AdminWordV3 };

interface Props {
  word: AdminWordV3;
  sharedSentenceCount?: number;
  partOfSpeechCatalog?: readonly PartOfSpeechCatalogItem[];
  assistantCatalog?: PartOfSpeechCatalogResponse;
  onAssistantNavigate?: (path: string) => void;
  onAssistantFormsApply?: (
    forms: FormsStepRepresentationV3,
    expected: string
  ) => boolean;
  activeStep: WordCreationStep;
  reachableSteps?: ReadonlySet<WordCreationStep>;
  readOnly?: boolean;
  dirtySteps?: Readonly<{ forms: boolean; meanings: boolean }>;
  draftForms?: FormsStepRepresentationV3;
  draftMeanings?: DraftMeaningsStepContentWritableV3;
  problem?: V3Problem;
  conflict?: V3ConflictComparison;
  /** 本地有未保存输入时收到的更新服务端版本，等录入者决定保留还是放弃本地修改。 */
  remoteUpdate?: AdminWordV3;
  /** 待决期间每拦下一次写操作就递增，用来把冲突提示滚回视野。 */
  remoteUpdateNotice?: number;
  retrying?: boolean;
  refreshingConflict?: boolean;
  onStepChange: (step: WordCreationStep) => void;
  onIssueNavigate?: (issue: V3DraftValidationIssue) => void;
  onRetry?: () => void;
  onRefreshConflict?: () => void;
  onKeepLocalChanges?: () => void;
  onDiscardLocalChanges?: () => void;
  children: ReactNode;
}

function problemTitle(problem: V3Problem): WorkspaceMessage {
  switch (problem.kind) {
    case "revision_conflict":
      return "conflict";
    case "entry_archived":
      return "archived";
    case "validation":
      return "incomplete";
    // 影响确认失效（后端 409 downstream_confirmation_required）：兜底文案，
    // 正常路径由词形步/词义步的确认条挡在前面。
    case "impact_confirmation":
      return "impact_confirmation";
    case "inbound_reference":
      return problem.references.length > 0
        ? "references_mismatch"
        : "references_busy";
    case "network":
    case "server":
    case "service_unavailable":
      return "unavailable";
    case "authentication":
      return "expired";
    case "authorization":
      return "forbidden";
    case "client_contract":
    case "unexpected_client":
      return "invalid_response";
    default:
      return "operation_incomplete";
  }
}

type V3BaseFormSummary =
  | { mode: "common"; common: string }
  | { mode: "uk_us"; uk: string; us: string };

function firstBaseFormSummary(
  word: AdminWordV3
): V3BaseFormSummary | undefined {
  for (const pos of expandFormContents(word.forms).pos) {
    const base = pos.forms.find((form) => form.form_type === "base");
    if (!base) continue;
    if (base.regional_variants.mode === "common") {
      const common = base.regional_variants.common.spelling.trim();
      return common ? { mode: "common", common } : undefined;
    }
    const uk = primaryRegionalVariant(
      base.regional_variants,
      "uk"
    ).spelling.trim();
    const us = primaryRegionalVariant(
      base.regional_variants,
      "us"
    ).spelling.trim();
    return uk || us ? { mode: "uk_us", uk, us } : undefined;
  }
  return undefined;
}

function baseFormSummaryLabel(summary?: V3BaseFormSummary): string | undefined {
  if (!summary) return undefined;
  if (summary.mode === "common") return summary.common;
  return [...new Set([summary.uk, summary.us].filter(Boolean))].join(" / ");
}

function DiscardLocalChangesButton({
  revision,
  onConfirm
}: {
  revision: number;
  onConfirm: () => void;
}) {
  const { t } = useWorkspaceTranslation();
  return (
    <Popconfirm
      cancelText={t("cancel")}
      description={t("discard_revision", { revision })}
      okButtonProps={{ danger: true }}
      okText={t("discard_changes")}
      onConfirm={onConfirm}
      title={t("discard_local_confirm")}
    >
      <Button danger>{t("discard_local")}</Button>
    </Popconfirm>
  );
}

function V3WordCreationLayoutContent({
  word,
  partOfSpeechCatalog,
  assistantCatalog,
  onAssistantNavigate,
  onAssistantFormsApply,
  activeStep,
  reachableSteps,
  readOnly = false,
  sharedSentenceCount,
  dirtySteps = { forms: false, meanings: false },
  draftForms,
  draftMeanings,
  problem,
  conflict,
  remoteUpdate,
  remoteUpdateNotice,
  retrying,
  refreshingConflict,
  onStepChange,
  onIssueNavigate,
  onRetry,
  onRefreshConflict,
  onKeepLocalChanges,
  onDiscardLocalChanges,
  children
}: Props) {
  const { t, i18n } = useWorkspaceTranslation();
  const remoteUpdateAlertRef = useRef<HTMLDivElement>(null);
  const referenceGuard = useV3ReferenceGuard();
  // 保存被引用拦下多半是别处刚新增了引用（或索引过期）：重新拉一次，界面禁用态跟着更新。
  const inboundReferenceProblem =
    problem?.kind === "inbound_reference" ? problem : undefined;
  useEffect(() => {
    if (inboundReferenceProblem) referenceGuard.refresh();
    // 只在收到新的引用冲突时刷新；refresh 身份随查询变化，不作依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboundReferenceProblem]);
  useEffect(() => {
    if (!remoteUpdateNotice) return;
    remoteUpdateAlertRef.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "center"
    });
  }, [remoteUpdateNotice]);
  const baseFormSummary = firstBaseFormSummary(word);
  const presentationLabel = word.presentation.label.trim();
  const visibleLabel =
    baseFormSummaryLabel(baseFormSummary) ??
    (presentationLabel && !/^未命名词条(?:\s*·.*)?$/u.test(presentationLabel)
      ? presentationLabel
      : (word.presentation.matched_surfaces.find(
          (surface) =>
            surface.trim() !== "" &&
            !/^未命名词条(?:\s*·.*)?$/u.test(surface.trim())
        ) ?? t("new_entry")));
  const progressRows = buildV3ProductProgress({
    wordId: word.id,
    language: word.language,
    partOfSpeechCatalog,
    dirtySteps,
    completedSteps: word.completed_steps,
    forms: expandFormContents(draftForms ?? word.forms),
    meanings: draftMeanings ?? word.meanings
  });
  if (sharedSentenceCount !== undefined) {
    const sentences = progressRows.find((row) => row.key === "sentences");
    if (sentences) {
      sentences.count = sharedSentenceCount;
      sentences.completed = sharedSentenceCount > 0;
    }
  }
  const currentProgressKey = progressRows.find(
    (row) => row.step === activeStep && !row.completed
  )?.key;
  const operationValidationIssues =
    problem?.kind === "validation" &&
    problem.operation !== "validate" &&
    problem.operation !== "publish"
      ? problem.issues
      : [];
  const dirtyStepLabel = [
    dirtySteps.forms ? t("forms") : undefined,
    dirtySteps.meanings ? t("meanings") : undefined
  ]
    .filter(Boolean)
    .join(i18n.language.startsWith("en") ? ", " : "、");
  const showRemoteUpdate = Boolean(remoteUpdate) && !readOnly;
  const comparisonWord = remoteUpdate ?? conflict?.serverWord;
  return (
    <WordCreationLayout
      currentStep={activeStep}
      reachableSteps={reachableSteps}
      onStepChange={readOnly ? undefined : onStepChange}
      presentation={{
        wordExists: true,
        breadcrumbTitle: `${visibleLabel} · ${t(STEP_TITLE[activeStep])}`,
        completedSteps: word.completed_steps,
        summaryHeadword: (
          <strong className="v3-summary-headword tsz-words">
            {visibleLabel}
          </strong>
        ),
        progressBadge: v3ProductProgressBadge(progressRows),
        progress: (
          <V3ProductProgressList
            currentKey={currentProgressKey}
            rows={progressRows.map((row) => ({
              completed: row.completed,
              index: row.index,
              key: row.key,
              label: t(`progress_${row.key}`),
              value: row.value ?? row.count,
              details: row.details,
              statusDescription: row.statusDescription
                ? t(
                    row.key === "forms"
                      ? dirtySteps.forms
                        ? "progress_unsaved_forms"
                        : "progress_forms_count"
                      : "progress_editing"
                  )
                : undefined
            }))}
          />
        )
      }}
      readOnly={readOnly}
    >
      <Flex vertical gap="middle">
        {showRemoteUpdate && remoteUpdate ? (
          <div ref={remoteUpdateAlertRef}>
            <Alert
              showIcon
              type="error"
              title={t("conflict")}
              description={
                <Flex vertical gap={4}>
                  <span>
                    {t("remote_changed", {
                      revision: remoteUpdate.revision,
                      changes: dirtyStepLabel
                        ? t("changes_in_steps", { steps: dirtyStepLabel })
                        : t("your_changes")
                    })}
                  </span>
                  <span>{t("conflict_help")}</span>
                </Flex>
              }
              action={
                <Flex gap="small" wrap="wrap">
                  {onKeepLocalChanges ? (
                    <Button type="primary" onClick={onKeepLocalChanges}>
                      {t("keep_local")}
                    </Button>
                  ) : null}
                  {onDiscardLocalChanges ? (
                    <DiscardLocalChangesButton
                      revision={remoteUpdate.revision}
                      onConfirm={onDiscardLocalChanges}
                    />
                  ) : null}
                </Flex>
              }
            />
          </div>
        ) : null}

        {!readOnly &&
        !showRemoteUpdate &&
        (dirtySteps.forms || dirtySteps.meanings) ? (
          <Alert
            showIcon
            type="warning"
            title={t("unsaved")}
            description={t("save_before_publish", { steps: dirtyStepLabel })}
          />
        ) : null}

        {/* 挂起的新版本已经给出保留/放弃的选择，同一冲突的 409 提示不再并列显示。 */}
        {problem &&
          !(showRemoteUpdate && problem.kind === "revision_conflict") && (
            <Alert
              showIcon
              type={problem.kind === "validation" ? "warning" : "error"}
              title={t(problemTitle(problem))}
              description={
                conflict ? (
                  <Flex vertical gap={4}>
                    <span>
                      <strong>
                        {conflict.step === "forms"
                          ? t("forms_conflict")
                          : t("meanings_conflict")}
                      </strong>
                      {t("local_retained")}
                    </span>
                    {conflict.serverWord && <span>{t("server_loaded")}</span>}
                  </Flex>
                ) : inboundReferenceProblem ? (
                  <Flex vertical gap={4}>
                    <span>{t("reference_help")}</span>
                    <V3ReferenceList
                      emptyText={t("references_unknown")}
                      references={inboundReferenceProblem.references}
                    />
                  </Flex>
                ) : operationValidationIssues.length > 0 ? (
                  <Flex vertical gap={4}>
                    {v3IssueMessages(operationValidationIssues).map(
                      (message) => (
                        <span key={message}>{message}</span>
                      )
                    )}
                  </Flex>
                ) : undefined
              }
              action={
                problem.kind === "revision_conflict" &&
                conflict &&
                onRefreshConflict ? (
                  <Flex gap="small" wrap="wrap">
                    <Button
                      loading={refreshingConflict}
                      onClick={onRefreshConflict}
                    >
                      {t("compare")}
                    </Button>
                    {conflict.serverWord && onDiscardLocalChanges ? (
                      <DiscardLocalChangesButton
                        revision={conflict.serverWord.revision}
                        onConfirm={onDiscardLocalChanges}
                      />
                    ) : null}
                  </Flex>
                ) : operationValidationIssues[0] && onIssueNavigate ? (
                  <Button
                    onClick={() =>
                      onIssueNavigate(operationValidationIssues[0]!)
                    }
                  >
                    {t("first_issue")}
                  </Button>
                ) : problem.retryable && onRetry ? (
                  <Button loading={retrying} onClick={onRetry}>
                    {t("retry")}
                  </Button>
                ) : undefined
              }
            />
          )}

        {!readOnly && comparisonWord && (
          <DraftComparison
            local={{
              ...(dirtySteps.forms || conflict?.step === "forms"
                ? {
                    词形与发音:
                      draftForms ??
                      (conflict?.step === "forms"
                        ? conflict.localForms
                        : word.forms)
                  }
                : {}),
              ...(dirtySteps.meanings || conflict?.step === "meanings"
                ? {
                    词义与例句:
                      draftMeanings ??
                      (conflict?.step === "meanings"
                        ? conflict.localMeanings
                        : toWritableMeanings(word.meanings))
                  }
                : {})
            }}
            remote={{
              ...(dirtySteps.forms || conflict?.step === "forms"
                ? { 词形与发音: comparisonWord.forms }
                : {}),
              ...(dirtySteps.meanings || conflict?.step === "meanings"
                ? { 词义与例句: toWritableMeanings(comparisonWord.meanings) }
                : {})
            }}
          />
        )}
        {children}
        <LexiconAssistant
          context={{
            word,
            catalog: assistantCatalog,
            navigateField: onAssistantNavigate,
            applyForms:
              !readOnly && !conflict && !remoteUpdate && !retrying
                ? onAssistantFormsApply
                : undefined,
            step: activeStep,
            forms: draftForms ?? word.forms,
            meanings: draftMeanings ?? toWritableMeanings(word.meanings),
            dirtySteps,
            progress: progressRows.map(({ label, completed }) => ({
              label,
              completed
            }))
          }}
        />
      </Flex>
    </WordCreationLayout>
  );
}

export function V3WordCreationLayout(props: Props) {
  return <V3WordCreationLayoutContent key={props.word.id} {...props} />;
}
