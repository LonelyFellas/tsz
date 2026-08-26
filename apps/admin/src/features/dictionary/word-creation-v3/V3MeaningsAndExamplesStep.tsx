import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Checkbox,
  Empty,
  Flex,
  Input,
  Select,
  Space,
  Tag,
  Tabs,
  Typography
} from "antd";
import type {
  Dialect,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  EnglishTextV3,
  GrammarStructureV3,
  PartOfSpeechCatalogResponse,
  RelatedWordResultAny,
  StepSaveIntent,
  V3DraftValidationIssue,
  WordDefinitionV3,
  WordRelationWritableV3,
  WordSentenceWritableV3,
  WordSenseWritableV3
} from "@tsz/types";
import { useState } from "react";
import { useRelatedSearchAny } from "../api";
import { newWordNodeId } from "../word-model/primitives";
import {
  editableEnglishText,
  replaceEnglishText,
  replaceRichText
} from "./meaningsModel";
import {
  definitionModeLabel,
  dialectLabel,
  partOfSpeechLabel
} from "./presentation";

export interface V3MeaningsAndExamplesStepProps {
  value: DraftMeaningsStepContentWritableV3;
  onChange: (next: DraftMeaningsStepContentWritableV3) => void;
  onSave?: (
    content: DraftMeaningsStepContentWritableV3,
    intent: StepSaveIntent
  ) => Promise<void>;
  saving?: boolean;
  issues?: readonly V3DraftValidationIssue[];
  activePosId?: string;
  wordId?: string;
  forms?: DraftFormsStepContentV3;
  partOfSpeechCatalog?: PartOfSpeechCatalogResponse;
  onActivePosChange?: (posId: string) => void;
  idFactory?: () => string;
}

type DraftMutation = (draft: DraftMeaningsStepContentWritableV3) => void;

function moveItem<T>(items: T[], index: number, nextIndex: number) {
  const [item] = items.splice(index, 1);
  if (item !== undefined) items.splice(nextIndex, 0, item);
}

function ListActions({
  label,
  index,
  length,
  onMove,
  onDelete
}: {
  label: string;
  index: number;
  length: number;
  onMove: (nextIndex: number) => void;
  onDelete: () => void;
}) {
  return (
    <Space.Compact>
      <Button
        aria-label={`上移${label}`}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
        size="small"
      >
        上移
      </Button>
      <Button
        aria-label={`下移${label}`}
        disabled={index === length - 1}
        onClick={() => onMove(index + 1)}
        size="small"
      >
        下移
      </Button>
      <Button
        aria-label={`删除${label}`}
        danger
        onClick={onDelete}
        size="small"
      >
        删除
      </Button>
    </Space.Compact>
  );
}

function newGrammarStructure(idFactory: () => string): GrammarStructureV3 {
  return {
    id: idFactory(),
    variants: [
      {
        id: idFactory(),
        dialect: "common",
        content: { version: 2, text: "", annotations: [] }
      }
    ]
  };
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

function newDefinition(idFactory: () => string): WordDefinitionV3 {
  return {
    id: idFactory(),
    level: "A1",
    definition_mode: "zh_definition",
    content_id: idFactory(),
    content: { version: 2, text: "", annotations: [] }
  };
}

function newSentence(
  idFactory: () => string,
  wordId: string,
  senseId: string
): WordSentenceWritableV3 {
  return {
    id: idFactory(),
    level: "A1",
    en_text: {
      mode: "unified",
      common: {
        id: idFactory(),
        origin: "manual",
        value: { version: 2, text: "", annotations: [] }
      }
    },
    zh_text_id: idFactory(),
    zh_text: { version: 2, text: "", annotations: [] },
    links: [{ word_id: wordId, sense_id: senseId, role: "focus" }]
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

function newRelation(idFactory: () => string): WordRelationWritableV3 {
  return {
    id: idFactory(),
    relation: "synonym",
    score: "0"
  };
}

function sentenceLinkRoleLabel(role: string): string {
  if (role === "focus" || role === "head") return "主关联";
  if (role === "context") return "上下文关联";
  return "其他关联";
}

function OptionalInput({
  label,
  value,
  nodeId,
  field,
  onChange
}: {
  label: string;
  value?: string;
  nodeId: string;
  field: string;
  onChange: (value?: string) => void;
}) {
  return (
    <Input
      aria-label={label}
      data-v3-field={field}
      data-v3-node-id={nodeId}
      onChange={(event) => onChange(event.target.value || undefined)}
      value={value ?? ""}
    />
  );
}

export function V3MeaningsAndExamplesStep({
  value,
  onChange,
  onSave,
  saving = false,
  issues = [],
  activePosId,
  wordId,
  forms,
  partOfSpeechCatalog,
  onActivePosChange,
  idFactory = newWordNodeId
}: V3MeaningsAndExamplesStepProps) {
  const [contextSearch, setContextSearch] = useState<{
    sentenceId: string;
    linkIndex?: number;
    query: string;
  }>();
  const [knownContextTargets, setKnownContextTargets] = useState<
    Record<string, ContextTarget>
  >({});
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

  return (
    <Flex vertical gap="middle">
      {issues.length > 0 && (
        <Alert
          description={
            <ul>
              {issues.map((issue) => (
                <li key={`${issue.node_id}:${issue.field}:${issue.code}`}>
                  {issue.message}
                </li>
              ))}
            </ul>
          }
          showIcon
          title="释义与例句尚未完成"
          type="warning"
        />
      )}

      <Card size="small" title="释义组">
        <Flex vertical gap="small">
          {value.sense_groups.length === 0 ? (
            <Typography.Text type="secondary">
              草稿可暂时不添加释义组
            </Typography.Text>
          ) : (
            value.sense_groups.map((group, groupIndex) => (
              <Flex data-v3-node-id={group.id} gap="small" key={group.id} wrap>
                <Input
                  aria-label={`释义组 ${groupIndex + 1} 中文名称`}
                  data-v3-field="name_zh"
                  data-v3-node-id={group.id}
                  onChange={(event) =>
                    change((draft) => {
                      draft.sense_groups[groupIndex]!.name_zh =
                        event.target.value;
                    })
                  }
                  value={group.name_zh}
                />
                <Input
                  aria-label={`释义组 ${groupIndex + 1} 英文名称`}
                  data-v3-field="name_en"
                  data-v3-node-id={group.id}
                  onChange={(event) =>
                    change((draft) => {
                      draft.sense_groups[groupIndex]!.name_en =
                        event.target.value;
                    })
                  }
                  value={group.name_en}
                />
                <ListActions
                  index={groupIndex}
                  label={`释义组 ${groupIndex + 1}`}
                  length={value.sense_groups.length}
                  onDelete={() =>
                    change((draft) => {
                      draft.sense_groups.splice(groupIndex, 1);
                      for (const pos of draft.pos) {
                        for (const sense of pos.senses) {
                          if (sense.sense_group_id === group.id) {
                            delete sense.sense_group_id;
                          }
                        }
                      }
                    })
                  }
                  onMove={(nextIndex) =>
                    change((draft) =>
                      moveItem(draft.sense_groups, groupIndex, nextIndex)
                    )
                  }
                />
              </Flex>
            ))
          )}
          <Button
            onClick={() =>
              change((draft) => {
                draft.sense_groups.push({
                  id: idFactory(),
                  name_zh: "",
                  name_en: ""
                });
              })
            }
          >
            新增释义组
          </Button>
        </Flex>
      </Card>

      <Button
        disabled={
          !activePosId || value.pos.some((pos) => pos.pos_id === activePosId)
        }
        onClick={() => {
          if (!activePosId) return;
          change((draft) => {
            draft.pos.push({
              pos_id: activePosId,
              grammar_structures: [],
              senses: []
            });
          });
        }}
      >
        添加当前词性释义
      </Button>

      {value.pos.length === 0 ? (
        <Empty description="草稿可暂时不添加词性释义" />
      ) : (
        <Tabs
          activeKey={activePosId}
          defaultActiveKey={value.pos[0]?.pos_id}
          items={value.pos.map((pos, posIndex) => ({
            key: pos.pos_id,
            label: visiblePosLabel(pos.pos_id, posIndex),
            children: (
              <Flex
                data-v3-field="senses"
                data-v3-node-id={pos.pos_id}
                tabIndex={-1}
                vertical
                gap="middle"
              >
                <Button
                  aria-label={`删除${visiblePosLabel(pos.pos_id, posIndex)}的释义`}
                  danger
                  onClick={() =>
                    change((draft) => {
                      draft.pos.splice(posIndex, 1);
                      const nextPos = draft.pos[0]?.pos_id;
                      if (nextPos) onActivePosChange?.(nextPos);
                    })
                  }
                >
                  删除当前词性释义
                </Button>
                <Card size="small" title="语法结构">
                  {pos.grammar_structures.length === 0 ? (
                    <Typography.Text type="secondary">
                      暂无语法结构
                    </Typography.Text>
                  ) : (
                    <Flex vertical gap="small">
                      {pos.grammar_structures.map(
                        (structure, structureIndex) => (
                          <Card
                            data-v3-field="variants"
                            data-v3-node-id={structure.id}
                            extra={
                              <ListActions
                                index={structureIndex}
                                label={`语法结构 ${structureIndex + 1}`}
                                length={pos.grammar_structures.length}
                                onDelete={() =>
                                  change((draft) => {
                                    draft.pos[
                                      posIndex
                                    ]!.grammar_structures.splice(
                                      structureIndex,
                                      1
                                    );
                                    for (const sense of draft.pos[posIndex]!
                                      .senses) {
                                      for (const definition of sense.definitions) {
                                        if (
                                          definition.grammar_structure_id ===
                                          structure.id
                                        ) {
                                          delete definition.grammar_structure_id;
                                        }
                                      }
                                    }
                                  })
                                }
                                onMove={(nextIndex) =>
                                  change((draft) =>
                                    moveItem(
                                      draft.pos[posIndex]!.grammar_structures,
                                      structureIndex,
                                      nextIndex
                                    )
                                  )
                                }
                              />
                            }
                            key={structure.id}
                            size="small"
                            tabIndex={-1}
                            title={`语法结构 ${structureIndex + 1}`}
                          >
                            {structure.variants.map((variant, variantIndex) => (
                              <Flex
                                data-v3-node-id={variant.id}
                                gap="small"
                                key={variant.id}
                              >
                                <Select
                                  aria-label={`语法结构 ${structureIndex + 1} 地区 ${variantIndex + 1}`}
                                  onChange={(dialect: Dialect) =>
                                    change((draft) => {
                                      draft.pos[posIndex]!.grammar_structures[
                                        structureIndex
                                      ]!.variants[variantIndex]!.dialect =
                                        dialect;
                                    })
                                  }
                                  options={[
                                    { label: "通用", value: "common" },
                                    { label: "英式", value: "uk" },
                                    { label: "美式", value: "us" }
                                  ]}
                                  value={variant.dialect}
                                />
                                <Input
                                  aria-label={`语法结构 ${structureIndex + 1} 内容 ${variantIndex + 1}`}
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
                                  value={variant.content.text}
                                />
                              </Flex>
                            ))}
                          </Card>
                        )
                      )}
                    </Flex>
                  )}
                  <Button
                    onClick={() =>
                      change((draft) => {
                        draft.pos[posIndex]!.grammar_structures.push(
                          newGrammarStructure(idFactory)
                        );
                      })
                    }
                  >
                    新增语法结构
                  </Button>
                </Card>

                {pos.senses.map((sense, senseIndex) => (
                  <Card
                    data-v3-node-id={sense.id}
                    extra={
                      <ListActions
                        index={senseIndex}
                        label={`释义 ${senseIndex + 1}`}
                        length={pos.senses.length}
                        onDelete={() =>
                          change((draft) => {
                            draft.pos[posIndex]!.senses.splice(senseIndex, 1);
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
                      />
                    }
                    key={sense.id}
                    size="small"
                    title={`释义 ${senseIndex + 1}`}
                  >
                    <Flex vertical gap="small">
                      <Space wrap>
                        <Select
                          aria-label={`释义 ${senseIndex + 1} 子词性`}
                          data-v3-field="sub_pos"
                          data-v3-node-id={sense.id}
                          onChange={(subPos) =>
                            change((draft) => {
                              draft.pos[posIndex]!.senses[senseIndex]!.sub_pos =
                                subPos;
                            })
                          }
                          options={(() => {
                            const code = formPosById.get(pos.pos_id);
                            const configured = code
                              ? (catalogByCode.get(code)?.sub_parts ?? [])
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
                          value={sense.sub_pos}
                        />
                        <Input
                          aria-label={`释义 ${senseIndex + 1} 等级`}
                          data-v3-field="level"
                          data-v3-node-id={sense.id}
                          onChange={(event) =>
                            change((draft) => {
                              draft.pos[posIndex]!.senses[senseIndex]!.level =
                                event.target.value;
                            })
                          }
                          value={sense.level}
                        />
                        <Select
                          aria-label={`释义 ${senseIndex + 1} 所属释义组`}
                          data-v3-field="sense_group_id"
                          data-v3-node-id={sense.id}
                          onChange={(nextValue: string) =>
                            change((draft) => {
                              const target =
                                draft.pos[posIndex]!.senses[senseIndex]!;
                              if (!nextValue) delete target.sense_group_id;
                              else target.sense_group_id = nextValue;
                            })
                          }
                          options={[
                            { label: "不归入释义组", value: "" },
                            ...value.sense_groups.map((group, groupIndex) => ({
                              label:
                                group.name_zh ||
                                group.name_en ||
                                `释义组 ${groupIndex + 1}`,
                              value: group.id
                            }))
                          ]}
                          placeholder="选择释义组"
                          value={sense.sense_group_id}
                        />
                        <OptionalInput
                          field="frequency"
                          label={`释义 ${senseIndex + 1} 频率`}
                          nodeId={sense.id}
                          onChange={(nextValue) =>
                            change((draft) => {
                              const target =
                                draft.pos[posIndex]!.senses[senseIndex]!;
                              if (nextValue === undefined)
                                delete target.frequency;
                              else target.frequency = nextValue;
                            })
                          }
                          value={sense.frequency}
                        />
                        <Checkbox
                          checked={sense.depends_on_context}
                          onChange={(event) =>
                            change((draft) => {
                              draft.pos[posIndex]!.senses[
                                senseIndex
                              ]!.depends_on_context = event.target.checked;
                            })
                          }
                        >
                          依赖语境
                        </Checkbox>
                      </Space>

                      {sense.definitions.map((definition, definitionIndex) => (
                        <Card
                          data-v3-node-id={definition.id}
                          extra={
                            <ListActions
                              index={definitionIndex}
                              label={`定义 ${definitionIndex + 1}`}
                              length={sense.definitions.length}
                              onDelete={() =>
                                change((draft) => {
                                  draft.pos[posIndex]!.senses[
                                    senseIndex
                                  ]!.definitions.splice(definitionIndex, 1);
                                })
                              }
                              onMove={(nextIndex) =>
                                change((draft) =>
                                  moveItem(
                                    draft.pos[posIndex]!.senses[senseIndex]!
                                      .definitions,
                                    definitionIndex,
                                    nextIndex
                                  )
                                )
                              }
                            />
                          }
                          key={definition.id}
                          size="small"
                          title={`${definitionModeLabel(definition.definition_mode)} ${definitionIndex + 1}`}
                        >
                          <Space direction="vertical" style={{ width: "100%" }}>
                            <Input
                              aria-label={`定义 ${definitionIndex + 1} 等级`}
                              data-v3-field="level"
                              data-v3-node-id={definition.id}
                              onChange={(event) =>
                                change((draft) => {
                                  draft.pos[posIndex]!.senses[
                                    senseIndex
                                  ]!.definitions[definitionIndex]!.level =
                                    event.target.value;
                                })
                              }
                              value={definition.level}
                            />
                            <Select
                              aria-label={`定义 ${definitionIndex + 1} 语法结构`}
                              data-v3-field="grammar_structure_id"
                              data-v3-node-id={definition.id}
                              onChange={(nextValue: string) =>
                                change((draft) => {
                                  const target =
                                    draft.pos[posIndex]!.senses[senseIndex]!
                                      .definitions[definitionIndex]!;
                                  if (!nextValue)
                                    delete target.grammar_structure_id;
                                  else target.grammar_structure_id = nextValue;
                                })
                              }
                              options={[
                                { label: "不指定语法结构", value: "" },
                                ...(definition.grammar_structure_id &&
                                !pos.grammar_structures.some(
                                  (item) =>
                                    item.id === definition.grammar_structure_id
                                )
                                  ? [
                                      {
                                        label: "未找到的语法结构",
                                        value: definition.grammar_structure_id
                                      }
                                    ]
                                  : []),
                                ...pos.grammar_structures.map(
                                  (structure, structureIndex) => ({
                                    label: `语法结构 ${structureIndex + 1}`,
                                    value: structure.id
                                  })
                                )
                              ]}
                              placeholder="选择语法结构"
                              value={definition.grammar_structure_id}
                            />
                            {definition.definition_mode === "zh_definition" ||
                            definition.definition_mode === "zh_sentence" ? (
                              <Input.TextArea
                                aria-label={`定义 ${definitionIndex + 1} 内容`}
                                data-v3-field="content"
                                data-v3-node-id={definition.id}
                                onChange={(event) =>
                                  change((draft) => {
                                    const target =
                                      draft.pos[posIndex]!.senses[senseIndex]!
                                        .definitions[definitionIndex]!;
                                    if (
                                      target.definition_mode ===
                                        "zh_definition" ||
                                      target.definition_mode === "zh_sentence"
                                    ) {
                                      target.content = replaceRichText(
                                        target.content,
                                        event.target.value
                                      );
                                    }
                                  })
                                }
                                value={definition.content.text}
                              />
                            ) : (
                              editableEnglishText(
                                definition.content as EnglishTextV3
                              ).map((row) => (
                                <Input.TextArea
                                  aria-label={`定义 ${definitionIndex + 1} ${dialectLabel(row.dialect)}内容`}
                                  data-v3-field="value"
                                  data-v3-node-id={row.variant_id}
                                  key={row.variant_id}
                                  onChange={(event) =>
                                    change((draft) => {
                                      const target =
                                        draft.pos[posIndex]!.senses[senseIndex]!
                                          .definitions[definitionIndex]!;
                                      if (
                                        target.definition_mode ===
                                          "en_definition" ||
                                        target.definition_mode === "en_sentence"
                                      ) {
                                        target.content = replaceEnglishText(
                                          target.content,
                                          row.dialect,
                                          event.target.value
                                        );
                                      }
                                    })
                                  }
                                  value={row.text}
                                />
                              ))
                            )}
                          </Space>
                        </Card>
                      ))}
                      <Button
                        onClick={() =>
                          change((draft) => {
                            draft.pos[posIndex]!.senses[
                              senseIndex
                            ]!.definitions.push(newDefinition(idFactory));
                          })
                        }
                      >
                        新增定义
                      </Button>

                      {sense.sentences.map((sentence, sentenceIndex) => (
                        <Card
                          data-v3-field="sentence"
                          data-v3-node-id={sentence.id}
                          extra={
                            <ListActions
                              index={sentenceIndex}
                              label={`例句 ${sentenceIndex + 1}`}
                              length={sense.sentences.length}
                              onDelete={() =>
                                change((draft) => {
                                  draft.pos[posIndex]!.senses[
                                    senseIndex
                                  ]!.sentences.splice(sentenceIndex, 1);
                                })
                              }
                              onMove={(nextIndex) =>
                                change((draft) =>
                                  moveItem(
                                    draft.pos[posIndex]!.senses[senseIndex]!
                                      .sentences,
                                    sentenceIndex,
                                    nextIndex
                                  )
                                )
                              }
                            />
                          }
                          key={sentence.id}
                          size="small"
                          tabIndex={-1}
                          title={`例句 ${sentenceIndex + 1}`}
                        >
                          <Space direction="vertical" style={{ width: "100%" }}>
                            <Input
                              aria-label={`例句 ${sentenceIndex + 1} 等级`}
                              data-v3-field="level"
                              data-v3-node-id={sentence.id}
                              onChange={(event) =>
                                change((draft) => {
                                  draft.pos[posIndex]!.senses[
                                    senseIndex
                                  ]!.sentences[sentenceIndex]!.level =
                                    event.target.value;
                                })
                              }
                              value={sentence.level}
                            />
                            {editableEnglishText(sentence.en_text).map(
                              (row) => (
                                <Input.TextArea
                                  aria-label={`例句 ${sentenceIndex + 1} ${dialectLabel(row.dialect)}英文`}
                                  data-v3-field="value"
                                  data-v3-node-id={row.variant_id}
                                  key={row.variant_id}
                                  onChange={(event) =>
                                    change((draft) => {
                                      const target =
                                        draft.pos[posIndex]!.senses[senseIndex]!
                                          .sentences[sentenceIndex]!;
                                      target.en_text = replaceEnglishText(
                                        target.en_text,
                                        row.dialect,
                                        event.target.value
                                      );
                                    })
                                  }
                                  value={row.text}
                                />
                              )
                            )}
                            <Input.TextArea
                              aria-label={`例句 ${sentenceIndex + 1} 中文`}
                              data-v3-field="zh_text"
                              data-v3-node-id={sentence.zh_text_id}
                              onChange={(event) =>
                                change((draft) => {
                                  const target =
                                    draft.pos[posIndex]!.senses[senseIndex]!
                                      .sentences[sentenceIndex]!;
                                  target.zh_text = replaceRichText(
                                    target.zh_text,
                                    event.target.value
                                  );
                                })
                              }
                              value={sentence.zh_text.text}
                            />
                            {sentence.links.map((link, linkIndex) => {
                              const isPrimary =
                                link.role === "focus" || link.role === "head";
                              const targetKey = `${link.word_id}:${link.sense_id}`;
                              const availableTargets = contextTargets.filter(
                                (target) =>
                                  target.key === targetKey ||
                                  !sentence.links.some(
                                    (otherLink, otherIndex) =>
                                      otherIndex !== linkIndex &&
                                      otherLink.word_id === target.word_id &&
                                      otherLink.sense_id === target.sense_id
                                  )
                              );
                              const targetOptions = availableTargets.some(
                                (target) => target.key === targetKey
                              )
                                ? availableTargets
                                : [
                                    ...availableTargets,
                                    {
                                      key: targetKey,
                                      label: "已关联其他词义",
                                      word_id: link.word_id,
                                      sense_id: link.sense_id
                                    }
                                  ];
                              return (
                                <Flex
                                  align="center"
                                  data-v3-field="links"
                                  data-v3-node-id={sentence.id}
                                  gap="small"
                                  key={`${targetKey}:${linkIndex}`}
                                  wrap
                                >
                                  <Tag color={isPrimary ? "blue" : undefined}>
                                    {sentenceLinkRoleLabel(link.role)}
                                  </Tag>
                                  <Typography.Text>
                                    {wordId &&
                                    link.word_id === wordId &&
                                    link.sense_id === sense.id
                                      ? "当前词义"
                                      : "已关联其他词义"}
                                  </Typography.Text>
                                  {!isPrimary ? (
                                    <>
                                      <AutoComplete
                                        aria-label={`例句 ${sentenceIndex + 1} 上下文关联 ${linkIndex + 1} 目标`}
                                        filterOption={false}
                                        onSearch={(query) =>
                                          setContextSearch({
                                            sentenceId: sentence.id,
                                            linkIndex,
                                            query
                                          })
                                        }
                                        onSelect={(nextKey) => {
                                          const target = targetOptions.find(
                                            (option) => option.key === nextKey
                                          );
                                          if (!target) return;
                                          change((draft) => {
                                            const draftLink =
                                              draft.pos[posIndex]!.senses[
                                                senseIndex
                                              ]!.sentences[sentenceIndex]!
                                                .links[linkIndex]!;
                                            draftLink.word_id = target.word_id;
                                            draftLink.sense_id =
                                              target.sense_id;
                                          });
                                          setKnownContextTargets((current) => ({
                                            ...current,
                                            [target.key]: target
                                          }));
                                          setContextSearch(undefined);
                                        }}
                                        options={targetOptions.map(
                                          (target) => ({
                                            label: target.label,
                                            value: target.key
                                          })
                                        )}
                                        placeholder="搜索已发布词条并选择具体词义"
                                        value={
                                          contextSearch?.sentenceId ===
                                            sentence.id &&
                                          contextSearch.linkIndex === linkIndex
                                            ? contextSearch.query
                                            : targetOptions.find(
                                                (target) =>
                                                  target.key === targetKey
                                              )?.label
                                        }
                                      />
                                      <Button
                                        aria-label={`删除例句 ${sentenceIndex + 1} 的上下文关联 ${linkIndex + 1}`}
                                        danger
                                        onClick={() =>
                                          change((draft) => {
                                            draft.pos[posIndex]!.senses[
                                              senseIndex
                                            ]!.sentences[
                                              sentenceIndex
                                            ]!.links.splice(linkIndex, 1);
                                          })
                                        }
                                      >
                                        删除关联
                                      </Button>
                                    </>
                                  ) : null}
                                </Flex>
                              );
                            })}
                            {primaryLinkState(sentence, wordId, sense.id) !==
                              "valid" && wordId ? (
                              <Button
                                onClick={() =>
                                  change((draft) => {
                                    const draftSentence =
                                      draft.pos[posIndex]!.senses[senseIndex]!
                                        .sentences[sentenceIndex]!;
                                    draftSentence.links = [
                                      {
                                        word_id: wordId,
                                        sense_id: sense.id,
                                        role: "focus"
                                      },
                                      ...draftSentence.links.filter(
                                        (link) =>
                                          link.role !== "focus" &&
                                          link.role !== "head" &&
                                          (link.word_id !== wordId ||
                                            link.sense_id !== sense.id)
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
                                const target = contextTargets.find(
                                  (option) => option.key === targetKey
                                );
                                if (!target) return;
                                change((draft) => {
                                  draft.pos[posIndex]!.senses[
                                    senseIndex
                                  ]!.sentences[sentenceIndex]!.links.push({
                                    word_id: target.word_id,
                                    sense_id: target.sense_id,
                                    role: "context"
                                  });
                                });
                                setKnownContextTargets((current) => ({
                                  ...current,
                                  [target.key]: target
                                }));
                                setContextSearch(undefined);
                              }}
                              options={contextTargets
                                .filter(
                                  (target) =>
                                    !sentence.links.some(
                                      (link) =>
                                        link.word_id === target.word_id &&
                                        link.sense_id === target.sense_id
                                    )
                                )
                                .map((target) => ({
                                  label: target.label,
                                  value: target.key
                                }))}
                              placeholder="搜索已发布词条并选择具体词义"
                              value={
                                contextSearch?.sentenceId === sentence.id &&
                                contextSearch.linkIndex === undefined
                                  ? contextSearch.query
                                  : ""
                              }
                            />
                          </Space>
                        </Card>
                      ))}
                      <Button
                        disabled={!wordId}
                        onClick={() =>
                          change((draft) => {
                            if (!wordId) return;
                            draft.pos[posIndex]!.senses[
                              senseIndex
                            ]!.sentences.push(
                              newSentence(idFactory, wordId, sense.id)
                            );
                          })
                        }
                      >
                        新增例句
                      </Button>

                      {sense.relations.map((relation, relationIndex) => (
                        <Card
                          data-v3-node-id={relation.id}
                          extra={
                            <ListActions
                              index={relationIndex}
                              label={`关联 ${relationIndex + 1}`}
                              length={sense.relations.length}
                              onDelete={() =>
                                change((draft) => {
                                  draft.pos[posIndex]!.senses[
                                    senseIndex
                                  ]!.relations.splice(relationIndex, 1);
                                })
                              }
                              onMove={(nextIndex) =>
                                change((draft) =>
                                  moveItem(
                                    draft.pos[posIndex]!.senses[senseIndex]!
                                      .relations,
                                    relationIndex,
                                    nextIndex
                                  )
                                )
                              }
                            />
                          }
                          key={relation.id}
                          size="small"
                          title={`关联 ${relationIndex + 1}`}
                        >
                          <Flex gap="small" wrap>
                            <Select
                              aria-label={`关联 ${relationIndex + 1} 类型`}
                              data-v3-field="relation"
                              data-v3-node-id={relation.id}
                              onChange={(relationType) =>
                                change((draft) => {
                                  draft.pos[posIndex]!.senses[
                                    senseIndex
                                  ]!.relations[relationIndex]!.relation =
                                    relationType;
                                })
                              }
                              options={[
                                { label: "近义词", value: "synonym" },
                                { label: "反义词", value: "antonym" },
                                { label: "派生词", value: "derivative" }
                              ]}
                              value={relation.relation}
                            />
                            {relation.target_word_id ||
                            relation.target_sense_id ? (
                              <Tag color="green">已选择关联目标</Tag>
                            ) : (
                              <OptionalInput
                                field="pending_target_headword"
                                label={`关联 ${relationIndex + 1} 待关联词条`}
                                nodeId={relation.id}
                                onChange={(nextValue) =>
                                  change((draft) => {
                                    const target =
                                      draft.pos[posIndex]!.senses[senseIndex]!
                                        .relations[relationIndex]!;
                                    if (nextValue === undefined)
                                      delete target.pending_target_headword;
                                    else
                                      target.pending_target_headword =
                                        nextValue;
                                  })
                                }
                                value={relation.pending_target_headword}
                              />
                            )}
                            <Input
                              aria-label={`关联 ${relationIndex + 1} 分数`}
                              data-v3-field="score"
                              data-v3-node-id={relation.id}
                              onChange={(event) =>
                                change((draft) => {
                                  draft.pos[posIndex]!.senses[
                                    senseIndex
                                  ]!.relations[relationIndex]!.score =
                                    event.target.value;
                                })
                              }
                              value={relation.score}
                            />
                          </Flex>
                        </Card>
                      ))}
                      <Button
                        onClick={() =>
                          change((draft) => {
                            draft.pos[posIndex]!.senses[
                              senseIndex
                            ]!.relations.push(newRelation(idFactory));
                          })
                        }
                      >
                        新增关联
                      </Button>
                    </Flex>
                  </Card>
                ))}
                <Button
                  onClick={() =>
                    change((draft) => {
                      draft.pos[posIndex]!.senses.push(
                        newSense(idFactory, draft.sense_groups[0]?.id)
                      );
                    })
                  }
                >
                  新增释义
                </Button>
              </Flex>
            )
          }))}
          onChange={onActivePosChange}
        />
      )}

      {onSave && (
        <Flex justify="end" gap="small">
          <Button disabled={saving} onClick={() => void save("save")}>
            保存草稿
          </Button>
          <Button
            disabled={saving}
            loading={saving}
            onClick={() => void save("complete")}
            type="primary"
          >
            完成此步
          </Button>
        </Flex>
      )}
    </Flex>
  );
}
