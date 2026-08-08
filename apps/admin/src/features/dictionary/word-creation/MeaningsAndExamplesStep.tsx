import {
  DeleteOutlined,
  DownOutlined,
  LockOutlined,
  PlusOutlined,
  SoundOutlined,
  ThunderboltOutlined,
  UpOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Card,
  Collapse,
  Divider,
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
import { HttpError } from "@tsz/api-client/http";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DIALECT_LABEL, POS_TAG_ZH, SUB_POS_OPTIONS } from "../editorConstants";
import { CEFR_OPTIONS, POS_TAG_ABBR, cefrColor } from "../labels";
import { adminWordsDataSourceCapabilities } from "../dataSource";
import { useRelatedSearch } from "../api";
import {
  cloneWordValue,
  moveWordNode,
  newWordNodeId,
  toWordRichText
} from "../word-model/primitives";
import { useSaveMeaningsStep, useSuggestDialectVariants } from "./api";
import {
  createDefinition,
  createEnglishText,
  createGrammar,
  createRelation,
  createSense,
  createSentence,
  ensureMeaningsForForms,
  grammarDialects
} from "./model";
import { useUnsavedWordChanges } from "./useUnsavedWordChanges";
import {
  useWordValidationIssue,
  useWordValidationIssueFocus
} from "./useWordValidationIssueFocus";

interface Props {
  word: AdminWordV2;
  readOnly?: boolean;
  onSaved: (word: AdminWordV2) => void;
}

type EnglishFieldKind = "definition" | "example";

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

function setEnglishText(
  value: EnglishTextV2,
  dialect: Dialect,
  text: string
): EnglishTextV2 {
  if (value.mode === "unified") {
    return {
      ...value,
      common: {
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
        value: toWordRichText(
          text,
          current.state === "ready" ? current.variant.value : undefined
        ),
        origin: "manual"
      }
    }
  };
}

function EnglishTextEditor({
  value,
  clientId,
  fieldKind,
  readOnly,
  generating,
  onChange,
  onGenerate
}: {
  value: EnglishTextV2;
  clientId: string;
  fieldKind: EnglishFieldKind;
  readOnly?: boolean;
  generating?: boolean;
  onChange: (next: EnglishTextV2) => void;
  onGenerate: (
    clientId: string,
    fieldKind: EnglishFieldKind,
    source: "uk" | "us",
    target: "uk" | "us",
    sourceValue: RichText
  ) => Promise<RichText | undefined>;
}) {
  if (value.mode === "unified") {
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
  return (
    <div
      className="dialect-grid"
      data-word-node-id={clientId}
      data-word-field="content"
    >
      {(["uk", "us"] as const).map((dialect) => {
        const slot = value[dialect];
        const source = value.source_dialect;
        const sourceSlot = value[source];
        return (
          <div
            className={`dialect-panel dialect-panel-${dialect}`}
            key={dialect}
          >
            <Flex justify="space-between" align="center">
              <Typography.Text strong>
                {DIALECT_LABEL[dialect]} · {dialect === "uk" ? "BrE" : "AmE"}
              </Typography.Text>
              {dialect === source && <Tag color="blue">源文本</Tag>}
            </Flex>
            {slot.state === "ready" ? (
              <>
                <Input.TextArea
                  aria-label={`${DIALECT_LABEL[dialect]}英语文本`}
                  value={slot.variant.value.text}
                  readOnly={readOnly}
                  autoSize={{ minRows: 2, maxRows: 6 }}
                  style={{ marginTop: 8 }}
                  onChange={(event) =>
                    onChange(setEnglishText(value, dialect, event.target.value))
                  }
                />
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  来源：{slot.variant.origin}
                </Typography.Text>
              </>
            ) : (
              <Flex vertical gap={8} style={{ marginTop: 8 }}>
                <Alert type="warning" showIcon title="目标方言文本尚未填写" />
                {!readOnly && (
                  <Space wrap>
                    <Button
                      size="small"
                      icon={<ThunderboltOutlined />}
                      loading={generating}
                      disabled={
                        !adminWordsDataSourceCapabilities.dialectVariantSuggestions ||
                        sourceSlot.state !== "ready" ||
                        sourceSlot.variant.value.text.trim() === ""
                      }
                      title={
                        adminWordsDataSourceCapabilities.dialectVariantSuggestions
                          ? undefined
                          : "真实方言建议服务尚未接入，请手工填写"
                      }
                      onClick={() => {
                        if (sourceSlot.state !== "ready") return;
                        void onGenerate(
                          clientId,
                          fieldKind,
                          source,
                          dialect,
                          sourceSlot.variant.value
                        ).then((suggestion) => {
                          if (!suggestion) return;
                          onChange({
                            ...value,
                            [dialect]: {
                              state: "ready",
                              variant: {
                                value: suggestion,
                                origin: "converted"
                              }
                            }
                          });
                        });
                      }}
                    >
                      生成{dialect === "uk" ? "英式" : "美式"}建议
                    </Button>
                    <Button
                      size="small"
                      onClick={() =>
                        onChange(setEnglishText(value, dialect, ""))
                      }
                    >
                      手工填写
                    </Button>
                  </Space>
                )}
              </Flex>
            )}
          </div>
        );
      })}
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
  const dialects = grammarDialects(headwords);
  return (
    <Card
      title="语法结构"
      size="small"
      data-word-node-id={posId}
      data-word-field="grammar_structures"
    >
      <Alert
        type="info"
        showIcon
        title="语法结构由人工填写，不参与英美自动转换。"
        style={{ marginBottom: 12 }}
      />
      {value.map((grammar, grammarIndex) => (
        <div className="word-table-row" key={grammar.id}>
          <span className="word-number-cell">{grammarIndex + 1}</span>
          <Typography.Text strong style={{ paddingTop: 6 }}>
            结构 {grammarIndex + 1}
          </Typography.Text>
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
                    {DIALECT_LABEL[dialect]}
                  </Typography.Text>
                  <Space.Compact block style={{ marginTop: 8 }}>
                    <Button icon={<SoundOutlined />} disabled />
                    <Input
                      aria-label={`${DIALECT_LABEL[dialect]}语法结构 ${grammarIndex + 1}`}
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
                  </Space.Compact>
                </div>
              );
            })}
          </div>
          {!readOnly && (
            <Space orientation="vertical" size={2}>
              <Button
                type="text"
                icon={<UpOutlined />}
                aria-label={`上移语法结构 ${grammarIndex + 1}`}
                disabled={grammarIndex === 0}
                onClick={() =>
                  onChange(moveWordNode(value, grammarIndex, grammarIndex - 1))
                }
              />
              <Button
                type="text"
                icon={<DownOutlined />}
                aria-label={`下移语法结构 ${grammarIndex + 1}`}
                disabled={grammarIndex === value.length - 1}
                onClick={() =>
                  onChange(moveWordNode(value, grammarIndex, grammarIndex + 1))
                }
              />
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
  last,
  headwords,
  grammars,
  readOnly,
  generating,
  onGenerate,
  onChange,
  onMove,
  onRemove
}: {
  value: WordDefinitionV2;
  index: number;
  last: boolean;
  headwords: WordHeadwordsV2;
  grammars: WordPosMeaningsV2["grammar_structures"];
  readOnly?: boolean;
  generating?: boolean;
  onGenerate: Parameters<typeof EnglishTextEditor>[0]["onGenerate"];
  onChange: (next: WordDefinitionV2) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const english = value.definition_mode.startsWith("en_");
  return (
    <div
      className="word-table-row"
      data-word-node-id={value.id}
      data-word-field="definition"
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
              grammar_structure_id: value.grammar_structure_id,
              audio_url: value.audio_url,
              audio_source: value.audio_source
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
            fieldKind="definition"
            readOnly={readOnly}
            generating={generating}
            onGenerate={onGenerate}
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
            label: `语法结构 ${grammarIndex + 1}`
          }))}
          onChange={(grammar_structure_id) =>
            onChange({ ...value, grammar_structure_id })
          }
        />
      </Space>
      {!readOnly && (
        <Space orientation="vertical" size={2}>
          <Button
            type="text"
            icon={<UpOutlined />}
            aria-label={`上移释义 ${index + 1}`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          />
          <Button
            type="text"
            icon={<DownOutlined />}
            aria-label={`下移释义 ${index + 1}`}
            disabled={last}
            onClick={() => onMove(1)}
          />
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
  const focus = sentence.links.find((link) => link.role === "focus");
  const contexts = sentence.links.filter((link) => link.role === "context");
  return (
    <Space orientation="vertical" size={8} style={{ width: "100%" }}>
      <Input
        prefix={<LockOutlined />}
        value={focus ? `当前词条 / 当前词义 · ${focus.sense_id}` : "主关联缺失"}
        status={focus ? undefined : "error"}
        readOnly
        aria-label="例句主关联"
      />
      {contexts.map((link, index) => (
        <Space.Compact block key={`${link.word_id}-${link.sense_id}-${index}`}>
          <Input
            aria-label="上下文词条 ID"
            value={link.word_id}
            readOnly={readOnly}
            placeholder="上下文词条 ID"
            onChange={(event) => {
              const next = cloneWordValue(sentence);
              const nextContexts = next.links.filter(
                (item) => item.role === "context"
              );
              nextContexts[index]!.word_id = event.target.value;
              next.links = [
                ...next.links.filter((item) => item.role === "focus"),
                ...nextContexts
              ];
              onChange(next);
            }}
          />
          <Input
            aria-label="上下文词义 ID"
            value={link.sense_id}
            readOnly={readOnly}
            placeholder="上下文词义 ID"
            onChange={(event) => {
              const next = cloneWordValue(sentence);
              const nextContexts = next.links.filter(
                (item) => item.role === "context"
              );
              nextContexts[index]!.sense_id = event.target.value;
              next.links = [
                ...next.links.filter((item) => item.role === "focus"),
                ...nextContexts
              ];
              onChange(next);
            }}
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
        <Button
          type="dashed"
          block
          icon={<PlusOutlined />}
          onClick={() =>
            onChange({
              ...sentence,
              links: [
                ...sentence.links,
                { word_id: "", sense_id: "", role: "context" }
              ]
            })
          }
        >
          添加上下文关联
        </Button>
      )}
    </Space>
  );
}

function SentenceEditor({
  value,
  index,
  last,
  readOnly,
  generating,
  onGenerate,
  onChange,
  onMove,
  onRemove
}: {
  value: WordSentenceV2;
  index: number;
  last: boolean;
  readOnly?: boolean;
  generating?: boolean;
  onGenerate: Parameters<typeof EnglishTextEditor>[0]["onGenerate"];
  onChange: (next: WordSentenceV2) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="word-table-row"
      data-word-node-id={value.id}
      data-word-field="sentence"
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
        <EnglishTextEditor
          value={value.en_text}
          clientId={value.id}
          fieldKind="example"
          readOnly={readOnly}
          generating={generating}
          onGenerate={onGenerate}
          onChange={(en_text) => onChange({ ...value, en_text })}
        />
        <Input.TextArea
          aria-label="汉语译文"
          value={value.zh_text.text}
          readOnly={readOnly}
          placeholder="汉语译文"
          autoSize={{ minRows: 2, maxRows: 5 }}
          onChange={(event) =>
            onChange({
              ...value,
              zh_text: toWordRichText(event.target.value, value.zh_text)
            })
          }
        />
        <ContextLinksEditor
          sentence={value}
          readOnly={readOnly}
          onChange={onChange}
        />
      </Space>
      {!readOnly && (
        <Space orientation="vertical" size={2}>
          <Button
            type="text"
            icon={<UpOutlined />}
            aria-label={`上移例句 ${index + 1}`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          />
          <Button
            type="text"
            icon={<DownOutlined />}
            aria-label={`下移例句 ${index + 1}`}
            disabled={last}
            onClick={() => onMove(1)}
          />
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

function RelatedTargetSelect({
  value,
  readOnly,
  onChange
}: {
  value: WordRelationV2;
  readOnly?: boolean;
  onChange: (next: WordRelationV2) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value.target_headword ?? "");
  const result = useRelatedSearch(query, open);
  const options =
    result.data?.results.flatMap((word) =>
      word.senses.map((sense) => ({
        value: `${word.word_id}::${sense.sense_id}`,
        label: `${word.headword} · ${sense.gloss}`,
        wordId: word.word_id,
        senseId: sense.sense_id,
        headword: word.headword,
        gloss: sense.gloss
      }))
    ) ?? [];
  return (
    <AutoComplete
      aria-label="搜索关联词并选择词义"
      data-word-node-id={value.id}
      data-word-field="target_word_id"
      value={query}
      options={options}
      open={open}
      disabled={readOnly}
      placeholder="搜索关联词并选择词义"
      onDropdownVisibleChange={setOpen}
      onSearch={(nextQuery) => {
        setQuery(nextQuery);
        if (
          nextQuery !== (value.target_headword ?? "") &&
          (value.target_word_id || value.target_sense_id)
        ) {
          onChange({
            ...value,
            target_word_id: "",
            target_sense_id: "",
            target_headword: undefined,
            target_gloss: undefined
          });
        }
      }}
      onSelect={(_, option) => {
        setQuery(option.headword as string);
        onChange({
          ...value,
          target_word_id: option.wordId as string,
          target_sense_id: option.senseId as string,
          target_headword: option.headword as string,
          target_gloss: option.gloss as string
        });
      }}
    />
  );
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
  return (
    <div className="word-inline-grid">
      {(Object.keys(RELATION_META) as WordRelationType[]).map((type) => {
        const meta = RELATION_META[type];
        const relations = value.filter((item) => item.relation === type);
        return (
          <Card size="small" title={meta.title} key={type}>
            <Space orientation="vertical" style={{ width: "100%" }}>
              {relations.map((relation) => {
                const absoluteIndex = value.findIndex(
                  (item) => item.id === relation.id
                );
                return (
                  <Space.Compact
                    block
                    key={relation.id}
                    data-word-node-id={relation.id}
                    data-word-field="target_word_id"
                  >
                    <RelatedTargetSelect
                      value={relation}
                      readOnly={readOnly}
                      onChange={(next) => {
                        const relationsValue = [...value];
                        relationsValue[absoluteIndex] = next;
                        onChange(relationsValue);
                      }}
                    />
                    <InputNumber
                      aria-label={meta.metric}
                      data-word-node-id={relation.id}
                      data-word-field="score"
                      min={0}
                      max={100}
                      precision={2}
                      value={Number(relation.score)}
                      disabled={readOnly}
                      addonAfter="%"
                      style={{ width: 125 }}
                      onChange={(score) => {
                        const relationsValue = [...value];
                        relationsValue[absoluteIndex] = {
                          ...relation,
                          score: String(score ?? 0)
                        };
                        onChange(relationsValue);
                      }}
                    />
                    {!readOnly && (
                      <Button
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
                  </Space.Compact>
                );
              })}
              {!readOnly && (
                <Button
                  type="dashed"
                  block
                  icon={<PlusOutlined />}
                  onClick={() => onChange([...value, createRelation(type)])}
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
  readOnly,
  generating,
  forceOpen,
  onGenerate,
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
  readOnly?: boolean;
  generating?: boolean;
  forceOpen?: boolean;
  onGenerate: Parameters<typeof EnglishTextEditor>[0]["onGenerate"];
  onChange: (next: WordSenseV2) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(index === 0 || forceOpen === true);
  useEffect(() => {
    if (forceOpen) setExpanded(true);
  }, [forceOpen]);

  const titleDefinition = value.definitions.find(
    (definition) =>
      definition.definition_mode.startsWith("zh_") &&
      (definition.content as RichText).text.trim()
  );
  const definitionText = titleDefinition
    ? (titleDefinition.content as RichText).text
    : "待填写中文释义";
  return (
    <Collapse
      data-word-node-id={value.id}
      data-word-field="sense"
      activeKey={expanded ? [value.id] : []}
      onChange={(keys) =>
        setExpanded((Array.isArray(keys) ? keys : [keys]).includes(value.id))
      }
      items={[
        {
          key: value.id,
          label: (
            <Space wrap>
              <Tag color={cefrColor(value.level)}>{value.level}</Tag>
              <Typography.Text strong>
                {index + 1}. {definitionText}
              </Typography.Text>
              {value.sub_pos && <Tag color="green">{value.sub_pos}</Tag>}
            </Space>
          ),
          extra: !readOnly ? (
            <Space onClick={(event) => event.stopPropagation()}>
              <Button
                type="text"
                size="small"
                icon={<UpOutlined />}
                aria-label={`上移词义 ${index + 1}`}
                disabled={index === 0}
                onClick={() => onMove(-1)}
              />
              <Button
                type="text"
                size="small"
                icon={<DownOutlined />}
                aria-label={`下移词义 ${index + 1}`}
                disabled={last}
                onClick={() => onMove(1)}
              />
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                aria-label={`删除词义 ${index + 1}`}
                onClick={onRemove}
              />
            </Space>
          ) : null,
          children: (
            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
              <div className="word-inline-grid">
                <div>
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
                <div>
                  <Typography.Text type="secondary">语义区间</Typography.Text>
                  <Select
                    aria-label="语义区间"
                    data-word-node-id={value.id}
                    data-word-field="sense_group_id"
                    allowClear
                    value={value.sense_group_id}
                    options={senseGroups.map((group) => ({
                      value: group.id,
                      label: group.name || "未命名区间"
                    }))}
                    disabled={readOnly}
                    style={{ width: "100%", marginTop: 6 }}
                    onChange={(sense_group_id) =>
                      onChange({ ...value, sense_group_id })
                    }
                  />
                </div>
                <div>
                  <Typography.Text type="secondary">细分词性</Typography.Text>
                  <Select
                    aria-label="细分词性"
                    data-word-node-id={value.id}
                    data-word-field="sub_pos"
                    value={value.sub_pos || undefined}
                    options={SUB_POS_OPTIONS}
                    disabled={readOnly}
                    style={{ width: "100%", marginTop: 6 }}
                    onChange={(sub_pos) => onChange({ ...value, sub_pos })}
                  />
                </div>
                <div>
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
                    addonAfter="%"
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
                <Flex align="center" gap={8}>
                  <Typography.Text type="secondary">
                    是否依赖语境
                  </Typography.Text>
                  <Switch
                    aria-label="是否依赖语境"
                    checked={value.depends_on_context}
                    disabled={readOnly}
                    onChange={(depends_on_context) =>
                      onChange({ ...value, depends_on_context })
                    }
                  />
                </Flex>
              </div>

              <div data-word-node-id={value.id} data-word-field="definitions">
                <Divider titlePlacement="start">多维释义</Divider>
                {value.definitions.map((definition, definitionIndex) => (
                  <DefinitionEditor
                    key={definition.id}
                    value={definition}
                    index={definitionIndex}
                    last={definitionIndex === value.definitions.length - 1}
                    headwords={headwords}
                    grammars={grammars}
                    readOnly={readOnly}
                    generating={generating}
                    onGenerate={onGenerate}
                    onChange={(nextDefinition) => {
                      const definitions = [...value.definitions];
                      definitions[definitionIndex] = nextDefinition;
                      onChange({ ...value, definitions });
                    }}
                    onMove={(delta) =>
                      onChange({
                        ...value,
                        definitions: moveWordNode(
                          value.definitions,
                          definitionIndex,
                          definitionIndex + delta
                        )
                      })
                    }
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
              </div>

              <Divider titlePlacement="start">多维例句</Divider>
              {value.sentences.map((sentence, sentenceIndex) => (
                <SentenceEditor
                  key={sentence.id}
                  value={sentence}
                  index={sentenceIndex}
                  last={sentenceIndex === value.sentences.length - 1}
                  readOnly={readOnly}
                  generating={generating}
                  onGenerate={onGenerate}
                  onChange={(nextSentence) => {
                    const sentences = [...value.sentences];
                    sentences[sentenceIndex] = nextSentence;
                    onChange({ ...value, sentences });
                  }}
                  onMove={(delta) =>
                    onChange({
                      ...value,
                      sentences: moveWordNode(
                        value.sentences,
                        sentenceIndex,
                        sentenceIndex + delta
                      )
                    })
                  }
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

              <Divider titlePlacement="start">关联词</Divider>
              <RelationsEditor
                value={value.relations}
                readOnly={readOnly}
                onChange={(relations) => onChange({ ...value, relations })}
              />
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

function validateMeanings(content: DraftMeaningsStepContent): string | null {
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
  const [content, setContent] = useState<DraftMeaningsStepContent>(() =>
    cloneWordValue(ensureMeaningsForForms(word))
  );
  const [activePosId, setActivePosId] = useState(
    word.forms.pos[0]?.pos_id ?? ""
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const issueTarget = useWordValidationIssue();
  const operationId = useRef(newWordNodeId());
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
    if (!dirty) setContent(cloneWordValue(ensureMeaningsForForms(word)));
  }, [dirty, word, word.revision]);

  const updateContent = (next: DraftMeaningsStepContent) => {
    operationId.current = newWordNodeId();
    setContent(next);
    setDirty(true);
  };

  const removeSenseGroup = (groupId: string) => {
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
            ? { ...sense, sense_group_id: undefined }
            : sense
        )
      }));
      updateContent({
        sense_groups: content.sense_groups.filter(
          (group) => group.id !== groupId
        ),
        pos
      });
    };
    if (referenceCount === 0) {
      apply();
      return;
    }
    modal.confirm({
      title: "删除被词义引用的语义区间？",
      content: `将清空 ${referenceCount} 个词义的语义区间引用，词义内容本身会保留。`,
      okText: "删除并清空引用",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: apply
    });
  };

  const generateVariant = async (
    clientId: string,
    fieldKind: EnglishFieldKind,
    source: "uk" | "us",
    target: "uk" | "us",
    sourceValue: RichText
  ): Promise<RichText | undefined> => {
    if (!adminWordsDataSourceCapabilities.dialectVariantSuggestions) {
      return undefined;
    }
    try {
      const response = await suggestVariants.mutateAsync({
        source_dialect: source,
        target_dialect: target,
        items: [
          { client_id: clientId, field_kind: fieldKind, value: sourceValue }
        ]
      });
      const suggestion = response.suggestions[0];
      if (!suggestion || suggestion.field_kind === "form") return undefined;
      return await new Promise((resolve) => {
        modal.confirm({
          title: `确认${target === "uk" ? "英式" : "美式"}建议`,
          content: (
            <Space orientation="vertical" style={{ width: "100%" }}>
              <Typography.Text type="secondary">源文本</Typography.Text>
              <Typography.Paragraph>{sourceValue.text}</Typography.Paragraph>
              <Typography.Text type="secondary">建议文本</Typography.Text>
              <Typography.Paragraph strong>
                {suggestion.value.text}
              </Typography.Paragraph>
            </Space>
          ),
          okText: "写入建议",
          cancelText: "取消",
          onOk: () => resolve(suggestion.value),
          onCancel: () => resolve(undefined)
        });
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "生成建议失败");
      return undefined;
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
        operation_id: operationId.current,
        intent,
        content
      });
      operationId.current = newWordNodeId();
      setDirty(false);
      onSaved(savedWord);
      message.success(
        intent === "complete" ? "词义与例句已完成" : "草稿已保存"
      );
      if (intent === "complete") {
        allowSavedNavigation();
        navigate(`/words/${word.id}/wizard/preview`);
      }
    } catch (error) {
      if (error instanceof HttpError) {
        const issue = error.field_issues.find(
          (candidate) => candidate.step === "meanings"
        );
        if (issue) {
          message.warning(issue.message);
          navigate(`/words/${word.id}/wizard/meanings`, {
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

  const tabs = content.pos.map((posMeanings, posIndex) => {
    const formPos = formsById.get(posMeanings.pos_id);
    const label = formPos ? POS_TAG_ZH[formPos.pos] : "未知词性";
    return {
      key: posMeanings.pos_id,
      label: (
        <Space>
          <strong>{label}</strong>
          {formPos && <Tag color="blue">{POS_TAG_ABBR[formPos.pos]}</Tag>}
        </Space>
      ),
      children: (
        <div data-word-node-id={posMeanings.pos_id} data-word-field="pos">
          <Space orientation="vertical" size={20} style={{ width: "100%" }}>
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
                  readOnly={readOnly}
                  generating={suggestVariants.isPending}
                  forceOpen={
                    issueTarget
                      ? senseOwnsNode(sense, issueTarget.nodeId)
                      : false
                  }
                  onGenerate={generateVariant}
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
                        createSense(word.headwords, word.id)
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
    <>
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

      <fieldset
        className="word-request-lock"
        disabled={saving}
        aria-busy={saving}
      >
        <Card size="small" title="语义区间" style={{ marginBottom: 18 }}>
          <Space orientation="vertical" style={{ width: "100%" }}>
            {content.sense_groups.map((group, index) => (
              <Space.Compact block key={group.id}>
                <Input
                  aria-label={`语义区间 ${index + 1}`}
                  addonBefore={index + 1}
                  value={group.name}
                  readOnly={readOnly}
                  placeholder="例如 几何与物理空间核心"
                  onChange={(event) => {
                    const sense_groups = [...content.sense_groups];
                    sense_groups[index] = {
                      ...group,
                      name: event.target.value
                    };
                    updateContent({ ...content, sense_groups });
                  }}
                />
                {!readOnly && (
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`删除语义区间 ${index + 1}`}
                    onClick={() => removeSenseGroup(group.id)}
                  />
                )}
              </Space.Compact>
            ))}
            {!readOnly && (
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() =>
                  updateContent({
                    ...content,
                    sense_groups: [
                      ...content.sense_groups,
                      { id: newWordNodeId(), name: "" }
                    ]
                  })
                }
              >
                添加语义区间
              </Button>
            )}
          </Space>
        </Card>

        <Tabs activeKey={activePosId} onChange={setActivePosId} items={tabs} />

        {!readOnly && (
          <div className="word-step-actions">
            <Button onClick={() => navigate(`/words/${word.id}/wizard/forms`)}>
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
    </>
  );
}
