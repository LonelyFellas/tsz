import { Alert, Button, Flex } from "antd";
import type {
  AdminWordV3,
  PartOfSpeechCatalogItem,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  V3DraftValidationIssue,
  WordCreationStep
} from "@tsz/types";
import type { ReactNode } from "react";
import { WordCreationLayout } from "../word-creation/WordCreationLayout";
import { V3ProductProgressList } from "./components/V3ProductProgressList";
import type { V3IssueNavigationTarget } from "./issueNavigation";
import type { V3Problem } from "./problem";
import { buildV3ProductProgress } from "./readiness";
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
  partOfSpeechCatalog?: readonly PartOfSpeechCatalogItem[];
  activeStep: WordCreationStep;
  reachableSteps?: ReadonlySet<WordCreationStep>;
  readOnly?: boolean;
  dirtySteps?: Readonly<{ forms: boolean; meanings: boolean }>;
  draftForms?: DraftFormsStepContentV3;
  draftMeanings?: DraftMeaningsStepContentWritableV3;
  issues: readonly V3DraftValidationIssue[];
  problem?: V3Problem;
  conflict?: V3ConflictComparison;
  retrying?: boolean;
  refreshingConflict?: boolean;
  onStepChange: (step: WordCreationStep) => void;
  onProgressNavigate?: (target: V3IssueNavigationTarget) => void;
  onIssueNavigate?: (issue: V3DraftValidationIssue) => void;
  onRetry?: () => void;
  onRefreshConflict?: () => void;
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

export function V3WordCreationLayout({
  word,
  partOfSpeechCatalog,
  activeStep,
  reachableSteps,
  readOnly = false,
  dirtySteps = { forms: false, meanings: false },
  draftForms,
  draftMeanings,
  issues,
  problem,
  conflict,
  retrying,
  refreshingConflict,
  onStepChange,
  onProgressNavigate,
  onIssueNavigate,
  onRetry,
  onRefreshConflict,
  children
}: Props) {
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
    meanings: draftMeanings ?? word.meanings,
    issues
  });
  const currentProgressKey = progressRows.find(
    (row) => row.target.step === activeStep && !row.completed
  )?.key;
  const operationValidationIssues =
    problem?.kind === "validation" &&
    problem.operation !== "validate" &&
    problem.operation !== "publish"
      ? problem.issues
      : [];
  return (
    <WordCreationLayout
      currentStep={activeStep}
      reachableSteps={reachableSteps}
      entryKind={word.kind}
      onStepChange={readOnly ? undefined : onStepChange}
      presentation={{
        wordExists: true,
        breadcrumbTitle: `${visibleLabel} · ${STEP_TITLE[activeStep]}`,
        completedSteps: word.completed_steps,
        showEntrySummary: false,
        progress: (
          <V3ProductProgressList
            currentKey={currentProgressKey}
            disabled={readOnly}
            onSelect={(key) => {
              const row = progressRows.find((item) => item.key === key);
              if (!row) return;
              if (onProgressNavigate) onProgressNavigate(row.target);
              else onStepChange(row.target.step);
            }}
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
      <Flex vertical gap="middle">
        {!readOnly && (dirtySteps.forms || dirtySteps.meanings) ? (
          <Alert
            showIcon
            type="warning"
            title="有未保存的草稿"
            description={`切换步骤不会丢失当前输入；请先保存${[
              dirtySteps.forms ? "词形与发音" : undefined,
              dirtySteps.meanings ? "词义与例句" : undefined
            ]
              .filter(Boolean)
              .join("、")}草稿，再检查或发布。`}
          />
        ) : null}

        {problem && (
          <Alert
            showIcon
            type={problem.kind === "validation" ? "warning" : "error"}
            title={problemTitle(problem)}
            description={
              conflict ? (
                <Flex vertical gap={4}>
                  <span>
                    <strong>
                      {conflict.step === "forms"
                        ? "词形与发音冲突"
                        : "词义与例句冲突"}
                    </strong>
                    ：本地输入仍已保留。
                  </span>
                  {conflict.serverWord && <span>已获取服务端最新内容。</span>}
                </Flex>
              ) : operationValidationIssues.length > 0 ? (
                <Flex vertical gap={4}>
                  {v3IssueMessages(operationValidationIssues).map((message) => (
                    <span key={message}>{message}</span>
                  ))}
                </Flex>
              ) : undefined
            }
            action={
              problem.kind === "revision_conflict" &&
              conflict &&
              onRefreshConflict ? (
                <Button
                  loading={refreshingConflict}
                  onClick={onRefreshConflict}
                >
                  刷新并比较
                </Button>
              ) : operationValidationIssues[0] && onIssueNavigate ? (
                <Button
                  onClick={() => onIssueNavigate(operationValidationIssues[0]!)}
                >
                  去处理首项
                </Button>
              ) : problem.retryable && onRetry ? (
                <Button loading={retrying} onClick={onRetry}>
                  重试
                </Button>
              ) : undefined
            }
          />
        )}

        {children}
      </Flex>
    </WordCreationLayout>
  );
}
