import { Alert, Button, Card, Flex, Steps, Tag, Typography } from "antd";
import type {
  AdminWordV3,
  DraftMeaningsStepContentWritableV3,
  V3DraftValidationIssue,
  WordCreationStep
} from "@tsz/types";
import type { ReactNode } from "react";
import type { V3Problem } from "./problem";
import type { V3ReadinessSummary } from "./readiness";
import { wordStatusLabel } from "./presentation";
import "./v3-layout.css";

const STEP_ORDER: WordCreationStep[] = [
  "basics",
  "forms",
  "meanings",
  "preview"
];

const STEP_TITLE: Record<WordCreationStep, string> = {
  basics: "基础信息",
  forms: "词形与发音",
  meanings: "释义与例句",
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
  activeStep: WordCreationStep;
  readOnly?: boolean;
  dirtySteps?: Readonly<{ forms: boolean; meanings: boolean }>;
  readiness: V3ReadinessSummary;
  issues: readonly V3DraftValidationIssue[];
  problem?: V3Problem;
  conflict?: V3ConflictComparison;
  retrying?: boolean;
  refreshingConflict?: boolean;
  onStepChange: (step: WordCreationStep) => void;
  onIssueNavigate: (issue: V3DraftValidationIssue) => void;
  onRetry?: () => void;
  onRefreshConflict?: () => void;
  children: ReactNode;
}

function problemTitle(problem: V3Problem) {
  switch (problem.kind) {
    case "revision_conflict":
      return "版本冲突";
    case "entry_archived":
      return "词条已归档";
    case "validation":
      return "仍有内容需要完成";
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

export function V3WordCreationLayout({
  word,
  activeStep,
  readOnly = false,
  dirtySteps = { forms: false, meanings: false },
  readiness,
  issues,
  problem,
  conflict,
  retrying,
  refreshingConflict,
  onStepChange,
  onIssueNavigate,
  onRetry,
  onRefreshConflict,
  children
}: Props) {
  const completed = new Set(word.completed_steps);
  const displayedIssues = issues.filter(
    (issue, index) =>
      issues.findIndex(
        (candidate) =>
          candidate.step === issue.step &&
          candidate.node_id === issue.node_id &&
          candidate.field === issue.field &&
          candidate.code === issue.code
      ) === index
  );
  return (
    <div className="v3-word-creation">
      <header className="v3-word-creation__header">
        <div>
          <Typography.Title level={3}>
            {word.presentation.label}
          </Typography.Title>
          <Typography.Text type="secondary">
            {word.has_unpublished_changes
              ? "包含尚未发布的修改"
              : "当前内容已保存"}
          </Typography.Text>
        </div>
        <Tag color={word.status === "draft" ? "processing" : "default"}>
          {wordStatusLabel(word.status)}
        </Tag>
      </header>

      <div className="v3-word-creation__shell">
        <aside className="v3-word-creation__sidebar" aria-label="创编进度">
          <Card size="small" title="创编进度">
            <Steps
              current={STEP_ORDER.indexOf(activeStep)}
              direction="vertical"
              responsive={false}
              size="small"
              items={STEP_ORDER.map((step) => ({
                title: STEP_TITLE[step],
                description:
                  step === "forms" && dirtySteps.forms
                    ? "未保存"
                    : step === "meanings" && dirtySteps.meanings
                      ? "未保存"
                      : completed.has(step as "basics" | "forms" | "meanings")
                        ? "已完成"
                        : undefined,
                disabled: readOnly,
                status:
                  step === activeStep
                    ? "process"
                    : completed.has(step as "basics" | "forms" | "meanings")
                      ? "finish"
                      : "wait"
              }))}
              onChange={
                readOnly
                  ? undefined
                  : (index) => onStepChange(STEP_ORDER[index]!)
              }
            />
            <Typography.Text type="secondary">
              {readiness.issue_count > 0
                ? `还有 ${readiness.issue_count} 项待完成`
                : "当前没有待处理问题"}
            </Typography.Text>
          </Card>
        </aside>

        <section className="v3-word-creation__main">
          {!readOnly && (dirtySteps.forms || dirtySteps.meanings) ? (
            <Alert
              showIcon
              type="warning"
              title="有未保存的草稿"
              description={`切换步骤不会丢失当前输入；请先保存${[
                dirtySteps.forms ? "词形与发音" : undefined,
                dirtySteps.meanings ? "释义与例句" : undefined
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
                          : "释义与例句冲突"}
                      </strong>
                      ：本地输入仍已保留。
                    </span>
                    {conflict.serverWord && <span>已获取服务端最新内容。</span>}
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
                ) : problem.retryable && onRetry ? (
                  <Button loading={retrying} onClick={onRetry}>
                    重试
                  </Button>
                ) : undefined
              }
            />
          )}

          {readiness.issue_count > 0 && (
            <section className="v3-word-creation__issues" aria-label="待完成项">
              <Typography.Text strong>
                待完成 {readiness.issue_count} 项
              </Typography.Text>
              <Flex vertical gap={6}>
                {displayedIssues.map((issue) => (
                  <Button
                    type="text"
                    className="v3-word-creation__issue"
                    key={`${issue.step}:${issue.node_id}:${issue.field}:${issue.code}`}
                    onClick={() => onIssueNavigate(issue)}
                  >
                    {issue.message}
                  </Button>
                ))}
              </Flex>
            </section>
          )}

          <main className="v3-word-creation__content">{children}</main>
        </section>
      </div>
    </div>
  );
}
