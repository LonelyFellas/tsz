import { localizedCatalogName } from "../../part-of-speech/catalog";
import {
  useLexiconEditorTranslation,
  LexiconEditorText
} from "@/features/dictionary/i18n/editor";
import { regionalVariants } from "@tsz/shared";
import { boundFormGroupIds, setFormGroupBindings } from "../meaningsModel";
import { CircleMinusIcon } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Empty,
  Flex,
  Space,
  Tabs,
  Typography
} from "@tsz/ui/admin/display";
import { App, Tooltip } from "@tsz/ui/admin/overlays";
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
import { useEffect, useState } from "react";
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
import "../posTabs.css";
import {
  sortableRowClass,
  sortableTabOffset,
  useSortableRows
} from "../sortableRows";
import { SortableDragHandle } from "./SortableDragHandle";
import { V3FormContentModal } from "./V3FormContentModal";
import { V3FormCopyProvider } from "./V3FormCopyProvider";
import type { createPronunciationReferenceIds } from "../sharedFormsModel";

/** 只接受本编辑器发出的词性拖动，避免把外部拖入的内容当成排序。 */
const POS_DRAG_TYPE = "application/x-tsz-v3-pos";

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
      description={t("voice_unavailable_help")}
      showIcon
      title={notice}
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
  onGoToMeanings
}: V3FormsAndPronunciationStepProps) {
  const { t, i18n } = useLexiconEditorTranslation();
  const { modal } = App.useApp();
  const [editingFormId, setEditingFormId] = useState<string>();
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

  const [catalog, setCatalog] = useState<{
    data?: PartOfSpeechCatalogResponse;
    isError: boolean;
    isPending: boolean;
  }>({ isError: false, isPending: true });
  useEffect(() => {
    let cancelled = false;
    void partOfSpeechDataSource
      .catalog()
      .then((data) => {
        if (!cancelled) setCatalog({ data, isError: false, isPending: false });
      })
      .catch(() => {
        if (!cancelled) setCatalog({ isError: true, isPending: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const addPos = (item: PartOfSpeechCatalogItem) => {
    const result = addPartOfSpeech(value, item, idFactory);
    if (!result.ok) return;
    const added = result.value.pos.at(-1)!;
    // 手动加的词性也按该词性的配置铺一遍「新建模板」，省得逐个「添加派生词形」。
    onChange(
      fillFormTypeTemplate(
        result.value,
        catalog.data?.items,
        idFactory,
        added.pos_id
      )
    );
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

  const addPosSelect = (
    <V3AddBasicPosSelect
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

  const tabItems =
    value.pos.length === 0
      ? [
          {
            key: "empty",
            label: t("pos"),
            disabled: true,
            children: (
              <div className="word-forms-tabs-empty">
                <Empty
                  className="word-forms-tabs-empty-content"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Space orientation="vertical" size={4}>
                      <Typography.Text strong>{t("no_pos")}</Typography.Text>
                      <Typography.Text type="secondary">
                        {t("draft_no_pos")}
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        {t("add_pos_help")}
                      </Typography.Text>
                    </Space>
                  }
                />
              </div>
            )
          }
        ]
      : value.pos.map((pos, posIndex) => {
          const catalogItem = catalog.data?.items.find(
            (item) => item.code === pos.pos
          );
          const label = catalogItem
            ? localizedCatalogName(catalogItem, i18n.language)
            : partOfSpeechLabel(pos.pos);
          const posReferences = posReferenceCount(referenceGuard.index, pos);
          return {
            key: pos.pos_id,
            label: (
              <span
                className={sortableRowClass(
                  "word-pos-tab-handle",
                  posSorting,
                  posIndex
                )}
                data-pos-id={pos.pos_id}
                onDragLeave={posSorting.handleDragLeave}
                onDragOver={(event) =>
                  posSorting.handleDragOver(event, posIndex)
                }
                onDrop={(event) => posSorting.handleDrop(event, posIndex)}
              >
                <span
                  className="word-pos-tab-content"
                  style={{
                    transform: `translateX(${sortableTabOffset(posSorting, posIndex)}px)`
                  }}
                >
                  <SortableDragHandle
                    dragImageSelector=".word-pos-tab-handle"
                    index={posIndex}
                    label={t("drag_item", { label: label })}
                    singleItemTitle={t("two_pos_required")}
                    sorting={posSorting}
                  />
                  <span className="word-pos-tab-label">
                    <strong>{label}</strong>
                    <Badge
                      count={countV3PosFormIncomplete(pos)}
                      size="small"
                      title={t("pos_issues")}
                    />
                    <V3ReferenceBadge label={label} nodeIds={posNodeIds(pos)} />
                  </span>
                  <span
                    className="word-pos-tab-actions"
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {addPosSelect}
                    {value.pos.length > 1 ? (
                      <Tooltip
                        title={
                          posReferences > 0
                            ? referenceBlockedHint(posReferences, t)
                            : undefined
                        }
                      >
                        <Button
                          aria-label={t("delete_item", { label: label })}
                          danger
                          icon={<CircleMinusIcon />}
                          onClick={(event) => {
                            event.stopPropagation();
                            modal.confirm({
                              title: (
                                <LexiconEditorText
                                  message="delete_pos_title"
                                  params={{ label: label }}
                                />
                              ),
                              content: (
                                <LexiconEditorText message="remove_pos_impact" />
                              ),
                              okText: <LexiconEditorText message="delete" />,
                              okButtonProps: { danger: true },
                              onOk: () => deletePos(pos.pos_id)
                            });
                          }}
                          size="small"
                          type="text"
                        />
                      </Tooltip>
                    ) : null}
                  </span>
                </span>
              </span>
            ),
            children: (
              <V3PosTab
                sharedCounts={sharedForms ? sharedCounts : undefined}
                onEditContent={sharedForms ? setEditingFormId : undefined}
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
      {editingFormId &&
        sharedForms &&
        onSharedFormsChange &&
        stableVariantIds && (
          <V3FormContentModal
            key={editingFormId}
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
            onCancel={() => setEditingFormId(undefined)}
            onConfirm={(next) => {
              onSharedFormsChange(next);
              setEditingFormId(undefined);
            }}
          />
        )}
      <Flex className="v3-forms-step" vertical gap="middle">
        <div className="word-step-heading">
          <span className="word-step-number">STEP 02</span>
          <Typography.Title level={2} style={{ margin: 0 }}>
            {t("forms_title")}
          </Typography.Title>
          <Typography.Paragraph className="word-step-description">
            {t("forms_help")}
          </Typography.Paragraph>
          <details className="v3-pronunciation-guide">
            <summary>{t("pronunciation_help_title")}</summary>
            <p>{t("pronunciation_help")}</p>
          </details>
        </div>
        <V3VoiceNotice value={value} />
        {issues.length > 0 && (
          <Alert
            description={t("validation_help")}
            showIcon
            title={t("forms_incomplete")}
            type="warning"
          />
        )}
        {catalog.isError && (
          <Alert showIcon title={t("catalog_unavailable")} type="error" />
        )}
        <Tabs
          activeKey={value.pos.length === 0 ? "empty" : activePosId}
          className="word-pos-tabs word-forms-tabs"
          key={value.pos.map((pos) => pos.pos_id).join(":")}
          onChange={onActivePosChange}
          items={tabItems}
          tabBarExtraContent={value.pos.length === 0 ? addPosSelect : undefined}
        />
      </Flex>
    </>
  );
  return (
    <PronunciationPreviewProvider>
      {sharedForms && onSharedFormsChange ? (
        <V3FormCopyProvider forms={sharedForms} onChange={onSharedFormsChange}>
          {editor}
        </V3FormCopyProvider>
      ) : (
        editor
      )}
    </PronunciationPreviewProvider>
  );
}
