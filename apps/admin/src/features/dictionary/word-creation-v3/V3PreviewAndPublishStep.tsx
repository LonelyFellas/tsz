import {
  Card as MuiCard,
  CardHeader as MuiCardHeader,
  CardContent as MuiCardContent
} from "@mui/material";
import {
  Alert as MuiAlert,
  AlertTitle as MuiAlertTitle,
  Button as MuiButton,
  Chip as MuiChip,
  Stack as MuiStack,
  Typography as MuiTypography
} from "@mui/material";
import { useAuthStore } from "@/lib/auth";
import {
  canPublishEntry,
  canCheckEntry,
  ENTRY_PUBLISH_BLOCKED_HINT
} from "../entryWritePermission";
import { useFormTypeLabel } from "../part-of-speech/FormTypeLabels";
import { usePartOfSpeechLabel } from "../part-of-speech/PartOfSpeechLabels";
import type {
  AdminWordV3,
  DraftValidationResponseV3,
  FormsImpactResponseV3,
  SurfaceMatchEnabledTerminalPageV3,
  SurfaceMatchPageV3,
  V3DraftValidationIssue
} from "@tsz/types";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  canAcknowledgeSurfaceSnapshot,
  type SurfaceSnapshotState
} from "../surfaceSnapshot";
import { useSurfaceSnapshot } from "../useSurfaceSnapshot";
import { newWordNodeId } from "../word-model/primitives";
import { createV3WordRequests, type V3WordRequests } from "./api";
import { classifyV3Problem } from "./problem";
import type { V3Problem } from "./problem";
import { impactReasonLabel, impactTypeLabel } from "./presentation";
import { buildV3PublicationIssueSummary } from "./publicationIssueSummary";
import { createV3SaveFlow, type V3SaveFlow } from "./saveFlow";
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
  renderPreview?: (readiness: ReactNode) => ReactNode;
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
  | (StandaloneProps & {
      controller?: never;
    });
function terminalPage(
  state: SurfaceSnapshotState<SurfaceMatchPageV3>
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
    return "网络异常，发布结果尚未确认，可原样重试确认。";
  }
  if (problem.kind === "authentication") return "登录已失效，请重新登录。";
  if (problem.kind === "authorization") return "当前账号没有发布权限。";
  if (problem.kind === "service_unavailable") {
    return "发布结果尚未确认，请刷新查看结果或原样重试确认。";
  }
  if (problem.kind === "validation") return "发布校验未通过。";
  return "发布失败，请检查当前内容后重试。";
}
function publicationUnavailableMessage(word: AdminWordV3): string | undefined {
  return word.status === "archived" ? "垃圾桶中的词条不能发布。" : undefined;
}
function V3WordPreview({
  word,
  readiness,
  render
}: {
  word: AdminWordV3;
  readiness?: ReactNode;
  render?: (readiness: ReactNode) => ReactNode;
}) {
  return render ? (
    render(readiness)
  ) : (
    <V3ReviewContent readiness={readiness} word={word} />
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
    <MuiStack style={{ width: "100%" }} direction="column" spacing={0.5}>
      <MuiTypography component="span">{summary}</MuiTypography>
      {impact.affected.length > 0 ? (
        <ul className="v3-review-list">
          {impact.affected.map((item) => (
            <li
              className="v3-review-impact-item"
              key={`${item.node_type}:${item.node_id}`}
              data-testid={`impact-item-${item.node_type}-${item.node_id}`}
            >
              <MuiStack
                direction="row"
                spacing={0.5}
                alignItems="center"
                useFlexGap
                flexWrap="wrap"
              >
                <MuiChip label={<>{impactTypeLabel(item.node_type)}</>} />
                <MuiTypography component="span">
                  {impactReasonLabel(item.reason)}
                </MuiTypography>
              </MuiStack>
            </li>
          ))}
        </ul>
      ) : null}
    </MuiStack>
  );
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
  const formTypeLabel = useFormTypeLabel();
  const posLabel = usePartOfSpeechLabel();
  const summary = buildV3PublicationIssueSummary(
    word,
    issues,
    formTypeLabel,
    posLabel
  );
  return (
    <section aria-label="发布待完成摘要" className="v3-validation-summary">
      <div className="v3-validation-summary__overview">
        <MuiTypography component="span" color="error.main" fontWeight={600}>
          仍有未完成的内容
        </MuiTypography>
        <MuiTypography component="h3" variant="h5">
          还有 {summary.total} 项待完成
        </MuiTypography>
        <MuiTypography component="span" color="text.secondary">
          发布条件保持不变。请先处理下列内容，再重新检查。
        </MuiTypography>
      </div>

      <div className="v3-validation-summary__positions">
        {summary.positions.map((position) => {
          const stepCounts = [
            position.by_step.forms > 0
              ? `词形与发音 ${position.by_step.forms}`
              : undefined,
            position.by_step.meanings > 0
              ? `词义与例句 ${position.by_step.meanings}`
              : undefined
          ].filter(Boolean);
          return (
            <div
              className="v3-validation-summary__position"
              data-testid={position.testId}
              key={position.key}
            >
              <div>
                <MuiTypography component="span" fontWeight={600}>
                  {position.label}
                </MuiTypography>
                <MuiTypography component="span" color="text.secondary">
                  {position.issues.length} 项待完成
                </MuiTypography>
                {stepCounts.length > 0 ? (
                  <MuiTypography component="span" color="text.secondary">
                    {stepCounts.join(" · ")}
                  </MuiTypography>
                ) : null}
              </div>
              {onNavigate ? (
                <MuiButton
                  aria-label={`填写${position.label}未完成项`}
                  size="small"
                  onClick={() => void onNavigate(position.issues[0]!)}
                  variant={"text"}
                >
                  去填写
                </MuiButton>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="v3-validation-summary__types">
        <MuiTypography component="span" fontWeight={600}>
          问题分布
        </MuiTypography>
        {summary.types.map((type) => (
          <div className="v3-validation-summary__type" key={type.code}>
            <div className="v3-validation-summary__type-copy">
              <MuiStack
                direction="row"
                spacing={0.75}
                alignItems="center"
                useFlexGap
                flexWrap="wrap"
              >
                <MuiChip color={"error"} label={<>{type.count} 项</>} />
                <MuiTypography component="span">{type.label}</MuiTypography>
              </MuiStack>
              <MuiTypography component="span" color="text.secondary">
                {type.scopes.join(" · ")}
              </MuiTypography>
            </div>
            {onNavigate ? (
              <MuiButton
                aria-label={`填写${type.label}问题`}
                size="small"
                onClick={() => void onNavigate(type.issues[0]!)}
                variant={"text"}
              >
                去填写
              </MuiButton>
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
  const impactState = useSurfaceSnapshot(
    impactPage,
    `${word.id}:${word.revision}:controlled-impact:${impactPage?.snapshot_id ?? "none"}`,
    fetchPage ?? unavailablePage
  );
  const publishState = useSurfaceSnapshot(
    publishPage,
    `${word.id}:${word.revision}:controlled-publish:${publishPage?.snapshot_id ?? "none"}`,
    fetchPage ?? unavailablePage
  );
  const profile = useAuthStore((state) => state.profile);
  const canPrepare = canCheckEntry(profile);
  const allowedToPublish = canPublishEntry(profile, word);
  const unavailableMessage =
    publicationUnavailableMessage(word) ??
    (!canPrepare ? "未开通词条检查权限" : undefined);
  const requiresImpactConfirmation = Boolean(
    controller.impact && (controller.impact.requires_confirmation || impactPage)
  );
  const readyToPublish = Boolean(
    allowedToPublish &&
    !unavailableMessage &&
    controller.issues.length === 0 &&
    controller.validation?.valid &&
    controller.impact &&
    (!requiresImpactConfirmation || controller.impactConfirmed)
  );
  const prepare = async () => {
    if (!canPrepare) return;
    const validation = await controller.actions.validate();
    if (validation?.valid) await controller.actions.previewFormsImpact();
  };
  const publish = async (token?: string) => {
    if (publishLock.current || !allowedToPublish) return;
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
    <MuiStack style={{ width: "100%" }} direction="column" spacing={2}>
      <V3WordPreview
        render={controller.renderPreview}
        readiness={
          unavailableMessage ? (
            <MuiTypography component="span" color="text.secondary">
              当前词条不可发布
            </MuiTypography>
          ) : controller.issues.length > 0 ? (
            <MuiTypography component="span" color="error.main">
              有待完成内容
            </MuiTypography>
          ) : controller.validation?.valid ? (
            <MuiTypography component="span" color="success.main">
              当前内容已通过发布检查
            </MuiTypography>
          ) : (
            <MuiTypography component="span" color="text.secondary">
              尚未检查发布条件
            </MuiTypography>
          )
        }
        word={word}
      />
      {unavailableMessage ? (
        <MuiAlert severity={"warning"}>
          <MuiAlertTitle>{"当前词条不可发布"}</MuiAlertTitle>
          {unavailableMessage}
        </MuiAlert>
      ) : (
        <MuiCard
          id="review-publish"
          className="v3-review-publish"
          variant="outlined"
        >
          <MuiCardHeader
            className="admin-card-header"
            title={"发布检查"}
            slotProps={{
              title: { variant: "subtitle1", className: "admin-card-title" }
            }}
            sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
          />
          <MuiCardContent className="admin-card-body">
            <MuiStack style={{ width: "100%" }} direction="column" spacing={1}>
              {!allowedToPublish && (
                <MuiAlert severity={"info"}>
                  <MuiAlertTitle>{"当前账号不能发布这条词条"}</MuiAlertTitle>
                  {ENTRY_PUBLISH_BLOCKED_HINT}
                </MuiAlert>
              )}
              <MuiButton
                loading={
                  controller.isPending("validate") ||
                  controller.isPending("impact")
                }
                onClick={() => void prepare()}
              >
                检查发布条件
              </MuiButton>
              {controller.issues.length > 0 ? (
                <ValidationIssueSummary
                  word={word}
                  issues={controller.issues}
                  onNavigate={controller.actions.navigateIssue}
                />
              ) : null}
              {controller.impact ? (
                <MuiAlert
                  severity={requiresImpactConfirmation ? "warning" : "success"}
                >
                  <MuiAlertTitle>{`影响预览：${controller.impact.affected.length} 项`}</MuiAlertTitle>
                  {
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
                </MuiAlert>
              ) : null}
              {allowedToPublish &&
              requiresImpactConfirmation &&
              !controller.impactConfirmed ? (
                <MuiButton
                  disabled={
                    impactPage
                      ? !controller.actions.confirmImpactSurface ||
                        !canAcknowledgeSurfaceSnapshot(impactState)
                      : !controller.actions.confirmImpact
                  }
                  onClick={confirmImpact}
                >
                  确认影响并允许发布
                </MuiButton>
              ) : null}
              {readyToPublish ? (
                <MuiButton
                  loading={controller.isPending("publish")}
                  onClick={() => void publish()}
                  variant={"contained"}
                >
                  发布词条
                </MuiButton>
              ) : null}
            </MuiStack>
          </MuiCardContent>
        </MuiCard>
      )}
      {allowedToPublish && publishPage ? (
        <MuiCard variant="outlined">
          <MuiCardHeader
            className="admin-card-header"
            title={"发布同形提示"}
            slotProps={{
              title: { variant: "subtitle1", className: "admin-card-title" }
            }}
            sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
          />
          <MuiCardContent className="admin-card-body">
            <MuiButton
              loading={controller.isPending("publish")}
              disabled={!canAcknowledgeSurfaceSnapshot(publishState)}
              onClick={confirmPublishSurface}
              variant={"contained"}
            >
              确认同形提示并重试发布
            </MuiButton>
          </MuiCardContent>
        </MuiCard>
      ) : null}
    </MuiStack>
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
  const impactState = useSurfaceSnapshot(
    impact?.surface_match_page,
    `${currentWord.id}:${currentWord.revision}:impact:${impact?.surface_match_page?.snapshot_id ?? "none"}`,
    requests.surfacePage
  );
  const publishSurfaceState = useSurfaceSnapshot(
    publishSurfacePage,
    `${currentWord.id}:${currentWord.revision}:publish:${publishSurfacePage?.snapshot_id ?? "none"}`,
    requests.surfacePage
  );
  const profile = useAuthStore((state) => state.profile);
  const canPrepare = canCheckEntry(profile);
  const allowedToPublish = canPublishEntry(profile, currentWord);
  const unavailableMessage =
    publicationUnavailableMessage(currentWord) ??
    (!canPrepare ? "未开通词条检查权限" : undefined);
  const needsImpactAcknowledgement = Boolean(
    impact && (impact.requires_confirmation || impact.surface_match_page)
  );
  const readyToPublish = Boolean(
    allowedToPublish &&
    !unavailableMessage &&
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
      !canPrepare ||
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
      !allowedToPublish ||
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
      if (problem.kind === "validation") {
        if (publishKey.current === idempotencyKey) {
          publishKey.current = undefined;
        }
        clearPreparedPublish();
        setValidationIssues(problem.issues);
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
    <MuiStack style={{ width: "100%" }} direction="column" spacing={2}>
      <V3WordPreview
        readiness={
          unavailableMessage ? (
            <MuiTypography component="span" color="text.secondary">
              当前词条不可发布
            </MuiTypography>
          ) : validationIssues.length > 0 ? (
            <MuiTypography component="span" color="error.main">
              有待完成内容
            </MuiTypography>
          ) : impact ? (
            <MuiTypography component="span" color="success.main">
              当前内容已通过发布检查
            </MuiTypography>
          ) : (
            <MuiTypography component="span" color="text.secondary">
              尚未检查发布条件
            </MuiTypography>
          )
        }
        word={currentWord}
      />
      {unavailableMessage ? (
        <MuiAlert severity={"warning"}>
          <MuiAlertTitle>{"当前词条不可发布"}</MuiAlertTitle>
          {unavailableMessage}
        </MuiAlert>
      ) : (
        <MuiCard
          id="review-publish"
          className="v3-review-publish"
          variant="outlined"
        >
          <MuiCardHeader
            className="admin-card-header"
            title={"发布检查"}
            slotProps={{
              title: { variant: "subtitle1", className: "admin-card-title" }
            }}
            sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
          />
          <MuiCardContent className="admin-card-body">
            <MuiStack style={{ width: "100%" }} direction="column" spacing={1}>
              {!allowedToPublish && (
                <MuiAlert severity={"info"}>
                  <MuiAlertTitle>{"当前账号不能发布这条词条"}</MuiAlertTitle>
                  {ENTRY_PUBLISH_BLOCKED_HINT}
                </MuiAlert>
              )}
              <MuiButton
                disabled={reconciliationRequired}
                loading={preparing || refreshingCanonical}
                onClick={() => void handlePrepare()}
              >
                检查发布条件
              </MuiButton>
              {validationIssues.length > 0 ? (
                <ValidationIssueSummary
                  word={currentWord}
                  issues={validationIssues}
                />
              ) : null}
              {impact ? (
                <MuiAlert
                  severity={needsImpactAcknowledgement ? "warning" : "success"}
                >
                  <MuiAlertTitle>{`影响预览：${impact.affected.length} 项`}</MuiAlertTitle>
                  {
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
                </MuiAlert>
              ) : null}
              {allowedToPublish &&
              needsImpactAcknowledgement &&
              !impactAccepted ? (
                <MuiButton
                  disabled={
                    Boolean(impact?.surface_match_page) &&
                    !canAcknowledgeSurfaceSnapshot(impactState)
                  }
                  onClick={handleAcceptImpact}
                >
                  确认影响并允许发布
                </MuiButton>
              ) : null}
              {readyToPublish ? (
                <MuiButton
                  loading={publishing}
                  onClick={() => void runPublish()}
                  variant={"contained"}
                >
                  发布词条
                </MuiButton>
              ) : null}
            </MuiStack>
          </MuiCardContent>
        </MuiCard>
      )}
      {allowedToPublish && publishSurfacePage ? (
        <MuiCard variant="outlined">
          <MuiCardHeader
            className="admin-card-header"
            title={"发布同形提示"}
            slotProps={{
              title: { variant: "subtitle1", className: "admin-card-title" }
            }}
            sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
          />
          <MuiCardContent className="admin-card-body">
            <MuiStack direction="column" spacing={1}>
              <MuiTypography component="span">
                已加载 {publishSurfaceState.items.length}/
                {publishSurfaceState.total} 条匹配来源
              </MuiTypography>
              <MuiButton
                loading={publishing}
                disabled={!canAcknowledgeSurfaceSnapshot(publishSurfaceState)}
                onClick={handleConfirmPublishSurface}
                variant={"contained"}
              >
                确认同形提示并重试发布
              </MuiButton>
            </MuiStack>
          </MuiCardContent>
        </MuiCard>
      ) : null}
      {reconciliationError ? (
        <MuiAlert
          action={
            <MuiButton
              loading={refreshingCanonical}
              onClick={() => void reconcilePublishConflict()}
            >
              重新刷新最新词条
            </MuiButton>
          }
          severity={"error"}
        >
          {"刷新最新词条失败，请先重试对账。"}
        </MuiAlert>
      ) : null}
      {error ? <MuiAlert severity={"error"}>{error}</MuiAlert> : null}
    </MuiStack>
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
