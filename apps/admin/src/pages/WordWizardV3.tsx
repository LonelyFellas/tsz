import {
  Alert as MuiAlert,
  AlertTitle as MuiAlertTitle,
  Button as MuiButton,
  CircularProgress as MuiCircularProgress,
  Stack as MuiStack,
  Typography as MuiTypography
} from "@mui/material";
import {
  ContentEditPermissions,
  useContentEditPermissions,
  onlyTextAssociationsChanged
} from "@/features/dictionary/contentEditPermissions";
import { PronunciationPreviewProvider } from "@/features/dictionary/word-creation/PronunciationPreview";
import { V3ReviewSentences } from "@/features/dictionary/word-creation-v3/V3ReviewSentences";
import { WordSentences } from "@/features/sentences/WordSentences";
import { wordKeys } from "@/features/dictionary/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFeedback } from "@/components/FeedbackProvider";
import { PageStatus } from "@/components/PageStatus";
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
import {
  canModifyEntry,
  canWriteEntry,
  canAssociateEntry,
  canCheckEntry
} from "@/features/dictionary/entryWritePermission";
import { api, useAuthStore, usePermission } from "@/lib/auth";
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
        <MuiAlert severity={"info"}>
          <MuiAlertTitle>{"暂时无法查看关联信息"}</MuiAlertTitle>
          {
            "请刷新页面后重试。你可以继续编辑和保存草稿，发布时系统会再次检查关联内容是否正确。"
          }
        </MuiAlert>
      ) : null}
      {index.stale.length > 0 ? (
        <MuiAlert severity={"error"}>
          <MuiAlertTitle>{`存在 ${index.stale.length} 处关联失效，处理后才能发布`}</MuiAlertTitle>
          {
            <MuiStack direction="column" spacing={0.5}>
              <span>
                以下内容关联的词形或词义已发生变化，请打开对应内容，重新选择或解除关联。你可以继续保存草稿，已发布的内容不受影响；处理完这些关联后才能发布。
              </span>
              <V3ReferenceList
                references={index.stale}
                staleLabel="草稿内不成立"
              />
            </MuiStack>
          }
        </MuiAlert>
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
    <MuiAlert severity={"error"}>
      <MuiAlertTitle>{`本次词形修改会影响 ${references.length} 处关联，处理后才能发布`}</MuiAlertTitle>
      {
        <MuiStack direction="column" spacing={0.5}>
          <span>
            可以先保存草稿，再打开以下关联内容，重新选择或解除关联；处理完成后才能发布。
          </span>
          <V3ReferenceList references={references} staleLabel="将失效" />
        </MuiStack>
      }
    </MuiAlert>
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
      if (intent === "save" && !context.dirtySteps.forms && !bindingsDirty) {
        await context.actions.saveDraft();
        setPendingIntent(undefined);
        return;
      }
      const impact = await context.actions.previewFormsSaveImpact();
      if (!impact) {
        setPendingIntent(undefined);
        return;
      }
      if (!impact.requires_confirmation && !impact.surface_match_page) {
        setPendingIntent(undefined);
        if (intent === "save") await context.actions.saveDraft();
        else await context.actions.saveForms(intent);
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
    if (intent === "save") await context.actions.saveDraft(confirmationContext);
    else await context.actions.saveForms(intent, confirmationContext);
  };

  const resetConfirmation = () => setPendingIntent(undefined);
  return (
    <MuiStack direction="column" spacing={2}>
      <V3ReferenceNotices />
      {conflictNoticeReferences.length > 0 ? (
        <MuiAlert severity={"error"}>
          <MuiAlertTitle>
            {"修改后的拼写与关联内容不一致，处理后才能发布"}
          </MuiAlertTitle>
          {
            <MuiStack direction="column" spacing={0.5}>
              <span>
                可以先保存草稿，再打开以下关联内容，调整文字或重新选择关联词形。处理完成后才能发布，已发布的内容不受草稿修改影响。
              </span>
              <V3ReferenceList references={conflictNoticeReferences} />
            </MuiStack>
          }
        </MuiAlert>
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
        <MuiAlert
          action={
            <MuiStack direction="row" spacing={1}>
              {impactPage &&
              (snapshot.phase === "error" || snapshot.phase === "expired") ? (
                <MuiButton onClick={snapshot.retry}>重新加载影响</MuiButton>
              ) : null}
              <MuiButton onClick={resetConfirmation}>取消</MuiButton>
              <MuiButton
                disabled={Boolean(impactPage) && !terminalPage}
                loading={snapshot.phase === "loading"}
                onClick={() => void confirmAndSave()}
              >
                {pendingIntent === "complete"
                  ? "确认影响并完成词形"
                  : "确认影响并保存草稿"}
              </MuiButton>
            </MuiStack>
          }
          severity={"warning"}
        >
          <MuiAlertTitle>{"保存前请确认影响"}</MuiAlertTitle>
          {
            <MuiStack direction="column" spacing={0.5}>
              <span>
                {impactPage
                  ? `正在核对同形匹配：已加载 ${snapshot.items.length}/${snapshot.total}`
                  : `本次修改会影响 ${context.impact.affected.length} 项关联内容。`}
              </span>
              {summarizeFormsImpact(context.impact.affected).map((group) => (
                <MuiTypography
                  key={group.reason}
                  component="span"
                  color="text.secondary"
                >
                  {group.reasonLabel}：
                  {group.parts
                    .map((part) => `${part.label} ${part.count}`)
                    .join("、")}
                </MuiTypography>
              ))}
            </MuiStack>
          }
        </MuiAlert>
      ) : null}
      <div className="word-step-actions">
        <MuiButton
          disabled={Boolean(pendingIntent)}
          onClick={() => context.setActiveStep("basics")}
        >
          上一步
        </MuiButton>
        <MuiButton
          disabled={
            Boolean(pendingIntent) ||
            (!context.hasUnsavedChanges && !bindingsDirty) ||
            busy
          }
          loading={busy && pendingIntent === "save"}
          onClick={() => void prepareSave("save")}
        >
          保存草稿
        </MuiButton>
        <MuiButton
          disabled={Boolean(pendingIntent)}
          onClick={() => {
            resetConfirmation();
            context.setActiveStep("meanings");
          }}
          variant={"contained"}
        >
          进入词义与例句
        </MuiButton>
      </div>
    </MuiStack>
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
  const permissions = useContentEditPermissions();
  const feedback = useFeedback();
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
      await context.actions.saveMeanings(
        content,
        permissions.edit ? intent : "save"
      );
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
    <MuiStack direction="column" spacing={2}>
      {!permissions.edit && (
        <MuiAlert severity={"info"}>
          {"仅可编辑单词与短语关联，文本、音频及其他内容只读"}
        </MuiAlert>
      )}
      <V3ReferenceNotices />
      <V3BlockedReferencesAlert references={blockedReferences} />
      {surfaceBlocked ? (
        <MuiAlert
          action={
            <MuiStack direction="row" spacing={1}>
              <MuiButton onClick={() => setSurfaceBlocked(false)}>
                知道了
              </MuiButton>
              <MuiButton
                onClick={() => {
                  setSurfaceBlocked(false);
                  context.setActiveStep("forms");
                }}
              >
                去词形与发音
              </MuiButton>
            </MuiStack>
          }
          severity={"warning"}
        >
          <MuiAlertTitle>{"词形变更需要在上一步确认"}</MuiAlertTitle>
          {
            "本次词形改动触发了同形匹配核对，请回到「词形与发音」保存一次并确认，再回来保存词义。"
          }
        </MuiAlert>
      ) : null}
      {pendingIntent && context.impact ? (
        <MuiAlert
          action={
            <MuiStack direction="row" spacing={1}>
              <MuiButton onClick={() => setPendingIntent(undefined)}>
                取 消
              </MuiButton>
              <MuiButton onClick={() => void confirmAndSave()}>
                {pendingIntent === "complete"
                  ? "确认影响并完成"
                  : "确认影响并保存草稿"}
              </MuiButton>
            </MuiStack>
          }
          severity={"warning"}
        >
          <MuiAlertTitle>{"保存前请确认词形影响"}</MuiAlertTitle>
          {
            <MuiStack direction="column" spacing={0.5}>
              <span>{`本次词形修改会影响 ${context.impact.affected.length} 项关联内容。`}</span>
              {summarizeFormsImpact(context.impact.affected).map((group) => (
                <MuiTypography
                  key={group.reason}
                  component="span"
                  color="text.secondary"
                >
                  {group.reasonLabel}：
                  {group.parts
                    .map((part) => `${part.label} ${part.count}`)
                    .join("、")}
                </MuiTypography>
              ))}
            </MuiStack>
          }
        </MuiAlert>
      ) : null}
      <>
        <V3MeaningsAndExamplesStep
          renderSentenceSection={(senseId) => (
            <>
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
            </>
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
              !permissions.edit &&
              !onlyTextAssociationsChanged(context.draftMeanings, next)
            ) {
              void feedback("当前仅有单词与短语关联权限", "warning");
              return;
            }
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
            if (!permissions.edit) return;
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
      </>
    </MuiStack>
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
  const canReadAllSentences = usePermission("sentences.access");
  const canReadPublishedSentences = usePermission("sentences.read_published");
  const canReadSentences = canReadAllSentences || canReadPublishedSentences;
  const sentences = useQuery({
    enabled: canReadSentences,
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
          <MuiButton onClick={onEdit} variant={"contained"}>
            继续编辑
          </MuiButton>
        ) : undefined
      }
      word={word}
    />
  );
}

function V3PreviewSlot({ context }: { context: V3WizardSlotContext }) {
  if (context.hasUnsavedChanges) {
    return (
      <MuiAlert severity={"warning"}>
        <MuiAlertTitle>{"请先保存未保存的草稿"}</MuiAlertTitle>
        {
          "当前预览只显示最近一次已保存内容。请先返回对应步骤保存草稿，再重新检查发布条件。"
        }
      </MuiAlert>
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
  const profile = useAuthStore((state) => state.profile);
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
      <MuiStack direction="column" spacing={2}>
        {canCheckEntry(profile) && !canModifyEntry(profile, context.word) ? (
          <V3PreviewAndPublishStep
            word={context.word}
            requests={requests}
            onPublished={onActivated}
          />
        ) : (
          <V3ReadOnlyPreview
            word={context.word}
            onEdit={
              canModifyEntry(profile, context.word) &&
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
        )}
        <V3PublicationHistory
          currentWord={context.word}
          onActivated={onActivated}
          onCanonicalRefreshed={onActivated}
          requests={requests}
        />
      </MuiStack>
    );
  }

  switch (context.activeStep) {
    case "basics":
      return <V3BasicsSlot context={context} />;
    case "forms":
      return canWriteEntry(profile, context.word) ? (
        <V3FormsSlot context={context} />
      ) : (
        <MuiStack direction="column" spacing={2}>
          <MuiAlert severity={"info"}>{"当前仅有单词与短语关联权限"}</MuiAlert>
          <MuiButton onClick={() => context.setActiveStep("meanings")}>
            进入词义与例句关联
          </MuiButton>
        </MuiStack>
      );
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
        <MuiStack direction="column" spacing={2}>
          <V3PreviewSlot context={context} />
          <V3PublicationHistory
            activationBlockedByUnsavedChanges={context.hasUnsavedChanges}
            currentWord={context.word}
            onActivated={onActivated}
            onCanonicalRefreshed={onActivated}
            requests={requests}
          />
        </MuiStack>
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
  const canReadSentences = usePermission("sentences.access");
  const { wordId = "", step } = useParams();
  const sharedSentences = useQuery({
    queryKey: ["shared-sentences", "count", wordId, "draft"],
    queryFn: () =>
      api.sentences.list({ view: "draft", entry_id: wordId, page_size: 1 }),
    enabled: !!wordId && canReadSentences
  });
  // 归属判定所需；门禁保证受保护页内 profile 必有值，缺失时判定一律不放行。
  const profile = useAuthStore((s) => s.profile);
  const writeActor = profile;
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
      <MuiStack
        style={{ minHeight: 420 }}
        direction="row"
        alignItems={"center"}
        justifyContent={"center"}
      >
        <MuiCircularProgress aria-label="正在加载词条" size={40} />
      </MuiStack>
    );
  }
  if (detail.isError || !detail.data) {
    const presentation = presentV3DetailError(detail.error);
    return (
      <PageStatus
        title={presentation.title}
        description={presentation.description}
        action={
          presentation.retryable ? (
            <MuiButton
              onClick={() => void detail.refetch()}
              variant={"contained"}
            >
              重试
            </MuiButton>
          ) : undefined
        }
      />
    );
  }

  const word = detail.data.word;
  const editingPublished =
    word.status === "published" && searchParams.get("mode") === "edit";
  const requestedStep = isStep(step) ? step : word.max_reachable_step;
  const stepAccess = resolveV3StepAccess(
    word,
    requestedStep,
    editingPublished,
    canModifyEntry(writeActor, word)
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
    <MuiStack direction="column" spacing={2}>
      <CreationSourceNotice source={creationSourceFromState(location.state)} />
      {searchParams.get("focus_node") &&
        !locateV3Node(word, searchParams.get("focus_node")!) && (
          <MuiAlert severity={"warning"}>
            <MuiAlertTitle>{"未找到关联来源内容"}</MuiAlertTitle>
            {
              "来源内容可能已被删除或修改，但关联不一定已解除。请检查来源词条的草稿和已发布内容，重新选择或解除关联后，返回本词条刷新页面。"
            }
          </MuiAlert>
        )}
      <ContentEditPermissions
        value={{
          edit: canWriteEntry(writeActor, word),
          associate: canAssociateEntry(writeActor, word)
        }}
      >
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
            contentEditing={canWriteEntry(writeActor, word)}
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
      </ContentEditPermissions>
    </MuiStack>
  );
}
