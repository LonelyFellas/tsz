import {
  CaretDownFilled,
  CaretUpFilled,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  EllipsisOutlined,
  HolderOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  SoundOutlined,
  UpOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  AutoComplete,
  Badge,
  Button,
  Card,
  Collapse,
  Dropdown,
  Empty,
  Flex,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tag,
  Tabs,
  Typography
} from "antd";
import type {
  Dialect,
  DialectModeV3,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  EnglishTextV3,
  PartOfSpeechCatalogResponse,
  RelatedWordResultAny,
  RichTextV3,
  SentenceAssociationInputV3,
  SentenceTranslationBandV3,
  StepSaveIntent,
  V3DraftValidationIssue,
  WordDefinitionV3,
  WordEntryKindV3,
  WordRelationWritableV3,
  WordSentenceAssociationV3,
  WordSentenceTranslationV3,
  WordSentenceWritableV3,
  WordSenseWritableV3
} from "@tsz/types";
import type { DragEvent, KeyboardEvent, ReactNode } from "react";
import { useState } from "react";
import { useRelatedSearchAny } from "../api";
import { CEFR_OPTIONS, cefrColor } from "../labels";
import { validateEntryInput } from "../word-creation/entryClassification";
import { newWordNodeId } from "../word-model/primitives";
import { addPartOfSpeech, deletePartOfSpeech } from "./operations";
import {
  editableEnglishText,
  newGrammarStructure,
  type RelationDisplaySnapshots,
  replaceEnglishText,
  replaceRichText,
  spellingModeForPos
} from "./meaningsModel";
import { dialectLabel, partOfSpeechLabel, relationLabel } from "./presentation";
import { v3IssueMessage } from "./presentationErrors";
import { countV3PosMeaningIncomplete } from "./posCompletion";
import { V3AddBasicPosSelect } from "./components/V3AddBasicPosSelect";
import { V3PhraseComponentUsagesCard } from "./components/V3PhraseComponentUsagesCard";
import {
  V3MultidimensionalSentenceDrawer,
  type V3MultidimensionalSentenceSaveDraft
} from "./components/V3MultidimensionalSentenceDrawer";

export interface V3MeaningsAndExamplesStepProps {
  value: DraftMeaningsStepContentWritableV3;
  onChange: (next: DraftMeaningsStepContentWritableV3) => void;
  onSave?: (
    content: DraftMeaningsStepContentWritableV3,
    intent: StepSaveIntent
  ) => Promise<void>;
  onPrevious?: () => void;
  saving?: boolean;
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
  sentenceAssociations?: Readonly<
    Record<string, readonly WordSentenceAssociationV3[]>
  >;
  onSaveMultidimensionalSentence?: (
    posId: string,
    senseId: string,
    draft: V3MultidimensionalSentenceSaveDraft
  ) => Promise<void>;
  onCreatePendingSentenceTarget?: (
    association: SentenceAssociationInputV3
  ) => void;
  sentenceTargetDiscoveryEnabled?: boolean;
  draftRelationPrebindingEnabled?: boolean;
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
type SenseSectionKind = "definitions" | "sentences" | "relations";

function translationTier(band: SentenceTranslationBandV3): {
  short: string;
  label: string;
} {
  if (band === "c1_c2") return { short: "初", label: "初阶" };
  if (band === "b1_b2") return { short: "中", label: "中阶" };
  return { short: "高", label: "高阶" };
}

function sentenceTranslationRows(
  sentence: WordSentenceWritableV3
): WordSentenceTranslationV3[] {
  if (sentence.zh_translations && sentence.zh_translations.length > 0)
    return sentence.zh_translations;
  const band: SentenceTranslationBandV3 = sentence.level.startsWith("C")
    ? "c1_c2"
    : sentence.level.startsWith("B")
      ? "b1_b2"
      : "a1_a2";
  return [
    {
      id: sentence.zh_text_id,
      band,
      content: sentence.zh_text
    }
  ];
}

function SenseSectionTitle({
  label,
  count,
  unit,
  collapsed,
  onToggle
}: {
  label: string;
  count: number;
  unit: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      aria-expanded={!collapsed}
      aria-label={`切换${label}`}
      className="word-sense-section-title is-interactive"
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onToggle();
      }}
      role="button"
      tabIndex={0}
    >
      <Typography.Text strong>{label}</Typography.Text>
      <div className="word-sense-section-title-actions">
        <Tag>{`${count} ${unit}`}</Tag>
        <Button
          aria-label={`${collapsed ? "展开" : "收起"}${label}`}
          className="word-sense-section-collapse"
          icon={collapsed ? <CaretDownFilled /> : <CaretUpFilled />}
          iconPlacement="end"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          size="small"
          type="text"
        >
          {collapsed ? "展开" : "收起"}
        </Button>
      </div>
    </div>
  );
}

function SenseSectionBody({
  collapsed,
  children
}: {
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden={collapsed}
      className={`word-sense-section-body${collapsed ? " is-collapsed" : ""}`}
      inert={collapsed}
    >
      <div className="word-sense-section-body-inner">{children}</div>
    </div>
  );
}

const SENSE_GROUP_DRAG_TYPE = "application/x-tsz-v3-sense-group";
const GRAMMAR_DRAG_TYPE = "application/x-tsz-v3-grammar-structure";
const DEFINITION_DRAG_TYPE = "application/x-tsz-v3-definition";
const SENTENCE_DRAG_TYPE = "application/x-tsz-v3-sentence";

function moveItem<T>(items: T[], index: number, nextIndex: number) {
  const [item] = items.splice(index, 1);
  if (item !== undefined) items.splice(nextIndex, 0, item);
}

interface SortableRowsController {
  canReorder: boolean;
  draggingIndex?: number;
  dragOverIndex?: number;
  handleDragStart: (event: DragEvent<HTMLElement>, sourceIndex: number) => void;
  handleDragEnd: () => void;
  handleDragOver: (
    event: DragEvent<HTMLDivElement>,
    targetIndex: number
  ) => void;
  handleDragLeave: () => void;
  handleDrop: (event: DragEvent<HTMLDivElement>, targetIndex: number) => void;
  handleKeyDown: (
    event: KeyboardEvent<HTMLElement>,
    sourceIndex: number
  ) => void;
}

function useSortableRows<T>({
  items,
  scopeId,
  dragType,
  onChange
}: {
  items: readonly T[];
  scopeId: string;
  dragType: string;
  onChange: (next: T[]) => void;
}): SortableRowsController {
  const [draggingIndex, setDraggingIndex] = useState<number>();
  const [dragOverIndex, setDragOverIndex] = useState<number>();
  const canReorder = items.length > 1;
  const reorder = (sourceIndex: number, targetIndex: number) => {
    if (
      sourceIndex < 0 ||
      sourceIndex >= items.length ||
      targetIndex < 0 ||
      targetIndex >= items.length ||
      sourceIndex === targetIndex
    ) {
      return;
    }
    const next = [...items];
    moveItem(next, sourceIndex, targetIndex);
    onChange(next);
  };
  const handleDragStart = (
    event: DragEvent<HTMLElement>,
    sourceIndex: number
  ) => {
    if (!canReorder) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      dragType,
      JSON.stringify({ scopeId, index: sourceIndex })
    );
    setDraggingIndex(sourceIndex);
  };
  const handleDragOver = (
    event: DragEvent<HTMLDivElement>,
    targetIndex: number
  ) => {
    if (!canReorder || !event.dataTransfer.types.includes(dragType)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverIndex(targetIndex);
  };
  const handleDrop = (
    event: DragEvent<HTMLDivElement>,
    targetIndex: number
  ) => {
    event.preventDefault();
    setDragOverIndex(undefined);
    const raw = event.dataTransfer.getData(dragType);
    if (!raw) return;
    try {
      const source = JSON.parse(raw) as {
        scopeId?: string;
        index?: number;
      };
      if (source.scopeId === scopeId && typeof source.index === "number") {
        reorder(source.index, targetIndex);
      }
    } catch {
      // Ignore drag data from outside this sortable editor.
    }
  };
  const handleKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    sourceIndex: number
  ) => {
    if (!canReorder) return;
    if (event.key === "ArrowUp" && sourceIndex > 0) {
      event.preventDefault();
      reorder(sourceIndex, sourceIndex - 1);
    }
    if (event.key === "ArrowDown" && sourceIndex < items.length - 1) {
      event.preventDefault();
      reorder(sourceIndex, sourceIndex + 1);
    }
  };
  return {
    canReorder,
    ...(draggingIndex === undefined ? {} : { draggingIndex }),
    ...(dragOverIndex === undefined ? {} : { dragOverIndex }),
    handleDragStart,
    handleDragEnd: () => {
      setDraggingIndex(undefined);
      setDragOverIndex(undefined);
    },
    handleDragOver,
    handleDragLeave: () => setDragOverIndex(undefined),
    handleDrop,
    handleKeyDown
  };
}

function sortableRowClass(
  baseClass: string,
  sorting: SortableRowsController,
  index: number
) {
  const dragging = sorting.draggingIndex === index;
  const dragOver = sorting.dragOverIndex === index;
  const position =
    dragOver && sorting.draggingIndex !== undefined
      ? sorting.draggingIndex < index
        ? " is-drag-over-after"
        : " is-drag-over-before"
      : "";
  return `${baseClass}${dragging ? " is-dragging" : ""}${dragOver ? " is-drag-over" : ""}${position}`;
}

function SortableDragHandle({
  label,
  singleItemTitle,
  sorting,
  index
}: {
  label: string;
  singleItemTitle: string;
  sorting: SortableRowsController;
  index: number;
}) {
  return (
    <Button
      aria-label={label}
      className="word-sort-drag-handle"
      disabled={!sorting.canReorder}
      draggable={sorting.canReorder}
      htmlType="button"
      icon={<HolderOutlined />}
      onDragEnd={sorting.handleDragEnd}
      onDragStart={(event) => {
        sorting.handleDragStart(event, index);
        const row = event.currentTarget.closest<HTMLElement>(
          ".word-sense-group-item, .word-grammar-row, .word-definition-row, .word-sentence-row"
        );
        if (row && typeof event.dataTransfer.setDragImage === "function") {
          event.dataTransfer.setDragImage(row, 24, 24);
        }
      }}
      onKeyDown={(event) => sorting.handleKeyDown(event, index)}
      size="small"
      title={
        sorting.canReorder ? "拖动排序，也可使用上下方向键" : singleItemTitle
      }
      type="text"
    />
  );
}

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
  length,
  onMove,
  onDelete,
  nodeId
}: {
  children: ReactNode;
  index: number;
  level: string;
  summary: string;
  subPosLabel?: string;
  length: number;
  onMove: (nextIndex: number) => void;
  onDelete: () => void;
  nodeId: string;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const safeLevel = /^(?:A1|A2|B1|B2|C1|C2)$/u.test(level) ? level : "A1";
  return (
    <div data-v3-field="sense" data-v3-node-id={nodeId} tabIndex={-1}>
      <Collapse
        activeKey={expanded ? [nodeId] : []}
        className={`word-sense-editor word-sense-editor-${safeLevel.toLowerCase()}`}
        onChange={(keys) =>
          setExpanded((Array.isArray(keys) ? keys : [keys]).includes(nodeId))
        }
        items={[
          {
            key: nodeId,
            showArrow: false,
            label: (
              <div className="word-sense-header-label">
                <Space wrap size={6}>
                  <Tag color={cefrColor(safeLevel as "A1")}>{level}</Tag>
                  <Typography.Text strong>
                    {index + 1}. {summary}
                  </Typography.Text>
                  {subPosLabel ? <Tag color="green">{subPosLabel}</Tag> : null}
                </Space>
                <span className="word-form-card-toggle-state">
                  <span>{expanded ? "收起" : "展开"}</span>
                  {expanded ? <CaretUpFilled /> : <CaretDownFilled />}
                </span>
              </div>
            ),
            extra: (
              <Dropdown
                placement="bottomRight"
                trigger={["click"]}
                menu={{
                  items: [
                    {
                      key: "up",
                      icon: <UpOutlined />,
                      label: "上移词义",
                      disabled: index === 0
                    },
                    {
                      key: "down",
                      icon: <DownOutlined />,
                      label: "下移词义",
                      disabled: index === length - 1
                    },
                    { type: "divider" },
                    {
                      key: "delete",
                      icon: <DeleteOutlined />,
                      label: "删除词义",
                      danger: true
                    }
                  ],
                  onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    if (key === "up") onMove(index - 1);
                    if (key === "down") onMove(index + 1);
                    if (key === "delete") onDelete();
                  }
                }}
              >
                <Button
                  aria-label={`管理词义 ${index + 1}`}
                  icon={<EllipsisOutlined />}
                  onClick={(event) => event.stopPropagation()}
                  type="text"
                />
              </Dropdown>
            ),
            children
          }
        ]}
      />
    </div>
  );
}

const GRAMMAR_PLACEHOLDER: Record<Dialect, string> = {
  common: "例如 a centre / the centre",
  uk: "例如 a centre / the centre",
  us: "例如 a center / the center"
};

function GrammarStructuresCard({
  pos,
  posIndex,
  spellingMode,
  change,
  idFactory
}: {
  pos: DraftMeaningsStepContentWritableV3["pos"][number];
  posIndex: number;
  spellingMode: DialectModeV3;
  change: (mutation: DraftMutation) => void;
  idFactory: () => string;
}) {
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
    <Card
      className="word-grammar-card"
      extra={
        <Button
          icon={<PlusOutlined aria-hidden />}
          onClick={() =>
            change((draft) => {
              draft.pos[posIndex]!.grammar_structures.push(
                newGrammarStructure(idFactory, spellingMode)
              );
            })
          }
          size="small"
          type="text"
        >
          添加语法结构
        </Button>
      }
      size="small"
      title="语法结构"
    >
      {pos.grammar_structures.length === 0 ? (
        <Typography.Text type="secondary">暂无语法结构</Typography.Text>
      ) : (
        <Flex vertical gap="small">
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
              <span className="word-grammar-index">{structureIndex + 1}</span>
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
                    {variant.dialect === "common" ? null : (
                      <Typography.Text
                        className="word-grammar-dialect-label"
                        type="secondary"
                      >
                        {dialectLabel(variant.dialect)}
                      </Typography.Text>
                    )}
                    <Input.TextArea
                      aria-label={`语法结构 ${structureIndex + 1} ${dialectLabel(variant.dialect)}内容`}
                      autoSize={{ minRows: 2, maxRows: 6 }}
                      className="word-pronunciation-phonetic-input"
                      data-v3-field="content"
                      data-v3-node-id={variant.id}
                      onChange={(event) =>
                        change((draft) => {
                          const target =
                            draft.pos[posIndex]!.grammar_structures[
                              structureIndex
                            ]!.variants[variantIndex]!;
                          target.content = replaceRichText(
                            target.content,
                            event.target.value
                          );
                        })
                      }
                      placeholder={GRAMMAR_PLACEHOLDER[variant.dialect]}
                      value={variant.content.text}
                    />
                  </div>
                ))}
              </div>
              <Space
                className="word-sort-actions"
                orientation="vertical"
                size={2}
              >
                <SortableDragHandle
                  index={structureIndex}
                  label={`拖动语法结构 ${structureIndex + 1}`}
                  singleItemTitle="至少需要两条语法结构"
                  sorting={sorting}
                />
                <Button
                  aria-label={`删除语法结构 ${structureIndex + 1}`}
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    change((draft) => {
                      draft.pos[posIndex]!.grammar_structures.splice(
                        structureIndex,
                        1
                      );
                      for (const sense of draft.pos[posIndex]!.senses) {
                        for (const definition of sense.definitions) {
                          if (
                            definition.grammar_structure_id === structure.id
                          ) {
                            delete definition.grammar_structure_id;
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
        </Flex>
      )}
    </Card>
  );
}

function newSense(
  idFactory: () => string,
  senseGroupId?: string
): WordSenseWritableV3 {
  return {
    id: idFactory(),
    sub_pos: "",
    level: "A1",
    ...(senseGroupId ? { sense_group_id: senseGroupId } : {}),
    frequency: "0",
    depends_on_context: false,
    definitions: [],
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
      extra={
        <Button
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
          size="small"
          type="text"
        >
          添加语义区间
        </Button>
      }
    >
      <div className="word-sense-group-list">
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
            <span
              aria-label={`第 ${groupIndex + 1} 个语义区间`}
              className="word-sense-group-index"
            >
              {groupIndex + 1}
            </span>
            <label className="word-sense-group-field">
              <Typography.Text type="secondary">中文</Typography.Text>
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
            </label>
            <label className="word-sense-group-field">
              <Typography.Text type="secondary">英文</Typography.Text>
              <Input
                aria-label={`语义区间 ${groupIndex + 1} 英文`}
                data-v3-field="name_en"
                data-v3-node-id={group.id}
                onChange={(event) =>
                  change((draft) => {
                    const target = draft.sense_groups.find(
                      (candidate) => candidate.id === group.id
                    );
                    if (target) target.name_en = event.target.value;
                  })
                }
                placeholder="例如 Core geometric and physical space"
                value={group.name_en}
              />
            </label>
            <Space
              className="word-sort-actions"
              orientation="vertical"
              size={2}
            >
              <SortableDragHandle
                index={groupIndex}
                label={`拖动语义区间 ${groupIndex + 1}`}
                singleItemTitle="至少需要两个语义区间"
                sorting={sorting}
              />
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
    </Card>
  );
}

function newDefinition(idFactory: () => string): WordDefinitionV3 {
  return {
    id: idFactory(),
    level: "A1",
    definition_mode: "zh_definition",
    content_id: idFactory(),
    content: { version: 2, text: "", annotations: [] }
  };
}

type DefinitionModeV3 =
  "zh_definition" | "zh_sentence" | "en_definition" | "en_sentence";

const DEFINITION_MODE_OPTIONS: Array<{
  label: string;
  value: DefinitionModeV3;
}> = [
  { label: "中文定义释义", value: "zh_definition" },
  { label: "英文定义释义", value: "en_definition" },
  { label: "中文整句释义", value: "zh_sentence" },
  { label: "英文整句释义", value: "en_sentence" }
];

function definitionRichText(definition: WordDefinitionV3) {
  if (
    definition.definition_mode === "zh_definition" ||
    definition.definition_mode === "zh_sentence"
  ) {
    return definition.content as RichTextV3;
  }
  const englishContent = definition.content as EnglishTextV3;
  if (englishContent.mode === "unified") {
    return englishContent.common.value;
  }
  const readySlot = [englishContent.uk, englishContent.us].find(
    (slot) => slot.state === "ready"
  );
  return readySlot?.state === "ready"
    ? readySlot.variant.value
    : { version: 2 as const, text: "", annotations: [] };
}

function withDefinitionMode(
  definition: WordDefinitionV3,
  definitionMode: DefinitionModeV3,
  idFactory: () => string
): WordDefinitionV3 {
  const base = {
    id: definition.id,
    level: definition.level,
    ...(definition.grammar_structure_id
      ? { grammar_structure_id: definition.grammar_structure_id }
      : {})
  };
  if (definitionMode === "zh_definition" || definitionMode === "zh_sentence") {
    return {
      ...base,
      definition_mode: definitionMode,
      content_id:
        definition.definition_mode === "zh_definition" ||
        definition.definition_mode === "zh_sentence"
          ? definition.content_id
          : idFactory(),
      content: definitionRichText(definition)
    };
  }
  return {
    ...base,
    definition_mode: definitionMode,
    content:
      definition.definition_mode === "en_definition" ||
      definition.definition_mode === "en_sentence"
        ? definition.content
        : {
            mode: "unified",
            common: {
              id: idFactory(),
              origin: "manual",
              value: definition.content as RichTextV3
            }
          }
  };
}

interface ContextTarget {
  key: string;
  label: string;
  word_id: string;
  sense_id: string;
}

function relatedContextTargets(results: RelatedWordResultAny[]) {
  return results.flatMap((result): ContextTarget[] => {
    const wordId =
      result.schema_version === 3 ? result.entry_id : result.word_id;
    const headword =
      result.schema_version === 3 ? result.presentation.label : result.headword;
    return result.senses.map((sense) => ({
      key: `${wordId}:${sense.sense_id}`,
      label: `${headword} · ${sense.gloss || "暂无释义"}`,
      word_id: wordId,
      sense_id: sense.sense_id
    }));
  });
}

function primaryLinkState(
  sentence: WordSentenceWritableV3,
  wordId: string | undefined,
  senseId: string
): "missing" | "valid" | "invalid" {
  const primaryLinks = sentence.links.filter(
    (link) => link.role === "focus" || link.role === "head"
  );
  if (primaryLinks.length === 0) return "missing";
  if (
    primaryLinks.length === 1 &&
    primaryLinks[0]!.role === "focus" &&
    primaryLinks[0]!.word_id === wordId &&
    primaryLinks[0]!.sense_id === senseId
  ) {
    return "valid";
  }
  return "invalid";
}

const RELATION_TYPES = ["synonym", "antonym", "derivative"] as const;
type RelationType = (typeof RELATION_TYPES)[number];

const RELATION_META: Record<RelationType, { metric: string }> = {
  synonym: { metric: "相似度" },
  antonym: { metric: "差异度" },
  derivative: { metric: "关联度" }
};

interface RelatedWordChoice {
  word_id: string;
  headword: string;
  status: "draft" | "published";
  senses: Array<{ sense_id: string; gloss: string }>;
}

function relatedWordChoices(
  results: RelatedWordResultAny[]
): RelatedWordChoice[] {
  return Array.from(
    new Map(
      results.map((result) => {
        const wordId =
          result.schema_version === 3 ? result.entry_id : result.word_id;
        return [
          wordId,
          {
            word_id: wordId,
            headword:
              result.schema_version === 3
                ? result.presentation.label
                : result.headword,
            status:
              result.schema_version === 3
                ? (result.status ?? "published")
                : "published",
            senses: result.senses
          }
        ] as const;
      })
    ).values()
  );
}

/**
 * 关系目标词面回显。knownWords 是未保存选择的唯一权威；快照来自上次保存的
 * canonical，预绑定态须以快照里的 prebinding_state 甄别新旧——改选草稿未保存时
 * 快照仍指旧目标，直接用会串词面，此时退回通用占位，保存后自愈。
 */
function relationDisplayHeadword(
  relation: WordRelationWritableV3,
  known: RelatedWordChoice | undefined,
  snapshot: RelationDisplaySnapshots[string] | undefined
): string {
  const snapshotHeadword = relation.target_word_id
    ? snapshot?.headword
    : relation.prebound_target_word_id && snapshot?.prebinding_state
      ? snapshot?.headword
      : undefined;
  return (
    known?.headword ??
    snapshotHeadword ??
    relation.pending_target_headword ??
    ""
  );
}

/** 合法的待建词面：非空且通过英文词条名校验（纯待建形态的判定基础）。 */
function hasValidPendingHeadword(relation: WordRelationWritableV3): boolean {
  return (
    Boolean(relation.pending_target_headword?.trim()) &&
    !validateEntryInput(relation.pending_target_headword ?? "").issue
  );
}

function relationPrebindingLabel(
  relation: WordRelationWritableV3,
  snapshot: RelationDisplaySnapshots[string] | undefined
): string | undefined {
  if (!relation.prebound_target_word_id) return undefined;
  const state = snapshot?.prebinding_state ?? "waiting_first_sense";
  const status = snapshot?.target_status ?? "draft";
  if (status === "archived") {
    return state === "target_sense_deleted"
      ? "已归档 · 原词义已删除"
      : "已归档 · 等待第一词义";
  }
  return state === "target_sense_deleted"
    ? "原词义已删除 · 重新选择"
    : "草稿 · 等待第一词义";
}

function newRelation(
  idFactory: () => string,
  relation: (typeof RELATION_TYPES)[number] = "synonym"
): WordRelationWritableV3 {
  return {
    id: idFactory(),
    relation,
    score: "0"
  };
}

function sentenceLinkRoleLabel(role: string): string {
  if (role === "focus" || role === "head") return "主关联";
  if (role === "context") return "上下文关联";
  return "其他关联";
}

function RelationsGrid({
  sense,
  posIndex,
  senseIndex,
  change,
  idFactory,
  relationDisplaySnapshots,
  includeDraftTargets
}: {
  sense: WordSenseWritableV3;
  posIndex: number;
  senseIndex: number;
  change: (mutation: DraftMutation) => void;
  idFactory: () => string;
  relationDisplaySnapshots?: RelationDisplaySnapshots;
  includeDraftTargets: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Record<RelationType, boolean>>({
    synonym: false,
    antonym: false,
    derivative: false
  });
  const [searching, setSearching] = useState<{
    relationId: string;
    query: string;
  }>();
  const [knownWords, setKnownWords] = useState<
    Record<string, RelatedWordChoice>
  >({});
  const preparedSearch = validateEntryInput(searching?.query ?? "");
  const relatedSearch = useRelatedSearchAny(
    preparedSearch.normalized,
    preparedSearch.kind,
    Boolean(searching?.query.trim()) && !preparedSearch.issue,
    includeDraftTargets
  );
  const searchWords = relatedWordChoices(
    [
      ...(relatedSearch.exact.data?.pages ?? []),
      ...(relatedSearch.contains.data?.pages ?? [])
    ].flatMap((page) => page.results)
  );
  const searchFailed =
    relatedSearch.exact.isError || relatedSearch.contains.isError;
  const searchHasNextPage = Boolean(
    relatedSearch.exact.hasNextPage || relatedSearch.contains.hasNextPage
  );
  const loadMoreSearchResults = async () => {
    if (relatedSearch.exact.hasNextPage) {
      await relatedSearch.exact.fetchNextPage();
      return;
    }
    if (relatedSearch.contains.hasNextPage) {
      await relatedSearch.contains.fetchNextPage();
    }
  };
  const retryRelatedSearch = () =>
    Promise.all([
      ...(relatedSearch.exact.isError ? [relatedSearch.exact.refetch()] : []),
      ...(relatedSearch.contains.isError
        ? [relatedSearch.contains.refetch()]
        : [])
    ]);
  const relationInputIssue = (relation: WordRelationWritableV3) => {
    const raw =
      searching?.relationId === relation.id
        ? searching.query
        : (relation.pending_target_headword ?? "");
    return raw.trim() ? validateEntryInput(raw).issue : undefined;
  };

  return (
    <div className="word-relations-grid">
      {RELATION_TYPES.map((relationType) => {
        const meta = RELATION_META[relationType];
        const relations = sense.relations
          .map((relation, relationIndex) => ({ relation, relationIndex }))
          .filter(({ relation }) => relation.relation === relationType);
        return (
          <Card
            className={`word-relation-card${collapsed[relationType] ? " is-collapsed" : ""}`}
            data-relation-type={relationType}
            extra={
              <Button
                aria-label={`${collapsed[relationType] ? "展开" : "收起"}${relationLabel(relationType)}`}
                className="word-relation-collapse"
                icon={
                  collapsed[relationType] ? (
                    <CaretDownFilled />
                  ) : (
                    <CaretUpFilled />
                  )
                }
                iconPlacement="end"
                onClick={() =>
                  setCollapsed((current) => ({
                    ...current,
                    [relationType]: !current[relationType]
                  }))
                }
                size="small"
                type="text"
              >
                {collapsed[relationType] ? "展开" : "收起"}
              </Button>
            }
            key={relationType}
            size="small"
            title={relationLabel(relationType)}
          >
            {relations.length === 0 ? (
              <Empty
                description={`暂无${relationLabel(relationType)}`}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : (
              <Flex className="word-relation-list" vertical>
                <div className="word-relation-column-heads">
                  <span>{meta.metric}</span>
                  <span>{relationLabel(relationType)}</span>
                  <span>匹配词义</span>
                  <span />
                </div>
                {relations.map(({ relation, relationIndex }) => (
                  <div
                    className="word-relation-row"
                    data-v3-node-id={relation.id}
                    key={relation.id}
                  >
                    <InputNumber
                      aria-label={meta.metric}
                      data-v3-field="score"
                      data-v3-node-id={relation.id}
                      max={100}
                      min={0}
                      onChange={(score) =>
                        change((draft) => {
                          draft.pos[posIndex]!.senses[senseIndex]!.relations[
                            relationIndex
                          ]!.score = String(score ?? 0);
                        })
                      }
                      precision={2}
                      size="small"
                      suffix="%"
                      value={Number(relation.score)}
                    />
                    <AutoComplete
                      className="word-relation-autocomplete"
                      filterOption={false}
                      notFoundContent={
                        relatedSearch.exact.isFetching ||
                        relatedSearch.contains.isFetching
                          ? "搜索中…"
                          : searchFailed
                            ? "搜索失败，请重试"
                            : searchHasNextPage
                              ? "仍有结果未加载"
                              : searching?.query
                                ? "未找到匹配词条"
                                : "输入词汇搜索"
                      }
                      onFocus={() => {
                        if (searching?.relationId === relation.id) return;
                        setSearching({
                          relationId: relation.id,
                          query: relationDisplayHeadword(
                            relation,
                            knownWords[relation.id],
                            relationDisplaySnapshots?.[relation.id]
                          )
                        });
                      }}
                      onSearch={(query) => {
                        const prepared = validateEntryInput(query);
                        setSearching({ relationId: relation.id, query });
                        setKnownWords((current) => {
                          if (!(relation.id in current)) return current;
                          const next = { ...current };
                          delete next[relation.id];
                          return next;
                        });
                        change((draft) => {
                          const target =
                            draft.pos[posIndex]!.senses[senseIndex]!.relations[
                              relationIndex
                            ]!;
                          delete target.target_word_id;
                          delete target.target_sense_id;
                          delete target.prebound_target_word_id;
                          if (!prepared.issue && prepared.normalized)
                            target.pending_target_headword =
                              prepared.normalized;
                          else {
                            delete target.pending_target_headword;
                            delete target.pending_target_gloss;
                          }
                        });
                      }}
                      onSelect={(wordId) => {
                        const word = searchWords.find(
                          (candidate) => candidate.word_id === wordId
                        );
                        if (!word) return;
                        setKnownWords((current) => ({
                          ...current,
                          [relation.id]: word
                        }));
                        setSearching(undefined);
                        change((draft) => {
                          const target =
                            draft.pos[posIndex]!.senses[senseIndex]!.relations[
                              relationIndex
                            ]!;
                          if (
                            word.status === "draft" &&
                            word.senses.length === 0
                          ) {
                            target.prebound_target_word_id = word.word_id;
                            // 预绑定不携带待建词面：词条身份在 prebound id 上，回显走只读快照。
                            delete target.pending_target_headword;
                            delete target.target_word_id;
                            delete target.target_sense_id;
                          } else {
                            target.target_word_id = word.word_id;
                            delete target.target_sense_id;
                            delete target.prebound_target_word_id;
                            delete target.pending_target_headword;
                            delete target.pending_target_gloss;
                          }
                        });
                      }}
                      options={
                        searching?.relationId === relation.id
                          ? searchWords.map((word) => ({
                              label: (
                                <Flex align="center" gap={6}>
                                  <span>{word.headword}</span>
                                  <Tag
                                    color={
                                      word.status === "draft"
                                        ? "orange"
                                        : "blue"
                                    }
                                  >
                                    {word.status === "draft"
                                      ? "草稿"
                                      : "已发布"}
                                  </Tag>
                                  {word.senses.length === 0 ? (
                                    <Typography.Text type="secondary">
                                      暂无词义
                                    </Typography.Text>
                                  ) : null}
                                </Flex>
                              ),
                              value: word.word_id
                            }))
                          : []
                      }
                      popupMatchSelectWidth={260}
                      status={
                        relationInputIssue(relation) ? "error" : undefined
                      }
                      value={
                        searching?.relationId === relation.id
                          ? searching.query
                          : relationDisplayHeadword(
                              relation,
                              knownWords[relation.id],
                              relationDisplaySnapshots?.[relation.id]
                            ) ||
                            (relation.target_word_id ||
                            relation.prebound_target_word_id
                              ? "已选择关联词"
                              : "")
                      }
                    >
                      <Input
                        aria-label={`${relationLabel(relationType)}目标词条`}
                        className="word-relation-target"
                        prefix={<SoundOutlined />}
                        suffix={
                          searching?.relationId === relation.id &&
                          searchFailed ? (
                            <Button
                              aria-label="重试关联词搜索"
                              onClick={() => void retryRelatedSearch()}
                              onMouseDown={(event) => event.preventDefault()}
                              size="small"
                              type="link"
                            >
                              搜索失败，重试
                            </Button>
                          ) : searching?.relationId === relation.id &&
                            searchHasNextPage ? (
                            <Button
                              aria-label="加载更多关联词结果"
                              onClick={() => void loadMoreSearchResults()}
                              onMouseDown={(event) => event.preventDefault()}
                              size="small"
                              type="link"
                            >
                              加载更多
                            </Button>
                          ) : null
                        }
                        placeholder="搜索关联词"
                        size="small"
                      />
                    </AutoComplete>
                    {!relation.target_word_id &&
                    (relation.prebound_target_word_id ||
                      hasValidPendingHeadword(relation)) ? (
                      <div className="word-relation-sense-cell">
                        {relationPrebindingLabel(
                          relation,
                          relationDisplaySnapshots?.[relation.id]
                        ) ? (
                          <Tag
                            color={
                              relationDisplaySnapshots?.[relation.id]
                                ?.target_status === "archived"
                                ? "default"
                                : "orange"
                            }
                          >
                            {relationPrebindingLabel(
                              relation,
                              relationDisplaySnapshots?.[relation.id]
                            )}
                          </Tag>
                        ) : null}
                        <Input
                          aria-label={`${relationLabel(relationType)}预定义词义`}
                          className="word-relation-sense"
                          data-v3-field="pending_target_gloss"
                          data-v3-node-id={relation.id}
                          maxLength={5000}
                          onChange={(event) =>
                            change((draft) => {
                              const target =
                                draft.pos[posIndex]!.senses[senseIndex]!
                                  .relations[relationIndex]!;
                              if (event.target.value)
                                target.pending_target_gloss =
                                  event.target.value;
                              else delete target.pending_target_gloss;
                            })
                          }
                          placeholder="预定义词义（可选）"
                          size="small"
                          value={relation.pending_target_gloss ?? ""}
                        />
                      </div>
                    ) : (
                      <Select
                        aria-label={`${relationLabel(relationType)}目标词义`}
                        className="word-relation-sense"
                        disabled={!relation.target_word_id}
                        onChange={(targetSenseId) =>
                          change((draft) => {
                            draft.pos[posIndex]!.senses[senseIndex]!.relations[
                              relationIndex
                            ]!.target_sense_id = targetSenseId;
                          })
                        }
                        options={(
                          knownWords[relation.id]?.senses ??
                          (relation.target_sense_id
                            ? [
                                {
                                  sense_id: relation.target_sense_id,
                                  gloss:
                                    relationDisplaySnapshots?.[relation.id]
                                      ?.gloss ?? "已匹配词义"
                                }
                              ]
                            : [])
                        ).map((targetSense) => ({
                          label: targetSense.gloss || "（无释义）",
                          value: targetSense.sense_id
                        }))}
                        placeholder="选择词义"
                        size="small"
                        value={relation.target_sense_id}
                      />
                    )}
                    {relationInputIssue(relation) ? (
                      <div className="word-relation-input-error" role="alert">
                        {relationInputIssue(relation)}
                      </div>
                    ) : null}
                    <Button
                      aria-label={`删除${relationLabel(relationType)}`}
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        change((draft) => {
                          draft.pos[posIndex]!.senses[
                            senseIndex
                          ]!.relations.splice(relationIndex, 1);
                        })
                      }
                      size="small"
                      type="text"
                    />
                  </div>
                ))}
                {relations.some(
                  ({ relation }) =>
                    !relation.target_word_id &&
                    !relation.prebound_target_word_id &&
                    hasValidPendingHeadword(relation)
                ) ? (
                  <div
                    aria-label={`${relationLabel(relationType)}待建条汇总`}
                    className="word-relation-pending-hint"
                    role="note"
                  >
                    <PlusOutlined aria-hidden />
                    <span>未选定词条，发布时会自动匹配同名词条或建条</span>
                  </div>
                ) : null}
              </Flex>
            )}
            <Button
              block
              className="word-section-add-button"
              icon={<PlusOutlined aria-hidden />}
              onClick={() => {
                const relation = newRelation(idFactory, relationType);
                change((draft) => {
                  draft.pos[posIndex]!.senses[senseIndex]!.relations.push(
                    relation
                  );
                });
                setSearching({ relationId: relation.id, query: "" });
              }}
              size="small"
              type="dashed"
            >
              添加{relationLabel(relationType)}
            </Button>
          </Card>
        );
      })}
    </div>
  );
}

export function V3MeaningsAndExamplesStep({
  value,
  onChange,
  onSave,
  onPrevious,
  saving = false,
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
  sentenceAssociations = {},
  onSaveMultidimensionalSentence,
  onCreatePendingSentenceTarget,
  sentenceTargetDiscoveryEnabled = true,
  draftRelationPrebindingEnabled = false
}: V3MeaningsAndExamplesStepProps) {
  const { modal } = App.useApp();
  const [contextSearch, setContextSearch] = useState<{
    sentenceId: string;
    linkIndex?: number;
    query: string;
  }>();
  const [knownContextTargets, setKnownContextTargets] = useState<
    Record<string, ContextTarget>
  >({});
  const [collapsedSenseSections, setCollapsedSenseSections] = useState<
    Record<string, boolean>
  >({});
  const [sentenceDrawerTarget, setSentenceDrawerTarget] = useState<{
    posId: string;
    senseId: string;
    sentence?: WordSentenceWritableV3;
  }>();
  const toggleSenseSection = (senseId: string, section: SenseSectionKind) => {
    const key = `${senseId}:${section}`;
    setCollapsedSenseSections((current) => ({
      ...current,
      [key]: !current[key]
    }));
  };
  const change = (mutation: DraftMutation) => {
    const next = structuredClone(value);
    mutation(next);
    onChange(next);
  };

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
  const localContextTargets = value.pos.flatMap((pos, posIndex) =>
    pos.senses.map((sense, senseIndex) => ({
      key: `${wordId ?? ""}:${sense.id}`,
      label: `${visiblePosLabel(pos.pos_id, posIndex)} · 释义 ${senseIndex + 1}`,
      word_id: wordId ?? "",
      sense_id: sense.id
    }))
  );
  const relatedSearch = useRelatedSearchAny(
    contextSearch?.query ?? "",
    undefined,
    Boolean(contextSearch?.query.trim())
  );
  const remoteContextTargets = relatedContextTargets(
    [
      ...(relatedSearch.exact.data?.pages ?? []),
      ...(relatedSearch.contains.data?.pages ?? [])
    ].flatMap((page) => page.results)
  );
  const contextTargets = Array.from(
    new Map(
      [
        ...localContextTargets,
        ...Object.values(knownContextTargets),
        ...remoteContextTargets
      ].map((target) => [target.key, target])
    ).values()
  );

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
  const resolvedActivePosId =
    activePosId && visiblePosIds.includes(activePosId)
      ? activePosId
      : visiblePosIds[0];
  const definitionSummary = (sense: WordSenseWritableV3) => {
    const definition = sense.definitions[0];
    if (!definition) return "待填写释义";
    if (
      definition.definition_mode === "zh_definition" ||
      definition.definition_mode === "zh_sentence"
    ) {
      return definition.content.text.trim() || "待填写释义";
    }
    return (
      editableEnglishText(definition.content as EnglishTextV3).find((row) =>
        row.text.trim()
      )?.text ?? "待填写释义"
    );
  };
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
        catalog={partOfSpeechCatalog}
        forms={forms}
        isError={partOfSpeechCatalogError}
        isPending={partOfSpeechCatalogPending}
        onAdd={addBasicPos}
      />
    ) : null;
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
          <Flex justify="flex-end">{addBasicPosSelect}</Flex>
          <Empty description="当前还没有词性，请从右上角添加词性。" />
        </Flex>
      ) : (
        <Tabs
          activeKey={resolvedActivePosId}
          className="word-pos-tabs"
          tabBarExtraContent={addBasicPosSelect}
          items={visiblePosIds.map((posId, displayPosIndex) => {
            const posIndex = value.pos.findIndex((pos) => pos.pos_id === posId);
            const pos = value.pos[posIndex];
            return {
              key: posId,
              label: (
                <Space size={6}>
                  <strong>{visiblePosLabel(posId, displayPosIndex)}</strong>
                  {pos ? (
                    <Badge
                      count={countV3PosMeaningIncomplete(pos, value)}
                      size="small"
                      title="该词性未填项"
                    />
                  ) : null}
                  {forms &&
                  forms.pos.length > 1 &&
                  forms.pos.some((formPos) => formPos.pos_id === posId) &&
                  onFormsChange ? (
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
                  ) : null}
                </Space>
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
                      change={change}
                      idFactory={idFactory}
                      pos={pos}
                      posIndex={posIndex}
                      spellingMode={spellingModeForPos(forms, pos.pos_id)}
                    />

                    {entryKind === "phrase" ? (
                      <V3PhraseComponentUsagesCard
                        discoveryEnabled={sentenceTargetDiscoveryEnabled}
                        forms={forms}
                        onFormsChange={onFormsChange}
                        posId={pos.pos_id}
                        wordId={wordId}
                      />
                    ) : null}

                    <div
                      className="word-sense-list"
                      data-v3-field="senses"
                      data-v3-node-id={pos.pos_id}
                    >
                      {pos.senses.map((sense, senseIndex) => {
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
                        const configuredSubParts =
                          catalogByCode.get(formPosById.get(pos.pos_id) ?? "")
                            ?.sub_parts ?? [];
                        const visibleSubPos = configuredSubParts.find(
                          (item) => item.code === sense.sub_pos
                        )?.name_zh;
                        const definitionsCollapsed = Boolean(
                          collapsedSenseSections[`${sense.id}:definitions`]
                        );
                        const sentencesCollapsed = Boolean(
                          collapsedSenseSections[`${sense.id}:sentences`]
                        );
                        const relationsCollapsed = Boolean(
                          collapsedSenseSections[`${sense.id}:relations`]
                        );
                        return (
                          <SenseEditorShell
                            index={senseIndex}
                            key={sense.id}
                            length={pos.senses.length}
                            level={sense.level}
                            nodeId={sense.id}
                            onDelete={() =>
                              change((draft) => {
                                draft.pos[posIndex]!.senses.splice(
                                  senseIndex,
                                  1
                                );
                              })
                            }
                            onMove={(nextIndex) =>
                              change((draft) =>
                                moveItem(
                                  draft.pos[posIndex]!.senses,
                                  senseIndex,
                                  nextIndex
                                )
                              )
                            }
                            subPosLabel={visibleSubPos}
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
                                        draft.pos[posIndex]!.senses[
                                          senseIndex
                                        ]!.level = level;
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
                                        else target.sense_group_id = nextValue;
                                      })
                                    }
                                    options={[
                                      { label: "不归入语义区间", value: "" },
                                      ...value.sense_groups.map(
                                        (group, groupIndex) => ({
                                          label:
                                            group.name_zh ||
                                            group.name_en ||
                                            `语义区间 ${groupIndex + 1}`,
                                          value: group.id
                                        })
                                      )
                                    ]}
                                    placeholder="选择语义区间"
                                    value={sense.sense_group_id}
                                  />
                                </label>
                                <label className="word-sense-field word-sense-field-pos">
                                  <Typography.Text type="secondary">
                                    细分词性
                                  </Typography.Text>
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
                                      const code = formPosById.get(pos.pos_id);
                                      const configured = code
                                        ? (catalogByCode.get(code)?.sub_parts ??
                                          [])
                                        : [];
                                      const known = configured.some(
                                        (item) => item.code === sense.sub_pos
                                      );
                                      return [
                                        { label: "不指定子词性", value: "" },
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
                                    status={subPosIssue ? "error" : undefined}
                                    value={sense.sub_pos}
                                  />
                                  <FieldIssueHelp issue={subPosIssue} />
                                </label>
                                <label className="word-sense-field word-sense-field-frequency">
                                  <Typography.Text type="secondary">
                                    词频
                                  </Typography.Text>
                                  <InputNumber
                                    aria-label={`释义 ${senseIndex + 1} 频率`}
                                    data-v3-field="frequency"
                                    data-v3-node-id={sense.id}
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
                                          target.frequency = String(nextValue);
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
                              </div>

                              <section
                                className={`word-sense-section${definitionsCollapsed ? " is-collapsed" : ""}`}
                                data-v3-field="definitions"
                                data-v3-node-id={sense.id}
                              >
                                <SenseSectionTitle
                                  collapsed={definitionsCollapsed}
                                  count={sense.definitions.length}
                                  label="多维释义"
                                  onToggle={() =>
                                    toggleSenseSection(sense.id, "definitions")
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
                                        <span>等级</span>
                                        <span>释义语言及方式</span>
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
                                              data-v3-node-id={definition.id}
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
                                              <span className="word-number-cell">
                                                {definitionIndex + 1}
                                              </span>
                                              <>
                                                <Select
                                                  aria-label={`定义 ${definitionIndex + 1} 等级`}
                                                  data-v3-field="level"
                                                  data-v3-node-id={
                                                    definition.id
                                                  }
                                                  onChange={(level: string) =>
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
                                                  aria-label={`定义 ${definitionIndex + 1} 方式`}
                                                  data-v3-field="definition_mode"
                                                  data-v3-node-id={
                                                    definition.id
                                                  }
                                                  onChange={(
                                                    definitionMode: DefinitionModeV3
                                                  ) =>
                                                    change((draft) => {
                                                      const current =
                                                        draft.pos[posIndex]!
                                                          .senses[senseIndex]!
                                                          .definitions[
                                                          definitionIndex
                                                        ]!;
                                                      draft.pos[
                                                        posIndex
                                                      ]!.senses[
                                                        senseIndex
                                                      ]!.definitions[
                                                        definitionIndex
                                                      ] = withDefinitionMode(
                                                        current,
                                                        definitionMode,
                                                        idFactory
                                                      );
                                                    })
                                                  }
                                                  options={
                                                    DEFINITION_MODE_OPTIONS
                                                  }
                                                  value={
                                                    definition.definition_mode
                                                  }
                                                />
                                              </>
                                              <div className="word-definition-content-cell">
                                                {definition.definition_mode ===
                                                  "zh_definition" ||
                                                definition.definition_mode ===
                                                  "zh_sentence" ? (
                                                  <Input.TextArea
                                                    aria-label={`定义 ${definitionIndex + 1} 内容`}
                                                    data-v3-field="content"
                                                    data-v3-node-id={
                                                      definition.id
                                                    }
                                                    onChange={(event) =>
                                                      change((draft) => {
                                                        const target =
                                                          draft.pos[posIndex]!
                                                            .senses[senseIndex]!
                                                            .definitions[
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
                                                              event.target.value
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
                                                      definition.content.text
                                                    }
                                                  />
                                                ) : (
                                                  editableEnglishText(
                                                    definition.content as EnglishTextV3
                                                  ).map((row) => (
                                                    <Input.TextArea
                                                      aria-label={`定义 ${definitionIndex + 1} ${dialectLabel(row.dialect)}内容`}
                                                      data-v3-field="value"
                                                      data-v3-node-id={
                                                        row.variant_id
                                                      }
                                                      key={row.variant_id}
                                                      onChange={(event) =>
                                                        change((draft) => {
                                                          const target =
                                                            draft.pos[posIndex]!
                                                              .senses[
                                                              senseIndex
                                                            ]!.definitions[
                                                              definitionIndex
                                                            ]!;
                                                          if (
                                                            target.definition_mode ===
                                                              "en_definition" ||
                                                            target.definition_mode ===
                                                              "en_sentence"
                                                          ) {
                                                            target.content =
                                                              replaceEnglishText(
                                                                target.content,
                                                                row.dialect,
                                                                event.target
                                                                  .value
                                                              );
                                                          }
                                                        })
                                                      }
                                                      status={
                                                        fieldIssue(
                                                          issues,
                                                          row.variant_id,
                                                          "value"
                                                        )
                                                          ? "error"
                                                          : undefined
                                                      }
                                                      value={row.text}
                                                    />
                                                  ))
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
                                                          .senses[senseIndex]!
                                                          .definitions[
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
                                                    ...pos.grammar_structures.map(
                                                      (
                                                        structure,
                                                        structureIndex
                                                      ) => ({
                                                        label: `语法结构 ${structureIndex + 1}`,
                                                        value: structure.id
                                                      })
                                                    )
                                                  ]}
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
                                                orientation="vertical"
                                                size={2}
                                              >
                                                <SortableDragHandle
                                                  index={definitionIndex}
                                                  label={`拖动定义 ${definitionIndex + 1}`}
                                                  singleItemTitle="至少需要两条释义"
                                                  sorting={definitionSorting}
                                                />
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

                              <section
                                className={`word-sense-section${sentencesCollapsed ? " is-collapsed" : ""}`}
                              >
                                <SenseSectionTitle
                                  collapsed={sentencesCollapsed}
                                  count={sense.sentences.length}
                                  label="多维例句"
                                  onToggle={() =>
                                    toggleSenseSection(sense.id, "sentences")
                                  }
                                  unit="条"
                                />
                                <SenseSectionBody
                                  collapsed={sentencesCollapsed}
                                >
                                  <>
                                    {sense.sentences.length > 0 ? (
                                      <div className="word-list-header word-sentence-list-header">
                                        <span aria-hidden="true" />
                                        <span>等级</span>
                                        <span>英文例句</span>
                                        <span>汉语译文</span>
                                        <span aria-hidden="true" />
                                      </div>
                                    ) : (
                                      <Empty
                                        description="暂无多维例句"
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                      />
                                    )}
                                    <SortableRows
                                      dragType={SENTENCE_DRAG_TYPE}
                                      items={sense.sentences}
                                      onChange={(next) =>
                                        change((draft) => {
                                          draft.pos[posIndex]!.senses[
                                            senseIndex
                                          ]!.sentences = next;
                                        })
                                      }
                                      scopeId={sense.id}
                                    >
                                      {(sentenceSorting) =>
                                        sense.sentences.map(
                                          (sentence, sentenceIndex) => (
                                            <div
                                              className={sortableRowClass(
                                                "word-table-row word-sentence-row",
                                                sentenceSorting,
                                                sentenceIndex
                                              )}
                                              data-v3-field="sentence"
                                              data-v3-node-id={sentence.id}
                                              key={sentence.id}
                                              onDragLeave={
                                                sentenceSorting.handleDragLeave
                                              }
                                              onDragOver={(event) =>
                                                sentenceSorting.handleDragOver(
                                                  event,
                                                  sentenceIndex
                                                )
                                              }
                                              onDrop={(event) =>
                                                sentenceSorting.handleDrop(
                                                  event,
                                                  sentenceIndex
                                                )
                                              }
                                              tabIndex={-1}
                                            >
                                              <span className="word-number-cell">
                                                {sentenceIndex + 1}
                                              </span>
                                              <Select
                                                aria-label={`例句 ${sentenceIndex + 1} 等级`}
                                                data-v3-field="level"
                                                data-v3-node-id={sentence.id}
                                                disabled
                                                options={CEFR_OPTIONS}
                                                value={sentence.level}
                                              />
                                              <Space
                                                className="word-sentence-english-fields"
                                                orientation="vertical"
                                                size={6}
                                                style={{ width: "100%" }}
                                              >
                                                {editableEnglishText(
                                                  sentence.en_text
                                                ).map((row) => (
                                                  <Input
                                                    aria-label={`例句 ${sentenceIndex + 1} ${dialectLabel(row.dialect)}英文`}
                                                    data-v3-field="value"
                                                    data-v3-node-id={
                                                      row.variant_id
                                                    }
                                                    key={row.variant_id}
                                                    prefix={
                                                      <SoundOutlined
                                                        aria-hidden="true"
                                                        className="word-sentence-sound-icon"
                                                      />
                                                    }
                                                    readOnly
                                                    value={row.text}
                                                  />
                                                ))}
                                                <div
                                                  aria-hidden="true"
                                                  className="word-sentence-associations"
                                                  hidden
                                                >
                                                  {sentence.links.map(
                                                    (link, linkIndex) => {
                                                      const isPrimary =
                                                        link.role === "focus" ||
                                                        link.role === "head";
                                                      const targetKey = `${link.word_id}:${link.sense_id}`;
                                                      const availableTargets =
                                                        contextTargets.filter(
                                                          (target) =>
                                                            target.key ===
                                                              targetKey ||
                                                            !sentence.links.some(
                                                              (
                                                                otherLink,
                                                                otherIndex
                                                              ) =>
                                                                otherIndex !==
                                                                  linkIndex &&
                                                                otherLink.word_id ===
                                                                  target.word_id &&
                                                                otherLink.sense_id ===
                                                                  target.sense_id
                                                            )
                                                        );
                                                      const targetOptions =
                                                        availableTargets.some(
                                                          (target) =>
                                                            target.key ===
                                                            targetKey
                                                        )
                                                          ? availableTargets
                                                          : [
                                                              ...availableTargets,
                                                              {
                                                                key: targetKey,
                                                                label:
                                                                  "已关联其他词义",
                                                                word_id:
                                                                  link.word_id,
                                                                sense_id:
                                                                  link.sense_id
                                                              }
                                                            ];
                                                      return (
                                                        <Flex
                                                          align="center"
                                                          data-v3-field="links"
                                                          data-v3-node-id={
                                                            sentence.id
                                                          }
                                                          gap="small"
                                                          key={`${targetKey}:${linkIndex}`}
                                                          wrap
                                                        >
                                                          <Tag
                                                            color={
                                                              isPrimary
                                                                ? "blue"
                                                                : undefined
                                                            }
                                                          >
                                                            {sentenceLinkRoleLabel(
                                                              link.role
                                                            )}
                                                          </Tag>
                                                          <Typography.Text>
                                                            {wordId &&
                                                            link.word_id ===
                                                              wordId &&
                                                            link.sense_id ===
                                                              sense.id
                                                              ? "当前词义"
                                                              : "已关联其他词义"}
                                                          </Typography.Text>
                                                          {!isPrimary ? (
                                                            <>
                                                              <AutoComplete
                                                                aria-label={`例句 ${sentenceIndex + 1} 上下文关联 ${linkIndex + 1} 目标`}
                                                                filterOption={
                                                                  false
                                                                }
                                                                onSearch={(
                                                                  query
                                                                ) =>
                                                                  setContextSearch(
                                                                    {
                                                                      sentenceId:
                                                                        sentence.id,
                                                                      linkIndex,
                                                                      query
                                                                    }
                                                                  )
                                                                }
                                                                onSelect={(
                                                                  nextKey
                                                                ) => {
                                                                  const target =
                                                                    targetOptions.find(
                                                                      (
                                                                        option
                                                                      ) =>
                                                                        option.key ===
                                                                        nextKey
                                                                    );
                                                                  if (!target)
                                                                    return;
                                                                  change(
                                                                    (draft) => {
                                                                      const draftLink =
                                                                        draft
                                                                          .pos[
                                                                          posIndex
                                                                        ]!
                                                                          .senses[
                                                                          senseIndex
                                                                        ]!
                                                                          .sentences[
                                                                          sentenceIndex
                                                                        ]!
                                                                          .links[
                                                                          linkIndex
                                                                        ]!;
                                                                      draftLink.word_id =
                                                                        target.word_id;
                                                                      draftLink.sense_id =
                                                                        target.sense_id;
                                                                    }
                                                                  );
                                                                  setKnownContextTargets(
                                                                    (
                                                                      current
                                                                    ) => ({
                                                                      ...current,
                                                                      [target.key]:
                                                                        target
                                                                    })
                                                                  );
                                                                  setContextSearch(
                                                                    undefined
                                                                  );
                                                                }}
                                                                options={targetOptions.map(
                                                                  (target) => ({
                                                                    label:
                                                                      target.label,
                                                                    value:
                                                                      target.key
                                                                  })
                                                                )}
                                                                placeholder="搜索已发布词条并选择具体词义"
                                                                value={
                                                                  contextSearch?.sentenceId ===
                                                                    sentence.id &&
                                                                  contextSearch.linkIndex ===
                                                                    linkIndex
                                                                    ? contextSearch.query
                                                                    : targetOptions.find(
                                                                        (
                                                                          target
                                                                        ) =>
                                                                          target.key ===
                                                                          targetKey
                                                                      )?.label
                                                                }
                                                              />
                                                              <Button
                                                                aria-label={`删除例句 ${sentenceIndex + 1} 的上下文关联 ${linkIndex + 1}`}
                                                                danger
                                                                onClick={() =>
                                                                  change(
                                                                    (draft) => {
                                                                      draft.pos[
                                                                        posIndex
                                                                      ]!.senses[
                                                                        senseIndex
                                                                      ]!.sentences[
                                                                        sentenceIndex
                                                                      ]!.links.splice(
                                                                        linkIndex,
                                                                        1
                                                                      );
                                                                    }
                                                                  )
                                                                }
                                                              >
                                                                删除关联
                                                              </Button>
                                                            </>
                                                          ) : null}
                                                        </Flex>
                                                      );
                                                    }
                                                  )}
                                                  {primaryLinkState(
                                                    sentence,
                                                    wordId,
                                                    sense.id
                                                  ) !== "valid" && wordId ? (
                                                    <Button
                                                      onClick={() =>
                                                        change((draft) => {
                                                          const draftSentence =
                                                            draft.pos[posIndex]!
                                                              .senses[
                                                              senseIndex
                                                            ]!.sentences[
                                                              sentenceIndex
                                                            ]!;
                                                          draftSentence.links =
                                                            [
                                                              {
                                                                word_id: wordId,
                                                                sense_id:
                                                                  sense.id,
                                                                role: "focus"
                                                              },
                                                              ...draftSentence.links.filter(
                                                                (link) =>
                                                                  link.role !==
                                                                    "focus" &&
                                                                  link.role !==
                                                                    "head" &&
                                                                  (link.word_id !==
                                                                    wordId ||
                                                                    link.sense_id !==
                                                                      sense.id)
                                                              )
                                                            ];
                                                        })
                                                      }
                                                    >
                                                      {primaryLinkState(
                                                        sentence,
                                                        wordId,
                                                        sense.id
                                                      ) === "missing"
                                                        ? "补充主关联"
                                                        : "修复主关联"}
                                                    </Button>
                                                  ) : null}
                                                  <AutoComplete
                                                    aria-label={`为例句 ${sentenceIndex + 1} 新增上下文关联`}
                                                    filterOption={false}
                                                    onSearch={(query) =>
                                                      setContextSearch({
                                                        sentenceId: sentence.id,
                                                        query
                                                      })
                                                    }
                                                    onSelect={(targetKey) => {
                                                      const target =
                                                        contextTargets.find(
                                                          (option) =>
                                                            option.key ===
                                                            targetKey
                                                        );
                                                      if (!target) return;
                                                      change((draft) => {
                                                        draft.pos[
                                                          posIndex
                                                        ]!.senses[
                                                          senseIndex
                                                        ]!.sentences[
                                                          sentenceIndex
                                                        ]!.links.push({
                                                          word_id:
                                                            target.word_id,
                                                          sense_id:
                                                            target.sense_id,
                                                          role: "context"
                                                        });
                                                      });
                                                      setKnownContextTargets(
                                                        (current) => ({
                                                          ...current,
                                                          [target.key]: target
                                                        })
                                                      );
                                                      setContextSearch(
                                                        undefined
                                                      );
                                                    }}
                                                    options={contextTargets
                                                      .filter(
                                                        (target) =>
                                                          !sentence.links.some(
                                                            (link) =>
                                                              link.word_id ===
                                                                target.word_id &&
                                                              link.sense_id ===
                                                                target.sense_id
                                                          )
                                                      )
                                                      .map((target) => ({
                                                        label: target.label,
                                                        value: target.key
                                                      }))}
                                                    placeholder="搜索已发布词条并选择具体词义"
                                                    value={
                                                      contextSearch?.sentenceId ===
                                                        sentence.id &&
                                                      contextSearch.linkIndex ===
                                                        undefined
                                                        ? contextSearch.query
                                                        : ""
                                                    }
                                                  />
                                                </div>
                                              </Space>
                                              <Space
                                                className="word-sentence-translation-list"
                                                orientation="vertical"
                                                size={6}
                                              >
                                                {sentenceTranslationRows(
                                                  sentence
                                                ).map(
                                                  (
                                                    translation,
                                                    translationIndex
                                                  ) => {
                                                    const tier =
                                                      translationTier(
                                                        translation.band
                                                      );
                                                    return (
                                                      <Input
                                                        aria-label={
                                                          sentenceTranslationRows(
                                                            sentence
                                                          ).length === 1
                                                            ? `例句 ${sentenceIndex + 1} 中文`
                                                            : `例句 ${sentenceIndex + 1} ${tier.label}中文`
                                                        }
                                                        data-v3-field="zh_translations"
                                                        data-v3-node-id={
                                                          translation.id
                                                        }
                                                        key={`${translation.id}:${translationIndex}`}
                                                        prefix={
                                                          <span
                                                            aria-label={`${tier.label}译文`}
                                                            className="word-sentence-translation-tier"
                                                          >
                                                            <strong>
                                                              {tier.short}
                                                            </strong>
                                                          </span>
                                                        }
                                                        readOnly
                                                        value={
                                                          translation.content
                                                            .text
                                                        }
                                                      />
                                                    );
                                                  }
                                                )}
                                              </Space>
                                              <Space
                                                className="word-sort-actions"
                                                orientation="vertical"
                                                size={2}
                                              >
                                                <SortableDragHandle
                                                  index={sentenceIndex}
                                                  label={`拖动例句 ${sentenceIndex + 1}`}
                                                  singleItemTitle="至少需要两条例句"
                                                  sorting={sentenceSorting}
                                                />
                                                {wordId &&
                                                onSaveMultidimensionalSentence ? (
                                                  <Button
                                                    aria-label={`编辑例句 ${sentenceIndex + 1} 的多维关联`}
                                                    icon={
                                                      <EditOutlined
                                                        aria-hidden
                                                      />
                                                    }
                                                    onClick={() =>
                                                      setSentenceDrawerTarget({
                                                        posId: pos.pos_id,
                                                        senseId: sense.id,
                                                        sentence
                                                      })
                                                    }
                                                    size="small"
                                                    type="text"
                                                  />
                                                ) : null}
                                                <Button
                                                  aria-label={`删除例句 ${sentenceIndex + 1}`}
                                                  danger
                                                  icon={<DeleteOutlined />}
                                                  onClick={() =>
                                                    change((draft) => {
                                                      draft.pos[
                                                        posIndex
                                                      ]!.senses[
                                                        senseIndex
                                                      ]!.sentences.splice(
                                                        sentenceIndex,
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
                                      disabled={
                                        !wordId ||
                                        !onSaveMultidimensionalSentence
                                      }
                                      icon={<PlusOutlined aria-hidden />}
                                      onClick={() =>
                                        setSentenceDrawerTarget({
                                          posId: pos.pos_id,
                                          senseId: sense.id
                                        })
                                      }
                                      type="dashed"
                                    >
                                      添加例句
                                    </Button>
                                  </>
                                </SenseSectionBody>
                              </section>

                              <section
                                className={`word-sense-section${relationsCollapsed ? " is-collapsed" : ""}`}
                              >
                                <SenseSectionTitle
                                  collapsed={relationsCollapsed}
                                  count={sense.relations.length}
                                  label="关联词"
                                  onToggle={() =>
                                    toggleSenseSection(sense.id, "relations")
                                  }
                                  unit="个"
                                />
                                <SenseSectionBody
                                  collapsed={relationsCollapsed}
                                >
                                  <RelationsGrid
                                    change={change}
                                    idFactory={idFactory}
                                    posIndex={posIndex}
                                    sense={sense}
                                    senseIndex={senseIndex}
                                    relationDisplaySnapshots={
                                      relationDisplaySnapshots
                                    }
                                    includeDraftTargets={
                                      draftRelationPrebindingEnabled
                                    }
                                  />
                                </SenseSectionBody>
                              </section>
                            </Flex>
                          </SenseEditorShell>
                        );
                      })}
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
                            posDraft.senses.push(
                              newSense(idFactory, inheritedGroupId)
                            );
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

      {wordId && sentenceDrawerTarget && onSaveMultidimensionalSentence ? (
        <V3MultidimensionalSentenceDrawer
          idFactory={idFactory}
          onClose={() => setSentenceDrawerTarget(undefined)}
          onCreatePendingTarget={onCreatePendingSentenceTarget}
          onSave={(draft) =>
            onSaveMultidimensionalSentence(
              sentenceDrawerTarget.posId,
              sentenceDrawerTarget.senseId,
              draft
            )
          }
          open
          initialAssociations={
            sentenceDrawerTarget.sentence
              ? (sentenceAssociations[sentenceDrawerTarget.sentence.id] ?? [])
              : []
          }
          initialSentence={sentenceDrawerTarget.sentence}
          senseId={sentenceDrawerTarget.senseId}
          targetDiscoveryEnabled={sentenceTargetDiscoveryEnabled}
          wordId={wordId}
        />
      ) : null}

      {onSave && (
        <div className="word-step-actions">
          {onPrevious ? (
            <Button disabled={saving} onClick={onPrevious}>
              上一步
            </Button>
          ) : null}
          <Button disabled={saving} onClick={() => void save("save")}>
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
        </div>
      )}
    </Flex>
  );
}
