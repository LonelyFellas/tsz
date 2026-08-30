import type { AdminWordV3, EnglishTextV3, WordDefinitionV3 } from "@tsz/types";
import { Card, Empty, Flex, Space, Tag, Typography } from "antd";
import { editableEnglishText, sentenceTranslationsV3 } from "./meaningsModel";
import {
  definitionModeLabel,
  dialectLabel,
  partOfSpeechLabel,
  relationLabel,
  sentenceLinkRoleLabel,
  subPartOfSpeechLabel
} from "./presentation";

function DefinitionText({ definition }: { definition: WordDefinitionV3 }) {
  if (
    definition.definition_mode === "zh_definition" ||
    definition.definition_mode === "zh_sentence"
  ) {
    return <Typography.Text>{definition.content.text}</Typography.Text>;
  }
  return (
    <Flex vertical gap={2}>
      {editableEnglishText(definition.content as EnglishTextV3).map((row) => (
        <Typography.Text key={row.variant_id}>
          <Tag>{dialectLabel(row.dialect)}</Tag>
          {row.text}
        </Typography.Text>
      ))}
    </Flex>
  );
}

function translationBandLabel(band: "a1_a2" | "b1_b2" | "c1_c2") {
  if (band === "c1_c2") return "初";
  if (band === "b1_b2") return "中";
  return "高";
}

export function V3MeaningsPreview({
  word,
  embedded = false
}: {
  word: AdminWordV3;
  embedded?: boolean;
}) {
  const posCodeById = new Map(
    word.forms.pos.map((pos) => [pos.pos_id, pos.pos] as const)
  );
  const senseGroupById = new Map(
    word.meanings.sense_groups.map((group, index) => [
      group.id,
      {
        index: index + 1,
        label: group.name_zh || group.name_en || `释义组 ${index + 1}`
      }
    ])
  );

  const content = (
    <Flex vertical gap="middle">
      {word.meanings.sense_groups.length > 0 ? (
        <Flex gap="small" wrap>
          {word.meanings.sense_groups.map((group, index) => (
            <Tag key={group.id}>
              释义组 {index + 1}：
              {[group.name_zh, group.name_en].filter(Boolean).join(" / ")}
            </Tag>
          ))}
        </Flex>
      ) : null}
      {word.meanings.pos.length === 0 ? (
        <Empty description="暂无词义与例句" />
      ) : (
        word.meanings.pos.map((pos) => (
          <Card
            key={pos.pos_id}
            size="small"
            title={partOfSpeechLabel(posCodeById.get(pos.pos_id) ?? "")}
          >
            <Flex vertical gap="middle">
              {pos.grammar_structures.length > 0 ? (
                <Flex vertical gap="small">
                  <Typography.Text strong>语法结构</Typography.Text>
                  {pos.grammar_structures.map((structure, index) => (
                    <Flex key={structure.id} gap="small" wrap>
                      <Tag>语法结构 {index + 1}</Tag>
                      {structure.variants.map((variant) => (
                        <Typography.Text key={variant.id}>
                          {dialectLabel(variant.dialect)}：
                          {variant.content.text}
                        </Typography.Text>
                      ))}
                    </Flex>
                  ))}
                </Flex>
              ) : null}
              {pos.senses.length === 0 ? (
                <Typography.Text type="secondary">暂无释义</Typography.Text>
              ) : (
                pos.senses.map((sense, senseIndex) => {
                  const group = sense.sense_group_id
                    ? senseGroupById.get(sense.sense_group_id)
                    : undefined;
                  return (
                    <Card
                      key={sense.id}
                      size="small"
                      title={`释义 ${senseIndex + 1}`}
                    >
                      <Flex vertical gap="small">
                        <Space wrap>
                          {sense.sub_pos ? (
                            <Tag color="blue">
                              {subPartOfSpeechLabel(sense.sub_pos)}
                            </Tag>
                          ) : null}
                          {sense.level ? <Tag>{sense.level}</Tag> : null}
                          {group ? (
                            <Tag color="purple">
                              释义组 {group.index}：{group.label}
                            </Tag>
                          ) : null}
                          {sense.depends_on_context ? (
                            <Tag color="gold">依赖上下文</Tag>
                          ) : null}
                        </Space>
                        {sense.definitions.map((definition, index) => (
                          <Card
                            key={definition.id}
                            size="small"
                            title={`${definitionModeLabel(definition.definition_mode)} ${index + 1}`}
                          >
                            <DefinitionText definition={definition} />
                          </Card>
                        ))}
                        {sense.sentences.map((sentence, index) => (
                          <Card
                            key={sentence.id}
                            size="small"
                            title={`例句 ${index + 1}`}
                          >
                            <Flex vertical gap={4}>
                              {editableEnglishText(sentence.en_text).map(
                                (row) => (
                                  <Typography.Text key={row.variant_id}>
                                    <Tag>{dialectLabel(row.dialect)}</Tag>
                                    {row.text}
                                  </Typography.Text>
                                )
                              )}
                              {sentenceTranslationsV3(sentence).map(
                                (translation) => (
                                  <Typography.Text key={translation.id}>
                                    <Tag>
                                      {translationBandLabel(translation.band)}
                                    </Tag>
                                    {translation.content.text}
                                  </Typography.Text>
                                )
                              )}
                              {sentence.links.length > 0 ? (
                                <Space wrap>
                                  {sentence.links.map((link, linkIndex) => (
                                    <Tag
                                      key={`${sentence.id}-link-${linkIndex}`}
                                    >
                                      {sentenceLinkRoleLabel(link.role)}
                                    </Tag>
                                  ))}
                                </Space>
                              ) : null}
                              {sentence.associations.map((association) => {
                                const pending = association.state === "pending";
                                const headword = pending
                                  ? association.pending_target_headword
                                  : association.target_headword;
                                const gloss = pending
                                  ? association.pending_target_gloss
                                  : association.target_gloss;
                                return (
                                  <Space key={association.id} size={4} wrap>
                                    <Tag color={pending ? "orange" : "green"}>
                                      {pending ? "待关联" : "已关联"}
                                    </Tag>
                                    <Typography.Text>
                                      {pending ? "待关联词条" : "上下文关联"}：
                                      {headword ??
                                        association.source_segments
                                          .map((segment) => segment.surface)
                                          .join(" … ")}
                                      {gloss ? ` · ${gloss}` : ""}
                                    </Typography.Text>
                                  </Space>
                                );
                              })}
                            </Flex>
                          </Card>
                        ))}
                        {sense.relations.length > 0 ? (
                          <Flex vertical gap={4}>
                            <Typography.Text strong>关系词</Typography.Text>
                            {sense.relations.map((relation) => (
                              <Typography.Text key={relation.id}>
                                <Tag>{relationLabel(relation.relation)}</Tag>
                                {relation.target_headword ??
                                  relation.pending_target_headword ??
                                  "待补充目标词条"}
                                {(relation.target_gloss ??
                                relation.pending_target_gloss)
                                  ? ` · ${relation.target_gloss ?? relation.pending_target_gloss}`
                                  : ""}
                              </Typography.Text>
                            ))}
                          </Flex>
                        ) : null}
                      </Flex>
                    </Card>
                  );
                })
              )}
            </Flex>
          </Card>
        ))
      )}
    </Flex>
  );
  return embedded ? content : <Card title="词义与例句">{content}</Card>;
}
