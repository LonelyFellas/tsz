import type {
  AdminWordV3,
  DraftValidationResponseV3,
  FormsImpactResponseV3,
  SurfaceMatchEnabledTerminalPageV3,
  SurfaceMatchPageAny,
  SurfaceMatchPageV3,
  V3DraftValidationIssue
} from "@tsz/types";
import { Alert, Button, Card, Space, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  canAcknowledgeSurfaceSnapshot,
  type SurfaceSnapshotState
} from "../surfaceSnapshot";
import { useSurfaceSnapshotAny } from "../useSurfaceSnapshot";
import { newWordNodeId } from "../word-model/primitives";
import { createV3WordRequests, type V3WordRequests } from "./api";
import { classifyV3Problem } from "./problem";
import type { V3Problem } from "./problem";
import {
  impactReasonLabel,
  impactTypeLabel,
  formTypeLabel,
  partOfSpeechLabel,
  publicationBlockMessage
} from "./presentation";
import { createV3SaveFlow, type V3SaveFlow } from "./saveFlow";
import { v3IssueMessage } from "./presentationErrors";
import { V3ReviewContent } from "./V3ReviewContent";

type PublishRequests = Pick<
  V3WordRequests,
  "get" | "validate" | "impact" | "surfacePage" | "publish"
>;

interface StandaloneProps {
  word: AdminWordV3;
  requests?: PublishRequests;
  flow?: V3SaveFlow;
  createFlow?: (word: AdminWordV3) => V3SaveFlow;
  onPublished: (word: AdminWordV3) => void;
}

export interface V3PreviewPublishController {
  validation?: DraftValidationResponseV3;
  impact?: FormsImpactResponseV3;
  impactConfirmed?: boolean;
  issues: readonly V3DraftValidationIssue[];
  problem?: V3Problem;
  isPending: (command: "validate" | "impact" | "publish") => boolean;
  actions: {
    validate: () => Promise<DraftValidationResponseV3 | undefined>;
    previewFormsImpact: () => Promise<FormsImpactResponseV3 | undefined>;
    publish: (confirmedSurfaceToken?: string) => Promise<void>;
    navigateIssue?: (issue: V3DraftValidationIssue) => Promise<void>;
    confirmImpact?: () => boolean;
    confirmImpactSurface?: (page: SurfaceMatchPageV3) => boolean;
    fetchSurfacePage?: (
      snapshotId: string,
      cursor: string,
      signal: AbortSignal
    ) => Promise<SurfaceMatchPageV3>;
  };
}

type Props =
  | {
      word: AdminWordV3;
      controller: V3PreviewPublishController;
      onPublished?: never;
      requests?: PublishRequests;
      flow?: V3SaveFlow;
      createFlow?: (word: AdminWordV3) => V3SaveFlow;
    }
  | (StandaloneProps & { controller?: never });

function terminalPage(
  state: SurfaceSnapshotState<SurfaceMatchPageAny>
): SurfaceMatchEnabledTerminalPageV3 | undefined {
  if (
    state.schema_version !== 3 ||
    !canAcknowledgeSurfaceSnapshot(state) ||
    !state.snapshot_id ||
    !state.policy_name ||
    state.policy_epoch === undefined
  ) {
    return undefined;
  }
  return {
    schema_version: 3,
    snapshot_id: state.snapshot_id,
    items: state.items as SurfaceMatchPageV3["items"],
    total: state.total,
    matched_entry_contexts:
      state.matched_entry_contexts as SurfaceMatchPageV3["matched_entry_contexts"],
    confirmation_reasons: state.confirmation_reasons,
    policy_name: state.policy_name,
    policy_epoch: state.policy_epoch,
    continuation_policy: "enabled",
    next_cursor: null,
    surface_confirmation_token: state.surface_confirmation_token,
    ...(state.impact_confirmation_token
      ? { impact_confirmation_token: state.impact_confirmation_token }
      : {})
  };
}

function requestErrorMessage(error: unknown): string {
  const problem = classifyV3Problem(error, "publish");
  if (problem.kind === "network") {
    return "网络异常，发布失败，可原样重试。";
  }
  if (problem.kind === "authentication") return "登录已失效，请重新登录。";
  if (problem.kind === "authorization") return "当前账号没有发布权限。";
  if (problem.kind === "service_unavailable") {
    return "发布服务暂不可用，请稍后重试。";
  }
  if (problem.kind === "validation") return "发布校验未通过。";
  return "发布失败，请检查当前内容后重试。";
}

function publicationUnavailableMessage(word: AdminWordV3): string | undefined {
  if (word.status === "archived") return "垃圾桶中的词条不能发布。";
  const capability = word.capabilities.publication;
  if (capability.mode === "shadow_only") {
    return publicationBlockMessage(capability.blocked_code);
  }
  if (capability.mode === "migration_canary" && !capability.whitelisted) {
    return publicationBlockMessage(
      capability.blocked_code ?? "migration_canary_not_whitelisted"
    );
  }
  return undefined;
}

function V3WordPreview({
  word,
  readiness
}: {
  word: AdminWordV3;
  readiness?: ReactNode;
}) {
  return <V3ReviewContent readiness={readiness} word={word} />;
}

function ImpactDescription({
  impact,
  summary
}: {
  impact: FormsImpactResponseV3;
  summary: string;
}) {
  return (
    <Space orientation="vertical" size={4} style={{ width: "100%" }}>
      <Typography.Text>{summary}</Typography.Text>
      {impact.affected.length > 0 ? (
        <ul className="v3-review-list">
          {impact.affected.map((item) => (
            <li
              className="v3-review-impact-item"
              key={`${item.node_type}:${item.node_id}`}
              data-testid={`impact-item-${item.node_type}-${item.node_id}`}
            >
              <Space wrap size={4}>
                <Tag>{impactTypeLabel(item.node_type)}</Tag>
                <Typography.Text>
                  {impactReasonLabel(item.reason)}
                </Typography.Text>
              </Space>
            </li>
          ))}
        </ul>
      ) : null}
    </Space>
  );
}

interface IssuePositionGroup {
  key: string;
  testId: string;
  label: string;
  issues: V3DraftValidationIssue[];
}

interface IssueTypeGroup {
  key: string;
  label: string;
  issues: V3DraftValidationIssue[];
}

function meaningPosOwnsIssue(
  word: AdminWordV3,
  posId: string,
  issueNodeIds: ReadonlySet<string>
) {
  const pos = word.meanings.pos.find((candidate) => candidate.pos_id === posId);
  if (!pos) return false;
  if (issueNodeIds.has(pos.pos_id)) return true;
  if (
    pos.grammar_structures.some(
      (grammar) =>
        issueNodeIds.has(grammar.id) ||
        grammar.variants.some((variant) => issueNodeIds.has(variant.id))
    )
  ) {
    return true;
  }
  return pos.senses.some((sense) => {
    if (issueNodeIds.has(sense.id)) return true;
    if (sense.sense_group_id && issueNodeIds.has(sense.sense_group_id)) {
      return true;
    }
    if (
      sense.definitions.some((definition) => {
        if (issueNodeIds.has(definition.id)) return true;
        if (
          "content_id" in definition &&
          issueNodeIds.has(definition.content_id)
        ) {
          return true;
        }
        if (
          "mode" in definition.content &&
          definition.content.mode === "unified"
        ) {
          return issueNodeIds.has(definition.content.common.id);
        }
        if ("mode" in definition.content) {
          return [definition.content.uk, definition.content.us].some(
            (side) =>
              side.state === "ready" && issueNodeIds.has(side.variant.id)
          );
        }
        return false;
      })
    ) {
      return true;
    }
    if (
      sense.sentences.some((sentence) => {
        if (
          issueNodeIds.has(sentence.id) ||
          issueNodeIds.has(sentence.zh_text_id) ||
          sentence.zh_translations?.some((translation) =>
            issueNodeIds.has(translation.id)
          )
        ) {
          return true;
        }
        if (sentence.en_text.mode === "unified") {
          return issueNodeIds.has(sentence.en_text.common.id);
        }
        return [sentence.en_text.uk, sentence.en_text.us].some(
          (side) => side.state === "ready" && issueNodeIds.has(side.variant.id)
        );
      })
    ) {
      return true;
    }
    return sense.relations.some((relation) => issueNodeIds.has(relation.id));
  });
}

function issuePosition(
  word: AdminWordV3,
  issue: V3DraftValidationIssue
): Omit<IssuePositionGroup, "issues"> {
  const issueNodeIds = new Set([
    issue.node_id,
    ...issue.node_location.ancestor_node_ids
  ]);
  const pos = word.forms.pos.find(
    (candidate) =>
      candidate.pos_id === issue.node_location.pos_id ||
      issueNodeIds.has(candidate.pos_id) ||
      meaningPosOwnsIssue(word, candidate.pos_id, issueNodeIds)
  );
  if (pos) {
    return {
      key: pos.pos_id,
      testId: `issue-pos-${pos.pos}`,
      label: partOfSpeechLabel(pos.pos)
    };
  }
  return issue.step === "forms"
    ? {
        key: "forms-general",
        testId: "issue-pos-forms-general",
        label: "词形与发音"
      }
    : {
        key: "meanings-general",
        testId: "issue-pos-meanings-general",
        label: "词义与例句"
      };
}

function groupIssuesByPosition(
  word: AdminWordV3,
  issues: readonly V3DraftValidationIssue[]
): IssuePositionGroup[] {
  const groups = new Map<string, IssuePositionGroup>();
  for (const issue of issues) {
    const position = issuePosition(word, issue);
    const current = groups.get(position.key);
    if (current) current.issues.push(issue);
    else groups.set(position.key, { ...position, issues: [issue] });
  }
  return [...groups.values()];
}

function groupIssuesByType(
  issues: readonly V3DraftValidationIssue[]
): IssueTypeGroup[] {
  const groups = new Map<string, IssueTypeGroup>();
  for (const issue of issues) {
    const current = groups.get(issue.code);
    if (current) current.issues.push(issue);
    else {
      groups.set(issue.code, {
        key: issue.code,
        label: v3IssueMessage(issue),
        issues: [issue]
      });
    }
  }
  return [...groups.values()];
}

function issueScopeLabels(
  word: AdminWordV3,
  issues: readonly V3DraftValidationIssue[]
): string[] {
  return groupIssuesByPosition(word, issues).map((position) => {
    const formTypes = new Map<string, number>();
    for (const issue of position.issues) {
      const formType = issue.node_location.form_type;
      if (!formType) continue;
      const label = formTypeLabel(formType);
      formTypes.set(label, (formTypes.get(label) ?? 0) + 1);
    }
    if (formTypes.size === 0) {
      return `${position.label} ${position.issues.length} 项`;
    }
    return `${position.label}：${[...formTypes]
      .map(([label, count]) => `${label} ${count} 项`)
      .join("、")}`;
  });
}

function ValidationIssueSummary({
  word,
  issues,
  onNavigate
}: {
  word: AdminWordV3;
  issues: readonly V3DraftValidationIssue[];
  onNavigate?: (issue: V3DraftValidationIssue) => Promise<void>;
}) {
  const positions = groupIssuesByPosition(word, issues);
  const types = groupIssuesByType(issues);
  return (
    <section aria-label="发布待完成摘要" className="v3-validation-summary">
      <div className="v3-validation-summary__overview">
        <Typography.Text type="danger" strong>
          发布校验未通过
        </Typography.Text>
        <Typography.Title level={3}>
          还有 {issues.length} 项待完成
        </Typography.Title>
        <Typography.Text type="secondary">
          发布条件保持不变。请先处理下列内容，再重新检查。
        </Typography.Text>
      </div>

      <div className="v3-validation-summary__positions">
        {positions.map((position) => (
          <div
            className="v3-validation-summary__position"
            data-testid={position.testId}
            key={position.key}
          >
            <div>
              <Typography.Text strong>{position.label}</Typography.Text>
              <Typography.Text type="secondary">
                {position.issues.length} 项待完成
              </Typography.Text>
            </div>
            {onNavigate ? (
              <Button
                aria-label={`填写${position.label}未完成项`}
                size="small"
                type="link"
                onClick={() => void onNavigate(position.issues[0]!)}
              >
                去填写
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="v3-validation-summary__types">
        <Typography.Text strong>问题分布</Typography.Text>
        {types.map((type) => (
          <div className="v3-validation-summary__type" key={type.key}>
            <div className="v3-validation-summary__type-copy">
              <Space size={6} wrap>
                <Tag color="error">{type.issues.length} 项</Tag>
                <Typography.Text>{type.label}</Typography.Text>
              </Space>
              <Typography.Text type="secondary">
                {issueScopeLabels(word, type.issues).join(" · ")}
              </Typography.Text>
            </div>
            {onNavigate ? (
              <Button
                aria-label={`填写${type.label}问题`}
                size="small"
                type="link"
                onClick={() => void onNavigate(type.issues[0]!)}
              >
                去填写
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function ControlledV3PreviewAndPublishStep({
  word,
  controller
}: {
  word: AdminWordV3;
  controller: V3PreviewPublishController;
}) {
  const publishLock = useRef(false);
  const impactPage = controller.impact?.surface_match_page;
  const publishPage =
    controller.problem?.kind === "surface_confirmation" &&
    controller.problem.meta?.surface_match_page?.schema_version === 3
      ? controller.problem.meta.surface_match_page
      : undefined;
  const fetchPage = controller.actions.fetchSurfacePage;
  const unavailablePage = async () => {
    throw new Error("controlled surface page action is unavailable");
  };
  const impactState = useSurfaceSnapshotAny(
    impactPage,
    `${word.id}:${word.revision}:controlled-impact:${impactPage?.snapshot_id ?? "none"}`,
    fetchPage ?? unavailablePage
  );
  const publishState = useSurfaceSnapshotAny(
    publishPage,
    `${word.id}:${word.revision}:controlled-publish:${publishPage?.snapshot_id ?? "none"}`,
    fetchPage ?? unavailablePage
  );
  const unavailableMessage = publicationUnavailableMessage(word);
  const requiresImpactConfirmation = Boolean(
    controller.impact && (controller.impact.requires_confirmation || impactPage)
  );
  const readyToPublish = Boolean(
    !unavailableMessage &&
    controller.issues.length === 0 &&
    controller.validation?.valid &&
    controller.impact &&
    (!requiresImpactConfirmation || controller.impactConfirmed)
  );

  const prepare = async () => {
    const validation = await controller.actions.validate();
    if (validation?.valid) await controller.actions.previewFormsImpact();
  };
  const publish = async (token?: string) => {
    if (publishLock.current) return;
    publishLock.current = true;
    try {
      await controller.actions.publish(token);
    } finally {
      publishLock.current = false;
    }
  };
  const confirmImpact = () => {
    if (!impactPage) {
      controller.actions.confirmImpact?.();
      return;
    }
    const page = terminalPage(impactState);
    if (page) controller.actions.confirmImpactSurface?.(page);
  };
  const confirmPublishSurface = () => {
    const page = terminalPage(publishState);
    if (page) void publish(page.surface_confirmation_token);
  };

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      <V3WordPreview
        readiness={
          unavailableMessage ? (
            <Typography.Text type="secondary">当前词条不可发布</Typography.Text>
          ) : controller.issues.length > 0 ? (
            <Typography.Text type="danger">有待完成内容</Typography.Text>
          ) : controller.validation?.valid ? (
            <Typography.Text type="success">
              当前内容已通过发布检查
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary">尚未检查发布条件</Typography.Text>
          )
        }
        word={word}
      />
      {unavailableMessage ? (
        <Alert
          showIcon
          type="warning"
          title="当前词条不可发布"
          description={unavailableMessage}
        />
      ) : (
        <Card size="small" title="发布检查">
          <Space orientation="vertical" style={{ width: "100%" }}>
            <Button
              loading={
                controller.isPending("validate") ||
                controller.isPending("impact")
              }
              onClick={() => void prepare()}
            >
              检查发布条件
            </Button>
            {controller.issues.length > 0 ? (
              <ValidationIssueSummary
                word={word}
                issues={controller.issues}
                onNavigate={controller.actions.navigateIssue}
              />
            ) : null}
            {controller.impact ? (
              <Alert
                showIcon
                type={requiresImpactConfirmation ? "warning" : "success"}
                title={`影响预览：${controller.impact.affected.length} 项`}
                description={
                  <ImpactDescription
                    impact={controller.impact}
                    summary={
                      impactPage
                        ? `确认快照已加载 ${impactState.items.length}/${impactState.total}`
                        : controller.impact.requires_confirmation
                          ? "需要由向导确认当前影响。"
                          : "未发现需要确认的影响。"
                    }
                  />
                }
              />
            ) : null}
            {requiresImpactConfirmation && !controller.impactConfirmed ? (
              <Button
                disabled={
                  impactPage
                    ? !controller.actions.confirmImpactSurface ||
                      !canAcknowledgeSurfaceSnapshot(impactState)
                    : !controller.actions.confirmImpact
                }
                onClick={confirmImpact}
              >
                确认影响并允许发布
              </Button>
            ) : null}
            {readyToPublish ? (
              <Button
                type="primary"
                loading={controller.isPending("publish")}
                onClick={() => void publish()}
              >
                发布词条
              </Button>
            ) : null}
          </Space>
        </Card>
      )}
      {publishPage ? (
        <Card size="small" title="发布同形提示">
          <Button
            type="primary"
            loading={controller.isPending("publish")}
            disabled={!canAcknowledgeSurfaceSnapshot(publishState)}
            onClick={confirmPublishSurface}
          >
            确认同形提示并重试发布
          </Button>
        </Card>
      ) : null}
    </Space>
  );
}

function StandaloneV3PreviewAndPublishStep({
  word,
  requests: suppliedRequests,
  flow: suppliedFlow,
  createFlow = createV3SaveFlow,
  onPublished
}: StandaloneProps) {
  const requests = useMemo(
    () => suppliedRequests ?? createV3WordRequests(),
    [suppliedRequests]
  );
  const flowRef = useRef(suppliedFlow ?? createFlow(word));
  const ownsFlowRef = useRef(!suppliedFlow);
  const mountedRef = useRef(true);
  const propWordRef = useRef(word);
  const [currentWord, setCurrentWord] = useState(word);
  const [preparing, setPreparing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [refreshingCanonical, setRefreshingCanonical] = useState(false);
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const [reconciliationError, setReconciliationError] = useState(false);
  const [validationIssues, setValidationIssues] = useState<
    V3DraftValidationIssue[]
  >([]);
  const [impact, setImpact] = useState<FormsImpactResponseV3>();
  const [impactAccepted, setImpactAccepted] = useState(false);
  const [publishSurfacePage, setPublishSurfacePage] =
    useState<SurfaceMatchPageV3>();
  const [error, setError] = useState<string>();
  const prepareLock = useRef(false);
  const publishLock = useRef(false);
  const publishKey = useRef<string | undefined>(undefined);
  const reconciliationRequiredRef = useRef(false);
  const reconciliationLockRef = useRef(false);
  const reconciliationScopeRef = useRef(0);
  const impactState = useSurfaceSnapshotAny(
    impact?.surface_match_page,
    `${currentWord.id}:${currentWord.revision}:impact:${impact?.surface_match_page?.snapshot_id ?? "none"}`,
    requests.surfacePage
  );
  const publishSurfaceState = useSurfaceSnapshotAny(
    publishSurfacePage,
    `${currentWord.id}:${currentWord.revision}:publish:${publishSurfacePage?.snapshot_id ?? "none"}`,
    requests.surfacePage
  );
  const unavailableMessage = publicationUnavailableMessage(currentWord);
  const needsImpactAcknowledgement = Boolean(
    impact && (impact.requires_confirmation || impact.surface_match_page)
  );
  const readyToPublish = Boolean(
    impact &&
    validationIssues.length === 0 &&
    (!needsImpactAcknowledgement || impactAccepted)
  );

  useEffect(() => {
    mountedRef.current = true;
    if (ownsFlowRef.current) {
      flowRef.current.dispose();
      flowRef.current = createFlow(propWordRef.current);
    }
    return () => {
      mountedRef.current = false;
      if (ownsFlowRef.current) flowRef.current.dispose();
    };
  }, [createFlow]);

  useEffect(() => {
    setImpact(undefined);
    setImpactAccepted(false);
    setPublishSurfacePage(undefined);
    setValidationIssues([]);
    setError(undefined);
    publishKey.current = undefined;
  }, [word.id, word.revision]);

  const clearPreparedPublish = () => {
    setImpact(undefined);
    setImpactAccepted(false);
    setPublishSurfacePage(undefined);
    setValidationIssues([]);
  };

  const replaceFlow = useCallback(
    (latest: AdminWordV3) => {
      if (ownsFlowRef.current) flowRef.current.dispose();
      flowRef.current = createFlow(latest);
      ownsFlowRef.current = true;
    },
    [createFlow]
  );

  useEffect(() => {
    if (propWordRef.current === word) return;
    propWordRef.current = word;
    reconciliationScopeRef.current += 1;
    replaceFlow(word);
    setCurrentWord(word);
    reconciliationRequiredRef.current = false;
    reconciliationLockRef.current = false;
    setReconciliationRequired(false);
    setReconciliationError(false);
    setRefreshingCanonical(false);
    clearPreparedPublish();
    setError(undefined);
    publishKey.current = undefined;
  }, [replaceFlow, word]);

  const reconcilePublishConflict = async () => {
    if (!reconciliationRequiredRef.current || reconciliationLockRef.current) {
      return;
    }
    reconciliationLockRef.current = true;
    const scope = reconciliationScopeRef.current;
    setRefreshingCanonical(true);
    setReconciliationError(false);
    try {
      const latest = await requests.get(currentWord.id);
      if (!mountedRef.current || scope !== reconciliationScopeRef.current) {
        return;
      }
      replaceFlow(latest.word);
      setCurrentWord(latest.word);
      publishKey.current = undefined;
      reconciliationRequiredRef.current = false;
      setReconciliationRequired(false);
      setReconciliationError(false);
      setError(undefined);
      clearPreparedPublish();
    } catch {
      if (!mountedRef.current || scope !== reconciliationScopeRef.current) {
        return;
      }
      setReconciliationError(true);
      setError(undefined);
    } finally {
      if (scope === reconciliationScopeRef.current) {
        reconciliationLockRef.current = false;
        if (mountedRef.current) setRefreshingCanonical(false);
      }
    }
  };

  const requireCanonicalReconciliation = async () => {
    reconciliationRequiredRef.current = true;
    setReconciliationRequired(true);
    clearPreparedPublish();
    await reconcilePublishConflict();
  };

  const handlePrepare = async () => {
    if (
      prepareLock.current ||
      reconciliationRequiredRef.current ||
      reconciliationLockRef.current
    ) {
      return;
    }
    prepareLock.current = true;
    const scope = reconciliationScopeRef.current;
    setPreparing(true);
    setError(undefined);
    setValidationIssues([]);
    setImpact(undefined);
    setImpactAccepted(false);
    try {
      const validation = await flowRef.current.runRequest("validate", () =>
        requests.validate(currentWord.id, {
          schema_version: 3,
          base_revision: currentWord.revision
        })
      );
      if (!validation.accepted) return;
      if (!validation.value.valid) {
        setValidationIssues(validation.value.issues);
        return;
      }
      const preview = await flowRef.current.runRequest("impact", () =>
        requests.impact(currentWord.id, {
          schema_version: 3,
          base_revision: currentWord.revision,
          content: currentWord.forms
        })
      );
      if (!preview.accepted) return;
      setImpact(preview.value);
      flowRef.current.bindImpactConfirmation(preview.value, currentWord.forms);
      if (
        !preview.value.requires_confirmation &&
        !preview.value.surface_match_page
      ) {
        setImpactAccepted(true);
      }
    } catch (requestError) {
      if (!mountedRef.current || scope !== reconciliationScopeRef.current) {
        return;
      }
      if (
        classifyV3Problem(requestError, "validate").kind === "entry_archived"
      ) {
        await requireCanonicalReconciliation();
      } else {
        setError(requestErrorMessage(requestError));
      }
    } finally {
      prepareLock.current = false;
      setPreparing(false);
    }
  };

  const handleAcceptImpact = () => {
    if (!impact) return;
    if (impact.surface_match_page) {
      const terminal = terminalPage(impactState);
      if (
        !terminal ||
        !flowRef.current.bindImpactSurfaceConfirmation(terminal)
      ) {
        return;
      }
    }
    const tokens = flowRef.current.confirmations({
      base_revision: currentWord.revision,
      ...(impact.surface_match_page
        ? {
            snapshot_id: impact.surface_match_page.snapshot_id,
            policy_name: impact.surface_match_page.policy_name,
            policy_epoch: impact.surface_match_page.policy_epoch
          }
        : {}),
      impact_content: currentWord.forms
    });
    if (impact.requires_confirmation && !tokens.confirmed_impact_token) return;
    setImpactAccepted(true);
  };

  const runPublish = async (surfaceToken?: string) => {
    if (
      publishLock.current ||
      reconciliationRequiredRef.current ||
      reconciliationLockRef.current
    ) {
      return;
    }
    publishLock.current = true;
    const scope = reconciliationScopeRef.current;
    setPublishing(true);
    setError(undefined);
    const idempotencyKey = (publishKey.current ??= newWordNodeId());
    try {
      const result = await flowRef.current.runCanonical("publish", () =>
        requests.publish(currentWord.id, idempotencyKey, {
          schema_version: 3,
          base_revision: currentWord.revision,
          ...(surfaceToken
            ? { confirmed_surface_match_token: surfaceToken }
            : {})
        })
      );
      if (publishKey.current === idempotencyKey) {
        publishKey.current = undefined;
      }
      if (result.accepted) onPublished(result.value.word);
    } catch (requestError) {
      if (!mountedRef.current || scope !== reconciliationScopeRef.current) {
        return;
      }
      const problem = classifyV3Problem(requestError, "publish");
      const page =
        problem.kind === "surface_confirmation"
          ? problem.meta?.surface_match_page
          : undefined;
      if (
        problem.kind === "entry_archived" ||
        problem.kind === "idempotency_conflict" ||
        problem.kind === "revision_conflict"
      ) {
        await requireCanonicalReconciliation();
        return;
      }
      if (page?.schema_version === 3) setPublishSurfacePage(page);
      if (
        problem.kind === "surface_confirmation" &&
        problem.requires_new_idempotency_key
      ) {
        if (publishKey.current === idempotencyKey) {
          publishKey.current = undefined;
        }
      }
      setError(requestErrorMessage(requestError));
    } finally {
      publishLock.current = false;
      setPublishing(false);
    }
  };

  const handleConfirmPublishSurface = () => {
    const terminal = terminalPage(publishSurfaceState);
    if (
      !terminal ||
      !flowRef.current.bindSurfaceConfirmation(terminal, currentWord.forms)
    ) {
      return;
    }
    const token = flowRef.current.confirmations({
      base_revision: currentWord.revision,
      snapshot_id: terminal.snapshot_id,
      policy_name: terminal.policy_name,
      policy_epoch: terminal.policy_epoch,
      impact_content: currentWord.forms
    }).confirmed_surface_match_token;
    if (token) void runPublish(token);
  };

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      <V3WordPreview
        readiness={
          unavailableMessage ? (
            <Typography.Text type="secondary">当前词条不可发布</Typography.Text>
          ) : validationIssues.length > 0 ? (
            <Typography.Text type="danger">有待完成内容</Typography.Text>
          ) : impact ? (
            <Typography.Text type="success">
              当前内容已通过发布检查
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary">尚未检查发布条件</Typography.Text>
          )
        }
        word={currentWord}
      />
      {unavailableMessage ? (
        <Alert
          showIcon
          type="warning"
          title="当前词条不可发布"
          description={unavailableMessage}
        />
      ) : (
        <Card size="small" title="发布检查">
          <Space orientation="vertical" style={{ width: "100%" }}>
            <Button
              disabled={reconciliationRequired}
              loading={preparing || refreshingCanonical}
              onClick={() => void handlePrepare()}
            >
              检查发布条件
            </Button>
            {validationIssues.length > 0 ? (
              <ValidationIssueSummary
                word={currentWord}
                issues={validationIssues}
              />
            ) : null}
            {impact ? (
              <Alert
                showIcon
                type={needsImpactAcknowledgement ? "warning" : "success"}
                title={`影响预览：${impact.affected.length} 项`}
                description={
                  <ImpactDescription
                    impact={impact}
                    summary={
                      impact.surface_match_page
                        ? `确认快照已加载 ${impactState.items.length}/${impactState.total}`
                        : impact.requires_confirmation
                          ? "需要显式确认当前影响。"
                          : "未发现需要确认的影响。"
                    }
                  />
                }
              />
            ) : null}
            {needsImpactAcknowledgement && !impactAccepted ? (
              <Button
                disabled={
                  Boolean(impact?.surface_match_page) &&
                  !canAcknowledgeSurfaceSnapshot(impactState)
                }
                onClick={handleAcceptImpact}
              >
                确认影响并允许发布
              </Button>
            ) : null}
            {readyToPublish ? (
              <Button
                type="primary"
                loading={publishing}
                onClick={() => void runPublish()}
              >
                发布词条
              </Button>
            ) : null}
          </Space>
        </Card>
      )}
      {publishSurfacePage ? (
        <Card size="small" title="发布同形提示">
          <Space orientation="vertical">
            <Typography.Text>
              已加载 {publishSurfaceState.items.length}/
              {publishSurfaceState.total} 条匹配来源
            </Typography.Text>
            <Button
              type="primary"
              loading={publishing}
              disabled={!canAcknowledgeSurfaceSnapshot(publishSurfaceState)}
              onClick={handleConfirmPublishSurface}
            >
              确认同形提示并重试发布
            </Button>
          </Space>
        </Card>
      ) : null}
      {reconciliationError ? (
        <Alert
          showIcon
          type="error"
          title="刷新最新词条失败，请先重试对账。"
          action={
            <Button
              loading={refreshingCanonical}
              onClick={() => void reconcilePublishConflict()}
            >
              重新刷新最新词条
            </Button>
          }
        />
      ) : null}
      {error ? <Alert showIcon type="error" title={error} /> : null}
    </Space>
  );
}

export function V3PreviewAndPublishStep(props: Props) {
  if (props.controller) {
    return (
      <ControlledV3PreviewAndPublishStep
        word={props.word}
        controller={props.controller}
      />
    );
  }
  return (
    <StandaloneV3PreviewAndPublishStep
      key={`${props.word.id}:${props.word.revision}`}
      {...props}
    />
  );
}

export type { PublishRequests as V3PreviewPublishRequests };
