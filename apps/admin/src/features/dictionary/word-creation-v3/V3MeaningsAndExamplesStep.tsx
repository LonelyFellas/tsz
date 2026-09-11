import {
  RelationSortScope,
  RelationDeleteMenu
} from "./components/V3RelationSorting";
import { toRichTextV2 } from "@tsz/voice-editor/core";
import {
  PronunciationPreviewProvider,
  PronunciationPreviewControls
} from "../word-creation/PronunciationPreview";
import {
  CaretDownFilled,
  CaretUpFilled,
  DeleteOutlined,
  InfoCircleOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  SoundOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  AutoComplete,
  Badge,
  Button,
  Card,
  Collapse,
  Empty,
  Flex,
  Input,
  InputNumber,
  Select,
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
  RelatedWordResultAny,
  RichTextV3,
  StepSaveIntent,
  V3DraftValidationIssue,
  WordDefinitionV3,
  WordEntryKindV3,
  WordRelationWritableV3,
  WordSenseWritableV3
} from "@tsz/types";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useRelatedSearchAny } from "../api";
import {
  groupRelations,
  replaceRelationGroup,
  selectDerivativeSenses
} from "./relationGroups";
import { CEFR_OPTIONS } from "../labels";
import { validateEntryInput } from "../word-creation/entryClassification";
import { newWordNodeId } from "../word-model/primitives";
import { addPartOfSpeech, deletePartOfSpeech } from "./operations";
import {
  editableEnglishText,
  newGrammarStructure,
  type RelationDisplaySnapshots,
  definitionSummary,
  replaceRichText,
  spellingModeForPos,
  DEFAULT_SENTENCE_TRANSLATION_BAND
} from "./meaningsModel";
import { dialectLabel, partOfSpeechLabel, relationLabel } from "./presentation";
import {
  sortableRowClass,
  useSortableRows,
  type SortableRowsController
} from "./sortableRows";
import { SortableDragHandle } from "./components/SortableDragHandle";
import { reorderPos } from "./operations";
import "./posTabs.css";
import { v3IssueMessage } from "./presentationErrors";
import { countV3PosMeaningIncomplete } from "./posCompletion";
import { V3VoiceTextField } from "./components/V3VoiceTextField";
import { V3LinkedEnglishTextField } from "./components/V3LinkedEnglishTextField";
import { V3SentenceTranslationsField } from "./components/V3SentenceTranslationsField";
import { V3AddBasicPosSelect } from "./components/V3AddBasicPosSelect";
import {
  baseSpellingForPos,
  reachableUsageCount,
  V3PhraseComponentUsagesCard
} from "./components/V3PhraseComponentUsagesCard";

export interface V3MeaningsAndExamplesStepProps {
  value: DraftMeaningsStepContentWritableV3;
  onChange: (next: DraftMeaningsStepContentWritableV3) => void;
  onSave?: (
    content: DraftMeaningsStepContentWritableV3,
    intent: StepSaveIntent
  ) => Promise<void>;
  onPrevious?: () => void;
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
  sentenceTargetDiscoveryEnabled?: boolean;
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
  nodeId
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
  nodeId: string;
}) {
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
                  <Tag className="word-sense-level-badge">{level}</Tag>
                  <Typography.Text className="word-sense-summary">
                    {index + 1}. {summary}
                  </Typography.Text>
                  {subPosLabel ? (
                    <Tag className="word-sense-sub-pos-badge">
                      {subPosLabel}
                    </Tag>
                  ) : null}
                </div>
                <span className="word-form-card-toggle-state">
                  <span>{expanded ? "收起" : "展开"}</span>
                  {expanded ? <CaretUpFilled /> : <CaretDownFilled />}
                </span>
              </div>
            ),
            extra: (
              <Space size={2} onClick={(event) => event.stopPropagation()}>
                <SortableDragHandle
                  sorting={sorting}
                  index={index}
                  label={`拖动词义 ${index + 1}`}
                  singleItemTitle="至少需要两个词义"
                  dragImageSelector=".word-sense-sortable"
                />
                <Button
                  aria-label={`删除词义 ${index + 1}`}
                  icon={<DeleteOutlined />}
                  danger
                  size="small"
                  type="text"
                  onClick={onDelete}
                />
              </Space>
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
                    <V3VoiceTextField
                      mode="grammar"
                      dialect={variant.dialect}
                      leadingAction={
                        <PronunciationPreviewControls
                          playbackOnly
                          pronunciationId={variant.id}
                          dialect={variant.dialect}
                          ariaLabelPrefix={`语法结构 ${structureIndex + 1} ${dialectLabel(variant.dialect)}内容`}
                          content={toRichTextV2(variant.content)}
                          voiceProfile={variant.voice_profile ?? undefined}
                        />
                      }
                      ariaLabel={`语法结构 ${structureIndex + 1} ${dialectLabel(variant.dialect)}内容`}
                      field="content"
                      nodeId={variant.id}
                      onChange={(next) =>
                        change((draft) => {
                          const target =
                            draft.pos[posIndex]!.grammar_structures[
                              structureIndex
                            ]!.variants[variantIndex]!;
                          target.content = next;
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
                <SortableDragHandle
                  dragImageSelector={SORTABLE_ROW_SELECTOR}
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
            <span
              aria-label={`第 ${groupIndex + 1} 个语义区间`}
              className="word-sense-group-index"
            >
              {groupIndex + 1}
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
              <V3VoiceTextField
                mode="grammar"
                dialect="common"
                audioUploadEnabled={false}
                ariaLabel={`语义区间 ${groupIndex + 1} 英文`}
                field="name_en"
                nodeId={group.id}
                leadingAction={
                  <PronunciationPreviewControls
                    playbackOnly
                    pronunciationId={group.id}
                    dialect="common"
                    ariaLabelPrefix={`语义区间 ${groupIndex + 1} 英文`}
                    content={toRichTextV2(
                      group.name_en_rich ?? {
                        version: 2,
                        text: group.name_en,
                        annotations: []
                      }
                    )}
                    voiceProfile={group.voice_profile}
                  />
                }
                onChange={(next) =>
                  change((draft) => {
                    const target = draft.sense_groups.find(
                      (candidate) => candidate.id === group.id
                    );
                    if (target) {
                      target.name_en = next.text;
                      target.name_en_rich = next;
                    }
                  })
                }
                voiceProfile={group.voice_profile}
                onVoiceProfileChange={(voice_profile) =>
                  change((draft) => {
                    const target = draft.sense_groups.find(
                      (candidate) => candidate.id === group.id
                    );
                    if (target) target.voice_profile = voice_profile;
                  })
                }
                placeholder="例如 Core geometric and physical space"
                value={
                  group.name_en_rich ?? {
                    version: 2,
                    text: group.name_en,
                    annotations: []
                  }
                }
              />
            </div>
            <Space
              className="word-sort-actions"
              orientation="horizontal"
              size={8}
            >
              <SortableDragHandle
                dragImageSelector={SORTABLE_ROW_SELECTOR}
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

/** 卡片自上而下的展示顺序：派生词在前，近义词与反义词在后。 */
const RELATION_TYPES = ["derivative", "synonym", "antonym"] as const;
type RelationType = (typeof RELATION_TYPES)[number];

const RELATION_META: Record<RelationType, { metric: string }> = {
  synonym: { metric: "相似度" },
  antonym: { metric: "差异度" },
  derivative: { metric: "关联度" }
};

interface RelatedWordChoice {
  word_id: string;
  headword: string;
  matchedHeadword: string;
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
            matchedHeadword:
              result.schema_version === 3
                ? (result.presentation.matched_surfaces[0] ??
                  result.presentation.label)
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

/** 未保存选择优先用搜索结果，已绑定关系回显服务端快照。 */
function relationDisplayHeadword(
  relation: WordRelationWritableV3,
  known: RelatedWordChoice | undefined,
  snapshot: RelationDisplaySnapshots[string] | undefined
): string {
  return (
    (relation.target_word_id ? known?.headword : undefined) ??
    (relation.target_word_id ? snapshot?.headword : undefined) ??
    relation.pending_target_headword ??
    ""
  );
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

function RelationsGrid({
  sense,
  posIndex,
  senseIndex,
  change,
  idFactory,
  currentWordId,
  relationDisplaySnapshots
}: {
  sense: WordSenseWritableV3;
  posIndex: number;
  senseIndex: number;
  change: (mutation: DraftMutation) => void;
  idFactory: () => string;
  /** 当前词条自身；关联词不能指向自己，候选里要排除掉。新建词条时为 undefined。 */
  currentWordId?: string;
  relationDisplaySnapshots?: RelationDisplaySnapshots;
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
  const knownWordFor = (relation: WordRelationWritableV3) =>
    knownWords[relation.id] ??
    Object.values(knownWords).find(
      (word) => word.word_id === relation.target_word_id
    );
  const relationRowKeys = useRef(new Map<string, string>());
  const [senseSearch, setSenseSearch] = useState<{
    wordId: string;
    query: string;
  }>();
  const activeSearch = searching ?? senseSearch;
  const preparedSearch = validateEntryInput(activeSearch?.query ?? "");
  const relatedSearch = useRelatedSearchAny(
    preparedSearch.normalized,
    preparedSearch.kind,
    Boolean(activeSearch?.query.trim()) && !preparedSearch.issue,
    true
  );
  // 完全相同的排在前面，其余按整词命中的跟在后面。
  const searchWords = relatedWordChoices(
    [
      ...(relatedSearch.exact.data?.pages ?? []),
      ...(relatedSearch.contains.data?.pages ?? [])
    ].flatMap((page) => page.results)
  ).filter((word) => word.word_id !== currentWordId);
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
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const prepared = validateEntryInput(trimmed);
    if (prepared.issue) return prepared.issue;
    // 近义词与反义词一个词面只配一条词义。收口只做在了界面上，手敲两行同样的词面
    // 仍然能存下去，要等后端物化才撞名报错，所以这里当场说清楚。只报后出现的那条，
    // 免得两行互相指认。
    if (relation.relation === "derivative") return undefined;
    // 存下来的是归一化词面（内部空白已折叠），只 trim 会让「look  up」漏报。
    const key = prepared.normalized.toLowerCase();
    const position = sense.relations.findIndex(
      (item) => item.id === relation.id
    );
    const duplicated = sense.relations.some(
      (other, index) =>
        index < position &&
        other.relation === relation.relation &&
        !other.target_word_id &&
        other.pending_target_headword?.trim().toLowerCase() === key
    );
    return duplicated
      ? "同类关联里已有这个词面，一个词面只配一条词义"
      : undefined;
  };

  const isUnlinkedText = (relation: WordRelationWritableV3) =>
    !relation.target_word_id &&
    Boolean(relation.pending_target_headword?.trim()) &&
    !relationInputIssue(relation);

  const isSelectedEmptyDraft = (relation: WordRelationWritableV3) =>
    knownWords[relation.id]?.status === "draft" &&
    knownWords[relation.id]?.senses.length === 0;

  /**
   * 已绑定词义的展示文案。顺序与 relationDisplayHeadword 一致：活数据优先、
   * 服务端快照兜底。快照只按 relation.id 存、不带 sense_id，改选目标或词义后
   * 仍是上一次保存的值，放在前面会把旧词义显示到新绑定上。
   */
  const boundGlossText = (relation: WordRelationWritableV3) =>
    [...Object.values(knownWords), ...searchWords]
      .find((word) => word.word_id === relation.target_word_id)
      ?.senses.find((item) => item.sense_id === relation.target_sense_id)
      ?.gloss ||
    relationDisplaySnapshots?.[relation.id]?.gloss ||
    "已匹配词义";

  return (
    <div className="word-relations-grid word-relations-grid-stacked">
      {RELATION_TYPES.map((relationType) => {
        const meta = RELATION_META[relationType];
        const relations = groupRelations(
          sense.relations,
          relationRowKeys.current
        )
          .filter((group) => group[0]!.relation === relationType)
          .map((group) => ({ relation: group[0]!, group }));
        return (
          <Card
            className={`word-relation-card word-relation-card-animated${collapsed[relationType] ? " is-collapsed" : ""}`}
            data-relation-type={relationType}
            styles={{ header: { cursor: "pointer" } }}
            onClick={(event) => {
              const header = event.currentTarget.querySelector(
                ":scope > .ant-card-head"
              );
              if (!header?.contains(event.target as Node)) return;
              setCollapsed((current) => ({
                ...current,
                [relationType]: !current[relationType]
              }));
            }}
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
                aria-expanded={!collapsed[relationType]}
                onClick={(event) => {
                  event.stopPropagation();
                  setCollapsed((current) => ({
                    ...current,
                    [relationType]: !current[relationType]
                  }));
                }}
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
            <SenseSectionBody collapsed={Boolean(collapsed[relationType])}>
              <div style={{ padding: 10 }}>
                {relations.length === 0 ? (
                  <Empty
                    description={`暂无${relationLabel(relationType)}`}
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                ) : (
                  <RelationSortScope
                    items={relations}
                    scopeId={`${sense.id}:${relationType}`}
                    onChange={(next) =>
                      change((draft) => {
                        const target = draft.pos[posIndex]!.senses[senseIndex]!;
                        const ordered = next.flatMap((entry) => entry.group);
                        let index = 0;
                        target.relations = target.relations.map((item) =>
                          item.relation === relationType
                            ? ordered[index++]!
                            : item
                        );
                      })
                    }
                  >
                    {(relationSorting) => (
                      <Flex className="word-relation-list" vertical>
                        <div className="word-relation-column-heads">
                          <span />
                          <span>{meta.metric}</span>
                          <span>{relationLabel(relationType)}</span>
                          <span>匹配词义</span>
                          <span />
                        </div>
                        {relations.map(({ relation, group }, relationIndex) => (
                          <div
                            className={sortableRowClass(
                              "word-relation-row",
                              relationSorting,
                              relationIndex
                            )}
                            onDragOver={(event) =>
                              relationSorting.handleDragOver(
                                event,
                                relationIndex
                              )
                            }
                            onDragLeave={relationSorting.handleDragLeave}
                            onDrop={(event) =>
                              relationSorting.handleDrop(event, relationIndex)
                            }
                            data-v3-node-id={relation.id}
                            key={
                              relationRowKeys.current.get(relation.id) ??
                              relation.id
                            }
                          >
                            <span
                              className="word-relation-drop-line"
                              aria-hidden
                            />
                            <Flex
                              className="word-relation-index"
                              align="center"
                              gap={2}
                            >
                              <SortableDragHandle
                                sorting={relationSorting}
                                index={relationIndex}
                                label={`拖动${relationLabel(relationType)} ${relationIndex + 1}`}
                                singleItemTitle="至少需要两个关联词"
                                dragImageSelector=".word-relation-row"
                              />
                              <span className="word-grammar-index">
                                {relationIndex + 1}
                              </span>
                            </Flex>
                            <InputNumber
                              aria-label={meta.metric}
                              status={
                                isUnlinkedText(relation) ? "warning" : undefined
                              }
                              data-v3-field="score"
                              data-v3-node-id={relation.id}
                              max={100}
                              min={0}
                              onChange={(score) =>
                                change((draft) => {
                                  for (const item of draft.pos[posIndex]!
                                    .senses[senseIndex]!.relations) {
                                    if (
                                      group.some(
                                        (member) => member.id === item.id
                                      )
                                    )
                                      item.score = String(score ?? 0);
                                  }
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
                                setSenseSearch(undefined);
                                if (searching?.relationId === relation.id)
                                  return;
                                setSearching({
                                  relationId: relation.id,
                                  query: relationDisplayHeadword(
                                    relation,
                                    knownWordFor(relation),
                                    relationDisplaySnapshots?.[relation.id]
                                  )
                                });
                              }}
                              onSearch={(query) => {
                                const prepared = validateEntryInput(query);
                                setSenseSearch(undefined);
                                setSearching({
                                  relationId: relation.id,
                                  query
                                });
                                setKnownWords((current) => {
                                  if (!(relation.id in current)) return current;
                                  const next = { ...current };
                                  delete next[relation.id];
                                  return next;
                                });
                                change((draft) => {
                                  const draftSense =
                                    draft.pos[posIndex]!.senses[senseIndex]!;
                                  const keepManualGroup =
                                    !relation.target_word_id &&
                                    group.length > 1;
                                  if (keepManualGroup) {
                                    const rowKey =
                                      relationRowKeys.current.get(
                                        relation.id
                                      ) ?? relation.id;
                                    for (const item of group)
                                      relationRowKeys.current.set(
                                        item.id,
                                        rowKey
                                      );
                                  }
                                  const targets = draftSense.relations.filter(
                                    (item) =>
                                      keepManualGroup
                                        ? group.some(
                                            (member) => member.id === item.id
                                          )
                                        : item.id === relation.id
                                  );
                                  draftSense.relations = replaceRelationGroup(
                                    draftSense.relations,
                                    group,
                                    targets
                                  );
                                  for (const target of targets) {
                                    delete target.target_word_id;
                                    delete target.target_sense_id;
                                    if (keepManualGroup)
                                      target.pending_target_headword =
                                        prepared.normalized ?? query.trim();
                                    else if (
                                      !prepared.issue &&
                                      prepared.normalized
                                    )
                                      target.pending_target_headword =
                                        prepared.normalized;
                                    else {
                                      delete target.pending_target_headword;
                                      delete target.pending_target_gloss;
                                    }
                                  }
                                });
                              }}
                              onSelect={(wordId) => {
                                const word = searchWords.find(
                                  (candidate) => candidate.word_id === wordId
                                );
                                if (!word) return;
                                if (word.senses.length === 0) {
                                  if (word.status !== "draft") return;
                                  setKnownWords((current) => ({
                                    ...current,
                                    [relation.id]: word
                                  }));
                                  setSearching(undefined);
                                  change((draft) => {
                                    const draftSense =
                                      draft.pos[posIndex]!.senses[senseIndex]!;
                                    draftSense.relations = replaceRelationGroup(
                                      draftSense.relations,
                                      group,
                                      [
                                        draftSense.relations.find(
                                          (item) => item.id === relation.id
                                        )!
                                      ]
                                    );
                                    const target = draft.pos[posIndex]!.senses[
                                      senseIndex
                                    ]!.relations.find(
                                      (item) => item.id === relation.id
                                    )!;
                                    delete target.target_word_id;
                                    delete target.target_sense_id;
                                    target.pending_target_headword =
                                      word.matchedHeadword;
                                  });
                                  return;
                                }
                                setKnownWords((current) => ({
                                  ...current,
                                  [relation.id]: word
                                }));
                                setSearching(undefined);
                                change((draft) => {
                                  const draftSense =
                                    draft.pos[posIndex]!.senses[senseIndex]!;
                                  draftSense.relations = replaceRelationGroup(
                                    draftSense.relations,
                                    group,
                                    [
                                      draftSense.relations.find(
                                        (item) => item.id === relation.id
                                      )!
                                    ]
                                  );
                                  const target = draft.pos[posIndex]!.senses[
                                    senseIndex
                                  ]!.relations.find(
                                    (item) => item.id === relation.id
                                  )!;
                                  target.target_word_id = word.word_id;
                                  delete target.target_sense_id;
                                  delete target.pending_target_headword;
                                  delete target.pending_target_gloss;
                                });
                              }}
                              options={
                                searching?.relationId === relation.id
                                  ? searchWords.map((word) => {
                                      const alreadyLinked =
                                        sense.relations.some(
                                          (other) =>
                                            !group.some(
                                              (member) => member.id === other.id
                                            ) &&
                                            other.relation === relationType &&
                                            (other.target_word_id ===
                                              word.word_id ||
                                              knownWords[other.id]?.word_id ===
                                                word.word_id ||
                                              other.pending_target_headword
                                                ?.trim()
                                                .toLowerCase() ===
                                                word.matchedHeadword
                                                  .trim()
                                                  .toLowerCase())
                                        );
                                      return {
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
                                            {/* 顺序即优先级：先说禁用理由，再说选中后会发生什么。
                                                「已发布且无词义」本身就是禁用理由，最该先说；
                                                「选中仅记文本」不是禁用理由，不能盖住已被关联，
                                                否则灰着的选项还在邀请一个点不动的操作。 */}
                                            {word.senses.length === 0 &&
                                            word.status !== "draft" ? (
                                              <Typography.Text type="secondary">
                                                暂无词义，请先添加词义
                                              </Typography.Text>
                                            ) : alreadyLinked ? (
                                              <Typography.Text type="secondary">
                                                已被同类型的另一行关联
                                              </Typography.Text>
                                            ) : word.senses.length === 0 ? (
                                              <Typography.Text type="secondary">
                                                暂无词义，选中仅记文本
                                              </Typography.Text>
                                            ) : null}
                                          </Flex>
                                        ),
                                        value: word.word_id,
                                        disabled:
                                          (word.senses.length === 0 &&
                                            word.status !== "draft") ||
                                          alreadyLinked
                                      };
                                    })
                                  : []
                              }
                              popupMatchSelectWidth={260}
                              status={
                                relationInputIssue(relation)
                                  ? "error"
                                  : isUnlinkedText(relation)
                                    ? "warning"
                                    : undefined
                              }
                              value={
                                searching?.relationId === relation.id
                                  ? searching.query
                                  : relationDisplayHeadword(
                                      relation,
                                      knownWordFor(relation),
                                      relationDisplaySnapshots?.[relation.id]
                                    ) ||
                                    (relation.target_word_id
                                      ? "已选择关联词"
                                      : "")
                              }
                            >
                              <Input
                                aria-label={`${relationLabel(relationType)}目标词条`}
                                className="word-relation-target"
                                prefix={
                                  relation.target_word_id ? (
                                    <SoundOutlined />
                                  ) : (
                                    <Tooltip title="待关联词暂不支持语音">
                                      <SoundOutlined
                                        aria-disabled="true"
                                        className="word-relation-sound-disabled"
                                      />
                                    </Tooltip>
                                  )
                                }
                                status={
                                  relationInputIssue(relation)
                                    ? "error"
                                    : isUnlinkedText(relation)
                                      ? "warning"
                                      : undefined
                                }
                                suffix={
                                  <>
                                    {searching?.relationId === relation.id &&
                                    searchFailed ? (
                                      <Button
                                        aria-label="重试关联词搜索"
                                        onClick={() =>
                                          void retryRelatedSearch()
                                        }
                                        onMouseDown={(event) =>
                                          event.preventDefault()
                                        }
                                        size="small"
                                        type="link"
                                      >
                                        搜索失败，重试
                                      </Button>
                                    ) : searching?.relationId === relation.id &&
                                      searchHasNextPage ? (
                                      <Button
                                        aria-label="加载更多关联词结果"
                                        onClick={() =>
                                          void loadMoreSearchResults()
                                        }
                                        onMouseDown={(event) =>
                                          event.preventDefault()
                                        }
                                        size="small"
                                        type="link"
                                      >
                                        加载更多
                                      </Button>
                                    ) : null}
                                    {isUnlinkedText(relation) &&
                                    !isSelectedEmptyDraft(relation) ? (
                                      <Tooltip
                                        title={`待关联的${relationLabel(relationType)}`}
                                      >
                                        <InfoCircleOutlined
                                          aria-label={`待关联的${relationLabel(relationType)}`}
                                          className="word-relation-unlinked-icon"
                                          role="note"
                                        />
                                      </Tooltip>
                                    ) : null}
                                  </>
                                }
                                placeholder="搜索关联词"
                                size="small"
                              />
                            </AutoComplete>
                            {isUnlinkedText(relation) ||
                            (!relation.target_word_id && group.length > 1) ? (
                              <Flex
                                className="word-relation-sense"
                                vertical
                                gap={6}
                              >
                                <RelationSortScope
                                  items={group}
                                  scopeId={`${sense.id}:${relation.id}:glosses`}
                                  onChange={(next) => {
                                    const key =
                                      relationRowKeys.current.get(
                                        relation.id
                                      ) ?? relation.id;
                                    for (const item of next)
                                      relationRowKeys.current.set(item.id, key);
                                    change((draft) => {
                                      const target =
                                        draft.pos[posIndex]!.senses[
                                          senseIndex
                                        ]!;
                                      target.relations = replaceRelationGroup(
                                        target.relations,
                                        group,
                                        next
                                      );
                                    });
                                  }}
                                >
                                  {(glossSorting) => (
                                    <Flex
                                      vertical
                                      gap={6}
                                      className={
                                        relationType === "derivative" &&
                                        group.length > 1
                                          ? "word-relation-glosses-connected"
                                          : undefined
                                      }
                                    >
                                      {group.map((member, glossIndex) => (
                                        <Flex
                                          key={member.id}
                                          gap={6}
                                          align="center"
                                          className={sortableRowClass(
                                            "word-relation-gloss-row",
                                            glossSorting,
                                            glossIndex
                                          )}
                                          onDragOver={(event) => {
                                            event.stopPropagation();
                                            glossSorting.handleDragOver(
                                              event,
                                              glossIndex
                                            );
                                          }}
                                          onDragLeave={(event) => {
                                            event.stopPropagation();
                                            glossSorting.handleDragLeave();
                                          }}
                                          onDrop={(event) => {
                                            event.stopPropagation();
                                            glossSorting.handleDrop(
                                              event,
                                              glossIndex
                                            );
                                          }}
                                        >
                                          <span
                                            className="word-relation-drop-line"
                                            aria-hidden
                                          />
                                          {relationType === "derivative" ? (
                                            <SortableDragHandle
                                              sorting={glossSorting}
                                              index={glossIndex}
                                              label={`拖动${relationLabel(relationType)}词义 ${glossIndex + 1}`}
                                              singleItemTitle="至少需要两个词义"
                                              dragImageSelector=".word-relation-gloss-row"
                                            />
                                          ) : null}
                                          <Input
                                            aria-label={`${relationLabel(relationType)}待关联词义${group.length > 1 ? ` ${glossIndex + 1}` : ""}`}
                                            className="word-relation-sense"
                                            data-v3-field="pending_target_gloss"
                                            data-v3-node-id={member.id}
                                            maxLength={5000}
                                            onChange={(event) =>
                                              change((draft) => {
                                                const target = draft.pos[
                                                  posIndex
                                                ]!.senses[
                                                  senseIndex
                                                ]!.relations.find(
                                                  (item) =>
                                                    item.id === member.id
                                                )!;
                                                if (event.target.value)
                                                  target.pending_target_gloss =
                                                    event.target.value;
                                                else
                                                  delete target.pending_target_gloss;
                                              })
                                            }
                                            placeholder="输入词义"
                                            size="small"
                                            status="warning"
                                            suffix={
                                              isSelectedEmptyDraft(relation) ? (
                                                <Tooltip
                                                  title={`待关联的${relationLabel(relationType)}`}
                                                >
                                                  <InfoCircleOutlined
                                                    aria-label={`待关联的${relationLabel(relationType)}`}
                                                    className="word-relation-unlinked-icon"
                                                    role="note"
                                                  />
                                                </Tooltip>
                                              ) : undefined
                                            }
                                            value={
                                              member.pending_target_gloss ?? ""
                                            }
                                          />

                                          {group.length > 1 ? (
                                            <RelationDeleteMenu
                                              label={`${relationLabel(relationType)}词义 ${glossIndex + 1}`}
                                              onDelete={() => {
                                                const remaining = group.filter(
                                                  (item) =>
                                                    item.id !== member.id
                                                );
                                                const rowKey =
                                                  relationRowKeys.current.get(
                                                    relation.id
                                                  ) ?? relation.id;
                                                for (const item of remaining)
                                                  relationRowKeys.current.set(
                                                    item.id,
                                                    rowKey
                                                  );
                                                change((draft) => {
                                                  const target =
                                                    draft.pos[posIndex]!.senses[
                                                      senseIndex
                                                    ]!;
                                                  target.relations =
                                                    replaceRelationGroup(
                                                      target.relations,
                                                      group,
                                                      remaining
                                                    );
                                                });
                                              }}
                                            />
                                          ) : null}
                                        </Flex>
                                      ))}
                                    </Flex>
                                  )}
                                </RelationSortScope>
                                {relationType === "derivative" ? (
                                  <Button
                                    aria-label={`添加${relationLabel(relationType)}词义`}
                                    size="small"
                                    type="dashed"
                                    icon={<PlusOutlined />}
                                    onClick={() =>
                                      change((draft) => {
                                        const target =
                                          draft.pos[posIndex]!.senses[
                                            senseIndex
                                          ]!;
                                        const added = {
                                          ...relation,
                                          id: idFactory()
                                        };
                                        delete added.pending_target_gloss;
                                        const rowKey =
                                          relationRowKeys.current.get(
                                            relation.id
                                          ) ?? relation.id;
                                        for (const member of [...group, added])
                                          relationRowKeys.current.set(
                                            member.id,
                                            rowKey
                                          );
                                        target.relations = replaceRelationGroup(
                                          target.relations,
                                          group,
                                          [...group, added]
                                        );
                                      })
                                    }
                                  >
                                    添加词义
                                  </Button>
                                ) : null}
                              </Flex>
                            ) : (
                              <Flex
                                className="word-relation-sense"
                                vertical
                                gap={6}
                              >
                                <Select
                                  aria-label={`${relationLabel(relationType)}目标词义`}
                                  className="word-relation-sense"
                                  disabled={!relation.target_word_id}
                                  mode={
                                    relationType === "derivative"
                                      ? "multiple"
                                      : undefined
                                  }
                                  maxTagCount={
                                    relationType === "derivative"
                                      ? 0
                                      : undefined
                                  }
                                  maxTagPlaceholder={(omitted) =>
                                    `已选 ${omitted.length} 条词义`
                                  }
                                  onChange={(selection: string | string[]) => {
                                    const discovered = searchWords.find(
                                      (word) =>
                                        word.word_id === relation.target_word_id
                                    );
                                    if (discovered)
                                      setKnownWords((current) => ({
                                        ...current,
                                        [relation.id]: discovered
                                      }));
                                    const replacement =
                                      relationType === "derivative"
                                        ? selectDerivativeSenses(
                                            group,
                                            selection as string[],
                                            idFactory
                                          )
                                        : undefined;
                                    if (replacement) {
                                      const rowKey =
                                        relationRowKeys.current.get(
                                          relation.id
                                        ) ?? relation.id;
                                      for (const item of replacement)
                                        relationRowKeys.current.set(
                                          item.id,
                                          rowKey
                                        );
                                    }
                                    change((draft) => {
                                      const draftSense =
                                        draft.pos[posIndex]!.senses[
                                          senseIndex
                                        ]!;
                                      if (replacement) {
                                        draftSense.relations =
                                          replaceRelationGroup(
                                            draftSense.relations,
                                            group,
                                            replacement
                                          );
                                      } else {
                                        // 单选路径没有空值兜底：写空会造出「有词条没词义」
                                        // 的半绑定，那个形状存不进库。今天不可达只因为这个
                                        // Select 没开 allowClear，谁开了就要在这里先接住。
                                        draftSense.relations.find(
                                          (item) => item.id === relation.id
                                        )!.target_sense_id =
                                          selection as string;
                                      }
                                    });
                                  }}
                                  onOpenChange={(open) => {
                                    setSearching(undefined);
                                    setSenseSearch(
                                      open
                                        ? {
                                            wordId: relation.target_word_id!,
                                            query: (
                                              relationDisplaySnapshots?.[
                                                relation.id
                                              ]?.headword ??
                                              knownWordFor(relation)
                                                ?.headword ??
                                              ""
                                            ).split(" / ")[0]!
                                          }
                                        : undefined
                                    );
                                  }}
                                  loading={
                                    senseSearch?.wordId ===
                                      relation.target_word_id &&
                                    (relatedSearch.exact.isFetching ||
                                      relatedSearch.contains.isFetching)
                                  }
                                  popupRender={(menu) => (
                                    <>
                                      {menu}
                                      {senseSearch?.wordId ===
                                        relation.target_word_id &&
                                      searchFailed ? (
                                        <Button
                                          size="small"
                                          type="link"
                                          onClick={() =>
                                            void retryRelatedSearch()
                                          }
                                        >
                                          搜索失败，重试
                                        </Button>
                                      ) : null}
                                      {senseSearch?.wordId ===
                                        relation.target_word_id &&
                                      searchHasNextPage ? (
                                        <Button
                                          size="small"
                                          type="link"
                                          onClick={() =>
                                            void loadMoreSearchResults()
                                          }
                                        >
                                          加载更多词义来源
                                        </Button>
                                      ) : null}
                                    </>
                                  )}
                                  options={Array.from(
                                    new Map(
                                      [
                                        ...group
                                          .filter(
                                            (item) => item.target_sense_id
                                          )
                                          .map((item) => ({
                                            sense_id: item.target_sense_id!,
                                            gloss:
                                              relationDisplaySnapshots?.[
                                                item.id
                                              ]?.gloss ?? "已匹配词义"
                                          })),
                                        ...(Object.values(knownWords).find(
                                          (word) =>
                                            word.word_id ===
                                            relation.target_word_id
                                        )?.senses ?? []),
                                        ...(senseSearch?.wordId ===
                                        relation.target_word_id
                                          ? (searchWords.find(
                                              (word) =>
                                                word.word_id ===
                                                relation.target_word_id
                                            )?.senses ?? [])
                                          : [])
                                      ].map((item) => [
                                        item.sense_id,
                                        {
                                          label: item.gloss || "（无释义）",
                                          value: item.sense_id
                                        }
                                      ])
                                    ).values()
                                  )}
                                  placeholder="选择词义"
                                  size="small"
                                  value={
                                    relationType === "derivative"
                                      ? group.flatMap((item) =>
                                          item.target_sense_id
                                            ? [item.target_sense_id]
                                            : []
                                        )
                                      : relation.target_sense_id
                                  }
                                />
                                {relationType === "derivative" &&
                                group.some((item) => item.target_sense_id) ? (
                                  <RelationSortScope
                                    items={group}
                                    scopeId={`${sense.id}:${relation.id}:bound-glosses`}
                                    onChange={(next) => {
                                      const rowKey =
                                        relationRowKeys.current.get(
                                          relation.id
                                        ) ?? relation.id;
                                      for (const item of next)
                                        relationRowKeys.current.set(
                                          item.id,
                                          rowKey
                                        );
                                      change((draft) => {
                                        const target =
                                          draft.pos[posIndex]!.senses[
                                            senseIndex
                                          ]!;
                                        target.relations = replaceRelationGroup(
                                          target.relations,
                                          group,
                                          next
                                        );
                                      });
                                    }}
                                  >
                                    {(glossSorting) => (
                                      <Flex
                                        vertical
                                        gap={6}
                                        className={
                                          group.length > 1
                                            ? "word-relation-glosses-connected"
                                            : undefined
                                        }
                                      >
                                        {/* 不再二次过滤，让排序 items 与 glossIndex 同源。
                                            组内不会出现「部分带 sense_id」的混合形状：
                                            selectDerivativeSenses 只产出全绑定或单条无词义，
                                            ensureV3MeaningsForForms 删关系是整条删，
                                            混合形状则会被 toWritableMeanings 拦在加载期。 */}
                                        {group.map((member, glossIndex) => (
                                          <Flex
                                            key={member.id}
                                            gap={6}
                                            align="center"
                                            className={sortableRowClass(
                                              "word-relation-gloss-row",
                                              glossSorting,
                                              glossIndex
                                            )}
                                            onDragOver={(event) => {
                                              event.stopPropagation();
                                              glossSorting.handleDragOver(
                                                event,
                                                glossIndex
                                              );
                                            }}
                                            onDragLeave={(event) => {
                                              event.stopPropagation();
                                              glossSorting.handleDragLeave();
                                            }}
                                            onDrop={(event) => {
                                              event.stopPropagation();
                                              glossSorting.handleDrop(
                                                event,
                                                glossIndex
                                              );
                                            }}
                                          >
                                            <span
                                              className="word-relation-drop-line"
                                              aria-hidden
                                            />
                                            <SortableDragHandle
                                              sorting={glossSorting}
                                              index={glossIndex}
                                              label={`拖动${relationLabel(relationType)}词义 ${glossIndex + 1}`}
                                              singleItemTitle="至少需要两个词义"
                                              dragImageSelector=".word-relation-gloss-row"
                                            />
                                            {/* tabIndex 让校验问题能定位到这一行：
                                                focusRenderedTarget 靠 focus() 后比对
                                                activeElement，不可聚焦的元素会让它白跑
                                                十轮重试，等于挂了个跳不过去的假锚点。 */}
                                            <Typography.Text
                                              className="word-relation-bound-gloss"
                                              data-v3-field="target_sense_id"
                                              data-v3-node-id={member.id}
                                              tabIndex={-1}
                                              ellipsis={{
                                                tooltip: boundGlossText(member)
                                              }}
                                            >
                                              {boundGlossText(member)}
                                            </Typography.Text>
                                            {/* 与手动词义一致：只剩一条时不给词义级删除，
                                                  免得同一个「删」在两处含义不同——这里删的是
                                                  一条词义，整条关联去掉走行级删除。想清空也可以
                                                  在上面的多选里取消最后一条，那等于删整条。 */}
                                            {group.length > 1 ? (
                                              <RelationDeleteMenu
                                                label={`${relationLabel(relationType)}词义 ${glossIndex + 1}`}
                                                onDelete={() => {
                                                  const remaining =
                                                    group.filter(
                                                      (item) =>
                                                        item.id !== member.id
                                                    );
                                                  const rowKey =
                                                    relationRowKeys.current.get(
                                                      relation.id
                                                    ) ?? relation.id;
                                                  for (const item of remaining)
                                                    relationRowKeys.current.set(
                                                      item.id,
                                                      rowKey
                                                    );
                                                  change((draft) => {
                                                    const target =
                                                      draft.pos[posIndex]!
                                                        .senses[senseIndex]!;
                                                    target.relations =
                                                      replaceRelationGroup(
                                                        target.relations,
                                                        group,
                                                        remaining
                                                      );
                                                  });
                                                }}
                                              />
                                            ) : null}
                                          </Flex>
                                        ))}
                                      </Flex>
                                    )}
                                  </RelationSortScope>
                                ) : null}
                              </Flex>
                            )}
                            {relationInputIssue(relation) ? (
                              <div
                                className="word-relation-input-error"
                                role="alert"
                              >
                                {relationInputIssue(relation)}
                              </div>
                            ) : null}
                            <RelationDeleteMenu
                              label={relationLabel(relationType)}
                              onDelete={() =>
                                change((draft) => {
                                  const draftSense =
                                    draft.pos[posIndex]!.senses[senseIndex]!;
                                  draftSense.relations = replaceRelationGroup(
                                    draftSense.relations,
                                    group,
                                    []
                                  );
                                })
                              }
                            />
                          </div>
                        ))}
                      </Flex>
                    )}
                  </RelationSortScope>
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
              </div>
            </SenseSectionBody>
          </Card>
        );
      })}
    </div>
  );
}

function V3MeaningsAndExamplesStepContent({
  value,
  onChange,
  onSave,
  onPrevious,
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
  sentenceTargetDiscoveryEnabled = true,
  componentUsagesEnabled = false,
  textLinksEnabled = false
}: V3MeaningsAndExamplesStepProps) {
  const { modal } = App.useApp();
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
                  <Space size={6}>
                    <SortableDragHandle
                      dragImageSelector=".word-pos-tab-handle"
                      index={displayPosIndex}
                      label={`拖动${visiblePosLabel(posId, displayPosIndex)}`}
                      singleItemTitle="至少需要两个基本词性"
                      sorting={posSorting}
                    />
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
                            const sentencesCollapsed = Boolean(
                              collapsedSenseSections[`${sense.id}:sentences`]
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
                                onDelete={() =>
                                  change((draft) => {
                                    draft.pos[posIndex]!.senses.splice(
                                      senseIndex,
                                      1
                                    );
                                  })
                                }
                                subPosLabel={
                                  visibleSubPos
                                    ? [
                                        selectedSubPos?.abbreviation,
                                        visibleSubPos
                                      ]
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
                                              )?.label ?? "未命名语义区间")
                                        }
                                        placeholder="选择语义区间"
                                        value={sense.sense_group_id}
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
                                                  <span className="word-number-cell">
                                                    <span className="word-grammar-index">
                                                      {definitionIndex + 1}
                                                    </span>
                                                  </span>
                                                  <>
                                                    <Select
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
                                                      aria-label={`定义 ${definitionIndex + 1} 方式`}
                                                      data-v3-field="definition_mode"
                                                      data-v3-node-id={
                                                        definition.id
                                                      }
                                                      onChange={(
                                                        definitionMode: DefinitionModeV3
                                                      ) => {
                                                        const apply = () => {
                                                          change((draft) => {
                                                            const current =
                                                              draft.pos[
                                                                posIndex
                                                              ]!.senses[
                                                                senseIndex
                                                              ]!.definitions[
                                                                definitionIndex
                                                              ]!;
                                                            draft.pos[
                                                              posIndex
                                                            ]!.senses[
                                                              senseIndex
                                                            ]!.definitions[
                                                              definitionIndex
                                                            ] =
                                                              withDefinitionMode(
                                                                current,
                                                                definitionMode,
                                                                idFactory
                                                              );
                                                          });
                                                        };
                                                        const english =
                                                          definition.definition_mode ===
                                                            "en_definition" ||
                                                          definition.definition_mode ===
                                                            "en_sentence"
                                                            ? definition.content
                                                            : undefined;
                                                        const variants = english
                                                          ? english.mode ===
                                                            "unified"
                                                            ? [english.common]
                                                            : [
                                                                english.uk,
                                                                english.us
                                                              ].flatMap(
                                                                (slot) =>
                                                                  slot.state ===
                                                                  "ready"
                                                                    ? [
                                                                        slot.variant
                                                                      ]
                                                                    : []
                                                              )
                                                          : [];
                                                        const removesEnglishSettings =
                                                          (definitionMode ===
                                                            "zh_definition" ||
                                                            definitionMode ===
                                                              "zh_sentence") &&
                                                          variants.some(
                                                            (variant) =>
                                                              variant.text_links
                                                                ?.length ||
                                                              variant.voice_profile ||
                                                              variant
                                                                .audio_assets
                                                                ?.length
                                                          );
                                                        if (
                                                          removesEnglishSettings
                                                        )
                                                          modal.confirm({
                                                            title:
                                                              "切换为中文释义",
                                                            content:
                                                              "切换后将移除这条释义的英文关联和发音设置。",
                                                            okText: "切换",
                                                            cancelText: "取消",
                                                            onOk: apply
                                                          });
                                                        else apply();
                                                      }}
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
                                                        placeholder={
                                                          definition.definition_mode ===
                                                          "en_sentence"
                                                            ? "请输入英文释义句"
                                                            : "请输入英文释义"
                                                        }
                                                        wordId={wordId}
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
                                          discoveryEnabled={
                                            sentenceTargetDiscoveryEnabled
                                          }
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

                                  <section
                                    className={`word-sense-section${sentencesCollapsed ? " is-collapsed" : ""}`}
                                  >
                                    <SenseSectionTitle
                                      collapsed={sentencesCollapsed}
                                      count={sense.sentences.length}
                                      label="多维例句"
                                      onToggle={() =>
                                        toggleSenseSection(
                                          sense.id,
                                          "sentences",
                                          sentencesCollapsed
                                        )
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
                                                    <span className="word-grammar-index">
                                                      {sentenceIndex + 1}
                                                    </span>
                                                  </span>
                                                  <Select
                                                    aria-label={`例句 ${sentenceIndex + 1} 等级`}
                                                    data-v3-field="level"
                                                    data-v3-node-id={
                                                      sentence.id
                                                    }
                                                    disabled={saving}
                                                    onChange={(level) =>
                                                      change((draft) => {
                                                        const next =
                                                          draft.pos[posIndex]!
                                                            .senses[senseIndex]!
                                                            .sentences[
                                                            sentenceIndex
                                                          ]!;
                                                        next.level = level;
                                                      })
                                                    }
                                                    options={CEFR_OPTIONS}
                                                    value={sentence.level}
                                                  />
                                                  <Space
                                                    className="word-sentence-english-fields"
                                                    orientation="vertical"
                                                    size={6}
                                                    style={{ width: "100%" }}
                                                  >
                                                    <V3LinkedEnglishTextField
                                                      value={sentence.en_text}
                                                      label={`例句 ${sentenceIndex + 1}`}
                                                      suffix="英文"
                                                      placeholder="请输入完整的英文例句"
                                                      wordId={wordId}
                                                      linksEnabled={
                                                        textLinksEnabled
                                                      }
                                                      readOnly={saving}
                                                      onChange={(en_text) =>
                                                        change((draft) => {
                                                          draft.pos[
                                                            posIndex
                                                          ]!.senses[
                                                            senseIndex
                                                          ]!.sentences[
                                                            sentenceIndex
                                                          ]!.en_text = en_text;
                                                        })
                                                      }
                                                    />
                                                  </Space>
                                                  <V3SentenceTranslationsField
                                                    sentence={sentence}
                                                    index={sentenceIndex}
                                                    disabled={saving}
                                                    onChange={(translations) =>
                                                      change((draft) => {
                                                        const next =
                                                          draft.pos[posIndex]!
                                                            .senses[senseIndex]!
                                                            .sentences[
                                                            sentenceIndex
                                                          ]!;
                                                        next.zh_translations =
                                                          translations;
                                                        const alias =
                                                          translations.find(
                                                            (item) =>
                                                              item.id ===
                                                              next.zh_text_id
                                                          ) ?? translations[0]!;
                                                        next.zh_text_id =
                                                          alias.id;
                                                        next.zh_text =
                                                          alias.content;
                                                      })
                                                    }
                                                  />
                                                  <Space
                                                    className="word-sort-actions"
                                                    orientation="horizontal"
                                                  >
                                                    <SortableDragHandle
                                                      dragImageSelector={
                                                        SORTABLE_ROW_SELECTOR
                                                      }
                                                      index={sentenceIndex}
                                                      label={`拖动例句 ${sentenceIndex + 1}`}
                                                      singleItemTitle="至少需要两条例句"
                                                      sorting={sentenceSorting}
                                                    />
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
                                          disabled={!wordId || saving}
                                          icon={<PlusOutlined aria-hidden />}
                                          onClick={() => {
                                            if (!wordId) return;
                                            change((draft) => {
                                              const zhText = {
                                                version: 2 as const,
                                                text: "",
                                                annotations: []
                                              };
                                              const translationId = idFactory();
                                              draft.pos[posIndex]!.senses[
                                                senseIndex
                                              ]!.sentences.push({
                                                id: idFactory(),
                                                level: "B1",
                                                en_text: {
                                                  mode: "unified",
                                                  common: {
                                                    id: idFactory(),
                                                    origin: "manual",
                                                    value: {
                                                      version: 2,
                                                      text: "",
                                                      annotations: []
                                                    }
                                                  }
                                                },
                                                zh_text_id: translationId,
                                                zh_text: zhText,
                                                zh_translations: [
                                                  {
                                                    id: translationId,
                                                    band: DEFAULT_SENTENCE_TRANSLATION_BAND,
                                                    content: zhText
                                                  }
                                                ],
                                                links: [
                                                  {
                                                    word_id: wordId,
                                                    sense_id: sense.id,
                                                    role: "focus"
                                                  }
                                                ]
                                              });
                                            });
                                          }}
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
                                      count={
                                        groupRelations(sense.relations).length
                                      }
                                      label="关联词"
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
                                      <RelationsGrid
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

      {onSave && (
        <div className="word-step-actions">
          {onPrevious ? (
            <Button disabled={saving} onClick={onPrevious}>
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
        </div>
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
