import {
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  EllipsisOutlined,
  LockOutlined,
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
  Flex,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography
} from "antd";
import type {
  AdminWordV2,
  CefrLevel,
  DraftMeaningsStepContent,
  EnglishTextV2,
  RichText,
  RelatedSearchResponse,
  RelatedWordResult,
  StepSaveIntent,
  WordDefinitionV2,
  WordHeadwordsV2,
  WordPosMeaningsV2,
  WordRelationType,
  WordRelationV2,
  WordSenseV2,
  WordSentenceV2
} from "@tsz/types";
import "@tsz/voice-editor/styles.css";
import { toRichTextV2 } from "@tsz/voice-editor/core";
import { HttpError } from "@tsz/api-client/http";
import {
  createContext,
  type DragEvent,
  type KeyboardEvent,
  lazy,
  type ReactNode,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useNavigate } from "react-router-dom";
import { DEFINITION_MODE_OPTIONS } from "../editorConstants";
import { CEFR_OPTIONS, cefrColor } from "../labels";
import { env } from "@/lib/env";
import {
  adminVoicePreviewAdapter,
  voicePreviewIsMock
} from "../voice-editor/dataSource";
import {
  createPartOfSpeechLookup,
  partOfSpeechLabel,
  subPartOfSpeechLabel,
  subPartOfSpeechOptions
} from "../part-of-speech/catalog";
import { usePartOfSpeechCatalog } from "../part-of-speech/api";
import { useRelatedSearch, useRelatedSearchV2 } from "../api";
import {
  cloneWordValue,
  moveWordNode,
  newWordNodeId,
  toWordRichText
} from "../word-model/primitives";
import { useSaveMeaningsStep } from "./api";
import { ContentCompletionPanel } from "./ContentCompletionPanel";
import {
  PronunciationPreviewControls,
  PronunciationPreviewProvider
} from "./PronunciationPreview";
import {
  collapseMeaningsEnglishText,
  countDiscardedEnglishTexts,
  countOverwrittenGrammarVariants,
  createDefinition,
  createEnglishText,
  createGrammar,
  createRelation,
  createSense,
  createSenseGroup,
  createSentence,
  ensureMeaningsForForms,
  mirrorMeaningsGrammar,
  resolveEnglishText,
  resolveGrammarText,
  toMeaningsWireContent,
  writeEnglishText,
  writeGrammarText
} from "./model";
import type { AdminDialectPreference } from "@tsz/shared";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import { useUnsavedWordChanges } from "./useUnsavedWordChanges";
import {
  useWordValidationIssue,
  useWordValidationIssueFocus
} from "./useWordValidationIssueFocus";
import {
  applySoleSubPartOfSpeech,
  collectPronunciationHints,
  countSenseReferences,
  meaningsPosOwnsNode,
  removeSenseAndReferences,
  senseOwnsNode
} from "./meaningsAndExamples/mapping";
import {
  countPosMeaningIssues,
  validateMeanings
} from "./meaningsAndExamples/validation";

const VoiceRichTextEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((module) => ({
    default: module.VoiceRichTextEditor
  }))
);

interface Props {
  word: AdminWordV2;
  readOnly?: boolean;
  onSaved: (word: AdminWordV2) => void;
  onDraftChange?: (content: DraftMeaningsStepContent) => void;
}

const DIALECT_PREFERENCE_LABEL: Record<AdminDialectPreference, string> = {
  uk: "英式",
  us: "美式"
};
const OTHER_DIALECT_LABEL: Record<AdminDialectPreference, string> = {
  uk: "美式",
  us: "英式"
};

const GRAMMAR_DRAG_TYPE = "application/x-tsz-grammar-structure";
const DEFINITION_DRAG_TYPE = "application/x-tsz-definition";
const SENTENCE_DRAG_TYPE = "application/x-tsz-sentence";

const RELATION_META: Record<
  WordRelationType,
  { title: string; metric: string }
> = {
  synonym: { title: "近义词", metric: "相似度" },
  antonym: { title: "反义词", metric: "差异度" },
  derivative: { title: "派生词", metric: "关联度" }
};

function grammarStructureOptionLabel(
  grammar: WordPosMeaningsV2["grammar_structures"][number],
  grammarIndex: number,
  preference: AdminDialectPreference
): string {
  // 语法结构的双份形状要到阶段 3 才收敛，这里先按偏好侧取那一份做下拉文案。
  const variant =
    grammar.variants.find((item) => item.dialect === preference) ??
    grammar.variants.find((item) => item.dialect === "common") ??
    grammar.variants[0];
  return (
    variant?.content.text.trim() || `语法结构 ${grammarIndex + 1}（未填写）`
  );
}

function definitionTitleText(
  definition: WordDefinitionV2 | undefined,
  preference: AdminDialectPreference
): string {
  if (!definition) return "待填写释义";
  if (!definition.definition_mode.startsWith("en_")) {
    return (definition.content as RichText).text.trim() || "待填写释义";
  }
  return (
    resolveEnglishText(
      definition.content as EnglishTextV2,
      preference
    ).text.trim() || "待填写释义"
  );
}

interface SortableRowsController {
  canReorder: boolean;
  draggingIndex?: number;
  dragOverIndex?: number;
  handleDragStart: (
    event: DragEvent<HTMLButtonElement>,
    sourceIndex: number
  ) => void;
  handleDragEnd: () => void;
  handleDragOver: (
    event: DragEvent<HTMLDivElement>,
    targetIndex: number
  ) => void;
  handleDragLeave: () => void;
  handleDrop: (event: DragEvent<HTMLDivElement>, targetIndex: number) => void;
  handleKeyDown: (
    event: KeyboardEvent<HTMLButtonElement>,
    sourceIndex: number
  ) => void;
}

function useSortableRows<T>({
  items,
  scopeId,
  dragType,
  readOnly,
  onChange
}: {
  items: T[];
  scopeId: string;
  dragType: string;
  readOnly?: boolean;
  onChange: (next: T[]) => void;
}): SortableRowsController {
  const [draggingIndex, setDraggingIndex] = useState<number>();
  const [dragOverIndex, setDragOverIndex] = useState<number>();
  const canReorder = !readOnly && items.length > 1;

  const handleDragStart = (
    event: DragEvent<HTMLButtonElement>,
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
      if (
        source.scopeId === scopeId &&
        typeof source.index === "number" &&
        source.index >= 0 &&
        source.index < items.length &&
        source.index !== targetIndex
      ) {
        onChange(moveWordNode(items, source.index, targetIndex));
      }
    } catch {
      // Ignore drag data from outside this sortable editor.
    }
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    sourceIndex: number
  ) => {
    if (!canReorder) return;
    if (event.key === "ArrowUp" && sourceIndex > 0) {
      event.preventDefault();
      onChange(moveWordNode(items, sourceIndex, sourceIndex - 1));
    }
    if (event.key === "ArrowDown" && sourceIndex < items.length - 1) {
      event.preventDefault();
      onChange(moveWordNode(items, sourceIndex, sourceIndex + 1));
    }
  };

  return {
    canReorder,
    draggingIndex,
    dragOverIndex,
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

interface VoiceEditorTarget {
  value: RichText;
  contextLabel: string;
  onApply: (value: RichText) => void;
}

interface VoiceEditorContextValue {
  open: (target: VoiceEditorTarget) => void;
}

const VoiceEditorContext = createContext<VoiceEditorContextValue | null>(null);

function VoiceEditorProvider({
  children,
  pronunciationHints,
  readOnly
}: {
  children: ReactNode;
  pronunciationHints: Readonly<Record<string, string>>;
  readOnly?: boolean;
}) {
  const [target, setTarget] = useState<VoiceEditorTarget>();
  const content = (
    <PronunciationPreviewProvider readOnly={readOnly}>
      {children}
    </PronunciationPreviewProvider>
  );
  if (!env.VOICE_EDITOR) return content;
  return (
    <VoiceEditorContext.Provider value={{ open: setTarget }}>
      {content}
      {target && (
        <Suspense fallback={null}>
          <VoiceRichTextEditor
            open
            value={target.value}
            language="en"
            contextLabel={target.contextLabel}
            pronunciationHints={pronunciationHints}
            previewAdapter={
              env.VOICE_PREVIEW ? adminVoicePreviewAdapter : undefined
            }
            previewIsMock={voicePreviewIsMock}
            onApply={(value) => {
              target.onApply(value);
              setTarget(undefined);
            }}
            onCancel={() => setTarget(undefined)}
          />
        </Suspense>
      )}
    </VoiceEditorContext.Provider>
  );
}

function VoiceTextControl({
  value,
  contextLabel,
  toolbarLabel,
  readOnly,
  showEditorAction = true,
  onChange
}: {
  value: RichText;
  contextLabel: string;
  toolbarLabel?: string;
  readOnly?: boolean;
  showEditorAction?: boolean;
  onChange: (value: RichText) => void;
}) {
  return (
    <div className="word-voice-text-control">
      {(toolbarLabel || showEditorAction) && (
        <div
          className={`word-voice-text-toolbar${toolbarLabel ? " word-voice-text-toolbar-labeled" : ""}`}
        >
          {toolbarLabel && (
            <Typography.Text strong>{toolbarLabel}</Typography.Text>
          )}
          <VoiceEditorAction
            value={value}
            contextLabel={contextLabel}
            readOnly={readOnly}
            onApply={onChange}
          />
        </div>
      )}
      <Input.TextArea
        aria-label={contextLabel}
        value={value.text}
        readOnly={readOnly}
        autoSize={{ minRows: 2, maxRows: 6 }}
        onChange={(event) =>
          onChange(toWordRichText(event.target.value, value))
        }
      />
    </div>
  );
}

function VoiceEditorAction({
  value,
  contextLabel,
  readOnly,
  onApply
}: {
  value: RichText;
  contextLabel: string;
  readOnly?: boolean;
  onApply: (value: RichText) => void;
}) {
  const editor = useContext(VoiceEditorContext);
  if (readOnly || !editor) return null;
  return (
    <Button
      className="word-voice-editor-action"
      type="text"
      size="small"
      icon={<EditOutlined />}
      aria-label={`${contextLabel} 高级语音编辑`}
      onClick={() => editor.open({ value, contextLabel, onApply })}
    >
      高级语音编辑
    </Button>
  );
}

function EnglishTextEditor({
  value,
  clientId,
  toolbarLabel,
  readOnly,
  onChange
}: {
  value: EnglishTextV2;
  clientId: string;
  toolbarLabel?: string;
  readOnly?: boolean;
  onChange: (next: EnglishTextV2) => void;
}) {
  // 第 3 步不再区分英美（A1）：无论 wire 是单份还是存量双份，这里只呈现一个输入框，
  // 口径取当前管理员的方言偏好；存量双份的收敛发生在保存前，由确认框兜底。
  const { preference } = useDialectPreference();
  const text = resolveEnglishText(value, preference);
  const write = (content: RichText) =>
    onChange(writeEnglishText(value, preference, content));

  return (
    <div data-word-node-id={clientId} data-word-field="content">
      <div data-word-node-id={clientId} data-word-field="content.common">
        {env.VOICE_EDITOR ? (
          <VoiceTextControl
            value={text}
            contextLabel="英语文本"
            toolbarLabel={toolbarLabel}
            readOnly={readOnly}
            onChange={write}
          />
        ) : (
          <Input.TextArea
            aria-label="英语文本"
            value={text.text}
            readOnly={readOnly}
            autoSize={{ minRows: 2, maxRows: 6 }}
            onChange={(event) =>
              write(toWordRichText(event.target.value, text))
            }
          />
        )}
      </div>
    </div>
  );
}

function GrammarEditor({
  value,
  posId,
  headwords,
  readOnly,
  onChange
}: {
  value: WordPosMeaningsV2["grammar_structures"];
  posId: string;
  headwords: WordHeadwordsV2;
  readOnly?: boolean;
  onChange: (next: WordPosMeaningsV2["grammar_structures"]) => void;
}) {
  // 语法结构只维护一份（A1）：wire 里对区分词条仍写两条同值镜像，但那是保存时的事，
  // 编辑器只呈现偏好侧那一份。
  const { preference } = useDialectPreference();
  const [draggingIndex, setDraggingIndex] = useState<number>();
  const [dragOverIndex, setDragOverIndex] = useState<number>();
  const canReorder = !readOnly && value.length > 1;

  const handleDragStart = (
    event: DragEvent<HTMLButtonElement>,
    grammarIndex: number
  ) => {
    if (!canReorder) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      GRAMMAR_DRAG_TYPE,
      JSON.stringify({ posId, index: grammarIndex })
    );
    setDraggingIndex(grammarIndex);
  };

  const handleDragOver = (
    event: DragEvent<HTMLDivElement>,
    grammarIndex: number
  ) => {
    if (!canReorder || !event.dataTransfer.types.includes(GRAMMAR_DRAG_TYPE)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverIndex(grammarIndex);
  };

  const handleDrop = (
    event: DragEvent<HTMLDivElement>,
    targetIndex: number
  ) => {
    event.preventDefault();
    setDragOverIndex(undefined);
    const raw = event.dataTransfer.getData(GRAMMAR_DRAG_TYPE);
    if (!raw) return;
    try {
      const source = JSON.parse(raw) as { posId?: string; index?: number };
      if (
        source.posId === posId &&
        typeof source.index === "number" &&
        source.index !== targetIndex
      ) {
        onChange(moveWordNode(value, source.index, targetIndex));
      }
    } catch {
      // Ignore drag data from outside the grammar editor.
    }
  };

  return (
    <Card
      className="word-grammar-card"
      title={<Typography.Text strong>语法结构</Typography.Text>}
      size="small"
      data-word-node-id={posId}
      data-word-field="grammar_structures"
    >
      {value.map((grammar, grammarIndex) => (
        <div
          className={`word-table-row word-grammar-row${draggingIndex === grammarIndex ? " is-dragging" : ""}${dragOverIndex === grammarIndex ? " is-drag-over" : ""}`}
          key={grammar.id}
          onDragOver={(event) => handleDragOver(event, grammarIndex)}
          onDragLeave={() => setDragOverIndex(undefined)}
          onDrop={(event) => handleDrop(event, grammarIndex)}
        >
          <span
            className="word-grammar-index"
            aria-label={`第 ${grammarIndex + 1} 个语法结构`}
          >
            {grammarIndex + 1}
          </span>
          <div
            className="word-grammar-panel"
            data-word-node-id={grammar.id}
            data-word-field="content"
          >
            <Flex
              className="word-dialect-panel-header"
              justify="flex-end"
              align="center"
              gap={8}
            >
              <VoiceEditorAction
                value={resolveGrammarText(grammar, preference)}
                contextLabel={`语法结构 ${grammarIndex + 1}`}
                readOnly={readOnly}
                onApply={(content) =>
                  onChange(
                    value.map((item, index) =>
                      index === grammarIndex
                        ? writeGrammarText(item, preference, content)
                        : item
                    )
                  )
                }
              />
            </Flex>
            <div className="word-grammar-text-field">
              {env.VOICE_EDITOR ? (
                <VoiceTextControl
                  value={resolveGrammarText(grammar, preference)}
                  contextLabel={`语法结构 ${grammarIndex + 1}`}
                  readOnly={readOnly}
                  showEditorAction={false}
                  onChange={(content) =>
                    onChange(
                      value.map((item, index) =>
                        index === grammarIndex
                          ? writeGrammarText(item, preference, content)
                          : item
                      )
                    )
                  }
                />
              ) : (
                <Input.TextArea
                  className="word-pronunciation-phonetic-input"
                  aria-label={`语法结构 ${grammarIndex + 1}`}
                  value={resolveGrammarText(grammar, preference).text}
                  readOnly={readOnly}
                  placeholder="例如 a centre / the centre"
                  autoSize={{ minRows: 2, maxRows: 6 }}
                  onChange={(event) =>
                    onChange(
                      value.map((item, index) =>
                        index === grammarIndex
                          ? writeGrammarText(
                              item,
                              preference,
                              toWordRichText(
                                event.target.value,
                                resolveGrammarText(item, preference)
                              )
                            )
                          : item
                      )
                    )
                  }
                />
              )}
            </div>
            <Flex
              className="word-grammar-voice-toolbar"
              justify="space-between"
              align="center"
              gap={8}
            >
              <PronunciationPreviewControls
                pronunciationId={grammar.id}
                content={toRichTextV2(resolveGrammarText(grammar, preference))}
                dialect={preference}
                ariaLabelPrefix={`语法结构 ${grammarIndex + 1}`}
                disabled={readOnly}
              />
            </Flex>
          </div>
          {!readOnly && (
            <Space orientation="vertical" size={2}>
              <button
                type="button"
                className="word-grammar-drag-handle"
                aria-label={`拖动语法结构 ${grammarIndex + 1}`}
                title={
                  canReorder
                    ? "拖动排序，也可使用上下方向键"
                    : "至少需要两条语法结构"
                }
                draggable={canReorder}
                disabled={!canReorder}
                onDragStart={(event) => handleDragStart(event, grammarIndex)}
                onDragEnd={() => {
                  setDraggingIndex(undefined);
                  setDragOverIndex(undefined);
                }}
                onKeyDown={(event) => {
                  if (!canReorder) return;
                  if (event.key === "ArrowUp" && grammarIndex > 0) {
                    event.preventDefault();
                    onChange(
                      moveWordNode(value, grammarIndex, grammarIndex - 1)
                    );
                  }
                  if (
                    event.key === "ArrowDown" &&
                    grammarIndex < value.length - 1
                  ) {
                    event.preventDefault();
                    onChange(
                      moveWordNode(value, grammarIndex, grammarIndex + 1)
                    );
                  }
                }}
              >
                ≡
              </button>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label={`删除语法结构 ${grammarIndex + 1}`}
                disabled={value.length === 1}
                onClick={() =>
                  onChange(value.filter((_, index) => index !== grammarIndex))
                }
              />
            </Space>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          className="word-grammar-add"
          type="dashed"
          block
          icon={<PlusOutlined />}
          onClick={() => onChange([...value, createGrammar(headwords)])}
        >
          添加语法结构
        </Button>
      )}
    </Card>
  );
}

function DefinitionEditor({
  value,
  index,
  grammars,
  readOnly,
  sorting,
  onChange,
  onRemove
}: {
  value: WordDefinitionV2;
  index: number;
  grammars: WordPosMeaningsV2["grammar_structures"];
  readOnly?: boolean;
  sorting: SortableRowsController;
  onChange: (next: WordDefinitionV2) => void;
  onRemove: () => void;
}) {
  const english = value.definition_mode.startsWith("en_");
  const { preference } = useDialectPreference();
  return (
    <div
      className={`word-table-row word-definition-row${sorting.draggingIndex === index ? " is-dragging" : ""}${sorting.dragOverIndex === index ? " is-drag-over" : ""}`}
      data-word-node-id={value.id}
      data-word-field="definition"
      onDragOver={(event) => sorting.handleDragOver(event, index)}
      onDragLeave={sorting.handleDragLeave}
      onDrop={(event) => sorting.handleDrop(event, index)}
    >
      <span className="word-number-cell">{index + 1}</span>
      <Space orientation="vertical" size={8}>
        <Select
          aria-label="释义等级"
          data-word-node-id={value.id}
          data-word-field="level"
          value={value.level}
          options={CEFR_OPTIONS}
          disabled={readOnly}
          onChange={(level) => onChange({ ...value, level })}
        />
        <Select
          aria-label="释义方式"
          value={value.definition_mode}
          options={DEFINITION_MODE_OPTIONS}
          disabled={readOnly}
          onChange={(definition_mode) => {
            const nextEnglish = definition_mode.startsWith("en_");
            const base = {
              id: value.id,
              level: value.level,
              grammar_structure_id: value.grammar_structure_id
            };
            onChange(
              nextEnglish
                ? {
                    ...base,
                    definition_mode: definition_mode as
                      "en_definition" | "en_sentence",
                    content: english
                      ? (value.content as EnglishTextV2)
                      : createEnglishText()
                  }
                : {
                    ...base,
                    definition_mode: definition_mode as
                      "zh_definition" | "zh_sentence",
                    content_id:
                      "content_id" in value
                        ? value.content_id
                        : newWordNodeId(),
                    content: english
                      ? toWordRichText("")
                      : (value.content as RichText)
                  }
            );
          }}
        />
      </Space>
      <Space orientation="vertical" size={8} style={{ width: "100%" }}>
        {english ? (
          <EnglishTextEditor
            value={value.content as EnglishTextV2}
            clientId={value.id}
            readOnly={readOnly}
            onChange={(content) =>
              onChange({
                ...value,
                definition_mode: value.definition_mode as
                  "en_definition" | "en_sentence",
                content
              })
            }
          />
        ) : (
          <Input.TextArea
            aria-label="中文释义"
            data-word-node-id={value.id}
            data-word-field="content"
            value={(value.content as RichText).text}
            readOnly={readOnly}
            autoSize={{ minRows: 2, maxRows: 6 }}
            onChange={(event) =>
              onChange({
                ...value,
                definition_mode: value.definition_mode as
                  "zh_definition" | "zh_sentence",
                content_id:
                  "content_id" in value ? value.content_id : newWordNodeId(),
                content: toWordRichText(
                  event.target.value,
                  value.content as RichText
                )
              })
            }
          />
        )}
        <Select
          aria-label="绑定语法结构"
          data-word-node-id={value.id}
          data-word-field="grammar_structure_id"
          allowClear
          placeholder="绑定语法结构（可选）"
          value={value.grammar_structure_id}
          disabled={readOnly}
          options={grammars.map((grammar, grammarIndex) => ({
            value: grammar.id,
            label: grammarStructureOptionLabel(
              grammar,
              grammarIndex,
              preference
            )
          }))}
          onChange={(grammar_structure_id) =>
            onChange({ ...value, grammar_structure_id })
          }
        />
      </Space>
      {!readOnly && (
        <Space orientation="vertical" size={2}>
          <button
            type="button"
            className="word-grammar-drag-handle"
            aria-label={`拖动释义 ${index + 1}`}
            title={
              sorting.canReorder
                ? "拖动排序，也可使用上下方向键"
                : "至少需要两条释义"
            }
            draggable={sorting.canReorder}
            disabled={!sorting.canReorder}
            onDragStart={(event) => sorting.handleDragStart(event, index)}
            onDragEnd={sorting.handleDragEnd}
            onKeyDown={(event) => sorting.handleKeyDown(event, index)}
          >
            ≡
          </button>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={`删除释义 ${index + 1}`}
            onClick={onRemove}
          />
        </Space>
      )}
    </div>
  );
}

function ContextLinksEditor({
  sentence,
  readOnly,
  onChange
}: {
  sentence: WordSentenceV2;
  readOnly?: boolean;
  onChange: (next: WordSentenceV2) => void;
}) {
  const [query, setQuery] = useState("");
  const contexts = sentence.links.filter((link) => link.role === "context");
  const relatedSearch = useRelatedSearch(
    query,
    !readOnly && query.trim() !== ""
  );
  const targets = (relatedSearch.data?.results ?? []).flatMap((word) =>
    word.senses.map((sense) => ({
      key: `${word.word_id}:${sense.sense_id}`,
      word_id: word.word_id,
      sense_id: sense.sense_id,
      headword: word.headword,
      gloss: sense.gloss
    }))
  );
  return (
    <Space orientation="vertical" size={8} style={{ width: "100%" }}>
      {contexts.map((link, index) => (
        <Space.Compact block key={`${link.word_id}-${link.sense_id}-${index}`}>
          <Input
            aria-label="上下文词条 ID"
            value={link.word_id}
            readOnly
            placeholder="上下文词条 ID"
          />
          <Input
            aria-label="上下文词义 ID"
            value={link.sense_id}
            readOnly
            placeholder="上下文词义 ID"
          />
          {!readOnly && (
            <Button
              danger
              icon={<DeleteOutlined />}
              aria-label={`删除上下文关联 ${index + 1}`}
              onClick={() =>
                onChange({
                  ...sentence,
                  links: sentence.links.filter(
                    (item) => item.role === "focus" || item !== link
                  )
                })
              }
            />
          )}
        </Space.Compact>
      ))}
      {!readOnly && (
        <AutoComplete
          value={query}
          options={targets.map((target) => ({
            value: target.key,
            label: `${target.headword} · ${target.gloss || "（无释义）"}`
          }))}
          filterOption={false}
          onSearch={setQuery}
          onSelect={(key) => {
            const target = targets.find((item) => item.key === key);
            if (!target) return;
            const exists = contexts.some(
              (link) =>
                link.word_id === target.word_id &&
                link.sense_id === target.sense_id
            );
            if (!exists) {
              onChange({
                ...sentence,
                links: [
                  ...sentence.links,
                  {
                    word_id: target.word_id,
                    sense_id: target.sense_id,
                    role: "context"
                  }
                ]
              });
            }
            setQuery("");
          }}
        >
          <Input
            prefix={<PlusOutlined />}
            aria-label="搜索并添加上下文关联"
            placeholder="搜索已发布词条并选择具体词义"
          />
        </AutoComplete>
      )}
    </Space>
  );
}

function SentenceEditor({
  value,
  index,
  readOnly,
  sorting,
  onChange,
  onRemove
}: {
  value: WordSentenceV2;
  index: number;
  readOnly?: boolean;
  sorting: SortableRowsController;
  onChange: (next: WordSentenceV2) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`word-table-row word-sentence-row${sorting.draggingIndex === index ? " is-dragging" : ""}${sorting.dragOverIndex === index ? " is-drag-over" : ""}`}
      data-word-node-id={value.id}
      data-word-field="sentence"
      onDragOver={(event) => sorting.handleDragOver(event, index)}
      onDragLeave={sorting.handleDragLeave}
      onDrop={(event) => sorting.handleDrop(event, index)}
    >
      <span className="word-number-cell">{index + 1}</span>
      <Select
        aria-label="例句等级"
        data-word-node-id={value.id}
        data-word-field="level"
        value={value.level}
        options={CEFR_OPTIONS}
        disabled={readOnly}
        onChange={(level) => onChange({ ...value, level })}
      />
      <Space orientation="vertical" size={10} style={{ width: "100%" }}>
        <div className="word-sentence-bilingual-grid">
          <div className="word-sentence-english-card">
            {!env.VOICE_EDITOR && (
              <div className="word-sentence-english-toolbar">
                <Typography.Text strong>英文例句</Typography.Text>
              </div>
            )}
            <EnglishTextEditor
              value={value.en_text}
              clientId={value.id}
              toolbarLabel="英文例句"
              readOnly={readOnly}
              onChange={(en_text) => onChange({ ...value, en_text })}
            />
            <div
              className={`word-sentence-focus-hint${value.links.some((link) => link.role === "focus") ? "" : " is-missing"}`}
              role="note"
              aria-label="例句主关联"
            >
              <LockOutlined aria-hidden />
              <span>
                {value.links.some((link) => link.role === "focus")
                  ? "已自动关联当前词义"
                  : "主关联缺失"}
              </span>
            </div>
          </div>
          <Space orientation="vertical" size={6} style={{ width: "100%" }}>
            <Typography.Text strong>汉语译文</Typography.Text>
            <Input.TextArea
              aria-label="汉语译文"
              data-word-node-id={value.id}
              data-word-field="zh_text"
              value={value.zh_text.text}
              readOnly={readOnly}
              placeholder="请输入汉语译文"
              autoSize={{ minRows: 2, maxRows: 6 }}
              onChange={(event) =>
                onChange({
                  ...value,
                  zh_text: toWordRichText(event.target.value, value.zh_text)
                })
              }
            />
          </Space>
        </div>
        <ContextLinksEditor
          sentence={value}
          readOnly={readOnly}
          onChange={onChange}
        />
      </Space>
      {!readOnly && (
        <Space orientation="vertical" size={2}>
          <button
            type="button"
            className="word-grammar-drag-handle"
            aria-label={`拖动例句 ${index + 1}`}
            title={
              sorting.canReorder
                ? "拖动排序，也可使用上下方向键"
                : "至少需要两条例句"
            }
            draggable={sorting.canReorder}
            disabled={!sorting.canReorder}
            onDragStart={(event) => sorting.handleDragStart(event, index)}
            onDragEnd={sorting.handleDragEnd}
            onKeyDown={(event) => sorting.handleKeyDown(event, index)}
          >
            ≡
          </button>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={`删除例句 ${index + 1}`}
            onClick={onRemove}
          />
        </Space>
      )}
    </div>
  );
}

interface RelationSenseChoice {
  senseId: string;
  gloss?: string;
}

function RelationsEditor({
  value,
  readOnly,
  onChange
}: {
  value: WordRelationV2[];
  readOnly?: boolean;
  onChange: (next: WordRelationV2[]) => void;
}) {
  const [searching, setSearching] = useState<{
    relationId: string;
    query: string;
  } | null>(null);
  const [senseChoices, setSenseChoices] = useState<
    Record<string, RelationSenseChoice[]>
  >({});
  const [collapsed, setCollapsed] = useState<Record<WordRelationType, boolean>>(
    {
      synonym: false,
      antonym: false,
      derivative: false
    }
  );
  const relatedSearch = useRelatedSearch(
    searching?.query ?? "",
    searching !== null && !env.RELATED_SEARCH_V2
  );
  const relatedSearchV2 = useRelatedSearchV2(
    searching?.query ?? "",
    undefined,
    searching !== null && env.RELATED_SEARCH_V2
  );
  const uniqueResults = (items: RelatedWordResult[]) =>
    Array.from(new Map(items.map((item) => [item.word_id, item])).values());
  const exactPages = relatedSearchV2.exact.data?.pages ?? [];
  const containsPages = relatedSearchV2.contains.data?.pages ?? [];
  const isV2Page = (page: RelatedSearchResponse) =>
    "total" in page && typeof page.total === "number" && "next_cursor" in page;
  const hasCompleteV2Wire =
    exactPages.length > 0 &&
    containsPages.length > 0 &&
    exactPages.every(isV2Page) &&
    containsPages.every(isV2Page);
  const exactResults = uniqueResults(
    exactPages.flatMap((page) => page.results)
  );
  const containsResults = uniqueResults(
    containsPages.flatMap((page) => page.results)
  ).filter(
    (item) => !exactResults.some((exact) => exact.word_id === item.word_id)
  );
  const searchResults = env.RELATED_SEARCH_V2
    ? hasCompleteV2Wire
      ? [...exactResults, ...containsResults]
      : uniqueResults([
          ...exactPages.flatMap((page) => page.results),
          ...containsPages.flatMap((page) => page.results)
        ])
    : (relatedSearch.data?.results ?? []);
  const toWordOption = (
    item: (typeof searchResults)[number],
    group?: "完全同名" | "相关联想"
  ) => ({
    value: item.word_id,
    label: (
      <Space orientation="vertical" size={0}>
        <Flex gap={8} align="center">
          {group && (
            <Tag color={group === "完全同名" ? "blue" : undefined}>{group}</Tag>
          )}
          <Typography.Text strong>{item.headword}</Typography.Text>
          <Typography.Text type="secondary">
            {item.kind} · {item.word_id.slice(0, 8)}
          </Typography.Text>
        </Flex>
        <Typography.Text type="secondary">
          {[...(item.dialects ?? []), ...(item.pos_labels ?? [])].join(" · ") ||
            "未标注方言/词性"}
          {item.senses[0]?.gloss ? ` · ${item.senses[0].gloss}` : ""}
        </Typography.Text>
      </Space>
    )
  });
  const wordOptions =
    env.RELATED_SEARCH_V2 && hasCompleteV2Wire
      ? [
          ...exactResults.map((item) => toWordOption(item, "完全同名")),
          ...containsResults.map((item) => toWordOption(item, "相关联想"))
        ]
      : searchResults.map((item) => toWordOption(item));

  const updateRelation = (
    relationId: string,
    update: Partial<WordRelationV2>
  ) => {
    onChange(
      value.map((relation) =>
        relation.id === relationId ? { ...relation, ...update } : relation
      )
    );
  };

  const selectWord = (relationId: string, wordId: string) => {
    const selected = searchResults.find((item) => item.word_id === wordId);
    if (!selected) return;
    const choices = selected.senses.map((sense) => ({
      senseId: sense.sense_id,
      gloss: sense.gloss
    }));
    setSenseChoices((current) => ({
      ...current,
      [relationId]: choices
    }));
    updateRelation(relationId, {
      target_word_id: selected.word_id,
      target_headword: selected.headword,
      target_sense_id: "",
      target_gloss: undefined
    });
    setSearching(null);
  };

  return (
    <div className="word-relations-grid">
      {(Object.keys(RELATION_META) as WordRelationType[]).map((type) => {
        const meta = RELATION_META[type];
        const relations = value.filter((item) => item.relation === type);
        return (
          <Card
            size="small"
            className={`word-relation-card${collapsed[type] ? " is-collapsed" : ""}`}
            title={meta.title}
            extra={
              <Button
                type="text"
                size="small"
                className="word-relation-collapse"
                icon={collapsed[type] ? <DownOutlined /> : <UpOutlined />}
                iconPlacement="end"
                aria-label={`${collapsed[type] ? "展开" : "收起"}${meta.title}`}
                onClick={() =>
                  setCollapsed((current) => ({
                    ...current,
                    [type]: !current[type]
                  }))
                }
              >
                {collapsed[type] ? "展开" : "收起"}
              </Button>
            }
            key={type}
          >
            <Space
              className="word-relation-list"
              orientation="vertical"
              style={{ width: "100%" }}
            >
              <div className="word-relation-column-heads">
                <span>{meta.metric}</span>
                <span>{meta.title}</span>
                <span>匹配词义</span>
                <span />
              </div>
              {relations.map((relation) => {
                const absoluteIndex = value.findIndex(
                  (item) => item.id === relation.id
                );
                const resultSenses = searchResults.find(
                  (item) => item.word_id === relation.target_word_id
                )?.senses;
                const availableSenses =
                  senseChoices[relation.id] ??
                  resultSenses?.map((sense) => ({
                    senseId: sense.sense_id,
                    gloss: sense.gloss
                  })) ??
                  (relation.target_sense_id
                    ? [
                        {
                          senseId: relation.target_sense_id,
                          gloss: relation.target_gloss
                        }
                      ]
                    : []);
                const isSearching = searching?.relationId === relation.id;
                return (
                  <div
                    className="word-relation-row"
                    key={relation.id}
                    data-word-node-id={relation.id}
                    data-word-field="target_word_id"
                  >
                    <InputNumber
                      aria-label={meta.metric}
                      data-word-node-id={relation.id}
                      data-word-field="score"
                      min={0}
                      max={100}
                      precision={2}
                      value={Number(relation.score)}
                      disabled={readOnly}
                      suffix="%"
                      size="small"
                      onChange={(score) => {
                        const relationsValue = [...value];
                        relationsValue[absoluteIndex] = {
                          ...relation,
                          score: String(score ?? 0)
                        };
                        onChange(relationsValue);
                      }}
                    />
                    <AutoComplete
                      className="word-relation-autocomplete"
                      value={
                        isSearching
                          ? searching.query
                          : relation.target_headword || ""
                      }
                      options={isSearching ? wordOptions : []}
                      disabled={readOnly}
                      filterOption={false}
                      popupMatchSelectWidth={260}
                      notFoundContent={
                        relatedSearch.isFetching ||
                        relatedSearchV2.exact.isFetching ||
                        relatedSearchV2.contains.isFetching
                          ? "搜索中…"
                          : env.RELATED_SEARCH_V2 &&
                              relatedSearchV2.exact.isError
                            ? "完全同名词条搜索失败"
                            : env.RELATED_SEARCH_V2 &&
                                relatedSearchV2.contains.isError
                              ? "相关联想搜索失败"
                              : searching?.query
                                ? "未找到匹配词条"
                                : "输入词汇搜索"
                      }
                      onFocus={() =>
                        setSearching({
                          relationId: relation.id,
                          query: relation.target_headword || ""
                        })
                      }
                      onSearch={(query) => {
                        setSearching({ relationId: relation.id, query });
                        updateRelation(relation.id, {
                          target_word_id: "",
                          target_sense_id: "",
                          target_headword: query,
                          target_gloss: undefined
                        });
                      }}
                      onSelect={(wordId) => selectWord(relation.id, wordId)}
                    >
                      <Input
                        aria-label={`${meta.title}目标词条`}
                        className="word-relation-target"
                        prefix={<SoundOutlined />}
                        placeholder="搜索关联词"
                        autoFocus={isSearching && searching.query === ""}
                        readOnly={readOnly}
                        size="small"
                      />
                    </AutoComplete>
                    {isSearching &&
                      env.RELATED_SEARCH_V2 &&
                      relatedSearchV2.exact.isError && (
                        <Alert
                          type="error"
                          showIcon
                          title="完全同名词条搜索失败，结果可能不完整"
                          action={
                            <Button
                              size="small"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => relatedSearchV2.exact.refetch()}
                            >
                              重 试
                            </Button>
                          }
                        />
                      )}
                    {isSearching &&
                      env.RELATED_SEARCH_V2 &&
                      relatedSearchV2.contains.isError && (
                        <Alert
                          type="error"
                          showIcon
                          title="相关联想搜索失败，结果可能不完整"
                          action={
                            <Button
                              size="small"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => relatedSearchV2.contains.refetch()}
                            >
                              重 试
                            </Button>
                          }
                        />
                      )}
                    {isSearching &&
                      env.RELATED_SEARCH_V2 &&
                      relatedSearchV2.exact.hasNextPage && (
                        <Button
                          size="small"
                          loading={relatedSearchV2.exact.isFetchingNextPage}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => relatedSearchV2.exact.fetchNextPage()}
                        >
                          加载更多同名词条
                        </Button>
                      )}
                    {isSearching &&
                      env.RELATED_SEARCH_V2 &&
                      relatedSearchV2.contains.hasNextPage && (
                        <Button
                          size="small"
                          loading={relatedSearchV2.contains.isFetchingNextPage}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() =>
                            relatedSearchV2.contains.fetchNextPage()
                          }
                        >
                          加载更多相关联想
                        </Button>
                      )}
                    {isSearching &&
                      env.RELATED_SEARCH_V2 &&
                      relatedSearchV2.exact.data?.pages.some(
                        (page) =>
                          !("total" in page) ||
                          typeof page.total !== "number" ||
                          !("next_cursor" in page)
                      ) && (
                        <Typography.Text type="warning">
                          后端未返回完整分页信息，不能确认已取全同名词条
                        </Typography.Text>
                      )}
                    <Select
                      aria-label={`${meta.title}目标词义`}
                      className="word-relation-sense"
                      value={relation.target_sense_id || undefined}
                      options={availableSenses.map((sense) => ({
                        value: sense.senseId,
                        label: sense.gloss || "（无释义）"
                      }))}
                      placeholder="选择词义"
                      disabled={readOnly || !relation.target_word_id}
                      size="small"
                      onChange={(target_sense_id) => {
                        const selectedSense = availableSenses.find(
                          (sense) => sense.senseId === target_sense_id
                        );
                        updateRelation(relation.id, {
                          target_sense_id,
                          target_gloss: selectedSense?.gloss
                        });
                      }}
                    />
                    {!readOnly && (
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label={`删除${meta.title}`}
                        onClick={() =>
                          onChange(
                            value.filter((item) => item.id !== relation.id)
                          )
                        }
                      />
                    )}
                  </div>
                );
              })}
              {!readOnly && (
                <Button
                  type="dashed"
                  block
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    const relation = createRelation(type);
                    onChange([...value, relation]);
                    setSearching({ relationId: relation.id, query: "" });
                  }}
                >
                  添加{meta.title}
                </Button>
              )}
            </Space>
          </Card>
        );
      })}
    </div>
  );
}

function SenseEditor({
  value,
  index,
  last,
  wordId,
  senseGroups,
  grammars,
  subPosOptions,
  subPosLabel,
  catalogUnavailable,
  readOnly,
  forceOpen,
  onChange,
  onMove,
  onRemove
}: {
  value: WordSenseV2;
  index: number;
  last: boolean;
  wordId: string;
  senseGroups: DraftMeaningsStepContent["sense_groups"];
  grammars: WordPosMeaningsV2["grammar_structures"];
  subPosOptions: Array<{ value: string; label: string }>;
  subPosLabel?: string;
  catalogUnavailable: boolean;
  readOnly?: boolean;
  forceOpen?: boolean;
  onChange: (next: WordSenseV2) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(index === 0 || forceOpen === true);
  useEffect(() => {
    if (forceOpen) setExpanded(true);
  }, [forceOpen]);

  // 只有一个可选细分项时选择器没有决策价值：改为只读展示，取值由上层回填。
  // 存量取值与该唯一项不符时仍保留选择器，让管理员能把非法编码改回来。
  const onlyOption = subPosOptions.length === 1 ? subPosOptions[0]! : undefined;
  const soleSubPos =
    onlyOption && (!value.sub_pos || value.sub_pos === onlyOption.value)
      ? onlyOption
      : undefined;

  const definitionSorting = useSortableRows({
    items: value.definitions,
    scopeId: `${value.id}:definitions`,
    dragType: DEFINITION_DRAG_TYPE,
    readOnly,
    onChange: (definitions) => onChange({ ...value, definitions })
  });
  const sentenceSorting = useSortableRows({
    items: value.sentences,
    scopeId: `${value.id}:sentences`,
    dragType: SENTENCE_DRAG_TYPE,
    readOnly,
    onChange: (sentences) => onChange({ ...value, sentences })
  });

  const { preference } = useDialectPreference();
  const definitionText = definitionTitleText(value.definitions[0], preference);
  return (
    <Collapse
      className={`word-sense-editor word-sense-editor-${value.level.toLowerCase()}`}
      data-word-node-id={value.id}
      data-word-field="sense"
      activeKey={expanded ? [value.id] : []}
      onChange={(keys) =>
        setExpanded((Array.isArray(keys) ? keys : [keys]).includes(value.id))
      }
      items={[
        {
          key: value.id,
          showArrow: false,
          label: (
            <div className="word-sense-header-label">
              <Space wrap size={6}>
                <Tag color={cefrColor(value.level)}>{value.level}</Tag>
                <Typography.Text strong>
                  {index + 1}. {definitionText}
                </Typography.Text>
                {subPosLabel && <Tag color="green">{subPosLabel}</Tag>}
              </Space>
              <span className="word-form-card-toggle-state">
                <span>{expanded ? "收起" : "展开"}</span>
                <DownOutlined
                  className={`word-form-card-toggle-icon${expanded ? "" : " is-collapsed"}`}
                />
              </span>
            </div>
          ),
          extra: !readOnly ? (
            <Dropdown
              trigger={["click"]}
              placement="bottomRight"
              menu={{
                items: [
                  {
                    key: "move-up",
                    icon: <UpOutlined />,
                    label: "上移词义",
                    disabled: index === 0
                  },
                  {
                    key: "move-down",
                    icon: <DownOutlined />,
                    label: "下移词义",
                    disabled: last
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
                  if (key === "move-up") onMove(-1);
                  if (key === "move-down") onMove(1);
                  if (key === "delete") onRemove();
                }
              }}
            >
              <Button
                type="text"
                icon={<EllipsisOutlined />}
                aria-label={`管理词义 ${index + 1}`}
                onClick={(event) => event.stopPropagation()}
              />
            </Dropdown>
          ) : null,
          children: (
            <Space orientation="vertical" size={14} style={{ width: "100%" }}>
              <div className="word-sense-meta-grid">
                <div className="word-sense-field">
                  <Typography.Text type="secondary">词义等级</Typography.Text>
                  <Select
                    aria-label="词义等级"
                    data-word-node-id={value.id}
                    data-word-field="level"
                    value={value.level}
                    options={CEFR_OPTIONS}
                    disabled={readOnly}
                    style={{ width: "100%", marginTop: 6 }}
                    onChange={(level: CefrLevel) =>
                      onChange({ ...value, level })
                    }
                  />
                </div>
                <div className="word-sense-field word-sense-field-group">
                  <Typography.Text type="secondary">语义区间</Typography.Text>
                  <Select
                    aria-label="语义区间"
                    aria-required="true"
                    data-word-node-id={value.id}
                    data-word-field="sense_group_id"
                    value={value.sense_group_id}
                    options={senseGroups.map((group) => ({
                      value: group.id,
                      label: senseGroupOptionLabel(group)
                    }))}
                    disabled={readOnly}
                    style={{ width: "100%", marginTop: 6 }}
                    onChange={(sense_group_id) =>
                      onChange({ ...value, sense_group_id })
                    }
                  />
                </div>
                <div className="word-sense-field word-sense-field-pos">
                  <Typography.Text type="secondary">细分词性</Typography.Text>
                  {soleSubPos ? (
                    <div
                      className="word-sense-fixed-value"
                      data-word-node-id={value.id}
                      data-word-field="sub_pos"
                    >
                      <Tag>{soleSubPos.label}</Tag>
                    </div>
                  ) : (
                    <Select
                      aria-label="细分词性"
                      data-word-node-id={value.id}
                      data-word-field="sub_pos"
                      value={value.sub_pos || undefined}
                      options={subPosOptions}
                      disabled={readOnly || catalogUnavailable}
                      style={{ width: "100%", marginTop: 6 }}
                      onChange={(sub_pos) => onChange({ ...value, sub_pos })}
                    />
                  )}
                </div>
                <div className="word-sense-field word-sense-field-frequency">
                  <Typography.Text type="secondary">词频</Typography.Text>
                  <InputNumber
                    aria-label="词频"
                    data-word-node-id={value.id}
                    data-word-field="frequency"
                    min={0}
                    max={100}
                    precision={2}
                    value={value.frequency ? Number(value.frequency) : null}
                    disabled={readOnly}
                    suffix="%"
                    style={{ width: "100%", marginTop: 6 }}
                    onChange={(frequency) =>
                      onChange({
                        ...value,
                        frequency:
                          frequency === null ? undefined : String(frequency)
                      })
                    }
                  />
                </div>
                <div className="word-sense-context-toggle">
                  <Typography.Text type="secondary">
                    是否依赖语境
                  </Typography.Text>
                  <div className="word-sense-context-control">
                    <Switch
                      aria-label="是否依赖语境"
                      checked={value.depends_on_context}
                      disabled={readOnly}
                      onChange={(depends_on_context) =>
                        onChange({ ...value, depends_on_context })
                      }
                    />
                  </div>
                </div>
              </div>

              <section
                className="word-sense-section"
                data-word-node-id={value.id}
                data-word-field="definitions"
              >
                <div className="word-sense-section-title">
                  <Typography.Text strong>多维释义</Typography.Text>
                  <Tag>{value.definitions.length} 条</Tag>
                </div>
                {value.definitions.map((definition, definitionIndex) => (
                  <DefinitionEditor
                    key={definition.id}
                    value={definition}
                    index={definitionIndex}
                    grammars={grammars}
                    readOnly={readOnly}
                    sorting={definitionSorting}
                    onChange={(nextDefinition) => {
                      const definitions = [...value.definitions];
                      definitions[definitionIndex] = nextDefinition;
                      onChange({ ...value, definitions });
                    }}
                    onRemove={() =>
                      onChange({
                        ...value,
                        definitions: value.definitions.filter(
                          (_, removeIndex) => removeIndex !== definitionIndex
                        )
                      })
                    }
                  />
                ))}
                {!readOnly && (
                  <Button
                    className="word-section-add-button"
                    type="dashed"
                    block
                    icon={<PlusOutlined />}
                    onClick={() =>
                      onChange({
                        ...value,
                        definitions: [...value.definitions, createDefinition()]
                      })
                    }
                  >
                    添加释义
                  </Button>
                )}
              </section>

              <section className="word-sense-section">
                <div className="word-sense-section-title">
                  <Typography.Text strong>多维例句</Typography.Text>
                  <Tag>{value.sentences.length} 条</Tag>
                </div>
                {value.sentences.map((sentence, sentenceIndex) => (
                  <SentenceEditor
                    key={sentence.id}
                    value={sentence}
                    index={sentenceIndex}
                    readOnly={readOnly}
                    sorting={sentenceSorting}
                    onChange={(nextSentence) => {
                      const sentences = [...value.sentences];
                      sentences[sentenceIndex] = nextSentence;
                      onChange({ ...value, sentences });
                    }}
                    onRemove={() =>
                      onChange({
                        ...value,
                        sentences: value.sentences.filter(
                          (_, removeIndex) => removeIndex !== sentenceIndex
                        )
                      })
                    }
                  />
                ))}
                {!readOnly && (
                  <Button
                    className="word-section-add-button"
                    type="dashed"
                    block
                    icon={<PlusOutlined />}
                    onClick={() =>
                      onChange({
                        ...value,
                        sentences: [
                          ...value.sentences,
                          createSentence(wordId, value.id)
                        ]
                      })
                    }
                  >
                    添加例句
                  </Button>
                )}
              </section>

              <section className="word-sense-section">
                <div className="word-sense-section-title">
                  <Typography.Text strong>关联词</Typography.Text>
                  <Tag>{value.relations.length} 个</Tag>
                </div>
                <RelationsEditor
                  value={value.relations}
                  readOnly={readOnly}
                  onChange={(relations) => onChange({ ...value, relations })}
                />
              </section>
            </Space>
          )
        }
      ]}
    />
  );
}

function senseGroupOptionLabel(
  group: DraftMeaningsStepContent["sense_groups"][number]
): string {
  const nameZh = group.name_zh.trim() || "待填写中文名";
  const nameEn = group.name_en.trim() || "待填写英文名";
  return `${nameZh} / ${nameEn}`;
}

export function MeaningsAndExamplesStep({
  word,
  readOnly,
  onSaved,
  onDraftChange
}: Props) {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const editQuery = word.status === "published" ? "?mode=edit" : "";
  const partOfSpeechCatalog = usePartOfSpeechCatalog();
  const partOfSpeechLookup = useMemo(
    () => createPartOfSpeechLookup(partOfSpeechCatalog.data),
    [partOfSpeechCatalog.data]
  );
  const [content, setContent] = useState<DraftMeaningsStepContent>(() =>
    cloneWordValue(ensureMeaningsForForms(word))
  );
  const contentRef = useRef(content);
  const loadedWordIdRef = useRef(word.id);
  const [activePosId, setActivePosId] = useState(
    word.forms.pos[0]?.pos_id ?? ""
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [collapsePending, setCollapsePending] = useState(false);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const issueTarget = useWordValidationIssue();
  const saveMeanings = useSaveMeaningsStep(word.id);
  const { preference } = useDialectPreference();
  const allowSavedNavigation = useUnsavedWordChanges(dirty);
  useWordValidationIssueFocus(activePosId);

  const issueOwnerPosId = issueTarget
    ? content.pos.find((pos) => meaningsPosOwnsNode(pos, issueTarget.nodeId))
        ?.pos_id
    : undefined;
  useEffect(() => {
    if (issueOwnerPosId) setActivePosId(issueOwnerPosId);
  }, [issueOwnerPosId]);

  useEffect(() => {
    const wordChanged = loadedWordIdRef.current !== word.id;
    if (!dirty || wordChanged) {
      loadedWordIdRef.current = word.id;
      const next = cloneWordValue(ensureMeaningsForForms(word));
      contentRef.current = next;
      setContent(next);
      if (wordChanged) {
        setDirty(false);
        setValidationMessages([]);
        setActivePosId(word.forms.pos[0]?.pos_id ?? "");
      }
    }
  }, [dirty, word, word.revision]);

  // 目录是异步到达的，回填要等它就位；辅助函数无可回填项时原样返回，
  // 因此这个 effect 会在一次回填后自然收敛。读 contentRef 而不是闭包里的
  // content：同一次提交里 word 变更可能已经写过更新的内容，
  // 用闭包快照回填会把它们覆盖掉；content 仍留在依赖里，新增词义后才会重跑。
  useEffect(() => {
    const current = contentRef.current;
    const next = applySoleSubPartOfSpeech(
      current,
      word.forms,
      partOfSpeechLookup
    );
    if (next === current) return;
    contentRef.current = next;
    setContent(next);
  }, [content, partOfSpeechLookup, word.forms]);

  useEffect(() => {
    onDraftChange?.(content);
  }, [content, onDraftChange]);

  const updateContent = (next: DraftMeaningsStepContent) => {
    contentRef.current = next;
    setContent(next);
    setDirty(true);
  };

  const removeSenseGroup = (groupId: string) => {
    if (content.sense_groups.length <= 1) return;
    const remainingGroups = content.sense_groups.filter(
      (group) => group.id !== groupId
    );
    const fallbackGroup = remainingGroups[0]!;
    const referenceCount = content.pos.reduce(
      (count, pos) =>
        count +
        pos.senses.filter((sense) => sense.sense_group_id === groupId).length,
      0
    );
    const apply = () => {
      const pos = content.pos.map((posMeanings) => ({
        ...posMeanings,
        senses: posMeanings.senses.map((sense) =>
          sense.sense_group_id === groupId
            ? { ...sense, sense_group_id: fallbackGroup.id }
            : sense
        )
      }));
      updateContent({
        sense_groups: remainingGroups,
        pos
      });
    };
    if (referenceCount === 0) {
      apply();
      return;
    }
    modal.confirm({
      title: "删除被词义引用的语义区间？",
      content: `将把 ${referenceCount} 个词义改绑到“${senseGroupOptionLabel(fallbackGroup)}”，词义内容本身会保留。`,
      okText: "删除并改绑",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: apply
    });
  };

  const performSave = async (intent: StepSaveIntent) => {
    setSaving(true);
    try {
      const { word: savedWord } = await saveMeanings.mutateAsync({
        base_revision: word.revision,
        intent,
        content: toMeaningsWireContent(content, word.headwords, preference)
      });
      setDirty(false);
      onSaved(savedWord);
      message.success(
        intent === "complete" ? "词义与例句已完成" : "草稿已保存"
      );
      if (intent === "complete") {
        allowSavedNavigation();
        navigate(`/words/${word.id}/wizard/preview${editQuery}`);
      }
    } catch (error) {
      if (error instanceof HttpError) {
        const stepIssues = error.field_issues.filter(
          (candidate) => candidate.step === "meanings"
        );
        setValidationMessages(stepIssues.map((issue) => issue.message));
        const issue = stepIssues[0];
        if (issue) {
          message.warning(issue.message);
          navigate(`/words/${word.id}/wizard/meanings${editQuery}`, {
            replace: true,
            state: { nodeId: issue.node_id, field: issue.field }
          });
          return;
        }
        if (error.status === 409) {
          modal.confirm({
            title: "草稿版本已更新",
            content:
              "该词条已在其他位置保存。为避免覆盖新内容，请重新加载最新草稿后再编辑。",
            okText: "重新加载",
            cancelText: "留在本页",
            onOk: () => navigate(0)
          });
          return;
        }
      }
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const save = async (intent: StepSaveIntent) => {
    // collapsePending 挡住确认框弹出期间的二次点击：此时 saving 还是 false，
    // 连点两下会叠出两个确认框，依次确认就用同一个 base_revision 发两次保存。
    if (saving || collapsePending) return;
    if (intent === "complete") {
      // 按「保存后会变成什么样」校验：英文内容收敛后只剩偏好侧那一份。
      const issues = validateMeanings(normalizedContent, {
        word_id: word.id,
        headwords: word.headwords,
        forms: word.forms,
        partOfSpeechLookup
      });
      setValidationMessages(issues);
      if (issues.length > 0) {
        message.warning(`还有 ${issues.length} 项需要完善`);
        return;
      }
    }
    if (discardedTotal === 0) {
      await performSave(intent);
      return;
    }
    // 不静默截断：把「哪一侧、丢几条」讲清楚，管理员点了确认才动。
    setCollapsePending(true);
    modal.confirm({
      title: "保存后这条词条只保留一份英文内容",
      content: `${OTHER_DIALECT_LABEL[preference]}的 ${discardedItems} 将不再保留，${DIALECT_PREFERENCE_LABEL[preference]}内容成为唯一内容。`,
      okText: "确认保存",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => performSave(intent),
      afterClose: () => setCollapsePending(false)
    });
  };

  const formsById = useMemo(
    () => new Map(word.forms.pos.map((pos) => [pos.pos_id, pos])),
    [word.forms.pos]
  );
  const pronunciationHints = useMemo(
    () => collectPronunciationHints(word.forms),
    [word.forms]
  );
  // 存量双份英文内容：进来时给一条说明，保存前再确认一次要丢弃哪些，绝不静默截断。
  // 判据是「确实有内容会被丢弃」而不是「wire 形状是不是 distinguish」——
  // 只填了单侧的旧草稿收敛时无物可丢，再提示「留着两份内容」只会让人去找不存在的那一份。
  // 保存出去的形状：英文收敛为单份 + 语法结构按偏好侧镜像。
  // 校验、完成度与词性 Tab 的待修项计数都必须基于它，否则会出现
  // 「Tab 上挂着一个消不掉的红点，但完成校验又说没问题」这种自相矛盾。
  const normalizedContent = useMemo(
    () =>
      mirrorMeaningsGrammar(
        collapseMeaningsEnglishText(content, preference),
        word.headwords,
        preference
      ),
    [content, preference, word.headwords]
  );
  const discarded = countDiscardedEnglishTexts(content, preference);
  // 语法结构保存时按偏好侧镜像写两条，非偏好侧写过的不同文本会被覆盖——
  // 这同样是丢数据，必须一起说清楚，不能宣称「语法结构不受影响」。
  //
  // 注意这里数的是**载入时**的服务端副本而不是正在编辑的 content：编辑只写偏好侧那一条，
  // 非偏好侧留着上一次的镜像值，拿 content 去比会把「你自己刚改的字」误判成
  // 「即将被覆盖的美式内容」，于是每改一个字都弹一次确认框。
  const overwrittenGrammar = countOverwrittenGrammarVariants(
    word.meanings,
    word.headwords,
    preference
  );
  const discardedTotal =
    discarded.definitions + discarded.sentences + overwrittenGrammar;
  const discardedItems = [
    discarded.definitions > 0 ? `英文释义 ${discarded.definitions} 条` : "",
    discarded.sentences > 0 ? `英文例句 ${discarded.sentences} 条` : "",
    overwrittenGrammar > 0 ? `语法结构 ${overwrittenGrammar} 条` : ""
  ]
    .filter(Boolean)
    .join("、");

  const tabs = content.pos.map((posMeanings, posIndex) => {
    const formPos = formsById.get(posMeanings.pos_id);
    const label = formPos
      ? partOfSpeechLabel(partOfSpeechLookup, formPos.pos)
      : "未知词性";
    const issueCount = countPosMeaningIssues(
      normalizedContent.pos[posIndex] ?? posMeanings,
      new Set(content.sense_groups.map((group) => group.id))
    );
    return {
      key: posMeanings.pos_id,
      label: (
        <Space>
          <strong>{label}</strong>
          <Badge count={issueCount} size="small" title="该词性待修项" />
        </Space>
      ),
      children: (
        <div
          className="word-pos-editor"
          data-word-node-id={posMeanings.pos_id}
          data-word-field="pos"
        >
          <Space orientation="vertical" size={14} style={{ width: "100%" }}>
            <GrammarEditor
              value={posMeanings.grammar_structures}
              posId={posMeanings.pos_id}
              headwords={word.headwords}
              readOnly={readOnly}
              onChange={(grammar_structures) => {
                const remaining = new Set(
                  grammar_structures.map((grammar) => grammar.id)
                );
                const removed = new Set(
                  posMeanings.grammar_structures
                    .filter((grammar) => !remaining.has(grammar.id))
                    .map((grammar) => grammar.id)
                );
                const referenceCount = posMeanings.senses.reduce(
                  (count, sense) =>
                    count +
                    sense.definitions.filter(
                      (definition) =>
                        definition.grammar_structure_id !== undefined &&
                        removed.has(definition.grammar_structure_id)
                    ).length,
                  0
                );
                const apply = () => {
                  const pos = [...content.pos];
                  pos[posIndex] = {
                    ...posMeanings,
                    grammar_structures,
                    senses: posMeanings.senses.map((sense) => ({
                      ...sense,
                      definitions: sense.definitions.map((definition) =>
                        definition.grammar_structure_id !== undefined &&
                        removed.has(definition.grammar_structure_id)
                          ? { ...definition, grammar_structure_id: undefined }
                          : definition
                      )
                    }))
                  };
                  updateContent({ ...content, pos });
                };
                if (referenceCount === 0) {
                  apply();
                  return;
                }
                modal.confirm({
                  title: "删除被释义引用的语法结构？",
                  content: `将清空 ${referenceCount} 条释义的语法结构绑定，释义正文会保留。`,
                  okText: "删除并清空引用",
                  okButtonProps: { danger: true },
                  cancelText: "取消",
                  onOk: apply
                });
              }}
            />

            <div
              className="word-sense-list"
              data-word-node-id={posMeanings.pos_id}
              data-word-field="senses"
            >
              {posMeanings.senses.map((sense, senseIndex) => (
                <SenseEditor
                  key={sense.id}
                  value={sense}
                  index={senseIndex}
                  last={senseIndex === posMeanings.senses.length - 1}
                  wordId={word.id}
                  senseGroups={content.sense_groups}
                  grammars={posMeanings.grammar_structures}
                  subPosOptions={
                    formPos
                      ? subPartOfSpeechOptions(partOfSpeechLookup, formPos.pos)
                      : []
                  }
                  subPosLabel={
                    sense.sub_pos
                      ? subPartOfSpeechLabel(partOfSpeechLookup, sense.sub_pos)
                      : undefined
                  }
                  catalogUnavailable={partOfSpeechCatalog.isError}
                  readOnly={readOnly}
                  forceOpen={
                    issueTarget
                      ? senseOwnsNode(sense, issueTarget.nodeId)
                      : false
                  }
                  onChange={(nextSense) => {
                    const pos = [...content.pos];
                    const senses = [...posMeanings.senses];
                    senses[senseIndex] = nextSense;
                    pos[posIndex] = { ...posMeanings, senses };
                    updateContent({ ...content, pos });
                  }}
                  onMove={(delta) => {
                    const pos = [...content.pos];
                    pos[posIndex] = {
                      ...posMeanings,
                      senses: moveWordNode(
                        posMeanings.senses,
                        senseIndex,
                        senseIndex + delta
                      )
                    };
                    updateContent({ ...content, pos });
                  }}
                  onRemove={() => {
                    const referenceCount = countSenseReferences(
                      content,
                      word.id,
                      sense.id
                    );
                    modal.confirm({
                      title: `删除词义 ${senseIndex + 1}？`,
                      content:
                        referenceCount > 0
                          ? `该词义还被 ${referenceCount} 条上下文关联或关系词引用；确认后会一并清理这些引用。`
                          : "该词义下的释义和例句会一并删除，且不可恢复。",
                      okText: "删除并清理引用",
                      okButtonProps: { danger: true },
                      cancelText: "取消",
                      onOk: () =>
                        updateContent(
                          removeSenseAndReferences(content, word.id, sense.id)
                        )
                    });
                  }}
                />
              ))}
              {!readOnly && (
                <Button
                  type="dashed"
                  block
                  size="large"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    const pos = [...content.pos];
                    pos[posIndex] = {
                      ...posMeanings,
                      senses: [
                        ...posMeanings.senses,
                        createSense(word.id, content.sense_groups[0]!.id)
                      ]
                    };
                    updateContent({ ...content, pos });
                  }}
                >
                  添加词义
                </Button>
              )}
            </div>
          </Space>
        </div>
      )
    };
  });

  return (
    <VoiceEditorProvider
      pronunciationHints={pronunciationHints}
      readOnly={readOnly}
    >
      <div className="word-step-heading">
        <span className="word-step-number">STEP 03</span>
        <Typography.Title level={2} style={{ margin: 0 }}>
          词义与例句
        </Typography.Title>
        <Typography.Paragraph className="word-step-description">
          按词性维护语法结构、词义、四类释义、双语例句和关系词。例句会自动保留指向当前词义的锁定主关联。
        </Typography.Paragraph>
      </div>

      {env.WORD_CONTENT_COMPLETION && (
        <ContentCompletionPanel
          key={word.id}
          word={word}
          content={content}
          readOnly={readOnly}
          onApply={updateContent}
        />
      )}

      {readOnly && (
        <Alert
          type="info"
          showIcon
          title={
            word.status === "archived"
              ? "已归档词条当前为只读"
              : "已发布词条当前为只读"
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {partOfSpeechCatalog.isError && (
        <Alert
          type="warning"
          showIcon
          title="词性配置加载失败，暂时无法选择细分词性"
          style={{ marginBottom: 16 }}
        />
      )}

      <fieldset
        className="word-request-lock"
        disabled={saving}
        aria-busy={saving}
      >
        {validationMessages.length > 0 && (
          <Alert
            type="error"
            showIcon
            title={`本步骤还有 ${validationMessages.length} 项待修正`}
            description={
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                {validationMessages.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            }
            style={{ marginBottom: 16 }}
          />
        )}
        {discardedTotal > 0 && (
          <Alert
            type="info"
            showIcon
            title={`这条词条还留着旧版的${OTHER_DIALECT_LABEL[preference]}英文内容`}
            description={`现在统一按你的方言偏好（${DIALECT_PREFERENCE_LABEL[preference]}）维护一份；保存时会让你确认是否丢弃${OTHER_DIALECT_LABEL[preference]}的 ${discardedItems}。`}
            style={{ marginBottom: 16 }}
          />
        )}

        <Card
          className="word-sense-groups-card"
          data-word-node-id={word.id}
          data-word-field="sense_groups"
          size="small"
          title="语义区间"
          extra={
            !readOnly ? (
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                onClick={() =>
                  updateContent({
                    ...content,
                    sense_groups: [...content.sense_groups, createSenseGroup()]
                  })
                }
              >
                添加语义区间
              </Button>
            ) : null
          }
        >
          <div className="word-sense-group-list">
            {content.sense_groups.map((group, index) => (
              <div className="word-sense-group-item" key={group.id}>
                <span
                  className="word-sense-group-index"
                  aria-label={`第 ${index + 1} 个语义区间`}
                >
                  {index + 1}
                </span>
                <label className="word-sense-group-field">
                  <Typography.Text type="secondary">中文</Typography.Text>
                  <Input
                    aria-label={`语义区间 ${index + 1} 中文`}
                    data-word-node-id={group.id}
                    data-word-field="name_zh"
                    value={group.name_zh}
                    readOnly={readOnly}
                    placeholder="例如 几何与物理空间核心"
                    onChange={(event) => {
                      const sense_groups = [...content.sense_groups];
                      sense_groups[index] = {
                        ...group,
                        name_zh: event.target.value
                      };
                      updateContent({ ...content, sense_groups });
                    }}
                  />
                </label>
                <label className="word-sense-group-field">
                  <Typography.Text type="secondary">英文</Typography.Text>
                  <Input
                    aria-label={`语义区间 ${index + 1} 英文`}
                    data-word-node-id={group.id}
                    data-word-field="name_en"
                    value={group.name_en}
                    readOnly={readOnly}
                    placeholder="例如 Core geometric and physical space"
                    onChange={(event) => {
                      const sense_groups = [...content.sense_groups];
                      sense_groups[index] = {
                        ...group,
                        name_en: event.target.value
                      };
                      updateContent({ ...content, sense_groups });
                    }}
                  />
                </label>
                {!readOnly && (
                  <Button
                    className="word-sense-group-delete"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`删除语义区间 ${index + 1}`}
                    disabled={content.sense_groups.length <= 1}
                    title={
                      content.sense_groups.length <= 1
                        ? "至少保留一个语义区间"
                        : "删除语义区间"
                    }
                    onClick={() => removeSenseGroup(group.id)}
                  />
                )}
              </div>
            ))}
          </div>
        </Card>

        <Tabs
          className="word-pos-tabs"
          activeKey={activePosId}
          onChange={setActivePosId}
          items={tabs}
        />

        {!readOnly && (
          <div className="word-step-actions">
            <Button
              onClick={() =>
                navigate(`/words/${word.id}/wizard/forms${editQuery}`)
              }
            >
              上一步
            </Button>
            <Button
              loading={saving}
              disabled={collapsePending}
              onClick={() => void save("save")}
            >
              保存草稿
            </Button>
            <Button
              type="primary"
              loading={saving}
              disabled={collapsePending}
              onClick={() => void save("complete")}
            >
              完成并进入预览
            </Button>
          </div>
        )}
      </fieldset>
    </VoiceEditorProvider>
  );
}
