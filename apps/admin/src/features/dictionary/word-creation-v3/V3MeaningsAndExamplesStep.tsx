import { boundFormGroupIds } from "./meaningsModel";
import {
  DEFINITION_MODE_BY_PARTS,
  definitionLanguageOf,
  definitionStyleOf,
  definitionsStillDefault,
  definitionModeRemovesEnglishSettings,
  senseNeedsDeleteConfirmation,
  withDefinitionMode,
  type DefinitionLanguageV3,
  type DefinitionModeV3,
  type DefinitionStyleV3
} from "./definitionModel";
import { toRichTextV2 } from "@tsz/voice-editor/core";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { PronunciationPreviewProvider } from "../word-creation/PronunciationPreview";
import {
  CaretDownFilled,
  CaretUpFilled,
  CopyOutlined,
  DeleteOutlined,
  MinusCircleOutlined,
  PlusOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Collapse,
  Empty,
  Flex,
  Input,
  InputNumber,
  Modal,
  Popover,
  Select,
  type SelectProps,
  Space,
  Switch,
  Tag,
  Tabs,
  Tooltip,
  Typography
} from "antd";
import type {
  Dialect,
  DialectModeV3,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  EnglishTextV3,
  GrammarStructureV3,
  PartOfSpeechCatalogResponse,
  StepSaveIntent,
  V3DraftValidationIssue,
  WordDefinitionV3,
  WordEntryKindV3,
  WordSenseWritableV3
} from "@tsz/types";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { groupRelations } from "./relationGroups";
import { CEFR_OPTIONS } from "../labels";
import { newWordNodeId } from "../word-model/primitives";
import { addPartOfSpeech, deletePartOfSpeech } from "./operations";
import {
  DEFAULT_SENSE_LEVEL,
  defaultDefinitions,
  definitionSummary,
  editableEnglishText,
  newDefinition,
  newGrammarStructure,
  replaceRichText,
  spellingModeForPos,
  type RelationDisplaySnapshots
} from "./meaningsModel";
import { dialectLabel, partOfSpeechLabel } from "./presentation";
import {
  sortableRowClass,
  useSortableRows,
  type SortableRowsController
} from "./sortableRows";
import { SortableDragHandle } from "./components/SortableDragHandle";
import { V3RowIndex } from "./components/V3RowIndex";
import { V3StepActions } from "./components/V3StepActions";
import { V3EditorTitle } from "./components/V3EditorTitle";
import { reorderPos } from "./operations";
import "./posTabs.css";
import { v3IssueMessage } from "./presentationErrors";
import { countV3PosMeaningIncomplete } from "./posCompletion";
import { V3GrammarVoiceTextField } from "./components/V3GrammarVoiceTextField";
import { V3LinkedEnglishTextField } from "./components/V3LinkedEnglishTextField";
import { V3AddBasicPosSelect } from "./components/V3AddBasicPosSelect";
import {
  baseSpellingForPos,
  reachableUsageCount,
  V3PhraseComponentUsagesCard
} from "./components/V3PhraseComponentUsagesCard";
import { V3ReferenceBadge } from "./components/V3ReferenceBadge";
import { V3RelationsGrid } from "./components/V3RelationsGrid";
import {
  SenseSectionBody,
  SenseSectionTitle
} from "./components/V3SenseSection";
import {
  nodesBlockingReferenceCount,
  posNodeIds,
  senseReferenceCount
} from "./referenceGuard";
import {
  referenceBlockedHint,
  useV3ReferenceGuard
} from "./referenceGuardContext";

export interface V3MeaningsAndExamplesStepProps {
  value: DraftMeaningsStepContentWritableV3;
  onChange: (next: DraftMeaningsStepContentWritableV3) => void;
  onSave?: (
    content: DraftMeaningsStepContentWritableV3,
    intent: StepSaveIntent
  ) => Promise<void>;
  onPrevious?: () => void;
  renderSentenceSection?: (senseId: string) => ReactNode;
  saving?: boolean;
  canSave?: boolean;
  issues?: readonly V3DraftValidationIssue[];
  activePosId?: string;
  wordId?: string;
  forms?: DraftFormsStepContentV3;
  partOfSpeechCatalog?: PartOfSpeechCatalogResponse;
  partOfSpeechCatalogError?: boolean;
  partOfSpeechCatalogPending?: boolean;
  onFormsChange?: (next: DraftFormsStepContentV3) => void;
  onActivePosChange?: (posId: string) => void;
  entryKind?: WordEntryKindV3;
  idFactory?: () => string;
  relationDisplaySnapshots?: RelationDisplaySnapshots;
  /** 后端释义级成分用词能力（capabilities.sense_component_usages）；关闭时成分区块只读、不发送。 */
  componentUsagesEnabled?: boolean;
  textLinksEnabled?: boolean;
}

function fieldIssue(
  issues: readonly V3DraftValidationIssue[],
  nodeId: string,
  field: string
) {
  return issues.find(
    (issue) => issue.node_id === nodeId && issue.field === field
  );
}

function FieldIssueHelp({ issue }: { issue?: V3DraftValidationIssue }) {
  return issue ? (
    <Typography.Text className="word-field-help" type="danger">
      {v3IssueMessage(issue)}
    </Typography.Text>
  ) : null;
}

function definitionContentIssue(
  issues: readonly V3DraftValidationIssue[],
  definition: WordDefinitionV3
) {
  if (
    definition.definition_mode === "zh_definition" ||
    definition.definition_mode === "zh_sentence"
  ) {
    return fieldIssue(issues, definition.id, "content");
  }
  for (const row of editableEnglishText(definition.content as EnglishTextV3)) {
    const issue = fieldIssue(issues, row.variant_id, "value");
    if (issue) return issue;
  }
  return undefined;
}

type DraftMutation = (draft: DraftMeaningsStepContentWritableV3) => void;
type SenseSectionKind =
  "definitions" | "component_usages" | "sentences" | "relations";

const SENSE_GROUP_DRAG_TYPE = "application/x-tsz-v3-sense-group";
const GRAMMAR_DRAG_TYPE = "application/x-tsz-v3-grammar-structure";
const DEFINITION_DRAG_TYPE = "application/x-tsz-v3-definition";
// const POS_DRAG_TYPE = "application/x-tsz-v3-pos";
/** 拖影取整行而不是把手上那颗小图标；与提取前硬编码的选择器一致。 */
const SORTABLE_ROW_SELECTOR =
  ".word-sense-group-item, .word-grammar-row, .word-definition-row, .word-sentence-row";

function SortableRows<T>({
  items,
  scopeId,
  dragType,
  onChange,
  children
}: {
  items: readonly T[];
  scopeId: string;
  dragType: string;
  onChange: (next: T[]) => void;
  children: (sorting: SortableRowsController) => ReactNode;
}) {
  const sorting = useSortableRows({ items, scopeId, dragType, onChange });
  return children(sorting);
}

function SenseEditorShell({
  children,
  index,
  level,
  summary,
  subPosLabel,
  sorting,
  expanded,
  onExpandedChange,
  onDelete,
  confirmDelete,
  canDelete,
  nodeId,
  referenceCount = 0
}: {
  children: ReactNode;
  index: number;
  level: string;
  summary: string;
  subPosLabel?: string;
  sorting: SortableRowsController;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onDelete: () => void;
  confirmDelete: boolean;
  canDelete: boolean;
  nodeId: string;
  /** 指向本词义的引用数；大于 0 时不能删除。 */
  referenceCount?: number;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const safeLevel = /^(?:A1|A2|B1|B2|C1|C2)$/u.test(level) ? level : "A1";
  return (
    <div
      data-v3-field="sense"
      data-v3-node-id={nodeId}
      tabIndex={-1}
      className={sortableRowClass("word-sense-sortable", sorting, index)}
      onDragOver={(event) => sorting.handleDragOver(event, index)}
      onDragLeave={sorting.handleDragLeave}
      onDrop={(event) => sorting.handleDrop(event, index)}
    >
      <Collapse
        activeKey={expanded ? [nodeId] : []}
        className={`word-sense-editor word-sense-editor-v3 word-sense-editor-${safeLevel.toLowerCase()}`}
        onChange={(keys) =>
          onExpandedChange(
            (Array.isArray(keys) ? keys : [keys]).includes(nodeId)
          )
        }
        items={[
          {
            key: nodeId,
            showArrow: false,
            label: (
              <div className="word-sense-header-label">
                <div className="word-sense-header-content">
                  <span
                    className="word-sort-leading"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <SortableDragHandle
                      sorting={sorting}
                      index={index}
                      label={`拖动词义 ${index + 1}`}
                      singleItemTitle="至少需要两个词义"
                      dragImageSelector=".word-sense-sortable"
                    />
                  </span>
                  <Tag className="word-sense-level-badge">{level}</Tag>
                  <Typography.Text className="word-sense-summary tsz-entry-en">
                    {index + 1}. {summary}
                  </Typography.Text>
                  {subPosLabel ? (
                    <Tag className="word-sense-sub-pos-badge">
                      {subPosLabel}
                    </Tag>
                  ) : null}
                  <V3ReferenceBadge label="词义" nodeIds={[nodeId]} />
                </div>
                <span className="word-form-card-toggle-state">
                  <span>{expanded ? "收起" : "展开"}</span>
                  {expanded ? <CaretUpFilled /> : <CaretDownFilled />}
                </span>
              </div>
            ),
            extra: (
              <Space
                className="word-sense-header-actions"
                size={2}
                onClick={(event) => event.stopPropagation()}
              >
                <Tooltip
                  title={
                    !canDelete
                      ? "至少保留一条词义"
                      : referenceCount > 0
                        ? referenceBlockedHint(referenceCount)
                        : undefined
                  }
                >
                  <Button
                    aria-label={`删除词义 ${index + 1}`}
                    icon={<DeleteOutlined />}
                    disabled={!canDelete || undefined}
                    danger
                    size="small"
                    type="text"
                    onClick={() => {
                      if (!canDelete) return;
                      if (confirmDelete) setDeleteOpen(true);
                      else onDelete();
                    }}
                  />
                </Tooltip>
              </Space>
            ),
            children
          }
        ]}
      />
      <Modal
        title="确定删除该词义吗？"
        open={deleteOpen}
        style={{ top: 48 }}
        maskClosable={false}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true, disabled: !canDelete }}
        cancelButtonProps={{ autoFocus: true }}
        onCancel={() => setDeleteOpen(false)}
        onOk={() => {
          setDeleteOpen(false);
          if (canDelete) onDelete();
        }}
      >
        <Typography.Text>{summary}</Typography.Text>
      </Modal>
    </div>
  );
}

const GRAMMAR_PLACEHOLDER: Record<Dialect, string> = {
  common: "例如 a centre / the centre",
  uk: "例如 a centre / the centre",
  us: "例如 a center / the center"
};

function GrammarStructuresCard({
  wordId,
  forms,
  meanings,
  pos,
  posIndex,
  spellingMode,
  change,
  idFactory
}: {
  wordId?: string;
  forms?: DraftFormsStepContentV3;
  meanings: DraftMeaningsStepContentWritableV3;
  pos: DraftMeaningsStepContentWritableV3["pos"][number];
  posIndex: number;
  spellingMode: DialectModeV3;
  change: (mutation: DraftMutation) => void;
  idFactory: () => string;
}) {
  const { modal } = App.useApp();
  const removeStructure = (structureId: string) =>
    change((draft) => {
      const target = draft.pos[posIndex]!;
      if (target.grammar_structures.length <= 1) return;
      const index = target.grammar_structures.findIndex(
        (structure) => structure.id === structureId
      );
      if (index < 0) return;
      target.grammar_structures.splice(index, 1);
      for (const sense of target.senses) {
        for (const definition of sense.definitions) {
          if (definition.grammar_structure_id === structureId) {
            delete definition.grammar_structure_id;
          }
        }
      }
    });
  const sorting = useSortableRows({
    items: pos.grammar_structures,
    scopeId: pos.pos_id,
    dragType: GRAMMAR_DRAG_TYPE,
    onChange: (next) =>
      change((draft) => {
        draft.pos[posIndex]!.grammar_structures = next;
      })
  });
  return (
    <Card className="word-grammar-card" size="small" title="语法结构">
      {pos.grammar_structures.length === 0 ? (
        <Typography.Text type="secondary">暂无语法结构</Typography.Text>
      ) : (
        <Flex vertical gap={0}>
          {pos.grammar_structures.map((structure, structureIndex) => (
            <div
              className={sortableRowClass(
                "word-table-row word-grammar-row",
                sorting,
                structureIndex
              )}
              data-v3-field="variants"
              data-v3-node-id={structure.id}
              key={structure.id}
              onDragLeave={sorting.handleDragLeave}
              onDragOver={(event) =>
                sorting.handleDragOver(event, structureIndex)
              }
              onDrop={(event) => sorting.handleDrop(event, structureIndex)}
              tabIndex={-1}
            >
              <span className="word-sort-leading">
                <SortableDragHandle
                  dragImageSelector={SORTABLE_ROW_SELECTOR}
                  index={structureIndex}
                  label={`拖动语法结构 ${structureIndex + 1}`}
                  singleItemTitle="至少需要两条语法结构"
                  sorting={sorting}
                />
                <V3RowIndex index={structureIndex} />
              </span>
              <div className="word-grammar-variants">
                {structure.variants.map((variant, variantIndex) => (
                  <div
                    className={
                      variant.dialect === "common"
                        ? "word-grammar-panel"
                        : `word-grammar-panel word-grammar-panel-${variant.dialect}`
                    }
                    data-v3-node-id={variant.id}
                    key={variant.id}
                  >
                    <V3GrammarVoiceTextField
                      wordId={wordId}
                      forms={forms}
                      meanings={meanings}
                      textLinks={variant.form_links}
                      dialect={variant.dialect}
                      ariaLabel={`语法结构 ${structureIndex + 1} ${dialectLabel(variant.dialect)}内容`}
                      editorTitle={
                        <V3EditorTitle
                          index={structureIndex}
                          title="语法结构"
                          details={dialectLabel(variant.dialect)}
                        />
                      }
                      field="content"
                      nodeId={variant.id}
                      onAssociationsChange={(links) =>
                        change((draft) => {
                          draft.pos[posIndex]!.grammar_structures[
                            structureIndex
                          ]!.variants[variantIndex]!.form_links = links;
                        })
                      }
                      onChange={(next, links) =>
                        change((draft) => {
                          const target =
                            draft.pos[posIndex]!.grammar_structures[
                              structureIndex
                            ]!.variants[variantIndex]!;
                          target.content = next;
                          target.form_links = links ?? [];
                        })
                      }
                      onCommit={(result) =>
                        change((draft) => {
                          const target =
                            draft.pos[posIndex]!.grammar_structures[
                              structureIndex
                            ]!.variants[variantIndex]!;
                          target.content = result.value;
                          target.form_links = result.textLinks ?? [];
                          target.voice_profile = result.voiceProfile;
                          target.audio_assets = result.audioAssets;
                        })
                      }
                      onVoiceProfileChange={(next) =>
                        change((draft) => {
                          const target =
                            draft.pos[posIndex]!.grammar_structures[
                              structureIndex
                            ]!.variants[variantIndex]!;
                          target.voice_profile = next;
                        })
                      }
                      onAudioAssetsChange={(next) =>
                        change((draft) => {
                          const target =
                            draft.pos[posIndex]!.grammar_structures[
                              structureIndex
                            ]!.variants[variantIndex]!;
                          target.audio_assets = next;
                        })
                      }
                      audioAssets={variant.audio_assets}
                      placeholder={GRAMMAR_PLACEHOLDER[variant.dialect]}
                      value={variant.content}
                      voiceProfile={variant.voice_profile}
                    />
                  </div>
                ))}
              </div>
              <Space
                className="word-sort-actions"
                orientation="horizontal"
                size={8}
              >
                <Button
                  aria-label={`删除语法结构 ${structureIndex + 1}`}
                  danger
                  disabled={pos.grammar_structures.length <= 1 || undefined}
                  title={
                    pos.grammar_structures.length <= 1
                      ? "至少保留一条语法结构"
                      : undefined
                  }
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    if (
                      structure.variants.some(
                        (variant) => variant.form_links?.length
                      )
                    ) {
                      modal.confirm({
                        title: "删除语法结构？",
                        content:
                          "删除后，词形关联会被清除，相关释义不再引用此结构。",
                        okText: "删除",
                        cancelText: "取消",
                        okButtonProps: { danger: true },
                        autoFocusButton: "cancel",
                        onOk: () => removeStructure(structure.id)
                      });
                    } else {
                      removeStructure(structure.id);
                    }
                  }}
                  size="small"
                  type="text"
                />
              </Space>
            </div>
          ))}
        </Flex>
      )}
      <Button
        block
        className="word-section-add-button"
        icon={<PlusOutlined aria-hidden />}
        onClick={() =>
          change((draft) => {
            draft.pos[posIndex]!.grammar_structures.push(
              newGrammarStructure(idFactory, spellingMode)
            );
          })
        }
        type="dashed"
      >
        添加语法结构
      </Button>
    </Card>
  );
}

function newSense(
  idFactory: () => string,
  senseGroupId?: string
): WordSenseWritableV3 {
  // 新词义先按默认等级铺好该等级的释义语句行；之后改等级，只要这些行还都空着就跟着换。
  const level = DEFAULT_SENSE_LEVEL;
  return {
    id: idFactory(),
    sub_pos: "",
    level,
    ...(senseGroupId ? { sense_group_id: senseGroupId } : {}),
    frequency: "0",
    depends_on_context: false,
    definitions: defaultDefinitions(level, idFactory),
    sentences: [],
    relations: []
  };
}

function SenseGroupsCard({
  value,
  wordId,
  change,
  idFactory
}: {
  value: DraftMeaningsStepContentWritableV3;
  wordId?: string;
  change: (mutation: DraftMutation) => void;
  idFactory: () => string;
}) {
  const groups = value.sense_groups;
  const sorting = useSortableRows({
    items: groups,
    scopeId: wordId ?? "current-entry",
    dragType: SENSE_GROUP_DRAG_TYPE,
    onChange: (next) =>
      change((draft) => {
        // 按拖拽结果重排 draft 里已有的区间；draft 中晚于本次渲染快照新增的
        // 区间不在 next 里，保留在尾部而不是被整体重建时静默抹掉。
        const order = new Map(next.map((group, index) => [group.id, index]));
        draft.sense_groups = [
          ...draft.sense_groups
            .filter((group) => order.has(group.id))
            .sort((a, b) => order.get(a.id)! - order.get(b.id)!),
          ...draft.sense_groups.filter((group) => !order.has(group.id))
        ];
      })
  });
  return (
    <Card
      className="word-sense-groups-card"
      data-v3-field="sense_groups"
      data-v3-node-id={wordId ?? "current-entry"}
      size="small"
      title="语义区间"
    >
      <div className="word-sense-group-list">
        {/* 列名只出一次：每行都重复「中文 / 英文」会把下一行的输入框推远，
            行与行之间的留白就跟着不对称了。 */}
        <div className="word-sense-group-heads">
          <span />
          <span>中文</span>
          <span>英文</span>
          <span />
        </div>
        {groups.map((group, groupIndex) => (
          <div
            className={sortableRowClass(
              "word-sense-group-item",
              sorting,
              groupIndex
            )}
            data-v3-node-id={group.id}
            key={group.id}
            onDragLeave={sorting.handleDragLeave}
            onDragOver={(event) => sorting.handleDragOver(event, groupIndex)}
            onDrop={(event) => sorting.handleDrop(event, groupIndex)}
          >
            <span className="word-sort-leading">
              <SortableDragHandle
                dragImageSelector={SORTABLE_ROW_SELECTOR}
                index={groupIndex}
                label={`拖动语义区间 ${groupIndex + 1}`}
                singleItemTitle="至少需要两个语义区间"
                sorting={sorting}
              />
              <span
                aria-label={`第 ${groupIndex + 1} 个语义区间`}
                className="word-sense-group-index"
              >
                {groupIndex + 1}
              </span>
            </span>
            <div className="word-sense-group-field">
              <Input
                aria-label={`语义区间 ${groupIndex + 1} 中文`}
                data-v3-field="name_zh"
                data-v3-node-id={group.id}
                onChange={(event) =>
                  change((draft) => {
                    const target = draft.sense_groups.find(
                      (candidate) => candidate.id === group.id
                    );
                    if (target) target.name_zh = event.target.value;
                  })
                }
                placeholder="例如 几何与物理空间核心"
                value={group.name_zh}
              />
            </div>
            <div className="word-sense-group-field">
              <Input
                aria-label={`语义区间 ${groupIndex + 1} 英文`}
                className="tsz-entry-en"
                data-v3-field="name_en"
                data-v3-node-id={group.id}
                onChange={(event) =>
                  change((draft) => {
                    const target = draft.sense_groups.find(
                      (candidate) => candidate.id === group.id
                    );
                    if (target) {
                      target.name_en = event.target.value;
                      if (target.name_en_rich) {
                        target.name_en_rich = {
                          version: 2,
                          text: event.target.value,
                          annotations: []
                        };
                      }
                    }
                  })
                }
                placeholder="例如 Core geometric and physical space"
                value={group.name_en}
              />
            </div>
            <Space
              className="word-sort-actions"
              orientation="horizontal"
              size={8}
            >
              <Button
                aria-label={`删除语义区间 ${groupIndex + 1}`}
                danger
                disabled={groups.length <= 1}
                icon={<DeleteOutlined />}
                onClick={() =>
                  change((draft) => {
                    if (draft.sense_groups.length <= 1) {
                      return;
                    }
                    draft.sense_groups = draft.sense_groups.filter(
                      (candidate) => candidate.id !== group.id
                    );
                    for (const candidate of draft.pos) {
                      for (const sense of candidate.senses) {
                        if (sense.sense_group_id === group.id) {
                          delete sense.sense_group_id;
                        }
                      }
                    }
                  })
                }
                size="small"
                type="text"
              />
            </Space>
          </div>
        ))}
      </div>
      <Button
        block
        className="word-section-add-button"
        icon={<PlusOutlined aria-hidden />}
        onClick={() =>
          change((draft) => {
            draft.sense_groups.push({
              id: idFactory(),
              name_zh: "",
              name_en: ""
            });
          })
        }
        type="dashed"
      >
        添加语义区间
      </Button>
    </Card>
  );
}

const GRAMMAR_STRUCTURE_PREVIEW_LIMIT = 24;

function grammarStructureText(
  structure: GrammarStructureV3
): string | undefined {
  return structure.variants
    .map((variant) => variant.content.text.trim())
    .find((value) => value.length > 0);
}

// ①-⑳ 都在 BMP 内，按 UTF-16 单元取用是安全的；超出 20 条回退成普通序号。
const CIRCLED_NUMBERS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

function circledIndex(index: number): string {
  return index < CIRCLED_NUMBERS.length
    ? CIRCLED_NUMBERS[index]!
    : `${index + 1}.`;
}

/**
 * 下拉里的语法结构要能被认出来：序号对齐上方「语法结构」卡片的编号，
 * 后面跟内容预览，多条时才分得清哪条是哪条。
 */
function grammarStructureOptionLabel(
  structure: GrammarStructureV3,
  index: number
): string {
  const text = grammarStructureText(structure) ?? "";
  // 按码点截断，和 replaceRichText 的计数口径一致，别把代理对劈开。
  const codepoints = [...text];
  const preview =
    codepoints.length > GRAMMAR_STRUCTURE_PREVIEW_LIMIT
      ? `${codepoints.slice(0, GRAMMAR_STRUCTURE_PREVIEW_LIMIT).join("")}…`
      : text;
  return `${circledIndex(index)} ${preview}`;
}

// 只生成展示副本：重定位颜色标注，仅保留 trim 和 24 码点截断内的完整连读；省略号不带标注。
function grammarStructurePreview(structure: GrammarStructureV3, index: number) {
  const content = structure.variants.find((variant) =>
    variant.content.text.trim()
  )?.content;
  if (!content) return `${circledIndex(index)} `;
  const rich = toRichTextV2(content);
  const start = [...rich.text].length - [...rich.text.trimStart()].length;
  const text = [...rich.text.trim()];
  const length = Math.min(text.length, GRAMMAR_STRUCTURE_PREVIEW_LIMIT);
  const annotations = rich.annotations.flatMap((annotation) => {
    // 连读连接两个锚点，不能像颜色区间一样裁剪，否则会凭空改变端点。
    if (
      annotation.type !== "emphasis" &&
      annotation.type !== "highlight" &&
      annotation.type !== "italic" &&
      annotation.type !== "liaison"
    )
      return [];
    if (
      annotation.type === "liaison" &&
      (annotation.start < start || annotation.end > start + length)
    )
      return [];
    const from = Math.max(0, annotation.start - start);
    const to = Math.min(length, annotation.end - start);
    return from < to ? [{ ...annotation, start: from, end: to }] : [];
  });
  return (
    <span className="word-grammar-reference-label">
      <span className="word-grammar-reference-index">
        {circledIndex(index)}{" "}
      </span>
      <span className="word-grammar-reference-text">
        <RichTextReadOnly
          className="word-grammar-reference"
          value={{
            version: 2,
            text: text.slice(0, length).join(""),
            annotations
          }}
          emptyText=""
        />
        {text.length > length ? "…" : ""}
      </span>
    </span>
  );
}

function renderGrammarStructureLabel(
  structures: readonly GrammarStructureV3[],
  id: string,
  fallback: ReactNode
) {
  const index = structures.findIndex((structure) => structure.id === id);
  const structure = structures[index];
  return structure && grammarStructureText(structure)
    ? grammarStructurePreview(structure, index)
    : fallback;
}

/**
 * 没写内容的语法结构不进下拉：新建词性默认就带一条空结构，把它列成可选项
 * 只会让人以为已经有语法结构了。已经被这条定义选中的结构例外——否则选中值
 * 会显示成空白。
 */
function grammarStructureOptions(
  structures: readonly GrammarStructureV3[],
  selectedId: string | undefined
) {
  return structures.flatMap((structure, index) =>
    grammarStructureText(structure) || structure.id === selectedId
      ? [
          {
            label: grammarStructureOptionLabel(structure, index),
            value: structure.id
          }
        ]
      : []
  );
}

const DEFINITION_LANGUAGE_OPTIONS: Array<{
  label: string;
  value: DefinitionLanguageV3;
}> = [
  { label: "中文", value: "zh" },
  { label: "英文", value: "en" }
];

const DEFINITION_STYLE_OPTIONS: Array<{
  label: string;
  value: DefinitionStyleV3;
}> = [
  { label: "定义释义", value: "definition" },
  { label: "整句释义", value: "sentence" }
];

const DEFINITION_TEXT_SELECT_PROPS = {
  className: "word-definition-text-select",
  classNames: { popup: { root: "word-definition-text-options" } },
  variant: "borderless",
  suffixIcon: null,
  popupMatchSelectWidth: false,
  popupAlign: {
    points: ["tc", "bc"],
    overflow: { adjustX: true, adjustY: true, shiftX: true }
  }
} satisfies SelectProps;

type ModalApi = ReturnType<typeof App.useApp>["modal"];

/** 切到中文会丢掉英文侧的关联与发音设置，先让用户确认；其余切换直接生效。 */
function requestDefinitionMode(
  definition: WordDefinitionV3,
  definitionMode: DefinitionModeV3,
  idFactory: () => string,
  modal: ModalApi,
  commit: (next: WordDefinitionV3) => void
): void {
  const apply = () =>
    commit(withDefinitionMode(definition, definitionMode, idFactory));
  if (definitionModeRemovesEnglishSettings(definition, definitionMode))
    modal.confirm({
      title: "切换为中文释义",
      content: "切换后将移除这条释义的英文关联和发音设置。",
      okText: "切换",
      cancelText: "取消",
      onOk: apply
    });
  else apply();
}

function V3MeaningsAndExamplesStepContent({
  value,
  onChange,
  onSave,
  onPrevious,
  renderSentenceSection,
  saving = false,
  canSave = true,
  issues = [],
  activePosId,
  wordId,
  forms,
  partOfSpeechCatalog,
  partOfSpeechCatalogError = false,
  partOfSpeechCatalogPending = false,
  onFormsChange,
  onActivePosChange,
  entryKind,
  idFactory = newWordNodeId,
  relationDisplaySnapshots,
  componentUsagesEnabled = false,
  textLinksEnabled = false
}: V3MeaningsAndExamplesStepProps) {
  const { modal } = App.useApp();
  // 仅本次新增词义的自动继承值可视为空白；已保存的归属保守地要求确认。
  const inheritedSenseGroups = useRef(new Map<string, string | undefined>());
  const [expandedSenseByPos, setExpandedSenseByPos] = useState<
    Record<string, string | null>
  >(() =>
    Object.fromEntries(
      value.pos
        .filter((pos) => pos.senses.length > 0)
        .map((pos) => [pos.pos_id, pos.senses[0]!.id])
    )
  );
  const [collapsedSenseSections, setCollapsedSenseSections] = useState<
    Record<string, boolean>
  >({});
  // 语法结构下拉里「同时套用到后面每条」的按钮要自己收起面板：它拦掉了选项的点击，
  // 不走 rc-select 的选中路径，面板不会自动关。同一时刻只可能开一个，存 definition id。
  const [structurePickerFor, setStructurePickerFor] = useState<string | null>(
    null
  );
  // 那颗按钮平时被 CSS 藏起来，隐形时收不到 mouseleave，交给 antd 自己管 hover
  // 会留下关不掉的气泡。改成受控：只认当前这一个键，换一个就把上一个顶掉。
  const [hoveredCopyKey, setHoveredCopyKey] = useState<string | null>(null);
  // 取反用的是当前**生效**的折叠态而不是 `current[key]`：成分区块在能力关闭时默认
  // 折叠，键尚未写入时 `!current[key]` 恒为 true，第一次点击会是无反馈的空操作。
  const toggleSenseSection = (
    senseId: string,
    section: SenseSectionKind,
    collapsed: boolean
  ) => {
    setCollapsedSenseSections((current) => ({
      ...current,
      [`${senseId}:${section}`]: !collapsed
    }));
  };
  const change = (mutation: DraftMutation) => {
    const next = structuredClone(value);
    mutation(next);
    onChange(next);
  };

  const senseGroupOptions = value.sense_groups.flatMap((group) => {
    const label = group.name_zh.trim() || group.name_en.trim();
    return label ? [{ label, value: group.id }] : [];
  });

  const formPosById = new Map(
    (forms?.pos ?? []).map((pos) => [pos.pos_id, pos.pos] as const)
  );
  const catalogByCode = new Map(
    (partOfSpeechCatalog?.items ?? []).map((item) => [item.code, item] as const)
  );
  const visiblePosLabel = (posId: string, index: number) => {
    const code = formPosById.get(posId);
    if (!code) return `词性 ${index + 1}`;
    return catalogByCode.get(code)?.name_zh ?? partOfSpeechLabel(code);
  };

  const save = async (intent: StepSaveIntent) => {
    if (!onSave) return;
    try {
      await onSave(value, intent);
    } catch {
      // T5A owns error classification and retry UI. This controlled editor
      // deliberately keeps the current value untouched on rejection.
    }
  };

  const visiblePosIds = Array.from(
    new Set([
      ...(forms?.pos ?? []).map((pos) => pos.pos_id),
      ...value.pos.map((pos) => pos.pos_id),
      ...(activePosId ? [activePosId] : [])
    ])
  );
  // 两步共用 forms.pos 的顺序；未对齐的词性集合不能回写排序。
  const posOrderMatchesForms =
    Boolean(forms && onFormsChange) &&
    forms!.pos.length === visiblePosIds.length &&
    visiblePosIds.every((posId) =>
      forms!.pos.some((pos) => pos.pos_id === posId)
    );
  const posSorting = useSortableRows({
    items: posOrderMatchesForms ? visiblePosIds : [],
    scopeId: "v3-meanings-pos-tabs",
    dragType: "application/x-tsz-v3-pos",
    onChange: (next) => {
      if (forms && onFormsChange) onFormsChange(reorderPos(forms, next));
    }
  });

  const resolvedActivePosId =
    activePosId && visiblePosIds.includes(activePosId)
      ? activePosId
      : visiblePosIds[0];
  const addBasicPos =
    forms && onFormsChange
      ? (item: PartOfSpeechCatalogResponse["items"][number]) => {
          const result = addPartOfSpeech(forms, item, idFactory);
          if (!result.ok) return;
          const added = result.value.pos.at(-1)!;
          onFormsChange(result.value);
          onActivePosChange?.(added.pos_id);
        }
      : undefined;
  const addBasicPosSelect =
    forms && addBasicPos ? (
      <V3AddBasicPosSelect
        compact={visiblePosIds.length > 0}
        catalog={partOfSpeechCatalog}
        entryKind={entryKind}
        forms={forms}
        isError={partOfSpeechCatalogError}
        isPending={partOfSpeechCatalogPending}
        onAdd={addBasicPos}
      />
    ) : null;
  const referenceGuard = useV3ReferenceGuard();
  const posReferenceCount = (posId: string) => {
    const formPos = forms?.pos.find((pos) => pos.pos_id === posId);
    const senseIds =
      value.pos
        .find((pos) => pos.pos_id === posId)
        ?.senses.map((sense) => sense.id) ?? [];
    return nodesBlockingReferenceCount(
      referenceGuard.index,
      formPos ? posNodeIds(formPos, senseIds) : [posId, ...senseIds]
    );
  };
  const deleteBasicPos = (posId: string) => {
    if (!forms || !onFormsChange || forms.pos.length <= 1) return;
    const formsResult = deletePartOfSpeech(forms, posId);
    if (!formsResult.ok) return;
    onFormsChange(formsResult.value);
    if (activePosId === posId) {
      const nextActivePosId = formsResult.value.pos[0]?.pos_id;
      if (nextActivePosId) onActivePosChange?.(nextActivePosId);
    }
  };

  return (
    <Flex className="v3-meanings-v2" vertical gap="middle">
      <div className="word-step-heading">
        <span className="word-step-number">STEP 03</span>
        <Typography.Title level={2} style={{ margin: 0 }}>
          词义与例句
        </Typography.Title>
        <Typography.Paragraph className="word-step-description">
          录入顺序：词义 → 语法结构 → 例句。系统报错触发条件：1)
          某项词义缺本语言释义语句；2) 例句未配置关联单词；
        </Typography.Paragraph>
      </div>

      {issues.length > 0 && (
        <Alert
          description="已按最近一次校验结果标出对应字段；修改后重新完成本步或重新检查发布条件以更新状态。"
          showIcon
          title="词义与例句尚未完成"
          type="warning"
        />
      )}

      {partOfSpeechCatalogError && addBasicPosSelect ? (
        <Alert showIcon title="词性目录不可用，已停止新增结构" type="error" />
      ) : null}

      <SenseGroupsCard
        change={change}
        idFactory={idFactory}
        value={value}
        wordId={wordId}
      />

      {visiblePosIds.length === 0 ? (
        <Flex vertical gap="small">
          <Flex>{addBasicPosSelect}</Flex>
          <Empty description="当前还没有词性，请从上方“添加词性”入口添加。" />
        </Flex>
      ) : (
        <Tabs
          activeKey={resolvedActivePosId}
          className="word-pos-tabs"
          tabBarExtraContent={undefined}
          items={visiblePosIds.map((posId, displayPosIndex) => {
            const posIndex = value.pos.findIndex((pos) => pos.pos_id === posId);
            const pos = value.pos[posIndex];
            return {
              key: posId,
              label: (
                <span
                  className={sortableRowClass(
                    "word-pos-tab-handle",
                    posSorting,
                    displayPosIndex
                  )}
                  data-pos-id={posId}
                  onDragLeave={posSorting.handleDragLeave}
                  onDragOver={(event) =>
                    posSorting.handleDragOver(event, displayPosIndex)
                  }
                  onDrop={(event) =>
                    posSorting.handleDrop(event, displayPosIndex)
                  }
                >
                  <SortableDragHandle
                    dragImageSelector=".word-pos-tab-handle"
                    index={displayPosIndex}
                    label={`拖动${visiblePosLabel(posId, displayPosIndex)}`}
                    singleItemTitle="至少需要两个基本词性"
                    sorting={posSorting}
                  />
                  <span className="word-pos-tab-label">
                    <strong>{visiblePosLabel(posId, displayPosIndex)}</strong>
                    {pos ? (
                      <Badge
                        count={countV3PosMeaningIncomplete(
                          pos,
                          value,
                          catalogByCode.get(formPosById.get(posId) ?? "")
                            ?.sub_pos_required ?? true
                        )}
                        size="small"
                        title="该词性未填项"
                      />
                    ) : null}
                  </span>
                  <span
                    className="word-pos-tab-actions"
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {addBasicPosSelect}
                    {forms &&
                    forms.pos.length > 1 &&
                    forms.pos.some((formPos) => formPos.pos_id === posId) &&
                    onFormsChange ? (
                      <Tooltip
                        title={
                          posReferenceCount(posId) > 0
                            ? referenceBlockedHint(posReferenceCount(posId))
                            : undefined
                        }
                      >
                        <Button
                          aria-label={`删除${visiblePosLabel(posId, displayPosIndex)}`}
                          danger
                          icon={<MinusCircleOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            modal.confirm({
                              title: `删除词性“${visiblePosLabel(posId, displayPosIndex)}”？`,
                              content:
                                "会移除该词性下的词形、词义、例句和关联词；保存草稿时会继续预览下游影响。",
                              okText: "删除",
                              okButtonProps: { danger: true },
                              onOk: () => deleteBasicPos(posId)
                            });
                          }}
                          size="small"
                          type="text"
                        />
                      </Tooltip>
                    ) : null}
                  </span>
                </span>
              ),
              children: pos ? (
                <div
                  className="word-pos-editor"
                  data-v3-field="senses"
                  data-v3-node-id={pos.pos_id}
                  tabIndex={-1}
                >
                  <Flex vertical gap="middle">
                    <GrammarStructuresCard
                      wordId={wordId}
                      forms={forms}
                      meanings={value}
                      change={change}
                      idFactory={idFactory}
                      pos={pos}
                      posIndex={posIndex}
                      spellingMode={spellingModeForPos(forms, pos.pos_id)}
                    />

                    <div
                      className="word-sense-list"
                      data-v3-field="senses"
                      data-v3-node-id={pos.pos_id}
                    >
                      <SortableRows
                        items={pos.senses}
                        scopeId={pos.pos_id}
                        dragType="application/x-tsz-v3-sense"
                        onChange={(next) =>
                          change((draft) => {
                            draft.pos[posIndex]!.senses = next;
                          })
                        }
                      >
                        {(senseSorting) =>
                          pos.senses.map((sense, senseIndex) => {
                            const senseIssues = issues.filter(
                              (issue) => issue.node_id === sense.id
                            );
                            const subPosIssue = fieldIssue(
                              senseIssues,
                              sense.id,
                              "sub_pos"
                            );
                            const frequencyIssue = fieldIssue(
                              senseIssues,
                              sense.id,
                              "frequency"
                            );
                            const formGroupIssue = fieldIssue(
                              senseIssues,
                              sense.id,
                              "form_group_id"
                            );
                            const catalogPos = catalogByCode.get(
                              formPosById.get(pos.pos_id) ?? ""
                            );
                            const configuredSubParts =
                              catalogPos?.sub_parts ?? [];
                            const selectedSubPos = configuredSubParts.find(
                              (item) => item.code === sense.sub_pos
                            );
                            const visibleSubPos = selectedSubPos?.name_zh;
                            // 任意基本词性都能挂细分词性；目录里没有该词性时保留原有可选行为，
                            // 避免目录加载失败把字段整体藏掉。
                            const subPosExtensible =
                              catalogPos?.sub_parts_extensible ?? true;
                            // 目录说这个基本词性必须挂细分词性时，就别把「不指定」摆成默认值，
                            // 否则新建的每条释义一进来就是校验通不过的状态。
                            const subPosRequired =
                              catalogPos?.sub_pos_required ?? true;
                            const definitionsCollapsed = Boolean(
                              collapsedSenseSections[`${sense.id}:definitions`]
                            );
                            const relationsCollapsed = Boolean(
                              collapsedSenseSections[`${sense.id}:relations`]
                            );
                            // 后端未声明能力时区块整体不可编辑，默认折叠：每条释义都摊开
                            // 一条同样的只读提示加一排点不动的按钮，只会把多维例句挤下去。
                            const componentUsagesCollapsed =
                              collapsedSenseSections[
                                `${sense.id}:component_usages`
                              ] ?? !componentUsagesEnabled;
                            const senseComponentUsages =
                              sense.component_usages ?? [];
                            const componentSpelling = baseSpellingForPos(
                              forms,
                              pos.pos_id
                            );
                            return (
                              <SenseEditorShell
                                index={senseIndex}
                                key={sense.id}
                                sorting={senseSorting}
                                expanded={
                                  (expandedSenseByPos[pos.pos_id] === undefined
                                    ? pos.senses[0]?.id
                                    : expandedSenseByPos[pos.pos_id]) ===
                                  sense.id
                                }
                                onExpandedChange={(expanded) =>
                                  setExpandedSenseByPos((current) => ({
                                    ...current,
                                    [pos.pos_id]: expanded ? sense.id : null
                                  }))
                                }
                                level={sense.level}
                                nodeId={sense.id}
                                canDelete={pos.senses.length > 1}
                                confirmDelete={senseNeedsDeleteConfirmation(
                                  sense,
                                  inheritedSenseGroups.current.get(sense.id)
                                )}
                                referenceCount={Math.max(
                                  senseReferenceCount(
                                    referenceGuard.index,
                                    sense.id
                                  ),
                                  boundFormGroupIds(sense).length
                                )}
                                onDelete={() =>
                                  change((draft) => {
                                    if (draft.pos[posIndex]!.senses.length <= 1)
                                      return;
                                    draft.pos[posIndex]!.senses.splice(
                                      senseIndex,
                                      1
                                    );
                                  })
                                }
                                subPosLabel={
                                  visibleSubPos
                                    ? [selectedSubPos?.name_en, visibleSubPos]
                                        .filter(Boolean)
                                        .join(" ")
                                    : undefined
                                }
                                summary={definitionSummary(sense)}
                              >
                                <Flex vertical gap="small">
                                  <div className="word-sense-meta-grid">
                                    <label className="word-sense-field">
                                      <Typography.Text type="secondary">
                                        词义等级
                                      </Typography.Text>
                                      <Select
                                        aria-label={`释义 ${senseIndex + 1} 等级`}
                                        data-v3-field="level"
                                        data-v3-node-id={sense.id}
                                        onChange={(level: string) =>
                                          change((draft) => {
                                            const target =
                                              draft.pos[posIndex]!.senses[
                                                senseIndex
                                              ]!;
                                            // 先按改之前的等级判断：这组释义还是原样的
                                            // 默认铺排才跟着换，动过一行就不碰。
                                            const stillDefault =
                                              definitionsStillDefault(
                                                target.definitions,
                                                target.level
                                              );
                                            target.level = level;
                                            if (stillDefault)
                                              target.definitions =
                                                defaultDefinitions(
                                                  level,
                                                  idFactory
                                                );
                                          })
                                        }
                                        options={CEFR_OPTIONS}
                                        style={{ width: "100%" }}
                                        value={sense.level}
                                      />
                                    </label>
                                    <label className="word-sense-field word-sense-field-group">
                                      <Typography.Text type="secondary">
                                        语义区间
                                      </Typography.Text>
                                      <Select
                                        aria-label={`释义 ${senseIndex + 1} 所属语义区间`}
                                        data-v3-field="sense_group_id"
                                        data-v3-node-id={sense.id}
                                        onChange={(nextValue: string) =>
                                          change((draft) => {
                                            const target =
                                              draft.pos[posIndex]!.senses[
                                                senseIndex
                                              ]!;
                                            if (!nextValue)
                                              delete target.sense_group_id;
                                            else
                                              target.sense_group_id = nextValue;
                                          })
                                        }
                                        options={[
                                          {
                                            label: "不归入语义区间",
                                            value: ""
                                          },
                                          ...senseGroupOptions
                                        ]}
                                        labelRender={({ value: selectedId }) =>
                                          selectedId === ""
                                            ? "不归入语义区间"
                                            : (senseGroupOptions.find(
                                                (option) =>
                                                  option.value === selectedId
                                              )?.label ?? "")
                                        }
                                        placeholder="请选择语义区间"
                                        value={
                                          senseGroupOptions.some(
                                            (option) =>
                                              option.value ===
                                              sense.sense_group_id
                                          )
                                            ? sense.sense_group_id
                                            : undefined
                                        }
                                      />
                                    </label>
                                    {(subPosExtensible ||
                                      Boolean(sense.sub_pos) ||
                                      Boolean(subPosIssue)) && (
                                      <label className="word-sense-field word-sense-field-pos">
                                        <Typography.Text type="secondary">
                                          细分词性
                                        </Typography.Text>
                                        {subPosExtensible ? (
                                          <Select
                                            aria-label={`释义 ${senseIndex + 1} 子词性`}
                                            data-v3-field="sub_pos"
                                            data-v3-node-id={sense.id}
                                            onChange={(subPos) =>
                                              change((draft) => {
                                                draft.pos[posIndex]!.senses[
                                                  senseIndex
                                                ]!.sub_pos = subPos;
                                              })
                                            }
                                            options={(() => {
                                              const code = formPosById.get(
                                                pos.pos_id
                                              );
                                              const configured = code
                                                ? (catalogByCode.get(code)
                                                    ?.sub_parts ?? [])
                                                : [];
                                              const known = configured.some(
                                                (item) =>
                                                  item.code === sense.sub_pos
                                              );
                                              return [
                                                ...(subPosRequired
                                                  ? []
                                                  : [
                                                      {
                                                        label: "不指定子词性",
                                                        value: ""
                                                      }
                                                    ]),
                                                ...(!sense.sub_pos || known
                                                  ? []
                                                  : [
                                                      {
                                                        label: "未配置子词性",
                                                        value: sense.sub_pos
                                                      }
                                                    ]),
                                                ...configured.map((item) => ({
                                                  label: item.name_zh,
                                                  value: item.code
                                                }))
                                              ];
                                            })()}
                                            placeholder="请选择细分词性"
                                            status={
                                              subPosIssue ? "error" : undefined
                                            }
                                            value={
                                              subPosRequired && !sense.sub_pos
                                                ? undefined
                                                : sense.sub_pos
                                            }
                                          />
                                        ) : (
                                          <Typography.Text
                                            data-v3-field="sub_pos"
                                            data-v3-node-id={sense.id}
                                          >
                                            {visibleSubPos ?? sense.sub_pos}
                                          </Typography.Text>
                                        )}
                                        <FieldIssueHelp issue={subPosIssue} />
                                      </label>
                                    )}
                                    <label className="word-sense-field word-sense-field-frequency">
                                      <Typography.Text type="secondary">
                                        词频
                                      </Typography.Text>
                                      <InputNumber
                                        aria-label={`释义 ${senseIndex + 1} 频率`}
                                        data-v3-field="frequency"
                                        data-v3-node-id={sense.id}
                                        placeholder="0–100"
                                        max={100}
                                        min={0}
                                        onChange={(nextValue) =>
                                          change((draft) => {
                                            const target =
                                              draft.pos[posIndex]!.senses[
                                                senseIndex
                                              ]!;
                                            if (nextValue === null)
                                              delete target.frequency;
                                            else
                                              target.frequency =
                                                String(nextValue);
                                          })
                                        }
                                        precision={2}
                                        step={0.01}
                                        suffix="%"
                                        status={
                                          frequencyIssue ? "error" : undefined
                                        }
                                        value={
                                          sense.frequency === undefined
                                            ? null
                                            : Number(sense.frequency)
                                        }
                                      />
                                      <FieldIssueHelp issue={frequencyIssue} />
                                    </label>
                                    <div className="word-sense-context-toggle">
                                      <Typography.Text type="secondary">
                                        是否依赖语境
                                      </Typography.Text>
                                      <div
                                        className="word-sense-context-control"
                                        onKeyDown={(event) => {
                                          if (
                                            event.key !== "Enter" &&
                                            event.key !== " "
                                          ) {
                                            return;
                                          }
                                          event.preventDefault();
                                          change((draft) => {
                                            const target =
                                              draft.pos[posIndex]!.senses[
                                                senseIndex
                                              ]!;
                                            target.depends_on_context =
                                              !target.depends_on_context;
                                          });
                                        }}
                                      >
                                        <Switch
                                          aria-label={`释义 ${senseIndex + 1} 是否依赖语境`}
                                          checked={sense.depends_on_context}
                                          onChange={(checked) =>
                                            change((draft) => {
                                              draft.pos[posIndex]!.senses[
                                                senseIndex
                                              ]!.depends_on_context = checked;
                                            })
                                          }
                                        />
                                      </div>
                                    </div>
                                    {formGroupIssue ? (
                                      <div
                                        className="word-sense-field word-sense-field-form-group"
                                        data-v3-field="form_group_id"
                                        data-v3-node-id={sense.id}
                                        tabIndex={-1}
                                      >
                                        <Typography.Text type="secondary">
                                          请在第 2
                                          步「词形与发音」调整专用词义设置。
                                        </Typography.Text>
                                        <FieldIssueHelp
                                          issue={formGroupIssue}
                                        />
                                      </div>
                                    ) : null}
                                  </div>

                                  <section
                                    className={`word-sense-section${definitionsCollapsed ? " is-collapsed" : ""}`}
                                    data-v3-field="definitions"
                                    data-v3-node-id={sense.id}
                                  >
                                    <SenseSectionTitle
                                      collapsed={definitionsCollapsed}
                                      count={sense.definitions.length}
                                      extra={
                                        <V3ReferenceBadge
                                          label="绑定"
                                          nodeIds={[sense.id]}
                                        />
                                      }
                                      label="多维释义"
                                      onToggle={() =>
                                        toggleSenseSection(
                                          sense.id,
                                          "definitions",
                                          definitionsCollapsed
                                        )
                                      }
                                      unit="条"
                                    />
                                    <SenseSectionBody
                                      collapsed={definitionsCollapsed}
                                    >
                                      <>
                                        {sense.definitions.length > 0 ? (
                                          <div className="word-list-header word-definition-list-header">
                                            <span aria-hidden="true" />
                                            <span>释义语句</span>
                                            <span>语法结构</span>
                                            <span aria-hidden="true" />
                                          </div>
                                        ) : null}
                                        <SortableRows
                                          dragType={DEFINITION_DRAG_TYPE}
                                          items={sense.definitions}
                                          onChange={(next) =>
                                            change((draft) => {
                                              draft.pos[posIndex]!.senses[
                                                senseIndex
                                              ]!.definitions = next;
                                            })
                                          }
                                          scopeId={sense.id}
                                        >
                                          {(definitionSorting) =>
                                            sense.definitions.map(
                                              (definition, definitionIndex) => (
                                                <div
                                                  className={sortableRowClass(
                                                    "word-table-row word-definition-row",
                                                    definitionSorting,
                                                    definitionIndex
                                                  )}
                                                  data-v3-node-id={
                                                    definition.id
                                                  }
                                                  key={definition.id}
                                                  onDragLeave={
                                                    definitionSorting.handleDragLeave
                                                  }
                                                  onDragOver={(event) =>
                                                    definitionSorting.handleDragOver(
                                                      event,
                                                      definitionIndex
                                                    )
                                                  }
                                                  onDrop={(event) =>
                                                    definitionSorting.handleDrop(
                                                      event,
                                                      definitionIndex
                                                    )
                                                  }
                                                >
                                                  <div className="word-definition-meta">
                                                    <span className="word-number-cell word-sort-leading">
                                                      <SortableDragHandle
                                                        dragImageSelector={
                                                          SORTABLE_ROW_SELECTOR
                                                        }
                                                        index={definitionIndex}
                                                        label={`拖动定义 ${definitionIndex + 1}`}
                                                        singleItemTitle="至少需要两条释义"
                                                        sorting={
                                                          definitionSorting
                                                        }
                                                      />
                                                      <V3RowIndex
                                                        index={definitionIndex}
                                                      />
                                                    </span>
                                                    <div className="word-definition-options">
                                                      <Select
                                                        {...DEFINITION_TEXT_SELECT_PROPS}
                                                        aria-label={`定义 ${definitionIndex + 1} 等级`}
                                                        data-v3-field="level"
                                                        data-v3-node-id={
                                                          definition.id
                                                        }
                                                        onChange={(
                                                          level: string
                                                        ) =>
                                                          change((draft) => {
                                                            draft.pos[
                                                              posIndex
                                                            ]!.senses[
                                                              senseIndex
                                                            ]!.definitions[
                                                              definitionIndex
                                                            ]!.level = level;
                                                          })
                                                        }
                                                        options={CEFR_OPTIONS}
                                                        value={definition.level}
                                                      />
                                                      <Select
                                                        {...DEFINITION_TEXT_SELECT_PROPS}
                                                        aria-label={`定义 ${definitionIndex + 1} 语言`}
                                                        data-v3-field="definition_mode"
                                                        data-v3-node-id={
                                                          definition.id
                                                        }
                                                        onChange={(
                                                          language: DefinitionLanguageV3
                                                        ) =>
                                                          requestDefinitionMode(
                                                            definition,
                                                            DEFINITION_MODE_BY_PARTS[
                                                              language
                                                            ][
                                                              definitionStyleOf(
                                                                definition.definition_mode
                                                              )
                                                            ],
                                                            idFactory,
                                                            modal,
                                                            (next) =>
                                                              change(
                                                                (draft) => {
                                                                  draft.pos[
                                                                    posIndex
                                                                  ]!.senses[
                                                                    senseIndex
                                                                  ]!.definitions[
                                                                    definitionIndex
                                                                  ] = next;
                                                                }
                                                              )
                                                          )
                                                        }
                                                        options={
                                                          DEFINITION_LANGUAGE_OPTIONS
                                                        }
                                                        value={definitionLanguageOf(
                                                          definition.definition_mode
                                                        )}
                                                      />
                                                      <Select
                                                        {...DEFINITION_TEXT_SELECT_PROPS}
                                                        aria-label={`定义 ${definitionIndex + 1} 释义方式`}
                                                        data-v3-node-id={
                                                          definition.id
                                                        }
                                                        onChange={(
                                                          style: DefinitionStyleV3
                                                        ) =>
                                                          requestDefinitionMode(
                                                            definition,
                                                            DEFINITION_MODE_BY_PARTS[
                                                              definitionLanguageOf(
                                                                definition.definition_mode
                                                              )
                                                            ][style],
                                                            idFactory,
                                                            modal,
                                                            (next) =>
                                                              change(
                                                                (draft) => {
                                                                  draft.pos[
                                                                    posIndex
                                                                  ]!.senses[
                                                                    senseIndex
                                                                  ]!.definitions[
                                                                    definitionIndex
                                                                  ] = next;
                                                                }
                                                              )
                                                          )
                                                        }
                                                        options={
                                                          DEFINITION_STYLE_OPTIONS
                                                        }
                                                        value={definitionStyleOf(
                                                          definition.definition_mode
                                                        )}
                                                      />
                                                    </div>
                                                  </div>
                                                  <div className="word-definition-content-cell">
                                                    {definition.definition_mode ===
                                                      "zh_definition" ||
                                                    definition.definition_mode ===
                                                      "zh_sentence" ? (
                                                      <Input.TextArea
                                                        aria-label={`定义 ${definitionIndex + 1} 内容`}
                                                        placeholder={
                                                          definition.definition_mode ===
                                                          "zh_sentence"
                                                            ? "请输入中文释义句"
                                                            : "请输入中文释义"
                                                        }
                                                        autoSize={{
                                                          maxRows: 6,
                                                          minRows: 1
                                                        }}
                                                        data-v3-field="content"
                                                        data-v3-node-id={
                                                          definition.id
                                                        }
                                                        onChange={(event) =>
                                                          change((draft) => {
                                                            const target =
                                                              draft.pos[
                                                                posIndex
                                                              ]!.senses[
                                                                senseIndex
                                                              ]!.definitions[
                                                                definitionIndex
                                                              ]!;
                                                            if (
                                                              target.definition_mode ===
                                                                "zh_definition" ||
                                                              target.definition_mode ===
                                                                "zh_sentence"
                                                            ) {
                                                              target.content =
                                                                replaceRichText(
                                                                  target.content,
                                                                  event.target
                                                                    .value
                                                                );
                                                            }
                                                          })
                                                        }
                                                        status={
                                                          fieldIssue(
                                                            issues,
                                                            definition.id,
                                                            "content"
                                                          )
                                                            ? "error"
                                                            : undefined
                                                        }
                                                        value={
                                                          definition.content
                                                            .text
                                                        }
                                                      />
                                                    ) : (
                                                      <V3LinkedEnglishTextField
                                                        value={
                                                          definition.content as EnglishTextV3
                                                        }
                                                        label={`定义 ${definitionIndex + 1}`}
                                                        suffix="内容"
                                                        renderEditorTitle={(
                                                          dialect
                                                        ) => (
                                                          <V3EditorTitle
                                                            index={
                                                              definitionIndex
                                                            }
                                                            title="多维释义"
                                                            details={`${definitionStyleOf(definition.definition_mode) === "sentence" ? "整句释义" : "定义释义"} · ${dialectLabel(dialect)}`}
                                                          />
                                                        )}
                                                        placeholder={
                                                          definition.definition_mode ===
                                                          "en_sentence"
                                                            ? "请输入英文释义句"
                                                            : "请输入英文释义"
                                                        }
                                                        wordId={wordId}
                                                        forms={forms}
                                                        meanings={value}
                                                        linksEnabled={
                                                          textLinksEnabled
                                                        }
                                                        readOnly={saving}
                                                        onChange={(content) =>
                                                          change((draft) => {
                                                            const target =
                                                              draft.pos[
                                                                posIndex
                                                              ]!.senses[
                                                                senseIndex
                                                              ]!.definitions[
                                                                definitionIndex
                                                              ]!;
                                                            if (
                                                              target.definition_mode ===
                                                                "en_definition" ||
                                                              target.definition_mode ===
                                                                "en_sentence"
                                                            )
                                                              target.content =
                                                                content;
                                                          })
                                                        }
                                                      />
                                                    )}
                                                    <FieldIssueHelp
                                                      issue={definitionContentIssue(
                                                        issues,
                                                        definition
                                                      )}
                                                    />
                                                  </div>
                                                  <div className="word-field-with-help">
                                                    <Select
                                                      aria-required="true"
                                                      aria-label={`定义 ${definitionIndex + 1} 语法结构`}
                                                      className="tsz-words word-grammar-select"
                                                      classNames={{
                                                        popup: {
                                                          root: "word-grammar-dropdown"
                                                        }
                                                      }}
                                                      data-v3-field="grammar_structure_id"
                                                      data-v3-node-id={
                                                        definition.id
                                                      }
                                                      onChange={(
                                                        nextValue: string
                                                      ) =>
                                                        change((draft) => {
                                                          const target =
                                                            draft.pos[posIndex]!
                                                              .senses[
                                                              senseIndex
                                                            ]!.definitions[
                                                              definitionIndex
                                                            ]!;
                                                          target.grammar_structure_id =
                                                            nextValue;
                                                        })
                                                      }
                                                      options={[
                                                        ...(definition.grammar_structure_id &&
                                                        !pos.grammar_structures.some(
                                                          (item) =>
                                                            item.id ===
                                                            definition.grammar_structure_id
                                                        )
                                                          ? [
                                                              {
                                                                label:
                                                                  "未找到的语法结构",
                                                                value:
                                                                  definition.grammar_structure_id
                                                              }
                                                            ]
                                                          : []),
                                                        ...grammarStructureOptions(
                                                          pos.grammar_structures,
                                                          definition.grammar_structure_id
                                                        )
                                                      ]}
                                                      open={
                                                        structurePickerFor ===
                                                        definition.id
                                                      }
                                                      onOpenChange={(
                                                        open: boolean
                                                      ) => {
                                                        setStructurePickerFor(
                                                          open
                                                            ? definition.id
                                                            : null
                                                        );
                                                        if (!open)
                                                          setHoveredCopyKey(
                                                            null
                                                          );
                                                      }}
                                                      labelRender={({
                                                        value,
                                                        label
                                                      }) =>
                                                        renderGrammarStructureLabel(
                                                          pos.grammar_structures,
                                                          String(value),
                                                          label
                                                        )
                                                      }
                                                      optionRender={(
                                                        option
                                                      ) => {
                                                        // 「未找到的语法结构」那条占位项不给复制按钮：
                                                        // 把一个已失效的 id 套到后面每条，只会把一处
                                                        // 悬空引用扩散成 N 处。
                                                        const known =
                                                          pos.grammar_structures.some(
                                                            (item) =>
                                                              item.id ===
                                                              String(
                                                                option.value
                                                              )
                                                          );
                                                        return (
                                                          <span
                                                            className="word-grammar-option"
                                                            onMouseLeave={() =>
                                                              setHoveredCopyKey(
                                                                null
                                                              )
                                                            }
                                                          >
                                                            <span className="word-grammar-option-label tsz-words">
                                                              {renderGrammarStructureLabel(
                                                                pos.grammar_structures,
                                                                String(
                                                                  option.value
                                                                ),
                                                                option.label
                                                              )}
                                                            </span>
                                                            {known &&
                                                            definitionIndex <
                                                              sense.definitions
                                                                .length -
                                                                1 ? (
                                                              <Popover
                                                                content="填到本条及后面每条释义"
                                                                // 触发点在 Select 浮层里，气泡得压过下拉面板（默认 1050）才不被挡住。
                                                                zIndex={1100}
                                                                classNames={{
                                                                  root: "word-grammar-tip"
                                                                }}
                                                                destroyOnHidden
                                                                open={
                                                                  hoveredCopyKey ===
                                                                  `${definition.id}:${String(option.value)}`
                                                                }
                                                                placement="right"
                                                              >
                                                                <Button
                                                                  aria-label={`把「${String(option.label)}」套用到定义 ${definitionIndex + 1} 及后面每条释义`}
                                                                  className="word-grammar-option-copy"
                                                                  onMouseEnter={() =>
                                                                    setHoveredCopyKey(
                                                                      `${definition.id}:${String(option.value)}`
                                                                    )
                                                                  }
                                                                  onMouseLeave={() =>
                                                                    setHoveredCopyKey(
                                                                      null
                                                                    )
                                                                  }
                                                                  icon={
                                                                    <CopyOutlined />
                                                                  }
                                                                  onClick={(
                                                                    event
                                                                  ) => {
                                                                    // 拦掉选项本身的选中：这里要一次写好本条与后面每条，
                                                                    // 再让 rc-select 触发 onChange 会拿旧快照把它们覆盖回去。
                                                                    event.stopPropagation();
                                                                    const structureId =
                                                                      String(
                                                                        option.value
                                                                      );
                                                                    change(
                                                                      (
                                                                        draft
                                                                      ) => {
                                                                        const definitions =
                                                                          draft
                                                                            .pos[
                                                                            posIndex
                                                                          ]!
                                                                            .senses[
                                                                            senseIndex
                                                                          ]!
                                                                            .definitions;
                                                                        for (
                                                                          let index =
                                                                            definitionIndex;
                                                                          index <
                                                                          definitions.length;
                                                                          index += 1
                                                                        )
                                                                          definitions[
                                                                            index
                                                                          ]!.grammar_structure_id =
                                                                            structureId;
                                                                      }
                                                                    );
                                                                    setStructurePickerFor(
                                                                      null
                                                                    );
                                                                    setHoveredCopyKey(
                                                                      null
                                                                    );
                                                                  }}
                                                                  size="small"
                                                                  type="text"
                                                                />
                                                              </Popover>
                                                            ) : null}
                                                          </span>
                                                        );
                                                      }}
                                                      notFoundContent="请先在上方填写语法结构"
                                                      placeholder="请选择语法结构"
                                                      status={
                                                        fieldIssue(
                                                          issues,
                                                          definition.id,
                                                          "grammar_structure_id"
                                                        )
                                                          ? "error"
                                                          : undefined
                                                      }
                                                      value={
                                                        definition.grammar_structure_id
                                                      }
                                                    />
                                                    <FieldIssueHelp
                                                      issue={fieldIssue(
                                                        issues,
                                                        definition.id,
                                                        "grammar_structure_id"
                                                      )}
                                                    />
                                                  </div>
                                                  <Space
                                                    className="word-sort-actions"
                                                    orientation="horizontal"
                                                  >
                                                    <Button
                                                      aria-label={`删除定义 ${definitionIndex + 1}`}
                                                      danger
                                                      icon={<DeleteOutlined />}
                                                      onClick={() =>
                                                        change((draft) => {
                                                          draft.pos[
                                                            posIndex
                                                          ]!.senses[
                                                            senseIndex
                                                          ]!.definitions.splice(
                                                            definitionIndex,
                                                            1
                                                          );
                                                        })
                                                      }
                                                      size="small"
                                                      type="text"
                                                    />
                                                  </Space>
                                                </div>
                                              )
                                            )
                                          }
                                        </SortableRows>
                                        <Button
                                          block
                                          className="word-section-add-button"
                                          icon={<PlusOutlined aria-hidden />}
                                          onClick={() =>
                                            change((draft) => {
                                              draft.pos[posIndex]!.senses[
                                                senseIndex
                                              ]!.definitions.push(
                                                newDefinition(idFactory)
                                              );
                                            })
                                          }
                                          type="dashed"
                                        >
                                          添加释义
                                        </Button>
                                      </>
                                    </SenseSectionBody>
                                  </section>

                                  {entryKind === "phrase" ? (
                                    <section
                                      className={`word-sense-section${componentUsagesCollapsed ? " is-collapsed" : ""}`}
                                      data-v3-field="component_usages"
                                      data-v3-node-id={sense.id}
                                    >
                                      <SenseSectionTitle
                                        collapsed={componentUsagesCollapsed}
                                        count={reachableUsageCount(
                                          componentSpelling,
                                          senseComponentUsages
                                        )}
                                        label="成分用词"
                                        onToggle={() =>
                                          toggleSenseSection(
                                            sense.id,
                                            "component_usages",
                                            componentUsagesCollapsed
                                          )
                                        }
                                        unit="条"
                                      />
                                      <SenseSectionBody
                                        collapsed={componentUsagesCollapsed}
                                      >
                                        <V3PhraseComponentUsagesCard
                                          idFactory={idFactory}
                                          onUsagesChange={(next) =>
                                            change((draft) => {
                                              draft.pos[posIndex]!.senses[
                                                senseIndex
                                              ]!.component_usages = next;
                                            })
                                          }
                                          senseComponentUsagesEnabled={
                                            componentUsagesEnabled
                                          }
                                          spelling={componentSpelling}
                                          usages={senseComponentUsages}
                                          wordId={wordId}
                                        />
                                      </SenseSectionBody>
                                    </section>
                                  ) : null}

                                  {renderSentenceSection?.(sense.id)}

                                  <section
                                    className={`word-sense-section${relationsCollapsed ? " is-collapsed" : ""}`}
                                  >
                                    <SenseSectionTitle
                                      collapsed={relationsCollapsed}
                                      count={
                                        groupRelations(sense.relations).length
                                      }
                                      label="拓展词"
                                      onToggle={() =>
                                        toggleSenseSection(
                                          sense.id,
                                          "relations",
                                          relationsCollapsed
                                        )
                                      }
                                      unit="个"
                                    />
                                    <SenseSectionBody
                                      collapsed={relationsCollapsed}
                                    >
                                      <V3RelationsGrid
                                        change={change}
                                        currentWordId={wordId}
                                        idFactory={idFactory}
                                        posIndex={posIndex}
                                        sense={sense}
                                        senseIndex={senseIndex}
                                        relationDisplaySnapshots={
                                          relationDisplaySnapshots
                                        }
                                      />
                                    </SenseSectionBody>
                                  </section>
                                </Flex>
                              </SenseEditorShell>
                            );
                          })
                        }
                      </SortableRows>
                      <Button
                        block
                        className="word-section-add-button"
                        icon={<PlusOutlined aria-hidden />}
                        onClick={() =>
                          change((draft) => {
                            const posDraft = draft.pos[posIndex]!;
                            const inheritedGroupId =
                              [...posDraft.senses]
                                .reverse()
                                .find((sense) => sense.sense_group_id)
                                ?.sense_group_id ?? draft.sense_groups[0]?.id;
                            const addedSense = newSense(
                              idFactory,
                              inheritedGroupId
                            );
                            inheritedSenseGroups.current.set(
                              addedSense.id,
                              inheritedGroupId
                            );
                            posDraft.senses.push(addedSense);
                          })
                        }
                        size="large"
                        type="dashed"
                      >
                        添加词义
                      </Button>
                    </div>
                  </Flex>
                </div>
              ) : null
            };
          })}
          onChange={onActivePosChange}
        />
      )}

      {onSave && (
        <V3StepActions>
          {onPrevious ? (
            <Button type="text" disabled={saving} onClick={onPrevious}>
              上一步
            </Button>
          ) : null}
          <Button
            disabled={saving || !canSave}
            onClick={() => void save("save")}
          >
            保存草稿
          </Button>
          <Button
            disabled={saving}
            loading={saving}
            onClick={() => void save("complete")}
            type="primary"
          >
            完成并进入预览
          </Button>
        </V3StepActions>
      )}
    </Flex>
  );
}

export function V3MeaningsAndExamplesStep(
  props: V3MeaningsAndExamplesStepProps
) {
  return (
    <PronunciationPreviewProvider>
      <V3MeaningsAndExamplesStepContent {...props} />
    </PronunciationPreviewProvider>
  );
}
