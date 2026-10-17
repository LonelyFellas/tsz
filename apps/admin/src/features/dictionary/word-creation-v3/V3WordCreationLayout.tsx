import {
  Alert as MuiAlert,
  AlertTitle as MuiAlertTitle,
  Button as MuiButton,
  Stack as MuiStack
} from "@mui/material";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type {
  AdminWordV3,
  PartOfSpeechCatalogItem,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  V3DraftValidationIssue,
  WordCreationStep
} from "@tsz/types";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { DraftComparison } from "../DraftComparison";
import { toWritableMeanings } from "./meaningsModel";
import { WordCreationLayout } from "../word-creation/WordCreationLayout";
import { V3ProductProgressList } from "./components/V3ProductProgressList";
import { V3ReferenceList } from "./components/V3ReferenceList";
import { useV3ReferenceGuard } from "./referenceGuardContext";
import type { V3Problem } from "./problem";
import { buildV3ProductProgress, v3ProductProgressBadge } from "./readiness";
import { v3IssueMessages } from "./presentationErrors";
import "./v3-layout.css";

const STEP_TITLE: Record<WordCreationStep, string> = {
  basics: "基础信息",
  forms: "词形与发音",
  meanings: "词义与例句",
  preview: "核对与发布"
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
  activeStep: WordCreationStep;
  reachableSteps?: ReadonlySet<WordCreationStep>;
  readOnly?: boolean;
  dirtySteps?: Readonly<{ forms: boolean; meanings: boolean }>;
  draftForms?: DraftFormsStepContentV3;
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

function problemTitle(problem: V3Problem) {
  switch (problem.kind) {
    case "revision_conflict":
      return "版本冲突";
    case "entry_archived":
      return "词条已在垃圾桶中";
    case "validation":
      return "仍有内容需要完成";
    // 影响确认失效（后端 409 downstream_confirmation_required）：兜底文案，
    // 正常路径由词形步/词义步的确认条挡在前面。
    case "impact_confirmation":
      return "词形影响需要重新确认";
    case "inbound_reference":
      return problem.references.length > 0
        ? "本次修改会导致关联内容不匹配，暂时无法完成操作"
        : "关联内容正在修改或尚未解除关联，暂时无法完成操作";
    case "network":
    case "server":
    case "service_unavailable":
      return "服务暂时不可用";
    case "authentication":
      return "登录状态已失效";
    case "authorization":
      return "没有操作权限";
    case "client_contract":
    case "unexpected_client":
      return "响应格式异常，已安全停止";
    default:
      return "操作未完成";
  }
}

type V3BaseFormSummary =
  | { mode: "common"; common: string }
  | { mode: "uk_us"; uk: string; us: string };

function firstBaseFormSummary(
  word: AdminWordV3
): V3BaseFormSummary | undefined {
  for (const pos of word.forms.pos) {
    const base = pos.forms.find((form) => form.form_type === "base");
    if (!base) continue;
    if (base.regional_variants.mode === "common") {
      const common = base.regional_variants.common.spelling.trim();
      return common ? { mode: "common", common } : undefined;
    }
    const uk = base.regional_variants.uk.spelling.trim();
    const us = base.regional_variants.us.spelling.trim();
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <MuiButton color="error" onClick={() => setOpen(true)}>
        放弃本地修改
      </MuiButton>
      <ConfirmDialog
        open={open}
        title="放弃本地修改？"
        confirmText="放弃修改"
        danger
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          onConfirm();
        }}
      >
        {`未保存的输入会被丢弃，改用第 ${revision} 版内容。`}
      </ConfirmDialog>
    </>
  );
}

function V3WordCreationLayoutContent({
  word,
  partOfSpeechCatalog,
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
        ) ?? "新词条"));
  const progressRows = buildV3ProductProgress({
    wordId: word.id,
    language: word.language,
    partOfSpeechCatalog,
    dirtySteps,
    completedSteps: word.completed_steps,
    forms: draftForms ?? word.forms,
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
    dirtySteps.forms ? "词形与发音" : undefined,
    dirtySteps.meanings ? "词义与例句" : undefined
  ]
    .filter(Boolean)
    .join("、");
  const showRemoteUpdate = Boolean(remoteUpdate) && !readOnly;
  const comparisonWord = remoteUpdate ?? conflict?.serverWord;
  return (
    <WordCreationLayout
      currentStep={activeStep}
      reachableSteps={reachableSteps}
      onStepChange={readOnly ? undefined : onStepChange}
      presentation={{
        wordExists: true,
        breadcrumbTitle: `${visibleLabel} · ${STEP_TITLE[activeStep]}`,
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
              label: row.label,
              value: row.value ?? row.count,
              details: row.details,
              statusDescription: row.statusDescription
            }))}
          />
        )
      }}
      readOnly={readOnly}
    >
      <MuiStack direction="column" spacing={2}>
        {showRemoteUpdate && remoteUpdate ? (
          <div ref={remoteUpdateAlertRef}>
            <MuiAlert
              action={
                <MuiStack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  flexWrap="wrap"
                >
                  {onKeepLocalChanges ? (
                    <MuiButton
                      onClick={onKeepLocalChanges}
                      variant={"contained"}
                    >
                      保留本地修改
                    </MuiButton>
                  ) : null}
                  {onDiscardLocalChanges ? (
                    <DiscardLocalChangesButton
                      revision={remoteUpdate.revision}
                      onConfirm={onDiscardLocalChanges}
                    />
                  ) : null}
                </MuiStack>
              }
              severity={"error"}
            >
              <MuiAlertTitle>{"版本冲突"}</MuiAlertTitle>
              {
                <MuiStack direction="column" spacing={0.5}>
                  <span>
                    {`词条已在别处保存为第 ${remoteUpdate.revision} 版；${
                      dirtyStepLabel
                        ? `你在「${dirtyStepLabel}」的修改`
                        : "你的修改"
                    }尚未保存，本地输入仍已保留。`}
                  </span>
                  <span>
                    保留本地修改后可继续编辑并保存；放弃本地修改则改用最新内容。做出选择前不会保存。
                  </span>
                </MuiStack>
              }
            </MuiAlert>
          </div>
        ) : null}

        {!readOnly &&
        !showRemoteUpdate &&
        (dirtySteps.forms || dirtySteps.meanings) ? (
          <MuiAlert severity={"warning"}>
            <MuiAlertTitle>{"有未保存的草稿"}</MuiAlertTitle>
            {`切换步骤不会丢失当前输入；请先保存${dirtyStepLabel}草稿，再检查或发布。`}
          </MuiAlert>
        ) : null}

        {/* 挂起的新版本已经给出保留/放弃的选择，同一冲突的 409 提示不再并列显示。 */}
        {problem &&
          !(showRemoteUpdate && problem.kind === "revision_conflict") && (
            <MuiAlert
              action={
                problem.kind === "revision_conflict" &&
                conflict &&
                onRefreshConflict ? (
                  <MuiStack
                    direction="row"
                    spacing={1}
                    useFlexGap
                    flexWrap="wrap"
                  >
                    <MuiButton
                      loading={refreshingConflict}
                      onClick={onRefreshConflict}
                    >
                      刷新并比较
                    </MuiButton>
                    {conflict.serverWord && onDiscardLocalChanges ? (
                      <DiscardLocalChangesButton
                        revision={conflict.serverWord.revision}
                        onConfirm={onDiscardLocalChanges}
                      />
                    ) : null}
                  </MuiStack>
                ) : operationValidationIssues[0] && onIssueNavigate ? (
                  <MuiButton
                    onClick={() =>
                      onIssueNavigate(operationValidationIssues[0]!)
                    }
                  >
                    去处理首项
                  </MuiButton>
                ) : problem.retryable && onRetry ? (
                  <MuiButton loading={retrying} onClick={onRetry}>
                    重试
                  </MuiButton>
                ) : undefined
              }
              severity={problem.kind === "validation" ? "warning" : "error"}
            >
              <MuiAlertTitle>{problemTitle(problem)}</MuiAlertTitle>
              {conflict ? (
                <MuiStack direction="column" spacing={0.5}>
                  <span>
                    <strong>
                      {conflict.step === "forms"
                        ? "词形与发音冲突"
                        : "词义与例句冲突"}
                    </strong>
                    ：本地输入仍已保留。
                  </span>
                  {conflict.serverWord && <span>已获取服务端最新内容。</span>}
                </MuiStack>
              ) : inboundReferenceProblem ? (
                <MuiStack direction="column" spacing={0.5}>
                  <span>
                    请刷新页面后重试；若仍无法完成，请检查关联内容，调整内容或解除关联后再试。
                  </span>
                  <V3ReferenceList
                    emptyText="暂时无法查看具体关联，请刷新页面后重试。"
                    references={inboundReferenceProblem.references}
                  />
                </MuiStack>
              ) : operationValidationIssues.length > 0 ? (
                <MuiStack direction="column" spacing={0.5}>
                  {v3IssueMessages(operationValidationIssues).map((message) => (
                    <span key={message}>{message}</span>
                  ))}
                </MuiStack>
              ) : undefined}
            </MuiAlert>
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
      </MuiStack>
    </WordCreationLayout>
  );
}

export function V3WordCreationLayout(props: Props) {
  return <V3WordCreationLayoutContent key={props.word.id} {...props} />;
}
