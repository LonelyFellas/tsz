import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Flex, Result, Spin, Typography } from "antd";
import type {
  AdminWordDraftV3Envelope,
  AdminWordV3,
  DraftMeaningsStepContentWritableV3,
  StepSaveIntent,
  SurfaceMatchEnabledTerminalPageV3,
  SurfaceMatchPageAny,
  SurfaceMatchPageV3,
  WordCreationStep,
  WordSentenceAssociationV3
} from "@tsz/types";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";
import {
  createV3WordRequests,
  type V3WordRequests
} from "@/features/dictionary/word-creation-v3/api";
import {
  canAcknowledgeSurfaceSnapshot,
  type SurfaceSnapshotState
} from "@/features/dictionary/surfaceSnapshot";
import { useSurfaceSnapshotAny } from "@/features/dictionary/useSurfaceSnapshot";
import { V3FormsAndPronunciationStep } from "@/features/dictionary/word-creation-v3/components/V3FormsAndPronunciationStep";
import { V3PendingSentenceAssociationsPanel } from "@/features/dictionary/word-creation-v3/components/V3PendingSentenceAssociationsPanel";
import { V3BasicsStep } from "@/features/dictionary/word-creation-v3/V3BasicsStep";
import { V3MeaningsAndExamplesStep } from "@/features/dictionary/word-creation-v3/V3MeaningsAndExamplesStep";
import { relationDisplaySnapshots } from "@/features/dictionary/word-creation-v3/meaningsModel";
import { pendingSentenceTargetFromState } from "@/features/dictionary/word-creation-v3/pendingSentenceTargetNavigation";
import { V3PreviewAndPublishStep } from "@/features/dictionary/word-creation-v3/V3PreviewAndPublishStep";
import { V3PublicationHistory } from "@/features/dictionary/word-creation-v3/V3PublicationHistory";
import { V3ReviewContent } from "@/features/dictionary/word-creation-v3/V3ReviewContent";
import {
  presentV3DetailError,
  shouldRetryV3Detail
} from "@/features/dictionary/word-creation-v3/presentationErrors";
import { resolveV3StepAccess } from "@/features/dictionary/word-creation-v3/stepAccess";
import { usePartOfSpeechCatalog } from "@/features/dictionary/part-of-speech/api";
import {
  impactReasonLabel,
  impactTypeLabel
} from "@/features/dictionary/word-creation-v3/presentation";
import {
  CreationSourceNotice,
  creationSourceFromState
} from "@/features/dictionary/word-creation/CreationSourceNotice";
import {
  V3WordCreationWizard,
  type V3WizardSlotContext
} from "@/features/dictionary/word-creation-v3/V3WordCreationWizard";

const STEPS = new Set<WordCreationStep>([
  "basics",
  "forms",
  "meanings",
  "preview"
]);

export type V3MeaningsStepRenderer = (
  context: V3WizardSlotContext
) => ReactNode;

function isStep(value: unknown): value is WordCreationStep {
  return STEPS.has(value as WordCreationStep);
}

function sentenceAssociationSnapshots(
  word: AdminWordV3
): Record<string, WordSentenceAssociationV3[]> {
  return Object.fromEntries(
    word.meanings.pos.flatMap((pos) =>
      pos.senses.flatMap((sense) =>
        sense.sentences.map((sentence) => [sentence.id, sentence.associations])
      )
    )
  );
}

function terminalSurfacePage(
  state: SurfaceSnapshotState<SurfaceMatchPageAny>
): SurfaceMatchEnabledTerminalPageV3 | undefined {
  if (
    state.schema_version !== 3 ||
    !canAcknowledgeSurfaceSnapshot(state) ||
    !state.snapshot_id ||
    !state.policy_name ||
    state.policy_epoch === undefined ||
    !state.surface_confirmation_token
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

function V3FormsSlot({ context }: { context: V3WizardSlotContext }) {
  const [pendingIntent, setPendingIntent] = useState<StepSaveIntent>();
  const preparingRef = useRef(false);
  const impactPage = context.impactSurfacePage;
  const snapshot = useSurfaceSnapshotAny(
    impactPage,
    `${context.word.id}:${context.word.revision}:forms-impact:${impactPage?.snapshot_id ?? "none"}`,
    context.actions.fetchSurfacePage
  );
  const terminalPage = terminalSurfacePage(snapshot);
  const requiresConfirmation = Boolean(
    context.impact &&
    (context.impact.requires_confirmation || context.impactSurfacePage)
  );
  const busy = context.isPending("impact") || context.isPending("save_forms");

  const prepareSave = async (intent: StepSaveIntent) => {
    if (preparingRef.current) return;
    preparingRef.current = true;
    setPendingIntent(intent);
    try {
      const impact = await context.actions.previewFormsSaveImpact();
      if (!impact) {
        setPendingIntent(undefined);
        return;
      }
      if (!impact.requires_confirmation && !impact.surface_match_page) {
        setPendingIntent(undefined);
        await context.actions.saveForms(intent);
      }
    } finally {
      preparingRef.current = false;
    }
  };

  const confirmAndSave = async () => {
    if (!pendingIntent) return;
    let confirmed = false;
    let confirmationContext:
      | {
          snapshot_id: string;
          policy_name: SurfaceMatchPageV3["policy_name"];
          policy_epoch: number;
        }
      | undefined;
    if (impactPage) {
      if (!terminalPage) return;
      confirmed = context.actions.confirmImpactSurface(terminalPage);
      confirmationContext = {
        snapshot_id: terminalPage.snapshot_id,
        policy_name: terminalPage.policy_name,
        policy_epoch: terminalPage.policy_epoch
      };
    } else {
      confirmed = context.actions.confirmImpact();
    }
    if (!confirmed) return;
    const intent = pendingIntent;
    setPendingIntent(undefined);
    await context.actions.saveForms(intent, confirmationContext);
  };

  const resetConfirmation = () => setPendingIntent(undefined);
  return (
    <Flex vertical gap="middle">
      <V3FormsAndPronunciationStep
        activePosId={context.activePosId}
        issues={context.issues.filter((issue) => issue.step === "forms")}
        onActivePosChange={(posId) => {
          resetConfirmation();
          context.setActivePosId(posId);
        }}
        onChange={(content) => {
          resetConfirmation();
          context.setDraftForms(content);
        }}
        stableVariantIds={context.stableVariantIds}
        value={context.draftForms}
      />
      {pendingIntent && context.impact && requiresConfirmation ? (
        <Alert
          showIcon
          type="warning"
          title="保存前请确认影响"
          description={
            <Flex vertical gap={4}>
              <span>
                {impactPage
                  ? `正在核对同形匹配：已加载 ${snapshot.items.length}/${snapshot.total}`
                  : `本次变更影响 ${context.impact.affected.length} 个引用节点。`}
              </span>
              {context.impact.affected.map((item) => (
                <Typography.Text
                  key={`${item.node_type}:${item.node_id}:${item.reason}`}
                  type="secondary"
                >
                  {impactTypeLabel(item.node_type)}：
                  {impactReasonLabel(item.reason)}
                </Typography.Text>
              ))}
            </Flex>
          }
          action={
            <Flex gap="small">
              {impactPage &&
              (snapshot.phase === "error" || snapshot.phase === "expired") ? (
                <Button onClick={snapshot.retry}>重新加载影响</Button>
              ) : null}
              <Button onClick={resetConfirmation}>取消</Button>
              <Button
                disabled={Boolean(impactPage) && !terminalPage}
                loading={snapshot.phase === "loading"}
                onClick={() => void confirmAndSave()}
              >
                {pendingIntent === "complete"
                  ? "确认影响并完成词形"
                  : "确认影响并保存草稿"}
              </Button>
            </Flex>
          }
        />
      ) : null}
      <div className="word-step-actions">
        <Button
          disabled={Boolean(pendingIntent)}
          onClick={() => context.setActiveStep("basics")}
        >
          上一步
        </Button>
        <Button
          disabled={Boolean(pendingIntent)}
          loading={busy && pendingIntent === "save"}
          onClick={() => void prepareSave("save")}
        >
          保存草稿
        </Button>
        <Button
          type="primary"
          disabled={Boolean(pendingIntent)}
          onClick={() => {
            resetConfirmation();
            context.setActiveStep("meanings");
          }}
        >
          进入词义与例句
        </Button>
      </div>
    </Flex>
  );
}

function V3BasicsSlot({ context }: { context: V3WizardSlotContext }) {
  return (
    <V3BasicsStep
      word={context.word}
      onContinue={() => context.setActiveStep("forms")}
      onStepChange={context.setActiveStep}
    />
  );
}

function V3MeaningsSlot({
  context,
  requests
}: {
  context: V3WizardSlotContext;
  requests: V3WordRequests;
}) {
  const partOfSpeechCatalog = usePartOfSpeechCatalog();
  const navigate = useNavigate();
  const location = useLocation();
  const pendingTarget = pendingSentenceTargetFromState(location.state);
  const prefillApplied = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      !pendingTarget?.gloss ||
      prefillApplied.current === pendingTarget.associationId
    )
      return;
    const next = structuredClone(context.draftMeanings);
    const definition = next.pos
      .flatMap((pos) => pos.senses)
      .flatMap((sense) => sense.definitions)
      .find((item) => "content_id" in item && item.content.text.trim() === "");
    if (!definition || !("content_id" in definition)) return;
    definition.content = {
      version: 2,
      text: pendingTarget.gloss,
      annotations: []
    };
    prefillApplied.current = pendingTarget.associationId;
    context.setDraftMeanings(next);
  }, [context, pendingTarget]);
  // 词义步里的成分用词卡片会改词形内容，保存时向导要先存脏词形。删除已有成分属于
  // 下游变更，后端要 confirmed_impact_token，直接 PUT 会 409 downstream_confirmation_required
  // 而整次保存中止。所以这里和词形步一样：先预览影响，需要确认就把保存挂起等确认。
  // 只记 intent：确认时用当时的 draftMeanings，快照 content 会把确认期间的编辑丢掉。
  const [pendingIntent, setPendingIntent] = useState<StepSaveIntent>();
  const [surfaceBlocked, setSurfaceBlocked] = useState(false);
  const preparingRef = useRef(false);
  const saveMeanings = async (
    content: DraftMeaningsStepContentWritableV3,
    intent: StepSaveIntent
  ) => {
    if (preparingRef.current) return;
    preparingRef.current = true;
    // 每次保存都从干净状态重来：上一轮的提示条留到这一轮，会和当前结果对不上。
    setSurfaceBlocked(false);
    setPendingIntent(undefined);
    try {
      if (context.dirtySteps.forms) {
        const impact = await context.actions.previewFormsSaveImpact();
        if (!impact) return;
        if (impact.surface_match_page) {
          // 同形匹配的确认要带 snapshot/policy 上下文，只有词形步的保存入口能透传，
          // 这里不复制那套状态机，直接把人引回词形步确认。
          setSurfaceBlocked(true);
          return;
        }
        if (impact.requires_confirmation) {
          setPendingIntent(intent);
          return;
        }
      }
      await context.actions.saveMeanings(content, intent);
    } finally {
      preparingRef.current = false;
    }
  };
  const confirmAndSave = async () => {
    if (!pendingIntent) return;
    // 影响令牌绑定在预览时那份词形内容上：确认条挂着时又改了词形，令牌就对不上。
    // 这时静默什么都不做最难排查，改成收起确认条、让用户重新点保存去拿新的预览。
    if (!context.actions.confirmImpact()) {
      setPendingIntent(undefined);
      return;
    }
    const intent = pendingIntent;
    setPendingIntent(undefined);
    await context.actions.saveMeanings(context.draftMeanings, intent);
  };

  const sentenceAssociationCapability =
    context.word.capabilities.sentence_associations;
  const sentenceAssociationsEnabled =
    sentenceAssociationCapability === true ||
    (sentenceAssociationCapability === undefined && import.meta.env.DEV);
  const sentenceTargetDiscoveryCapability =
    context.word.capabilities.sentence_target_discovery;
  const sentenceTargetDiscoveryEnabled =
    sentenceTargetDiscoveryCapability === true ||
    (sentenceTargetDiscoveryCapability === undefined && import.meta.env.DEV);
  return (
    <Flex vertical gap="middle">
      {sentenceAssociationsEnabled ? (
        <V3PendingSentenceAssociationsPanel
          requests={requests}
          word={context.word}
        />
      ) : null}
      {surfaceBlocked ? (
        <Alert
          showIcon
          type="warning"
          title="词形变更需要在上一步确认"
          description="本次词形改动触发了同形匹配核对，请回到「词形与发音」保存一次并确认，再回来保存词义。"
          action={
            <Flex gap="small">
              <Button onClick={() => setSurfaceBlocked(false)}>知道了</Button>
              <Button
                onClick={() => {
                  setSurfaceBlocked(false);
                  context.setActiveStep("forms");
                }}
              >
                去词形与发音
              </Button>
            </Flex>
          }
        />
      ) : null}
      {pendingIntent && context.impact ? (
        <Alert
          showIcon
          type="warning"
          title="保存前请确认词形影响"
          description={
            <Flex vertical gap={4}>
              <span>{`本次词形变更影响 ${context.impact.affected.length} 个引用节点。`}</span>
              {context.impact.affected.map((item) => (
                <Typography.Text
                  key={`${item.node_type}:${item.node_id}:${item.reason}`}
                  type="secondary"
                >
                  {impactTypeLabel(item.node_type)}：
                  {impactReasonLabel(item.reason)}
                </Typography.Text>
              ))}
            </Flex>
          }
          action={
            <Flex gap="small">
              <Button onClick={() => setPendingIntent(undefined)}>取 消</Button>
              <Button onClick={() => void confirmAndSave()}>
                {pendingIntent === "complete"
                  ? "确认影响并完成"
                  : "确认影响并保存草稿"}
              </Button>
            </Flex>
          }
        />
      ) : null}
      <V3MeaningsAndExamplesStep
        activePosId={context.activePosId}
        draftRelationPrebindingEnabled={
          context.word.capabilities.draft_relation_prebinding === true
        }
        entryKind={context.word.kind}
        forms={context.draftForms}
        issues={context.issues.filter((issue) => issue.step === "meanings")}
        onActivePosChange={(posId) => {
          // 切词性同样会作废影响令牌，条子留着的话点确认是无反馈的空操作。
          setPendingIntent(undefined);
          context.setActivePosId(posId);
        }}
        onChange={context.setDraftMeanings}
        onFormsChange={(next) => {
          // 词形一改，上一轮预览拿到的影响令牌就失效了，先把确认条收起来。
          setPendingIntent(undefined);
          context.setDraftForms(next);
        }}
        onPrevious={() => context.setActiveStep("forms")}
        onSave={saveMeanings}
        onSaveMultidimensionalSentence={
          sentenceAssociationsEnabled
            ? (posId, senseId, draft) =>
                context.actions.saveMultidimensionalSentence(
                  posId,
                  senseId,
                  draft.sentence,
                  draft.associations,
                  draft.idempotencyKey
                )
            : undefined
        }
        onCreatePendingSentenceTarget={(association) => {
          if (
            "target_word_id" in association ||
            !association.pending_target_headword
          )
            return;
          navigate("/words/create", {
            state: {
              pendingSentenceTarget: {
                associationId: association.id,
                headword: association.pending_target_headword,
                ...(association.pending_target_gloss
                  ? { gloss: association.pending_target_gloss }
                  : {}),
                returnTo: `${location.pathname}${location.search}`
              }
            }
          });
        }}
        partOfSpeechCatalog={partOfSpeechCatalog.data}
        partOfSpeechCatalogError={partOfSpeechCatalog.isError}
        partOfSpeechCatalogPending={partOfSpeechCatalog.isPending}
        relationDisplaySnapshots={relationDisplaySnapshots(
          context.word.meanings
        )}
        sentenceAssociations={sentenceAssociationSnapshots(context.word)}
        sentenceTargetDiscoveryEnabled={sentenceTargetDiscoveryEnabled}
        saving={
          context.isPending("impact") ||
          context.isPending("save_forms") ||
          context.isPending("save_meanings") ||
          context.isPending("save_sentence_associations")
        }
        value={context.draftMeanings}
        wordId={context.word.id}
      />
    </Flex>
  );
}

function V3ReadOnlyPreview({
  word,
  onEdit
}: {
  word: AdminWordV3;
  onEdit?: () => void;
}) {
  return (
    <V3ReviewContent
      actions={
        onEdit ? (
          <Button type="primary" onClick={onEdit}>
            继续编辑
          </Button>
        ) : undefined
      }
      word={word}
    />
  );
}

function V3PreviewSlot({ context }: { context: V3WizardSlotContext }) {
  if (context.hasUnsavedChanges) {
    return (
      <Alert
        showIcon
        type="warning"
        title="请先保存未保存的草稿"
        description="当前预览只显示最近一次已保存内容。请先返回对应步骤保存草稿，再重新检查发布条件。"
      />
    );
  }
  const controller = {
    ...(context.validation ? { validation: context.validation } : {}),
    ...(context.impact ? { impact: context.impact } : {}),
    impactConfirmed: context.impactConfirmed,
    issues: context.issues,
    ...(context.problem ? { problem: context.problem } : {}),
    isPending: (command: "validate" | "impact" | "publish") =>
      context.isPending(command),
    actions: {
      validate: context.actions.validate,
      previewFormsImpact: context.actions.previewFormsImpact,
      publish: context.actions.publish,
      navigateIssue: context.actions.navigateIssue,
      confirmImpact: context.actions.confirmImpact,
      confirmImpactSurface: context.actions.confirmImpactSurface,
      fetchSurfacePage: context.actions.fetchSurfacePage
    }
  };
  return (
    <V3PreviewAndPublishStep word={context.word} controller={controller} />
  );
}

function V3WizardSlots({
  context,
  wordId,
  renderMeaningsStep,
  requests,
  onActivated
}: {
  context: V3WizardSlotContext;
  wordId: string;
  renderMeaningsStep?: V3MeaningsStepRenderer;
  requests: V3WordRequests;
  onActivated: (word: AdminWordV3) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (context.readOnly) return;
    const pathname = `/words/${wordId}/v3/wizard/${context.activeStep}`;
    if (location.pathname !== pathname) {
      navigate(`${pathname}${location.search}`, {
        replace: true,
        state: location.state
      });
    }
  }, [
    context.activeStep,
    context.readOnly,
    location.pathname,
    location.search,
    location.state,
    navigate,
    wordId
  ]);

  if (context.readOnly) {
    return (
      <Flex vertical gap="middle">
        <V3ReadOnlyPreview
          word={context.word}
          onEdit={
            context.word.status === "published"
              ? () =>
                  navigate(
                    `/words/${context.word.id}/v3/wizard/forms?mode=edit`
                  )
              : undefined
          }
        />
        <V3PublicationHistory
          currentWord={context.word}
          onActivated={onActivated}
          onCanonicalRefreshed={onActivated}
          requests={requests}
        />
      </Flex>
    );
  }

  switch (context.activeStep) {
    case "basics":
      return <V3BasicsSlot context={context} />;
    case "forms":
      return <V3FormsSlot context={context} />;
    case "meanings":
      return (
        renderMeaningsStep?.(context) ?? (
          <V3MeaningsSlot context={context} requests={requests} />
        )
      );
    case "preview":
      return (
        <Flex vertical gap="middle">
          <V3PreviewSlot context={context} />
          <V3PublicationHistory
            activationBlockedByUnsavedChanges={context.hasUnsavedChanges}
            currentWord={context.word}
            onActivated={onActivated}
            onCanonicalRefreshed={onActivated}
            requests={requests}
          />
        </Flex>
      );
  }
}

export function WordWizardV3Page({
  requests: suppliedRequests,
  renderMeaningsStep
}: {
  requests?: V3WordRequests;
  renderMeaningsStep?: V3MeaningsStepRenderer;
} = {}) {
  const { wordId = "", step } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const pendingTarget = pendingSentenceTargetFromState(location.state);
  const [searchParams] = useSearchParams();
  const [activationGeneration, setActivationGeneration] = useState(0);
  const queryClient = useQueryClient();
  const requests = useMemo(
    () => suppliedRequests ?? createV3WordRequests(),
    [suppliedRequests]
  );
  const queryKey = useMemo(
    () => ["admin-words", "detail-v3", wordId] as const,
    [wordId]
  );
  const replaceCanonical = useCallback(
    (word: AdminWordV3) => {
      queryClient.setQueryData<AdminWordDraftV3Envelope>(queryKey, (current) =>
        current ? { ...current, word } : current
      );
    },
    [queryClient, queryKey]
  );
  const replaceActivatedCanonical = useCallback(
    (word: AdminWordV3) => {
      replaceCanonical(word);
      setActivationGeneration((generation) => generation + 1);
    },
    [replaceCanonical]
  );
  const detail = useQuery({
    queryKey,
    queryFn: () => requests.get(wordId),
    enabled: wordId !== "",
    staleTime: 0,
    gcTime: 0,
    retry: shouldRetryV3Detail
  });

  if (detail.isPending) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: 420 }}>
        <Spin size="large" description="正在加载词条" />
      </Flex>
    );
  }
  if (detail.isError || !detail.data) {
    const presentation = presentV3DetailError(detail.error);
    return (
      <Result
        status="error"
        title={presentation.title}
        subTitle={presentation.description}
        extra={
          presentation.retryable ? (
            <Button type="primary" onClick={() => void detail.refetch()}>
              重试
            </Button>
          ) : undefined
        }
      />
    );
  }

  const word = detail.data.word;
  const editingPublished =
    word.status === "published" && searchParams.get("mode") === "edit";
  const requestedStep = isStep(step) ? step : word.max_reachable_step;
  const stepAccess = resolveV3StepAccess(word, requestedStep, editingPublished);
  const forcePreview = stepAccess.readOnly;
  const legalStep = stepAccess.effective;
  if (step !== legalStep) {
    return (
      <Navigate
        replace
        to={`/words/${word.id}/v3/wizard/${legalStep}${editingPublished ? "?mode=edit" : ""}`}
      />
    );
  }

  return (
    <Flex vertical gap="middle">
      <CreationSourceNotice source={creationSourceFromState(location.state)} />
      {pendingTarget ? (
        <Alert
          action={
            <Button onClick={() => navigate(pendingTarget.returnTo)}>
              返回来源例句
            </Button>
          }
          description={
            pendingTarget.gloss
              ? `预填词义建议：${pendingTarget.gloss}`
              : "该 Pending 没有预填词义，请完成目标词义后再认领。"
          }
          showIcon
          title={`正在为 Pending 创建目标：${pendingTarget.headword}`}
          type="info"
        />
      ) : null}
      <V3WordCreationWizard
        key={`${word.id}:activation-${activationGeneration}:${editingPublished ? "edit" : "read"}`}
        allowPublishedEditing={editingPublished}
        initialStep={legalStep}
        initialWord={word}
        retiredStableNodes={detail.data.retired_stable_nodes}
        readOnly={forcePreview}
        requests={requests}
        onWordChange={replaceCanonical}
        renderStep={(context) => (
          <V3WizardSlots
            context={context}
            onActivated={replaceActivatedCanonical}
            renderMeaningsStep={renderMeaningsStep}
            requests={requests}
            wordId={word.id}
          />
        )}
      />
    </Flex>
  );
}
