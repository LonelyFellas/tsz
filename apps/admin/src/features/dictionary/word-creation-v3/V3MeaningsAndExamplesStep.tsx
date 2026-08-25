import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Flex,
  Input,
  Select,
  Space,
  Tabs,
  Typography
} from "antd";
import type {
  Dialect,
  DraftMeaningsStepContentWritableV3,
  EnglishTextV3,
  GrammarStructureV3,
  StepSaveIntent,
  V3DraftValidationIssue,
  WordDefinitionV3,
  WordRelationWritableV3,
  WordSentenceWritableV3,
  WordSenseWritableV3
} from "@tsz/types";
import { newWordNodeId } from "../word-model/primitives";
import {
  editableEnglishText,
  replaceEnglishText,
  replaceRichText
} from "./meaningsModel";

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

function newSentence(idFactory: () => string): WordSentenceWritableV3 {
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
    links: []
  };
}

function newRelation(idFactory: () => string): WordRelationWritableV3 {
  return {
    id: idFactory(),
    relation: "synonym",
    score: "0"
  };
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
  onActivePosChange,
  idFactory = newWordNodeId
}: V3MeaningsAndExamplesStepProps) {
  const change = (mutation: DraftMutation) => {
    const next = structuredClone(value);
    mutation(next);
    onChange(next);
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
                  aria-label={`释义组中文 ${group.id}`}
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
                  aria-label={`释义组英文 ${group.id}`}
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
                  label={`释义组 ${group.id}`}
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
            label: `词性 ${posIndex + 1}`,
            children: (
              <Flex
                data-v3-field="senses"
                data-v3-node-id={pos.pos_id}
                tabIndex={-1}
                vertical
                gap="middle"
              >
                <Button
                  aria-label={`删除词性释义 ${pos.pos_id}`}
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
                                label={`语法结构 ${structure.id}`}
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
                                  aria-label={`语法方言 ${variant.id}`}
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
                                  aria-label={`语法 ${variant.id}`}
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
                    新增语法结构 {pos.pos_id}
                  </Button>
                </Card>

                {pos.senses.map((sense, senseIndex) => (
                  <Card
                    data-v3-node-id={sense.id}
                    extra={
                      <ListActions
                        index={senseIndex}
                        label={`释义 ${sense.id}`}
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
                        <Input
                          aria-label={`子词性 ${sense.id}`}
                          data-v3-field="sub_pos"
                          data-v3-node-id={sense.id}
                          onChange={(event) =>
                            change((draft) => {
                              draft.pos[posIndex]!.senses[senseIndex]!.sub_pos =
                                event.target.value;
                            })
                          }
                          value={sense.sub_pos}
                        />
                        <Input
                          aria-label={`级别 ${sense.id}`}
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
                        <OptionalInput
                          field="sense_group_id"
                          label={`释义组 ${sense.id}`}
                          nodeId={sense.id}
                          onChange={(nextValue) =>
                            change((draft) => {
                              const target =
                                draft.pos[posIndex]!.senses[senseIndex]!;
                              if (nextValue === undefined)
                                delete target.sense_group_id;
                              else target.sense_group_id = nextValue;
                            })
                          }
                          value={sense.sense_group_id}
                        />
                        <OptionalInput
                          field="frequency"
                          label={`频率 ${sense.id}`}
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
                              label={`定义 ${definition.id}`}
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
                          title={definition.definition_mode}
                        >
                          <Space direction="vertical" style={{ width: "100%" }}>
                            <Input
                              aria-label={`释义级别 ${definition.id}`}
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
                            <OptionalInput
                              field="grammar_structure_id"
                              label={`释义语法 ${definition.id}`}
                              nodeId={definition.id}
                              onChange={(nextValue) =>
                                change((draft) => {
                                  const target =
                                    draft.pos[posIndex]!.senses[senseIndex]!
                                      .definitions[definitionIndex]!;
                                  if (nextValue === undefined)
                                    delete target.grammar_structure_id;
                                  else target.grammar_structure_id = nextValue;
                                })
                              }
                              value={definition.grammar_structure_id}
                            />
                            {definition.definition_mode === "zh_definition" ||
                            definition.definition_mode === "zh_sentence" ? (
                              <Input.TextArea
                                aria-label={`释义 ${definition.id}`}
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
                                  aria-label={`释义 ${definition.id} ${row.dialect}`}
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
                        新增定义 {sense.id}
                      </Button>

                      {sense.sentences.map((sentence, sentenceIndex) => (
                        <Card
                          data-v3-field="sentence"
                          data-v3-node-id={sentence.id}
                          extra={
                            <ListActions
                              index={sentenceIndex}
                              label={`例句 ${sentence.id}`}
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
                              aria-label={`例句级别 ${sentence.id}`}
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
                                  aria-label={`英文例句 ${sentence.id} ${row.dialect}`}
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
                              aria-label={`中文例句 ${sentence.id}`}
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
                            {sentence.links.map((link, linkIndex) => (
                              <Flex
                                gap="small"
                                key={`${link.word_id}:${link.sense_id}:${linkIndex}`}
                              >
                                {(["word_id", "sense_id", "role"] as const).map(
                                  (field) => (
                                    <Input
                                      aria-label={`例句关联 ${sentence.id} ${field}`}
                                      {...(field === "role"
                                        ? {
                                            "data-v3-field": "links",
                                            "data-v3-node-id": sentence.id
                                          }
                                        : {})}
                                      key={field}
                                      onChange={(event) =>
                                        change((draft) => {
                                          draft.pos[posIndex]!.senses[
                                            senseIndex
                                          ]!.sentences[sentenceIndex]!.links[
                                            linkIndex
                                          ]![field] = event.target.value;
                                        })
                                      }
                                      value={link[field]}
                                    />
                                  )
                                )}
                                <Button
                                  aria-label={`删除例句关联 ${sentence.id} ${linkIndex + 1}`}
                                  danger
                                  onClick={() =>
                                    change((draft) => {
                                      draft.pos[posIndex]!.senses[
                                        senseIndex
                                      ]!.sentences[sentenceIndex]!.links.splice(
                                        linkIndex,
                                        1
                                      );
                                    })
                                  }
                                >
                                  删除关联
                                </Button>
                              </Flex>
                            ))}
                            <Button
                              onClick={() =>
                                change((draft) => {
                                  draft.pos[posIndex]!.senses[
                                    senseIndex
                                  ]!.sentences[sentenceIndex]!.links.push({
                                    word_id: "",
                                    sense_id: sense.id,
                                    role: "focus"
                                  });
                                })
                              }
                            >
                              新增例句关联 {sentence.id}
                            </Button>
                          </Space>
                        </Card>
                      ))}
                      <Button
                        onClick={() =>
                          change((draft) => {
                            draft.pos[posIndex]!.senses[
                              senseIndex
                            ]!.sentences.push(newSentence(idFactory));
                          })
                        }
                      >
                        新增例句 {sense.id}
                      </Button>

                      {sense.relations.map((relation, relationIndex) => (
                        <Card
                          data-v3-node-id={relation.id}
                          extra={
                            <ListActions
                              index={relationIndex}
                              label={`关联 ${relation.id}`}
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
                            <Input
                              aria-label={`关联类型 ${relation.id}`}
                              data-v3-field="relation"
                              data-v3-node-id={relation.id}
                              onChange={(event) =>
                                change((draft) => {
                                  draft.pos[posIndex]!.senses[
                                    senseIndex
                                  ]!.relations[relationIndex]!.relation =
                                    event.target.value;
                                })
                              }
                              value={relation.relation}
                            />
                            {(
                              [
                                ["target_word_id", "目标词条"],
                                ["target_sense_id", "目标释义"],
                                ["pending_target_headword", "待解析词头"]
                              ] as const
                            ).map(([field, label]) => (
                              <OptionalInput
                                field={field}
                                key={field}
                                label={`${label} ${relation.id}`}
                                nodeId={relation.id}
                                onChange={(nextValue) =>
                                  change((draft) => {
                                    const target =
                                      draft.pos[posIndex]!.senses[senseIndex]!
                                        .relations[relationIndex]!;
                                    if (nextValue === undefined)
                                      delete target[field];
                                    else target[field] = nextValue;
                                  })
                                }
                                value={relation[field]}
                              />
                            ))}
                            <Input
                              aria-label={`关联分数 ${relation.id}`}
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
                        新增关联 {sense.id}
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
                  新增释义 {pos.pos_id}
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
