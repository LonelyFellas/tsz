import { localizedCatalogName } from "../../part-of-speech/catalog";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { regionalVariants } from "@tsz/shared";
import { boundFormGroupIds, setFormGroupBindings } from "../meaningsModel";
import {
  Alert,
  Badge,
  Empty,
  Flex,
  Space,
  Typography
} from "@tsz/ui/admin/display";
import { AdminControls, useAdminDisabled } from "@tsz/ui/admin/context";
import type {
  Dialect,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  FormGroupScopeV3,
  PartOfSpeechCatalogItem,
  PartOfSpeechCatalogResponse,
  WordPosFormsV3,
  WordFormGroupV3,
  V3DraftValidationIssue,
  WordEntryKindV3,
  SharedFormsStepContentV3,
  RetiredContentSlotV3,
  RetiredStableNodeV3
} from "@tsz/types";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { partOfSpeechDataSource } from "../../dataSource";
import { newWordNodeId } from "../../word-model/primitives";
import {
  addPartOfSpeech,
  deletePartOfSpeech,
  fillFormTypeTemplate,
  reorderPos,
  updateFormGroupScope,
  type V3IdFactory,
  type V3StableVariantIdFactory
} from "../operations";
import { V3FormGroupSenseEditor } from "./V3FormGroupSenseEditor";
import { countFormGroupBindings } from "../meaningsModel";
import { V3BasicPosTabs } from "./V3BasicPosTabs";
import { V3PosTab } from "./V3PosTab";
import { V3ReferenceBadge } from "./V3ReferenceBadge";
import { posNodeIds, posReferenceCount } from "../referenceGuard";
import {
  referenceBlockedHint,
  useV3ReferenceGuard
} from "../referenceGuardContext";
import { V3AddBasicPosSelect } from "./V3AddBasicPosSelect";
import { partOfSpeechLabel } from "../presentation";
import { countV3PosFormIncomplete } from "../posCompletion";
import {
  PronunciationPreviewProvider,
  usePronunciationVoiceNotice
} from "../../word-creation/PronunciationPreview";
import "../v3-forms.css";
import { useSortableRows } from "../sortableRows";
import { V3FormContentModal } from "./V3FormContentModal";
import { V3FormsAudioTasks } from "./V3FormsAudioTasks";
import { V3FormCopyProvider } from "./V3FormCopyProvider";
import {
  applyFormsStructure,
  type createPronunciationReferenceIds
} from "../sharedFormsModel";
import { applyDefaultFormSharing } from "../defaultFormSharing";
import { v3IssueMessages } from "../presentationErrors";
import { useVoiceAudioTasks, useVoiceSave } from "../voiceSaveContext";

/** 只接受本编辑器发出的词性拖动，避免把外部拖入的内容当成排序。 */
const POS_DRAG_TYPE = "application/x-tsz-v3-pos";

interface PartOfSpeechCatalogState {
  data?: PartOfSpeechCatalogResponse;
  isError: boolean;
  isPending: boolean;
}

export interface V3FormsAndPronunciationStepProps {
  sharedForms?: SharedFormsStepContentV3;
  contentReassignmentAvailable?: boolean;
  multipleSpellingsAvailable?: boolean;
  savedContentIds?: ReadonlySet<string>;
  onSharedFormsChange?: (next: SharedFormsStepContentV3) => void;
  retiredContentSlots?: readonly RetiredContentSlotV3[];
  retiredStableNodes?: readonly RetiredStableNodeV3[];
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
  value: DraftFormsStepContentV3;
  onChange: (next: DraftFormsStepContentV3) => void;
  /** 词条是单词还是短语；决定「添加基本词性」只列哪一侧。 */
  entryKind?: WordEntryKindV3;
  partOfSpeechCatalog?: PartOfSpeechCatalogState;
  /** 是否显示无词性草稿提示；新版智能词库由上方入口直接引导。 */
  showEmptyPosHint?: boolean;
  emptyAddPosButton?: boolean;
  showPronunciationGuide?: boolean;
  deletePosDescription?: ReactNode;
  activePosId?: string;
  onActivePosChange?: (posId: string) => void;
  issues?: readonly V3DraftValidationIssue[];
  idFactory?: V3IdFactory;
  stableVariantIds?: V3StableVariantIdFactory;
  pronunciationReferenceIds?: ReturnType<
    typeof createPronunciationReferenceIds
  >;
  /** 变化组 id → 词义步里绑定它的词义数；组卡片据此提示专用组的影响面。 */
  formGroupBindingCounts?: ReadonlyMap<string, number>;
  meanings?: DraftMeaningsStepContentWritableV3;
  savedSenseIds?: ReadonlySet<string>;
  bindingEditingAvailable?: boolean;
  onMeaningsChange?: (meanings: DraftMeaningsStepContentWritableV3) => void;
  onGoToMeanings?: (posId: string) => void;
  loadVoiceCatalogOnMount?: boolean;
}

function V3VoiceNotice({ value }: { value: DraftFormsStepContentV3 }) {
  const { t } = useLexiconEditorTranslation();
  const dialects = Array.from(
    new Set<Dialect>(
      value.pos.flatMap((pos) =>
        pos.forms.flatMap((form) =>
          regionalVariants(form.regional_variants).map((row) => row.dialect)
        )
      )
    )
  );
  const notice = usePronunciationVoiceNotice(dialects);
  return notice ? (
    <Alert
      description={
        notice.kind === "missing" ? t("voice_unavailable_help") : undefined
      }
      showIcon
      title={notice.title}
      type="warning"
    />
  ) : null;
}

export function V3FormsAndPronunciationStep({
  sharedForms,
  contentReassignmentAvailable = false,
  multipleSpellingsAvailable = false,
  savedContentIds,
  onSharedFormsChange,
  retiredContentSlots = [],
  retiredStableNodes = [],
  registerLeaveGuard,
  value,
  onChange,
  entryKind,
  partOfSpeechCatalog,
  showEmptyPosHint = true,
  emptyAddPosButton = false,
  showPronunciationGuide = true,
  deletePosDescription,
  activePosId,
  onActivePosChange,
  issues = [],
  idFactory = newWordNodeId,
  stableVariantIds,
  pronunciationReferenceIds,
  formGroupBindingCounts,
  meanings,
  savedSenseIds,
  bindingEditingAvailable = true,
  onMeaningsChange,
  onGoToMeanings,
  loadVoiceCatalogOnMount = true
}: V3FormsAndPronunciationStepProps) {
  const { t, i18n } = useLexiconEditorTranslation();
  const componentDisabled = useAdminDisabled();
  const [editingFormId, setEditingFormId] = useState<string>();
  const [audioGenerationRequested, setAudioGenerationRequested] =
    useState(false);
  const [audioTaskVersion, setAudioTaskVersion] = useState(0);
  const notifyAudioTaskRetry = useCallback(
    () => setAudioTaskVersion((version) => version + 1),
    []
  );
  const voiceAudioTasks = useVoiceAudioTasks();
  const voiceSave = useVoiceSave();
  const voiceAudioTasksRef = useRef(voiceAudioTasks);
  const voiceSaveRef = useRef(voiceSave);
  voiceAudioTasksRef.current = voiceAudioTasks;
  voiceSaveRef.current = voiceSave;
  useEffect(() => {
    if (!audioGenerationRequested) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      const tasks = [...(voiceAudioTasksRef.current?.values() ?? [])];
      if (!tasks.length) {
        setAudioGenerationRequested(false);
        return;
      }
      for (const wait of tasks) {
        if (!(await wait())) return;
      }
      if (cancelled) return;
      await voiceSaveRef.current?.saveAudio?.();
      if (!cancelled) setAudioGenerationRequested(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [audioGenerationRequested, audioTaskVersion]);
  const editingTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (editingFormId) return;
    if (editingTrigger.current?.isConnected)
      editingTrigger.current.focus({ preventScroll: true });
    editingTrigger.current = null;
  }, [editingFormId]);
  const sharedCounts = new Map<string, number>();
  if (sharedForms) {
    const counts = new Map<string, number>();
    for (const pos of sharedForms.pos)
      for (const form of pos.forms)
        counts.set(form.content_id, (counts.get(form.content_id) ?? 0) + 1);
    for (const pos of sharedForms.pos)
      for (const form of pos.forms)
        sharedCounts.set(form.id, counts.get(form.content_id)!);
  }
  const formIssues = sharedForms
    ? issues.flatMap((issue) => {
        const location = issue.node_location;
        if (!location.content_id || location.form_id) return [issue];
        return sharedForms.pos.flatMap((pos) =>
          pos.forms
            .filter((form) => form.content_id === location.content_id)
            .map((form) => ({
              ...issue,
              node_location: {
                ...location,
                pos_id: pos.pos_id,
                form_id: form.id
              }
            }))
        );
      })
    : issues;
  const unscopedIssueMessages = v3IssueMessages(
    formIssues.filter((issue) => !issue.node_location.form_id),
    t
  );
  const [bindingGroup, setBindingGroup] = useState<{
    posId: string;
    groupId: string;
  }>();
  const bindingCounts = meanings
    ? countFormGroupBindings(meanings)
    : formGroupBindingCounts;
  const applyBindings = (
    posId: string,
    groupId: string,
    scope: FormGroupScopeV3,
    senseIds: string[]
  ) => {
    if (!meanings || !onMeaningsChange) return;
    const nextForms = updateFormGroupScope(value, posId, groupId, scope);
    if (!nextForms.ok) return;
    const nextMeanings = structuredClone(meanings);
    const pos = nextMeanings.pos.find((item) => item.pos_id === posId);
    if (
      !pos ||
      (scope === "dedicated" &&
        (senseIds.length === 0 ||
          senseIds.some((id) => !pos.senses.some((sense) => sense.id === id))))
    )
      return;
    for (const sense of pos.senses) {
      const ids = boundFormGroupIds(sense).filter((id) => id !== groupId);
      if (scope === "dedicated" && senseIds.includes(sense.id))
        ids.push(groupId);
      if (ids.length || boundFormGroupIds(sense).includes(groupId)) {
        setFormGroupBindings(sense, ids);
      }
    }
    onChange(nextForms.value);
    onMeaningsChange(nextMeanings);
    setBindingGroup(undefined);
  };
  const renderGroupSenses = (pos: WordPosFormsV3, group: WordFormGroupV3) => {
    const senses =
      meanings?.pos.find((item) => item.pos_id === pos.pos_id)?.senses ?? [];
    const editing =
      bindingGroup?.posId === pos.pos_id && bindingGroup.groupId === group.id;
    if (editing && bindingEditingAvailable)
      return (
        <V3FormGroupSenseEditor
          key={group.id}
          pos={pos}
          group={group}
          senses={senses}
          savedSenseIds={savedSenseIds}
          onCancel={() => setBindingGroup(undefined)}
          onConfirm={(ids) =>
            applyBindings(pos.pos_id, group.id, "dedicated", ids)
          }
          onRestoreGeneral={() =>
            applyBindings(pos.pos_id, group.id, "general", [])
          }
          onGoToMeanings={
            onGoToMeanings
              ? () => {
                  setBindingGroup(undefined);
                  onGoToMeanings(pos.pos_id);
                }
              : undefined
          }
        />
      );
    return null;
  };

  const [localCatalog, setLocalCatalog] = useState<PartOfSpeechCatalogState>({
    isError: false,
    isPending: true
  });
  const fetchLocalCatalog = partOfSpeechCatalog === undefined;
  const catalog = partOfSpeechCatalog ?? localCatalog;
  useEffect(() => {
    if (!fetchLocalCatalog) return;
    let cancelled = false;
    void partOfSpeechDataSource
      .catalog()
      .then((data) => {
        if (!cancelled)
          setLocalCatalog({ data, isError: false, isPending: false });
      })
      .catch(() => {
        if (!cancelled) setLocalCatalog({ isError: true, isPending: false });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchLocalCatalog]);
  const addPos = (item: PartOfSpeechCatalogItem) => {
    const result = addPartOfSpeech(value, item, idFactory);
    if (!result.ok) return;
    const added = result.value.pos.at(-1)!;
    // 手动加的词性也按该词性的配置铺一遍「新建模板」，省得逐个「添加派生词形」。
    const filled = fillFormTypeTemplate(
      result.value,
      catalog.data?.items,
      idFactory,
      added.pos_id
    );
    if (sharedForms && onSharedFormsChange) {
      const next = applyFormsStructure(
        sharedForms,
        filled
      ) as SharedFormsStepContentV3;
      onSharedFormsChange(
        applyDefaultFormSharing(
          next,
          catalog.data,
          new Set(filled.pos.at(-1)!.forms.map((form) => form.id))
        )
      );
    } else onChange(filled);
    onActivePosChange?.(added.pos_id);
  };

  const referenceGuard = useV3ReferenceGuard();
  const deletePos = (posId: string) => {
    const index = value.pos.findIndex((pos) => pos.pos_id === posId);
    const result = deletePartOfSpeech(value, posId);
    if (!result.ok) return;
    onChange(result.value);
    if (activePosId === posId) {
      const next =
        result.value.pos[Math.min(index, result.value.pos.length - 1)];
      if (next) onActivePosChange?.(next.pos_id);
    }
  };

  const showEmptyAddButton = emptyAddPosButton && value.pos.length === 0;
  const addPosSelect = (
    <V3AddBasicPosSelect
      buttonTrigger={showEmptyAddButton}
      compact={value.pos.length > 0}
      catalog={catalog.data}
      entryKind={entryKind}
      forms={value}
      isError={catalog.isError}
      isPending={catalog.isPending}
      onAdd={addPos}
    />
  );

  // 词性标签拖动排序，与词义步的语义区间／释义／例句共用同一套拖放内核。
  // 事件挂在自己渲染的 label 容器上，不走 Tabs 的 renderTabBar——那要依赖 rc-tabs 的内部
  // render prop 约定，antd 小版本一动就可能静默失效。
  const posSorting = useSortableRows({
    items: value.pos,
    scopeId: "v3-pos-tabs",
    dragType: POS_DRAG_TYPE,
    onChange: (next) =>
      onChange(
        reorderPos(
          value,
          next.map((pos) => pos.pos_id)
        )
      )
  });

  const emptyPosPanel = (
    <div className="word-forms-tabs-empty">
      <Empty
        className="word-forms-tabs-empty-content"

        description={
          <Space orientation="vertical" size={4}>
            <Typography.Text strong>{t("no_pos")}</Typography.Text>
            {showEmptyPosHint && (
              <Typography.Text type="secondary">
                {t("draft_no_pos")}
              </Typography.Text>
            )}
            <Typography.Text type="secondary">
              {t("add_pos_help")}
            </Typography.Text>
          </Space>
        }
      />
    </div>
  );
  const tabItems =
    value.pos.length === 0
      ? [
          {
            key: "empty",
            label: t("pos"),
            disabled: true,
            children: emptyPosPanel
          }
        ]
      : value.pos.map((pos) => {
          const catalogItem = catalog.data?.items.find(
            (item) => item.code === pos.pos
          );
          const label = catalogItem
            ? localizedCatalogName(catalogItem, i18n.language)
            : partOfSpeechLabel(pos.pos);
          const posReferences = posReferenceCount(referenceGuard.index, pos);
          return {
            key: pos.pos_id,
            label,
            posId: pos.pos_id,
            badges: (
              <>
                <Badge
                  count={countV3PosFormIncomplete(pos)}
                  size="small"
                  title={t("pos_issues")}
                />
                <V3ReferenceBadge label={label} nodeIds={posNodeIds(pos)} />
              </>
            ),
            remove:
              value.pos.length > 1
                ? {
                    onConfirm: () => deletePos(pos.pos_id),
                    hint:
                      posReferences > 0
                        ? referenceBlockedHint(posReferences, t)
                        : undefined
                  }
                : undefined,
            children: (
              <V3PosTab
                sharedCounts={sharedForms ? sharedCounts : undefined}
                onEditContent={
                  sharedForms
                    ? (id) => {
                        editingTrigger.current =
                          document.activeElement instanceof HTMLElement
                            ? document.activeElement
                            : null;
                        setEditingFormId(id);
                      }
                    : undefined
                }
                content={value}
                formGroupBindingCounts={bindingCounts}
                renderGroupSenses={(group) => renderGroupSenses(pos, group)}
                onCloseGroupSenses={() => setBindingGroup(undefined)}
                editingGroupId={
                  bindingGroup?.posId === pos.pos_id
                    ? bindingGroup.groupId
                    : undefined
                }
                onEditGroupSenses={
                  bindingEditingAvailable
                    ? (groupId) =>
                        setBindingGroup({ posId: pos.pos_id, groupId })
                    : undefined
                }
                idFactory={idFactory}
                issues={formIssues}
                onChange={onChange}
                pos={pos}
                stableVariantIds={stableVariantIds}
                formTypes={catalog.data?.form_types}
                posCatalog={catalog.data?.items.find(
                  (item) => item.code === pos.pos
                )}
              />
            )
          };
        });

  const editor = (
    <>
      {sharedForms && onSharedFormsChange && (
        <V3FormsAudioTasks
          forms={sharedForms}
          paused={!!editingFormId || value.pos.length === 0}
          onChange={onSharedFormsChange}
          onAudioTaskRetry={notifyAudioTaskRetry}
          loadCatalogOnMount={
            loadVoiceCatalogOnMount || audioGenerationRequested
          }
        />
      )}
      {editingFormId &&
        sharedForms &&
        onSharedFormsChange &&
        stableVariantIds && (
          <AdminControls componentDisabled={componentDisabled}>
            <V3FormContentModal
              key={editingFormId}
              catalog={catalog.data}
              forms={sharedForms}
              contentReassignmentAvailable={contentReassignmentAvailable}
              multipleSpellingsAvailable={multipleSpellingsAvailable}
              savedContentIds={savedContentIds}
              formId={editingFormId}
              issues={issues}
              stableVariantIds={stableVariantIds}
              pronunciationReferenceIds={pronunciationReferenceIds}
              retiredContentSlots={retiredContentSlots}
              retiredStableNodes={retiredStableNodes}
              registerLeaveGuard={registerLeaveGuard}
              onApply={onSharedFormsChange}
              loadCatalogOnMount={loadVoiceCatalogOnMount}
              onRequestAudioGeneration={() => setAudioGenerationRequested(true)}
              onCancel={() => setEditingFormId(undefined)}
              onConfirm={(next) => {
                onSharedFormsChange(next);
                setEditingFormId(undefined);
              }}
            />
          </AdminControls>
        )}
      <fieldset
        className="v3-forms-reference"
        disabled={!!editingFormId}
        onClickCapture={(event) => {
          if (!editingFormId) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onDragStartCapture={(event) => {
          if (editingFormId) event.preventDefault();
        }}
      >
        <Flex className="v3-forms-step" vertical gap="middle">
          <div className="word-step-heading">
            <span className="word-step-number">STEP 02</span>
            <Typography.Title level={2} style={{ margin: 0 }}>
              {t("forms_title")}
            </Typography.Title>
            {showPronunciationGuide && (
              <details className="v3-pronunciation-guide">
                <summary>{t("pronunciation_help_title")}</summary>
                <p>{t("pronunciation_help")}</p>
              </details>
            )}
          </div>
          <V3VoiceNotice value={value} />
          {catalog.isError && (
            <Alert showIcon title={t("catalog_unavailable")} type="error" />
          )}
          {unscopedIssueMessages.length > 0 && (
            <Alert
              description={
                <Space orientation="vertical" size={4}>
                  {unscopedIssueMessages.map((message) => (
                    <span key={message}>{message}</span>
                  ))}
                </Space>
              }
              showIcon
              title={t("pending_fields")}
              type="warning"
            />
          )}
          <V3BasicPosTabs
            activeKey={value.pos.length === 0 ? "empty" : activePosId}
            addControl={addPosSelect}
            className="word-forms-tabs"
            deleteDescription={deletePosDescription}
            emptyToolbar={showEmptyAddButton}
            items={tabItems}
            key={value.pos.map((pos) => pos.pos_id).join(":")}
            onChange={onActivePosChange}
            sorting={posSorting}
          />
        </Flex>
      </fieldset>
    </>
  );
  return (
    <PronunciationPreviewProvider>
      {sharedForms && onSharedFormsChange ? (
        <AdminControls componentDisabled={editingFormId ? true : undefined}>
          <V3FormCopyProvider
            forms={sharedForms}
            onChange={onSharedFormsChange}
          >
            {editor}
          </V3FormCopyProvider>
        </AdminControls>
      ) : (
        editor
      )}
    </PronunciationPreviewProvider>
  );
}
