import type {
  AdminWordV3,
  DraftValidationResponseV3,
  FormsImpactResponseV3,
  SurfaceMatchEnabledTerminalPageV3,
  SurfaceMatchPageAny,
  SurfaceMatchPageV3,
  V3DraftValidationIssue
} from "@tsz/types";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  List,
  Space,
  Tag,
  Typography
} from "antd";
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
import { createV3SaveFlow, type V3SaveFlow } from "./saveFlow";

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
    return "V3 发布服务暂不可用，请稍后重试。";
  }
  if (problem.kind === "validation") return "发布校验未通过。";
  return "发布失败，请按稳定错误码处理后重试。";
}

function bridgeLabel(word: AdminWordV3): string | undefined {
  const bridge = word.compatibility?.legacy_headwords;
  if (!bridge) return undefined;
  return bridge.mode === "unified"
    ? bridge.common
    : `UK ${bridge.uk} / US ${bridge.us}`;
}

function publicationBlockCode(word: AdminWordV3): string | undefined {
  if (word.status === "archived") return "entry_archived";
  const capability = word.capabilities.publication;
  if (capability.mode === "shadow_only") return capability.blocked_code;
  if (capability.mode === "migration_canary" && !capability.whitelisted) {
    return capability.blocked_code ?? "migration_canary_not_whitelisted";
  }
  return undefined;
}

function V3WordPreview({ word }: { word: AdminWordV3 }) {
  const bridge = bridgeLabel(word);
  return (
    <>
      <Card title={word.presentation.label}>
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="展示策略">
            {word.presentation.strategy_version}
          </Descriptions.Item>
          {bridge ? (
            <Descriptions.Item label="兼容桥（只读）">
              {bridge}
            </Descriptions.Item>
          ) : null}
        </Descriptions>
      </Card>
      {word.forms.pos.map((pos) => (
        <Card key={pos.pos_id} size="small" title={pos.pos}>
          <Space orientation="vertical" size="small" style={{ width: "100%" }}>
            <Typography.Text strong>变化组与成员顺序</Typography.Text>
            {pos.form_groups.length > 0 ? (
              <List
                size="small"
                dataSource={pos.form_groups}
                renderItem={(group, groupIndex) => (
                  <List.Item
                    key={group.id}
                    data-testid={`preview-group-${group.id}`}
                  >
                    <Space orientation="vertical" size={2}>
                      <Space wrap size={4}>
                        <Tag>变化组 {groupIndex + 1}</Tag>
                        <Typography.Text type="secondary">
                          {group.is_regular ? "规则组" : "非规则组"}
                        </Typography.Text>
                      </Space>
                      <Space wrap size={4}>
                        {group.members.map((member, memberIndex) => {
                          const form = pos.forms.find(
                            (candidate) => candidate.id === member.form_id
                          );
                          const variant =
                            form?.regional_variants.mode === "common"
                              ? form.regional_variants.common
                              : form?.regional_variants.uk;
                          return (
                            <Tag
                              key={member.id}
                              data-testid={`preview-membership-${member.id}`}
                            >
                              {memberIndex + 1}. {form?.form_type ?? "未知词形"}
                              {variant ? ` · ${variant.spelling}` : ""}
                            </Tag>
                          );
                        })}
                      </Space>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Typography.Text type="secondary">暂无变化组</Typography.Text>
            )}
            <Typography.Text strong>具体词形与发音</Typography.Text>
            <List
              size="small"
              dataSource={pos.forms}
              renderItem={(form) => {
                const variants =
                  form.regional_variants.mode === "common"
                    ? [form.regional_variants.common]
                    : [form.regional_variants.uk, form.regional_variants.us];
                return (
                  <List.Item
                    key={form.id}
                    data-testid={`preview-form-${form.id}`}
                  >
                    <Space orientation="vertical" size={4}>
                      <Tag>{form.form_type}</Tag>
                      {variants.map((variant) => (
                        <Space key={variant.id} orientation="vertical" size={2}>
                          <Space size={4}>
                            <Tag>{variant.dialect}</Tag>
                            <Typography.Text strong>
                              {variant.spelling}
                            </Typography.Text>
                          </Space>
                          {variant.pronunciations.length > 0 ? (
                            variant.pronunciations.map((pronunciation) => (
                              <Typography.Text
                                key={pronunciation.id}
                                type="secondary"
                                data-testid={`preview-pronunciation-${pronunciation.id}`}
                              >
                                {pronunciation.style ?? "未选择风格"} ·{" "}
                                {pronunciation.dict_phonetic} ·{" "}
                                {pronunciation.actual_pron}
                              </Typography.Text>
                            ))
                          ) : (
                            <Typography.Text type="secondary">
                              暂无发音
                            </Typography.Text>
                          )}
                        </Space>
                      ))}
                    </Space>
                  </List.Item>
                );
              }}
            />
          </Space>
        </Card>
      ))}
    </>
  );
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
        <List
          size="small"
          dataSource={impact.affected}
          renderItem={(item) => (
            <List.Item
              key={`${item.node_type}:${item.node_id}`}
              data-testid={`impact-item-${item.node_type}-${item.node_id}`}
            >
              <Space wrap size={4}>
                <Tag>{item.node_type}</Tag>
                <Typography.Text code>{item.node_id}</Typography.Text>
                <Typography.Text>{item.reason}</Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      ) : null}
    </Space>
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
  const blockedCode = publicationBlockCode(word);
  const requiresImpactConfirmation = Boolean(
    controller.impact && (controller.impact.requires_confirmation || impactPage)
  );
  const readyToPublish = Boolean(
    !blockedCode &&
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
      <V3WordPreview word={word} />
      {blockedCode ? (
        <Alert
          showIcon
          type="warning"
          title="当前 V3 词条不可发布"
          description={<Typography.Text code>{blockedCode}</Typography.Text>}
        />
      ) : (
        <Card size="small" title="V3 发布检查">
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
              <Alert
                showIcon
                type="error"
                title="发布校验未通过"
                description={controller.issues
                  .map((issue) => `${issue.code} · ${issue.message}`)
                  .join("；")}
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
                发布 V3 词条
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
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
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
  const blockedCode = publicationBlockCode(currentWord);
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
        setValidationIssues(
          validation.value.issues.map(
            (issue) => `${issue.code} · ${issue.message}`
          )
        );
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
      <V3WordPreview word={currentWord} />
      {blockedCode ? (
        <Alert
          showIcon
          type="warning"
          title="当前 V3 词条不可发布"
          description={<Typography.Text code>{blockedCode}</Typography.Text>}
        />
      ) : (
        <Card size="small" title="V3 发布检查">
          <Space orientation="vertical" style={{ width: "100%" }}>
            <Button
              disabled={reconciliationRequired}
              loading={preparing || refreshingCanonical}
              onClick={() => void handlePrepare()}
            >
              检查发布条件
            </Button>
            {validationIssues.length > 0 ? (
              <Alert
                showIcon
                type="error"
                title="发布校验未通过"
                description={validationIssues.join("；")}
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
                发布 V3 词条
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
