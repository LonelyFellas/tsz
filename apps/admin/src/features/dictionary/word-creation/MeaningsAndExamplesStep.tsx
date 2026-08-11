import {
  DeleteOutlined,
  DownOutlined,
  EllipsisOutlined,
  LockOutlined,
  PlusOutlined,
  SoundOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  UploadOutlined,
  UpOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Card,
  Collapse,
  Dropdown,
  Flex,
  Input,
  InputNumber,
  Segmented,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography
} from "antd";
import type {
  AdminWordV2,
  CefrLevel,
  Dialect,
  DraftMeaningsStepContent,
  EnglishTextV2,
  RichText,
  StepSaveIntent,
  WordDefinitionV2,
  WordHeadwordsV2,
  WordPosMeaningsV2,
  WordRelationType,
  WordRelationV2,
  WordSenseV2,
  WordSentenceV2
} from "@tsz/types";
import { VoiceRichTextField } from "@tsz/voice-editor/reader";
import "@tsz/voice-editor/styles.css";
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
import { DIALECT_SHORT_LABEL } from "../editorConstants";
import { CEFR_OPTIONS, cefrColor } from "../labels";
import { adminWordsDataSourceCapabilities } from "../dataSource";
import { env } from "@/lib/env";
import { adminVoicePreviewAdapter } from "../voice-editor/dataSource";
import {
  createPartOfSpeechLookup,
  partOfSpeechLabel,
  subPartOfSpeechLabel,
  subPartOfSpeechOptions
} from "../part-of-speech/catalog";
import { usePartOfSpeechCatalog } from "../part-of-speech/api";
import { useRelatedSearch } from "../api";
import {
  cloneWordValue,
  moveWordNode,
  newWordNodeId,
  toWordRichText
} from "../word-model/primitives";
import { useSaveMeaningsStep, useSuggestDialectVariants } from "./api";
import {
  applyMeaningDialectSuggestions,
  collectMissingMeaningDialectItems,
  countIncompleteMeaningDialectSlots,
  createDefinition,
  createEnglishText,
  createGrammar,
  createRelation,
  createSense,
  createSenseGroup,
  createSentence,
  ensureMeaningsForForms,
  grammarDialects,
  toMeaningsWireContent
} from "./model";
import { useUnsavedWordChanges } from "./useUnsavedWordChanges";
import {
  useWordValidationIssue,
  useWordValidationIssueFocus
} from "./useWordValidationIssueFocus";

const VoiceRichTextEditor = lazy(() =>
  import("@tsz/voice-editor/editor").then((module) => ({
    default: module.VoiceRichTextEditor
  }))
);

interface Props {
  word: AdminWordV2;
  readOnly?: boolean;
  onSaved: (word: AdminWordV2) => void;
}

type MeaningDialect = "uk" | "us";

const GRAMMAR_DRAG_TYPE = "application/x-tsz-grammar-structure";
const DEFINITION_DRAG_TYPE = "application/x-tsz-definition";
const SENTENCE_DRAG_TYPE = "application/x-tsz-sentence";

const DEFINITION_MODE_OPTIONS = [
  { value: "zh_definition", label: "中文定义释义" },
  { value: "en_definition", label: "英文定义释义" },
  { value: "zh_sentence", label: "中文整句释义" },
  { value: "en_sentence", label: "英文整句释义" }
] as const;

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
  activeDialect: MeaningDialect
): string {
  const variant =
    grammar.variants.find((item) => item.dialect === activeDialect) ??
    grammar.variants.find((item) => item.dialect === "common") ??
    grammar.variants[0];
  return (
    variant?.content.text.trim() || `语法结构 ${grammarIndex + 1}（未填写）`
  );
}

function definitionTitleText(
  definition: WordDefinitionV2 | undefined,
  activeDialect: MeaningDialect
): string {
  if (!definition) return "待填写释义";
  if (!definition.definition_mode.startsWith("en_")) {
    return (definition.content as RichText).text.trim() || "待填写释义";
  }
  const content = definition.content as EnglishTextV2;
  if (content.mode === "unified") {
    return content.common.value.text.trim() || "待填写释义";
  }
  const slot = content[activeDialect];
  return slot.state === "ready" && slot.variant.value.text.trim()
    ? slot.variant.value.text.trim()
    : "待填写释义";
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

function setEnglishText(
  value: EnglishTextV2,
  dialect: Dialect,
  text: string
): EnglishTextV2 {
  if (value.mode === "unified") {
    return {
      ...value,
      common: {
        id: value.common.id,
        value: toWordRichText(text, value.common.value),
        origin: "manual"
      }
    };
  }
  if (dialect === "common") return value;
  const current = value[dialect];
  return {
    ...value,
    [dialect]: {
      state: "ready",
      variant: {
        id: current.state === "ready" ? current.variant.id : newWordNodeId(),
        value: toWordRichText(
          text,
          current.state === "ready" ? current.variant.value : undefined
        ),
        origin: "manual"
      }
    }
  };
}

function setEnglishRichText(
  value: EnglishTextV2,
  dialect: Dialect,
  content: RichText
): EnglishTextV2 {
  if (value.mode === "unified") {
    return {
      ...value,
      common: { id: value.common.id, value: content, origin: "manual" }
    };
  }
  if (dialect === "common") return value;
  const current = value[dialect];
  return {
    ...value,
    [dialect]: {
      state: "ready",
      variant: {
        id: current.state === "ready" ? current.variant.id : newWordNodeId(),
        value: content,
        origin: "manual"
      }
    }
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

export function collectPronunciationHints(
  forms: AdminWordV2["forms"]
): Readonly<Record<string, string>> {
  const hints: Record<string, string> = {};
  for (const pos of forms.pos) {
    const slots = [
      pos.base_form,
      ...pos.form_groups.flatMap((group) => group.slots)
    ];
    for (const slot of slots) {
      for (const variant of slot.variants) {
        const spelling = variant.spelling.trim().toLowerCase();
        const pronunciation = variant.pronunciations.find(
          (item) => item.dict_phonetic.trim() || item.actual_pron.trim()
        );
        const phoneme =
          pronunciation?.dict_phonetic.trim() ||
          pronunciation?.actual_pron.trim() ||
          "";
        if (spelling && phoneme && hints[spelling] === undefined) {
          hints[spelling] = phoneme;
        }
      }
    }
  }
  return hints;
}

function VoiceEditorProvider({
  children,
  pronunciationHints
}: {
  children: ReactNode;
  pronunciationHints: Readonly<Record<string, string>>;
}) {
  const [target, setTarget] = useState<VoiceEditorTarget>();
  if (!env.VOICE_EDITOR) return children;
  return (
    <VoiceEditorContext.Provider value={{ open: setTarget }}>
      {children}
      {target && (
        <Suspense fallback={null}>
          <VoiceRichTextEditor
            open
            value={target.value}
            language="en"
            contextLabel={target.contextLabel}
            pronunciationHints={pronunciationHints}
            previewAdapter={adminVoicePreviewAdapter}
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
  dialectLabel,
  readOnly,
  onChange
}: {
  value: RichText;
  contextLabel: string;
  dialectLabel?: string;
  readOnly?: boolean;
  onChange: (value: RichText) => void;
}) {
  const editor = useContext(VoiceEditorContext);
  return (
    <VoiceRichTextField
      value={value}
      contextLabel={contextLabel}
      dialectLabel={dialectLabel}
      readOnly={readOnly}
      onEdit={
        readOnly || !editor
          ? undefined
          : () => editor.open({ value, contextLabel, onApply: onChange })
      }
    />
  );
}

function EnglishTextEditor({
  value,
  clientId,
  activeDialect,
  readOnly,
  onChange
}: {
  value: EnglishTextV2;
  clientId: string;
  activeDialect: MeaningDialect;
  readOnly?: boolean;
  onChange: (next: EnglishTextV2) => void;
}) {
  if (value.mode === "unified") {
    if (env.VOICE_EDITOR) {
      return (
        <div data-word-node-id={clientId} data-word-field="content">
          <VoiceTextControl
            value={value.common.value}
            contextLabel="英语文本"
            readOnly={readOnly}
            onChange={(content) =>
              onChange(setEnglishRichText(value, "common", content))
            }
          />
        </div>
      );
    }
    return (
      <Input.TextArea
        aria-label="英语文本"
        data-word-node-id={clientId}
        data-word-field="content"
        value={value.common.value.text}
        readOnly={readOnly}
        autoSize={{ minRows: 2, maxRows: 6 }}
        onChange={(event) =>
          onChange(setEnglishText(value, "common", event.target.value))
        }
      />
    );
  }
  const dialect = activeDialect;
  const slot = value[dialect];
  const slotValue =
    slot.state === "ready"
      ? slot.variant.value
      : ({ version: 2, text: "", annotations: [] } satisfies RichText);
  return (
    <div
      className={`word-meaning-dialect-panel dialect-panel-${dialect}`}
      data-word-node-id={clientId}
      data-word-field="content"
    >
      {env.VOICE_EDITOR ? (
        <VoiceTextControl
          value={slotValue}
          contextLabel={`${DIALECT_SHORT_LABEL[dialect]}英语文本`}
          dialectLabel={DIALECT_SHORT_LABEL[dialect]}
          readOnly={readOnly}
          onChange={(content) =>
            onChange(setEnglishRichText(value, dialect, content))
          }
        />
      ) : (
        <Input.TextArea
          aria-label={`${DIALECT_SHORT_LABEL[dialect]}英语文本`}
          value={slot.state === "ready" ? slot.variant.value.text : ""}
          readOnly={readOnly}
          placeholder={
            slot.state === "missing" ? "待自动补全，也可直接填写" : undefined
          }
          autoSize={{ minRows: 2, maxRows: 6 }}
          onChange={(event) =>
            onChange(setEnglishText(value, dialect, event.target.value))
          }
        />
      )}
      <Flex justify="space-between" align="center" style={{ marginTop: 5 }}>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {slot.state === "ready"
            ? `来源：${slot.variant.origin}`
            : "待补全，可直接手工填写"}
        </Typography.Text>
        {dialect === value.source_dialect && <Tag color="blue">源文本</Tag>}
      </Flex>
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
  const { message } = App.useApp();
  const dialects = grammarDialects(headwords);
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
          <div className={dialects.length > 1 ? "dialect-grid" : undefined}>
            {dialects.map((dialect) => {
              const variant = grammar.variants.find(
                (item) => item.dialect === dialect
              );
              if (!variant) return null;
              return (
                <div
                  className={`dialect-panel dialect-panel-${dialect}`}
                  key={variant.id}
                >
                  <Typography.Text strong>
                    {DIALECT_SHORT_LABEL[dialect]}
                  </Typography.Text>
                  <Space.Compact block style={{ marginTop: 8 }}>
                    <Tooltip title="播放语音">
                      <Button
                        className="word-pronunciation-play-action"
                        icon={<SoundOutlined />}
                        aria-label={`${DIALECT_SHORT_LABEL[dialect]}语法结构 ${grammarIndex + 1} 播放语音`}
                        disabled
                      />
                    </Tooltip>
                    {env.VOICE_EDITOR ? (
                      <div
                        style={{ flex: 1 }}
                        data-word-node-id={grammar.id}
                        data-word-field="content"
                      >
                        <VoiceTextControl
                          value={variant.content}
                          contextLabel={`${DIALECT_SHORT_LABEL[dialect]}语法结构 ${grammarIndex + 1}`}
                          dialectLabel={DIALECT_SHORT_LABEL[dialect]}
                          readOnly={readOnly}
                          onChange={(content) => {
                            const grammars = cloneWordValue(value);
                            const nextVariant = grammars[
                              grammarIndex
                            ]!.variants.find((item) => item.id === variant.id)!;
                            nextVariant.content = content;
                            onChange(grammars);
                          }}
                        />
                      </div>
                    ) : (
                      <Input
                        className="word-pronunciation-phonetic-input"
                        aria-label={`${DIALECT_SHORT_LABEL[dialect]}语法结构 ${grammarIndex + 1}`}
                        data-word-node-id={grammar.id}
                        data-word-field="content"
                        value={variant.content.text}
                        readOnly={readOnly}
                        placeholder="例如 a centre / the centre"
                        onChange={(event) => {
                          const grammars = cloneWordValue(value);
                          const nextVariant = grammars[
                            grammarIndex
                          ]!.variants.find((item) => item.id === variant.id)!;
                          nextVariant.content = toWordRichText(
                            event.target.value,
                            nextVariant.content
                          );
                          onChange(grammars);
                        }}
                      />
                    )}
                    <Tooltip title="获取语音">
                      <Button
                        className="word-pronunciation-voice-action word-pronunciation-sync-action"
                        icon={<SyncOutlined />}
                        aria-label={`${DIALECT_SHORT_LABEL[dialect]}语法结构 ${grammarIndex + 1} 获取语音`}
                        disabled={readOnly}
                        onClick={() => message.info("获取语音（Mock）")}
                      />
                    </Tooltip>
                    <Tooltip title="上传语音">
                      <Button
                        className="word-pronunciation-voice-action"
                        icon={<UploadOutlined />}
                        aria-label={`${DIALECT_SHORT_LABEL[dialect]}语法结构 ${grammarIndex + 1} 上传语音`}
                        disabled={readOnly}
                        onClick={() => message.info("上传语音（Mock）")}
                      />
                    </Tooltip>
                  </Space.Compact>
                </div>
              );
            })}
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
  headwords,
  grammars,
  activeDialect,
  readOnly,
  englishReadOnly,
  sorting,
  onChange,
  onRemove
}: {
  value: WordDefinitionV2;
  index: number;
  headwords: WordHeadwordsV2;
  grammars: WordPosMeaningsV2["grammar_structures"];
  activeDialect: MeaningDialect;
  readOnly?: boolean;
  englishReadOnly?: boolean;
  sorting: SortableRowsController;
  onChange: (next: WordDefinitionV2) => void;
  onRemove: () => void;
}) {
  const english = value.definition_mode.startsWith("en_");
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
          value={value.level}
          options={CEFR_OPTIONS}
          disabled={readOnly}
          onChange={(level) => onChange({ ...value, level })}
        />
        <Select
          aria-label="释义方式"
          value={value.definition_mode}
          options={
            DEFINITION_MODE_OPTIONS as unknown as {
              value: WordDefinitionV2["definition_mode"];
              label: string;
            }[]
          }
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
                      : createEnglishText(headwords)
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
            activeDialect={activeDialect}
            readOnly={readOnly || englishReadOnly}
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
          allowClear
          placeholder="绑定语法结构（可选）"
          value={value.grammar_structure_id}
          disabled={readOnly}
          options={grammars.map((grammar, grammarIndex) => ({
            value: grammar.id,
            label: grammarStructureOptionLabel(
              grammar,
              grammarIndex,
              activeDialect
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
  const focus = sentence.links.find((link) => link.role === "focus");
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
      <Input
        prefix={<LockOutlined />}
        value={focus ? "已自动关联当前词义" : "主关联缺失"}
        status={focus ? undefined : "error"}
        readOnly
        aria-label="例句主关联"
        className="word-sentence-focus-link"
      />
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
  activeDialect,
  readOnly,
  englishReadOnly,
  sorting,
  onChange,
  onRemove
}: {
  value: WordSentenceV2;
  index: number;
  activeDialect: MeaningDialect;
  readOnly?: boolean;
  englishReadOnly?: boolean;
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
        value={value.level}
        options={CEFR_OPTIONS}
        disabled={readOnly}
        onChange={(level) => onChange({ ...value, level })}
      />
      <Space orientation="vertical" size={10} style={{ width: "100%" }}>
        <div className="word-sentence-bilingual-grid">
          <Space orientation="vertical" size={6} style={{ width: "100%" }}>
            <Typography.Text strong>英文例句</Typography.Text>
            <EnglishTextEditor
              value={value.en_text}
              clientId={value.id}
              activeDialect={activeDialect}
              readOnly={readOnly || englishReadOnly}
              onChange={(en_text) => onChange({ ...value, en_text })}
            />
          </Space>
          <Space orientation="vertical" size={6} style={{ width: "100%" }}>
            <Typography.Text strong>汉语译文</Typography.Text>
            <Input.TextArea
              aria-label="汉语译文"
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
    searching !== null
  );
  const searchResults = relatedSearch.data?.results ?? [];
  const wordOptions = searchResults.map((item) => ({
    value: item.headword,
    label: (
      <Flex justify="space-between" gap={8}>
        <Typography.Text strong>{item.headword}</Typography.Text>
        <Typography.Text
          type="secondary"
          className="word-relation-option-count"
        >
          {item.senses.length} 个词义
        </Typography.Text>
      </Flex>
    )
  }));

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

  const selectWord = (relationId: string, headword: string) => {
    const selected = searchResults.find((item) => item.headword === headword);
    if (!selected) return;
    const choices = selected.senses.map((sense) => ({
      senseId: sense.sense_id,
      gloss: sense.gloss
    }));
    const firstSense = choices[0];
    setSenseChoices((current) => ({
      ...current,
      [relationId]: choices
    }));
    updateRelation(relationId, {
      target_word_id: selected.word_id,
      target_headword: selected.headword,
      target_sense_id: firstSense?.senseId ?? "",
      target_gloss: firstSense?.gloss
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
                        relatedSearch.isFetching
                          ? "搜索中…"
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
                      onSelect={(headword) => selectWord(relation.id, headword)}
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
  headwords,
  wordId,
  senseGroups,
  grammars,
  subPosOptions,
  subPosLabel,
  catalogUnavailable,
  activeDialect,
  readOnly,
  englishReadOnly,
  forceOpen,
  onChange,
  onMove,
  onRemove
}: {
  value: WordSenseV2;
  index: number;
  last: boolean;
  headwords: WordHeadwordsV2;
  wordId: string;
  senseGroups: DraftMeaningsStepContent["sense_groups"];
  grammars: WordPosMeaningsV2["grammar_structures"];
  subPosOptions: Array<{ value: string; label: string }>;
  subPosLabel?: string;
  catalogUnavailable: boolean;
  activeDialect: MeaningDialect;
  readOnly?: boolean;
  englishReadOnly?: boolean;
  forceOpen?: boolean;
  onChange: (next: WordSenseV2) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(index === 0 || forceOpen === true);
  useEffect(() => {
    if (forceOpen) setExpanded(true);
  }, [forceOpen]);

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

  const definitionText = definitionTitleText(
    value.definitions[0],
    activeDialect
  );
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
                    headwords={headwords}
                    grammars={grammars}
                    activeDialect={activeDialect}
                    readOnly={readOnly}
                    englishReadOnly={englishReadOnly}
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
                    activeDialect={activeDialect}
                    readOnly={readOnly}
                    englishReadOnly={englishReadOnly}
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
                          createSentence(headwords, wordId, value.id)
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

function englishTextComplete(value: EnglishTextV2): boolean {
  if (value.mode === "unified") return value.common.value.text.trim() !== "";
  return (["uk", "us"] as const).every((dialect) => {
    const slot = value[dialect];
    return slot.state === "ready" && slot.variant.value.text.trim() !== "";
  });
}

function textCodePointLength(value: string): number {
  return [...value].length;
}

function senseGroupOptionLabel(
  group: DraftMeaningsStepContent["sense_groups"][number]
): string {
  const nameZh = group.name_zh.trim() || "待填写中文名";
  const nameEn = group.name_en.trim() || "待填写英文名";
  return `${nameZh} / ${nameEn}`;
}

function validateMeanings(content: DraftMeaningsStepContent): string | null {
  if (content.sense_groups.length === 0) return "至少需要一个语义区间";
  const senseGroupIds = new Set(content.sense_groups.map((group) => group.id));
  for (const [index, group] of content.sense_groups.entries()) {
    const names = [
      [group.name_zh, "中文名"],
      [group.name_en, "英文名"]
    ] as const;
    for (const [name, label] of names) {
      const normalized = name.trim();
      if (!normalized) return `请填写语义区间 ${index + 1} 的${label}`;
      if (textCodePointLength(normalized) > 200) {
        return `语义区间 ${index + 1} 的${label}不能超过 200 个字符`;
      }
    }
  }
  for (const pos of content.pos) {
    if (pos.grammar_structures.length === 0)
      return "每个词性至少需要一条语法结构";
    if (
      pos.grammar_structures.some((grammar) =>
        grammar.variants.some((variant) => !variant.content.text.trim())
      )
    ) {
      return "请完善全部语法结构文本";
    }
    if (pos.senses.length === 0) return "每个词性至少需要一个词义";
    for (const sense of pos.senses) {
      if (!sense.sense_group_id || !senseGroupIds.has(sense.sense_group_id)) {
        return "请为每个词义选择语义区间";
      }
      if (!sense.sub_pos) return "请为每个词义选择细分词性";
      const hasChinese = sense.definitions.some(
        (definition) =>
          definition.definition_mode.startsWith("zh_") &&
          (definition.content as RichText).text.trim() !== ""
      );
      if (!hasChinese) return "每个词义至少需要一条中文释义";
      for (const definition of sense.definitions) {
        if (
          definition.definition_mode.startsWith("en_") &&
          !englishTextComplete(definition.content as EnglishTextV2)
        ) {
          return "请补齐英文释义的全部启用方言文本";
        }
      }
      for (const sentence of sense.sentences) {
        if (
          !englishTextComplete(sentence.en_text) ||
          !sentence.zh_text.text.trim()
        ) {
          return "请补齐例句的英文文本和汉语译文";
        }
        const focusLinks = sentence.links.filter(
          (link) =>
            link.role === "focus" &&
            link.word_id !== "" &&
            link.sense_id === sense.id
        );
        if (focusLinks.length !== 1)
          return "每条例句必须保留唯一的当前词义主关联";
      }
      for (const relation of sense.relations) {
        if (!relation.target_word_id || !relation.target_sense_id) {
          return "请为每个关系词选择具体词条和词义";
        }
        if (
          !/^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/.test(relation.score)
        ) {
          return "关系词分值必须是 0–100 且最多两位小数";
        }
      }
    }
  }
  return null;
}

function senseOwnsNode(sense: WordSenseV2, nodeId: string): boolean {
  return (
    sense.id === nodeId ||
    sense.definitions.some((definition) => definition.id === nodeId) ||
    sense.sentences.some((sentence) => sentence.id === nodeId) ||
    sense.relations.some((relation) => relation.id === nodeId)
  );
}

function meaningsPosOwnsNode(pos: WordPosMeaningsV2, nodeId: string): boolean {
  if (pos.pos_id === nodeId) return true;
  if (
    pos.grammar_structures.some(
      (grammar) =>
        grammar.id === nodeId ||
        grammar.variants.some((variant) => variant.id === nodeId)
    )
  ) {
    return true;
  }
  return pos.senses.some((sense) => senseOwnsNode(sense, nodeId));
}

function countSenseReferences(
  content: DraftMeaningsStepContent,
  wordId: string,
  senseId: string
): number {
  return content.pos.reduce(
    (count, pos) =>
      count +
      pos.senses.reduce(
        (senseCount, sense) =>
          senseCount +
          sense.sentences.reduce(
            (sentenceCount, sentence) =>
              sentenceCount +
              sentence.links.filter(
                (link) =>
                  link.role === "context" &&
                  link.word_id === wordId &&
                  link.sense_id === senseId
              ).length,
            0
          ) +
          sense.relations.filter(
            (relation) =>
              relation.target_word_id === wordId &&
              relation.target_sense_id === senseId
          ).length,
        0
      ),
    0
  );
}

function removeSenseAndReferences(
  content: DraftMeaningsStepContent,
  wordId: string,
  senseId: string
): DraftMeaningsStepContent {
  return {
    ...content,
    pos: content.pos.map((pos) => ({
      ...pos,
      senses: pos.senses
        .filter((sense) => sense.id !== senseId)
        .map((sense) => ({
          ...sense,
          sentences: sense.sentences.map((sentence) => ({
            ...sentence,
            links: sentence.links.filter(
              (link) =>
                !(
                  link.role === "context" &&
                  link.word_id === wordId &&
                  link.sense_id === senseId
                )
            )
          })),
          relations: sense.relations.filter(
            (relation) =>
              !(
                relation.target_word_id === wordId &&
                relation.target_sense_id === senseId
              )
          )
        }))
    }))
  };
}

export function MeaningsAndExamplesStep({ word, readOnly, onSaved }: Props) {
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
  const [activePosId, setActivePosId] = useState(
    word.forms.pos[0]?.pos_id ?? ""
  );
  const [activeDialect, setActiveDialect] = useState<MeaningDialect>(() =>
    word.headwords.mode === "distinguish" ? word.headwords.source_dialect : "us"
  );
  const [fillingDialect, setFillingDialect] = useState<MeaningDialect>();
  const [attemptedDialects, setAttemptedDialects] = useState<
    Set<MeaningDialect>
  >(() => new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const issueTarget = useWordValidationIssue();
  const saveMeanings = useSaveMeaningsStep(word.id);
  const suggestVariants = useSuggestDialectVariants();
  const allowSavedNavigation = useUnsavedWordChanges(dirty);
  useWordValidationIssueFocus(activePosId);

  useEffect(() => {
    if (!issueTarget) return;
    const owner = content.pos.find((pos) =>
      meaningsPosOwnsNode(pos, issueTarget.nodeId)
    );
    if (owner) setActivePosId(owner.pos_id);
  }, [content.pos, issueTarget]);

  useEffect(() => {
    if (!dirty) {
      const next = cloneWordValue(ensureMeaningsForForms(word));
      contentRef.current = next;
      setContent(next);
      if (word.headwords.mode === "distinguish") {
        setActiveDialect(word.headwords.source_dialect);
      }
      setAttemptedDialects(new Set());
    }
  }, [dirty, word, word.revision]);

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

  const fillMissingDialect = async (
    target: MeaningDialect,
    requestContent: DraftMeaningsStepContent = contentRef.current
  ) => {
    if (
      readOnly ||
      !adminWordsDataSourceCapabilities.dialectVariantSuggestions
    ) {
      return;
    }
    const request = collectMissingMeaningDialectItems(requestContent, target);
    if (request.items.length === 0) return;
    setFillingDialect(target);
    setAttemptedDialects((current) => new Set(current).add(target));
    try {
      const response = await suggestVariants.mutateAsync(request);
      const result = applyMeaningDialectSuggestions(
        contentRef.current,
        target,
        response.suggestions
      );
      if (result.applied_count > 0) updateContent(result.content);
      const remaining = collectMissingMeaningDialectItems(
        result.content,
        target
      ).items.length;
      if (remaining === 0) {
        message.success(
          `已补全 ${result.applied_count} 项${target === "uk" ? "英式" : "美式"}内容`
        );
      } else if (result.applied_count > 0) {
        message.warning(
          `已补全 ${result.applied_count} 项，仍有 ${remaining} 项可重试`
        );
      } else {
        message.warning(`未获得可写入的内容，仍有 ${remaining} 项可重试`);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "自动补全失败");
    } finally {
      setFillingDialect(undefined);
    }
  };

  const changeActiveDialect = (target: MeaningDialect) => {
    setActiveDialect(target);
    if (
      !readOnly &&
      adminWordsDataSourceCapabilities.dialectVariantSuggestions
    ) {
      void fillMissingDialect(target, content);
    }
  };

  const save = async (intent: StepSaveIntent) => {
    if (saving) return;
    if (intent === "complete") {
      const validationMessage = validateMeanings(content);
      if (validationMessage) {
        message.warning(validationMessage);
        return;
      }
    }
    setSaving(true);
    try {
      const { word: savedWord } = await saveMeanings.mutateAsync({
        base_revision: word.revision,
        intent,
        content: toMeaningsWireContent(content)
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
        const issue = error.field_issues.find(
          (candidate) => candidate.step === "meanings"
        );
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

  const formsById = useMemo(
    () => new Map(word.forms.pos.map((pos) => [pos.pos_id, pos])),
    [word.forms.pos]
  );
  const pronunciationHints = useMemo(
    () => collectPronunciationHints(word.forms),
    [word.forms]
  );
  const activeDialectEligibleCount =
    word.headwords.mode === "distinguish"
      ? collectMissingMeaningDialectItems(content, activeDialect).items.length
      : 0;
  const activeDialectMissingCount =
    word.headwords.mode === "distinguish"
      ? countIncompleteMeaningDialectSlots(content, activeDialect)
      : 0;

  const tabs = content.pos.map((posMeanings, posIndex) => {
    const formPos = formsById.get(posMeanings.pos_id);
    const label = formPos
      ? partOfSpeechLabel(partOfSpeechLookup, formPos.pos)
      : "未知词性";
    return {
      key: posMeanings.pos_id,
      label: (
        <Space>
          <strong>{label}</strong>
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
                  headwords={word.headwords}
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
                  activeDialect={activeDialect}
                  readOnly={readOnly}
                  englishReadOnly={fillingDialect !== undefined}
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
                        createSense(
                          word.headwords,
                          word.id,
                          content.sense_groups[0]!.id
                        )
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
    <VoiceEditorProvider pronunciationHints={pronunciationHints}>
      <div className="word-step-heading">
        <span className="word-step-number">STEP 03</span>
        <Typography.Title level={2} style={{ margin: 0 }}>
          词义与例句
        </Typography.Title>
        <Typography.Paragraph className="word-step-description">
          按词性维护语法结构、词义、四类释义、双语例句和关系词。例句会自动保留指向当前词义的锁定主关联。
        </Typography.Paragraph>
      </div>

      {readOnly && (
        <Alert
          type="info"
          showIcon
          title="已发布词条当前为只读"
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
        {word.headwords.mode === "distinguish" && (
          <div className="word-meaning-dialect-toolbar">
            <Flex align="center" justify="space-between" gap={12} wrap>
              <Space size={10} wrap>
                <Typography.Text strong>英文内容</Typography.Text>
                <Segmented
                  aria-label="词义内容方言"
                  value={activeDialect}
                  disabled={fillingDialect !== undefined}
                  options={[
                    { label: "英式", value: "uk" },
                    { label: "美式", value: "us" }
                  ]}
                  onChange={(value) =>
                    changeActiveDialect(value as MeaningDialect)
                  }
                />
                <Typography.Text type="secondary">
                  {activeDialectMissingCount === 0
                    ? "当前内容已完整"
                    : !adminWordsDataSourceCapabilities.dialectVariantSuggestions
                      ? `待填写 ${activeDialectMissingCount} 项`
                      : activeDialectEligibleCount > 0
                        ? `待补全 ${activeDialectEligibleCount} 项`
                        : `待手工填写 ${activeDialectMissingCount} 项`}
                </Typography.Text>
              </Space>
              {!readOnly && activeDialectEligibleCount > 0 && (
                <Button
                  size="small"
                  icon={<ThunderboltOutlined />}
                  loading={fillingDialect === activeDialect}
                  disabled={
                    fillingDialect !== undefined ||
                    !adminWordsDataSourceCapabilities.dialectVariantSuggestions
                  }
                  title={
                    adminWordsDataSourceCapabilities.dialectVariantSuggestions
                      ? undefined
                      : "真实方言建议服务尚未接入，请手工填写"
                  }
                  onClick={() =>
                    void fillMissingDialect(activeDialect, content)
                  }
                >
                  {`${attemptedDialects.has(activeDialect) ? "重试补全" : "自动补全"} ${activeDialectEligibleCount} 项`}
                </Button>
              )}
            </Flex>
          </div>
        )}

        <Card
          className="word-sense-groups-card"
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
            <Button loading={saving} onClick={() => void save("save")}>
              保存草稿
            </Button>
            <Button
              type="primary"
              loading={saving}
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
