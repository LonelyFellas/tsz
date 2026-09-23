import { PronunciationPreviewProvider } from "@/features/dictionary/word-creation/PronunciationPreview";
import { V3ReviewSentences } from "@/features/dictionary/word-creation-v3/V3ReviewSentences";
import { WordSentences } from "@/features/sentences/WordSentences";
import { wordKeys } from "@/features/dictionary/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Flex, Result, Spin, Typography } from "antd";
import type {
  AdminWordDraftV3Envelope,
  AdminWordV3,
  DraftMeaningsStepContentWritableV3,
  InboundReferenceV3,
  SharedSentence,
  StepSaveIntent,
  SurfaceMatchEnabledTerminalPageV3,
  SurfaceMatchPageV3,
  WordCreationStep
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
import { useSurfaceSnapshot } from "@/features/dictionary/useSurfaceSnapshot";
import { V3FormsAndPronunciationStep } from "@/features/dictionary/word-creation-v3/components/V3FormsAndPronunciationStep";
import { V3BasicsStep } from "@/features/dictionary/word-creation-v3/V3BasicsStep";
import { V3MeaningsAndExamplesStep } from "@/features/dictionary/word-creation-v3/V3MeaningsAndExamplesStep";
import {
  countFormGroupBindings,
  formGroupBindingsChanged,
  relationDisplaySnapshots
} from "@/features/dictionary/word-creation-v3/meaningsModel";
import { V3PreviewAndPublishStep } from "@/features/dictionary/word-creation-v3/V3PreviewAndPublishStep";
import { V3PublicationHistory } from "@/features/dictionary/word-creation-v3/V3PublicationHistory";
import { V3ReviewContent } from "@/features/dictionary/word-creation-v3/V3ReviewContent";
import {
  presentV3DetailError,
  shouldRetryV3Detail
} from "@/features/dictionary/word-creation-v3/presentationErrors";
import { resolveV3StepAccess } from "@/features/dictionary/word-creation-v3/stepAccess";
import { canWriteEntry } from "@/features/dictionary/entryWritePermission";
import { api, useAuthStore } from "@/lib/auth";
import { usePartOfSpeechCatalog } from "@/features/dictionary/part-of-speech/api";
import { summarizeFormsImpact } from "@/features/dictionary/word-creation-v3/presentation";
import {
  CreationSourceNotice,
  creationSourceFromState
} from "@/features/dictionary/word-creation/CreationSourceNotice";
import {
  V3WordCreationWizard,
  type V3WizardSlotContext
} from "@/features/dictionary/word-creation-v3/V3WordCreationWizard";
import { V3ReferenceList } from "@/features/dictionary/word-creation-v3/components/V3ReferenceList";
import {
  buildReferenceIndex,
  locateV3Node,
  referenceLink,
  spellingConflicts
} from "@/features/dictionary/word-creation-v3/referenceGuard";
import {
  V3ReferenceGuardProvider,
  useV3ReferenceGuard,
  type V3ReferenceGuard
} from "@/features/dictionary/word-creation-v3/referenceGuardContext";

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

function terminalSurfacePage(
  state: SurfaceSnapshotState<SurfaceMatchPageV3>
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

/** 引用索引不可用 / 已失效引用的顶部提示，词形步与词义步共用。 */
function V3ReferenceNotices() {
  const { index } = useV3ReferenceGuard();
  return (
    <>
      {index.status === "unavailable" ? (
        <Alert
          showIcon
          type="info"
          title="引用信息暂不可用"
          description="引用影响信息暂不可用；可以编辑草稿，发布前仍由服务端严格校验。"
        />
      ) : null}
      {index.stale.length > 0 ? (
        <Alert
          showIcon
          type="error"
          title={`当前草稿有 ${index.stale.length} 条引用待修复，暂不可发布`}
          description={
            <Flex vertical gap={4}>
              <span>
                这些引用在当前草稿里已不成立。草稿可继续保存，当前发布内容不受影响；修复引用后才能发布。
              </span>
              <V3ReferenceList
                references={index.stale}
                staleLabel="草稿内不成立"
              />
            </Flex>
          }
        />
      ) : null}
    </>
  );
}

/** 草稿影响提示：不阻断保存，破坏性引用必须在发布前修复。 */
function V3BlockedReferencesAlert({
  references
}: {
  references: readonly InboundReferenceV3[];
}) {
  if (references.length === 0) return null;
  return (
    <Alert
      showIcon
      type="error"
      title={`本次词形变更会影响 ${references.length} 处引用，发布前需修复`}
      description={
        <Flex vertical gap={4}>
          <span>可先保存草稿，再到来源处调整这些引用；修复前不能发布。</span>
          <V3ReferenceList references={references} staleLabel="将失效" />
        </Flex>
      }
    />
  );
}

function V3FormsSlot({ context }: { context: V3WizardSlotContext }) {
  const referenceGuard = useV3ReferenceGuard();
  // 草稿可编辑；即时列出拼写影响，发布前必须修复引用。
  const conflicts = spellingConflicts(referenceGuard.index, context.draftForms);
  const conflictReferences = [
    ...new Map(
      conflicts
        .flatMap((conflict) => conflict.references)
        .map((reference) => [reference.id, reference] as const)
    ).values()
  ];
  // 已经列在「引用已失效」里的旧冲突不在拼写冲突提示里重复，也不禁用保存：草稿保存只拦本次改动
  // 破坏的引用，已失效的旧引用由后端只挡发布与切换版本。
  const staleReferenceIds = new Set(
    referenceGuard.index.stale.map((reference) => reference.id)
  );
  const conflictNoticeReferences = conflictReferences.filter(
    (reference) => !staleReferenceIds.has(reference.id)
  );
  const blockedReferences = context.impact?.blocked_references ?? [];
  const [pendingIntent, setPendingIntent] = useState<StepSaveIntent>();
  const preparingRef = useRef(false);
  const impactPage = context.impactSurfacePage;
  const snapshot = useSurfaceSnapshot(
    impactPage,
    `${context.word.id}:${context.word.revision}:forms-impact:${impactPage?.snapshot_id ?? "none"}`,
    context.actions.fetchSurfacePage
  );
  const terminalPage = terminalSurfacePage(snapshot);
  const requiresConfirmation = Boolean(
    context.impact &&
    (context.impact.requires_confirmation || context.impactSurfacePage)
  );
  const bindingsDirty =
    context.word.capabilities.atomic_form_sense_bindings === true &&
    formGroupBindingsChanged(context.draftMeanings, context.word.meanings);
  const busy =
    context.isPending("impact") ||
    context.isPending("save_forms") ||
    context.isPending("save_meanings");

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
      <V3ReferenceNotices />
      {conflictNoticeReferences.length > 0 ? (
        <Alert
          showIcon
          type="error"
          title="拼写变更会影响引用，发布前需修复"
          description={
            <Flex vertical gap={4}>
              <span>
                可以先保存草稿，再到引用来源修复；当前发布内容不随草稿保存改变。
              </span>
              <V3ReferenceList references={conflictNoticeReferences} />
            </Flex>
          }
        />
      ) : null}
      <V3BlockedReferencesAlert references={blockedReferences} />
      <V3FormsAndPronunciationStep
        activePosId={context.activePosId}
        entryKind={context.word.kind}
        formGroupBindingCounts={countFormGroupBindings(context.draftMeanings)}
        bindingEditingAvailable={
          context.word.capabilities.multi_group_sense_bindings === true
        }
        meanings={context.draftMeanings}
        savedSenseIds={
          new Set(
            context.word.meanings.pos.flatMap((pos) =>
              pos.senses.map((sense) => sense.id)
            )
          )
        }
        onMeaningsChange={(meanings) => {
          resetConfirmation();
          context.setDraftMeanings(meanings);
        }}
        onGoToMeanings={(posId) => {
          context.setActivePosId(posId);
          context.setActiveStep("meanings");
        }}
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
              {summarizeFormsImpact(context.impact.affected).map((group) => (
                <Typography.Text key={group.reason} type="secondary">
                  {group.reasonLabel}：
                  {group.parts
                    .map((part) => `${part.label} ${part.count}`)
                    .join("、")}
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
          disabled={
            Boolean(pendingIntent) ||
            (!context.dirtySteps.forms && !bindingsDirty) ||
            busy
          }
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
      draftForms={context.draftForms}
      draftMeanings={context.draftMeanings}
      dirtySteps={context.dirtySteps}
      partOfSpeechCatalog={context.partOfSpeechCatalog?.items}
      onContinue={() => context.setActiveStep("forms")}
      onStepChange={context.setActiveStep}
    />
  );
}

interface V3FocusSentence {
  senseId: string;
  sentenceId: string;
}

function V3MeaningsSlot({
  context,
  focusSentence,
  onFocusSentenceHandled
}: {
  context: V3WizardSlotContext;
  focusSentence?: V3FocusSentence;
  onFocusSentenceHandled?: () => void;
}) {
  const [sentenceEditor, setSentenceEditor] = useState<{
    senseId: string;
    value: SharedSentence | "new";
  }>();
  const blockedReferences = context.impact?.blocked_references ?? [];
  const leaveSentence = async () => {
    if (
      sentenceEditor &&
      context.requestSentenceLeave &&
      !(await context.requestSentenceLeave())
    )
      return false;
    setSentenceEditor(undefined);
    return true;
  };

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

  return (
    <Flex vertical gap="middle">
      <V3ReferenceNotices />
      <V3BlockedReferencesAlert references={blockedReferences} />
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
              {summarizeFormsImpact(context.impact.affected).map((group) => (
                <Typography.Text key={group.reason} type="secondary">
                  {group.reasonLabel}：
                  {group.parts
                    .map((part) => `${part.label} ${part.count}`)
                    .join("、")}
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
        multiGroupBindingsEnabled={
          context.word.capabilities.multi_group_sense_bindings === true
        }
        renderSentenceSection={(senseId) => (
          <WordSentences
            key={senseId}
            sourceWord={context.word}
            senseId={senseId}
            registerLeaveGuard={context.registerSentenceLeaveGuard}
            editor={
              sentenceEditor?.senseId === senseId
                ? sentenceEditor.value
                : undefined
            }
            onOpen={(value) => {
              void (async () => {
                if (await leaveSentence())
                  setSentenceEditor({ senseId, value });
              })();
            }}
            onClose={() => setSentenceEditor(undefined)}
            readOnly={context.readOnly}
            focusSentenceId={
              focusSentence?.senseId === senseId
                ? focusSentence.sentenceId
                : undefined
            }
            onFocusHandled={onFocusSentenceHandled}
          />
        )}
        textLinksEnabled={context.word.capabilities.text_links === true}
        activePosId={context.activePosId}
        componentUsagesEnabled={
          context.word.capabilities.sense_component_usages === true
        }
        entryKind={context.word.kind}
        forms={context.draftForms}
        issues={context.issues.filter((issue) => issue.step === "meanings")}
        onActivePosChange={(posId) => {
          // 切词性同样会作废影响令牌，条子留着的话点确认是无反馈的空操作。
          setPendingIntent(undefined);
          void (async () => {
            if (await leaveSentence()) context.setActivePosId(posId);
          })();
        }}
        onChange={(next) => {
          if (
            sentenceEditor &&
            !next.pos.some((pos) =>
              pos.senses.some((sense) => sense.id === sentenceEditor.senseId)
            )
          ) {
            void (async () => {
              if (await leaveSentence()) context.setDraftMeanings(next);
            })();
          } else context.setDraftMeanings(next);
        }}
        onFormsChange={(next) => {
          // 词形一改，上一轮预览拿到的影响令牌就失效了，先把确认条收起来。
          setPendingIntent(undefined);
          const activeSensePos = context.draftMeanings.pos.find((pos) =>
            pos.senses.some((sense) => sense.id === sentenceEditor?.senseId)
          );
          if (
            sentenceEditor &&
            activeSensePos &&
            !next.pos.some((pos) => pos.pos_id === activeSensePos.pos_id)
          ) {
            void (async () => {
              if (await leaveSentence()) context.setDraftForms(next);
            })();
          } else context.setDraftForms(next);
        }}
        onPrevious={() => context.setActiveStep("forms")}
        onSave={saveMeanings}
        canSave={context.hasUnsavedChanges}
        partOfSpeechCatalog={context.partOfSpeechCatalog}
        partOfSpeechCatalogError={context.partOfSpeechCatalogError}
        partOfSpeechCatalogPending={context.partOfSpeechCatalogPending}
        relationDisplaySnapshots={relationDisplaySnapshots(
          context.word.meanings
        )}
        saving={
          context.isPending("impact") ||
          context.isPending("save_forms") ||
          context.isPending("save_meanings")
        }
        value={context.draftMeanings}
        wordId={context.word.id}
      />
    </Flex>
  );
}

function V3LiveReview({
  word,
  readiness,
  actions,
  onEdit
}: {
  word: AdminWordV3;
  readiness?: React.ReactNode;
  actions?: React.ReactNode;
  onEdit?: (nodeId: string) => void;
}) {
  const sentences = useQuery({
    queryKey: ["shared-sentences", "count", word.id, "published"],
    queryFn: () =>
      api.sentences.list({ view: "published", entry_id: word.id, page_size: 1 })
  });
  const legacyCount = word.meanings.pos
    .flatMap((pos) => pos.senses)
    .reduce((sum, sense) => sum + sense.sentences.length, 0);
  return (
    <PronunciationPreviewProvider>
      <V3ReviewContent
        playback
        word={word}
        readiness={readiness}
        actions={actions}
        onEdit={onEdit}
        sentenceCount={
          sentences.data ? sentences.data.total + legacyCount : null
        }
        renderSentences={(senseId) => (
          <V3ReviewSentences
            key={`${word.id}:${senseId}`}
            entryId={word.id}
            senseId={senseId}
            revision={word.revision}
          />
        )}
      />
    </PronunciationPreviewProvider>
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
    <V3LiveReview
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
    renderPreview: (readiness: React.ReactNode) => (
      <V3LiveReview
        word={context.word}
        readiness={readiness}
        onEdit={(nodeId) => {
          const target = locateV3Node(context.word, nodeId);
          if (target) void context.actions.navigateTarget(target);
          else context.setActiveStep("forms");
        }}
      />
    ),
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
  const referenceGuard = useV3ReferenceGuard();
  const [focusSentence, setFocusSentence] = useState<V3FocusSentence>();
  // 引用列表的「查看例句」：切到词义步、定位到该词义卡片，再由例句区块直接打开这条例句。
  // 只读会话没有例句区块，改在例句库里看。
  const { navigateTarget } = context.actions;
  const readOnly = context.readOnly;
  const { registerNavigator } = referenceGuard;
  useEffect(() => {
    registerNavigator((reference: InboundReferenceV3) => {
      const link = referenceLink(reference);
      if (link.kind === "none") return;
      if (link.kind !== "local_sentence" || readOnly) {
        const href =
          link.kind === "local_sentence" ? link.libraryHref : link.href;
        window.open(href, "_blank", "noopener");
        return;
      }
      setFocusSentence({ senseId: link.senseId, sentenceId: link.sentenceId });
      void navigateTarget({
        step: "meanings",
        node_id: link.senseId,
        field: "sense",
        ...(link.posId ? { pos_id: link.posId } : {}),
        ancestor_node_ids: link.posId ? [link.posId] : []
      });
    });
    return () => registerNavigator(undefined);
  }, [navigateTarget, readOnly, registerNavigator]);
  // 跨词条跳转的深链：?focus_node=<来源节点 id>，加载后定位一次。
  const focusNodeHandledRef = useRef<string | null>(null);
  const focusNode = new URLSearchParams(location.search).get("focus_node");
  const word = context.word;
  useEffect(() => {
    if (!focusNode) {
      focusNodeHandledRef.current = null;
      return;
    }
    if (focusNodeHandledRef.current === focusNode || readOnly) return;
    focusNodeHandledRef.current = focusNode;
    const target = locateV3Node(word, focusNode);
    if (target) void navigateTarget(target);
  }, [focusNode, navigateTarget, readOnly, word]);
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
                    `/words/${context.word.id}/v3/wizard/forms?${new URLSearchParams(
                      {
                        mode: "edit",
                        ...(focusNode ? { focus_node: focusNode } : {})
                      }
                    )}`
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
          <V3MeaningsSlot
            context={context}
            focusSentence={focusSentence}
            onFocusSentenceHandled={() => setFocusSentence(undefined)}
          />
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
  const sharedSentences = useQuery({
    queryKey: ["shared-sentences", "count", wordId, "draft"],
    queryFn: () =>
      api.sentences.list({ view: "draft", entry_id: wordId, page_size: 1 }),
    enabled: !!wordId
  });
  // 归属判定所需；门禁保证受保护页内 profile 必有值，缺失时判定一律不放行。
  const profile = useAuthStore((s) => s.profile);
  const writeActor = profile
    ? { id: profile.id, role: profile.role }
    : undefined;
  const partOfSpeechCatalog = usePartOfSpeechCatalog();
  const location = useLocation();
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
      void queryClient.invalidateQueries({ queryKey: wordKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: wordKeys.stats() });
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
  // 入站引用按 revision 拉：保存成功 revision 就变，索引自然重取；加载失败不阻塞编辑。
  const detailRevision = detail.data?.word.revision;
  const references = useQuery({
    queryKey: ["inbound-references", wordId, detailRevision] as const,
    queryFn: () => requests.inboundReferences(wordId),
    enabled: wordId !== "" && detailRevision !== undefined,
    // 保存后 revision 变了还沿用上一份当占位，免得徽标闪没；但换了词条就不能沿用，
    // 否则新词条的引用到达前会显示、定位到上一个词条的引用。
    placeholderData: (previous) =>
      previous?.entry_id === wordId ? previous : undefined,
    // 在来源词条的标签页解除引用后切回要立刻解锁：全局 staleTime 60s 会让窗口聚焦时不重取。
    staleTime: 0,
    // 只是辅助信息：失败就提示不可用，不用重试拖慢首屏；保存被拦时会再拉。
    retry: false
  });
  const referencesRefetch = references.refetch;
  const referenceNavigatorRef = useRef<
    ((reference: InboundReferenceV3) => void) | undefined
  >(undefined);
  const referenceGuard = useMemo<V3ReferenceGuard>(
    () => ({
      // 聚焦重取偶发失败时还有上一份数据就照常用，不弹「引用信息暂不可用」。
      index: buildReferenceIndex(
        references.data,
        references.data
          ? "loaded"
          : references.isError
            ? "unavailable"
            : "loading"
      ),
      openReference: (reference) => referenceNavigatorRef.current?.(reference),
      refresh: () => void referencesRefetch(),
      registerNavigator: (navigator) => {
        referenceNavigatorRef.current = navigator;
      }
    }),
    [references.data, references.isError, referencesRefetch]
  );

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
  // 别人的未发布草稿是只读的：看得见、改不动（后端 403 entry_edit_forbidden 兜底）。
  const stepAccess = resolveV3StepAccess(
    word,
    requestedStep,
    editingPublished,
    canWriteEntry(writeActor, word)
  );
  const forcePreview = stepAccess.readOnly;
  const legalStep = stepAccess.effective;
  if (step !== legalStep) {
    return (
      <Navigate
        replace
        to={`/words/${word.id}/v3/wizard/${legalStep}${location.search}`}
      />
    );
  }

  return (
    <Flex vertical gap="middle">
      <CreationSourceNotice source={creationSourceFromState(location.state)} />
      {searchParams.get("focus_node") &&
        !locateV3Node(word, searchParams.get("focus_node")!) && (
          <Alert
            showIcon
            type="warning"
            title="引用来源节点已不存在"
            description="该引用来源节点未出现在当前内容中，可能已被删除或修改。请核对当前草稿和发布版本，修复后返回目标词条刷新引用；本提示不代表引用已解除。"
          />
        )}
      <V3ReferenceGuardProvider value={referenceGuard}>
        <V3WordCreationWizard
          key={`${word.id}:activation-${activationGeneration}:${editingPublished ? "edit" : "read"}`}
          allowPublishedEditing={editingPublished}
          initialStep={legalStep}
          initialWord={word}
          sharedSentenceCount={sharedSentences.data?.total ?? 0}
          partOfSpeechCatalog={partOfSpeechCatalog.data}
          prefillNewDraft={
            creationSourceFromState(location.state) !== undefined
          }
          partOfSpeechCatalogError={partOfSpeechCatalog.isError}
          partOfSpeechCatalogPending={partOfSpeechCatalog.isPending}
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
      </V3ReferenceGuardProvider>
    </Flex>
  );
}
