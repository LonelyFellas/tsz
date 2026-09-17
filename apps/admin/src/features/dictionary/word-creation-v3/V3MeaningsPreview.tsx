import { boundFormGroupIds } from "./meaningsModel";
import type {
  AdminWordV3,
  EnglishTextV3,
  SentenceTranslationBandV3,
  WordDefinitionV3,
  WordSenseV3,
  WordPosFormsV3
} from "@tsz/types";
import { Button, Card, Empty, Flex, Space, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { formGroupLabel, sentenceTranslationsV3 } from "./meaningsModel";
import { groupRelations } from "./relationGroups";
import { V3EnglishTextPreview } from "./components/V3EnglishTextPreview";
import {
  dialectLabel,
  relationLabel,
  sentenceLinkRoleLabel
} from "./presentation";
import {
  usePartOfSpeechLabel,
  useSubPartOfSpeechLabel
} from "../part-of-speech/PartOfSpeechLabels";

export function reviewSenseTitle(sense: WordSenseV3): string {
  for (const definition of sense.definitions) {
    if (
      (definition.definition_mode === "zh_definition" ||
        definition.definition_mode === "zh_sentence") &&
      definition.content.text.trim()
    )
      return definition.content.text;
  }
  return "待填写释义";
}

function DefinitionText({ definition }: { definition: WordDefinitionV3 }) {
  if (
    definition.definition_mode === "zh_definition" ||
    definition.definition_mode === "zh_sentence"
  ) {
    return <RichTextReadOnly value={definition.content} />;
  }
  return (
    <V3EnglishTextPreview
      value={definition.content as EnglishTextV3}
      hideCommonDialect
    />
  );
}

function boundFormGroupLabel(pos: WordPosFormsV3 | undefined, groupId: string) {
  return (pos && formGroupLabel(pos, groupId)) ?? "已失效的变化组";
}

function translationBandLabel(band: SentenceTranslationBandV3) {
  if (band === "word_for_word") return "初";
  if (band === "balanced_fluency") return "中";
  return "高";
}

export function V3MeaningsPreview({
  word,
  embedded = false,
  renderSentences,
  onEdit
}: {
  word: AdminWordV3;
  embedded?: boolean;
  renderSentences?: (senseId: string) => ReactNode;
  onEdit?: (nodeId: string) => void;
}) {
  const partOfSpeechLabel = usePartOfSpeechLabel();
  const subPartOfSpeechLabel = useSubPartOfSpeechLabel();
  const posCodeById = new Map(
    word.forms.pos.map((pos) => [pos.pos_id, pos.pos] as const)
  );
  const formsPosById = new Map(
    word.forms.pos.map((pos) => [pos.pos_id, pos] as const)
  );
  const senseGroupById = new Map(
    word.meanings.sense_groups.map((group, index) => [
      group.id,
      {
        index: index + 1,
        label: group.name_zh || group.name_en || `语义区间 ${index + 1}`
      }
    ])
  );

  const content = (
    <Flex vertical gap="middle">
      {word.meanings.sense_groups.length > 0 ? (
        <Flex gap="small" wrap>
          {word.meanings.sense_groups.map((group, index) => (
            <Tag key={group.id}>
              语义区间 {index + 1}：
              {[group.name_zh, group.name_en].filter(Boolean).join(" / ")}
            </Tag>
          ))}
        </Flex>
      ) : null}
      {word.meanings.pos.length === 0 ? (
        <Empty description="暂无词义与例句" />
      ) : (
        word.meanings.pos.map((pos) => (
          <section
            className="v3-dictionary-pos"
            key={pos.pos_id}
            id={`review-pos-${pos.pos_id}`}
          >
            <header className="v3-dictionary-pos-heading">
              <h2>{partOfSpeechLabel(posCodeById.get(pos.pos_id) ?? "")}</h2>
              <span>{pos.senses.length} 个词义</span>
            </header>
            <Flex vertical gap="middle">
              {pos.grammar_structures.length > 0 ? (
                <Flex vertical gap="small">
                  <Typography.Text strong>语法结构</Typography.Text>
                  {pos.grammar_structures.map((structure, index) => (
                    <Flex key={structure.id} gap="small" wrap>
                      <Tag>语法结构 {index + 1}</Tag>
                      {structure.variants.map((variant) => (
                        <Typography.Text
                          className="tsz-entry-en"
                          key={variant.id}
                        >
                          {dialectLabel(variant.dialect)}：
                          {variant.content.text}
                          {variant.audio_assets?.length ? (
                            <Tag style={{ marginInlineStart: 6 }}>
                              音频 {variant.audio_assets.length} 条
                            </Tag>
                          ) : null}
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
                    <article
                      className="v3-dictionary-sense"
                      key={sense.id}
                      id={`review-sense-${sense.id}`}
                    >
                      <header className="v3-dictionary-sense-heading">
                        <span className="v3-dictionary-number">
                          {String(senseIndex + 1).padStart(2, "0")}
                        </span>
                        <h3>{reviewSenseTitle(sense)}</h3>
                        {onEdit && (
                          <Button
                            type="link"
                            onClick={() => onEdit(sense.id)}
                            aria-label={`编辑词义 ${senseIndex + 1}`}
                          >
                            编辑
                          </Button>
                        )}
                      </header>
                      <Flex vertical gap="small">
                        <Space wrap>
                          {sense.sub_pos ? (
                            <Tag color="blue">
                              {subPartOfSpeechLabel(sense.sub_pos)}
                            </Tag>
                          ) : null}
                          {sense.level ? (
                            <Tag color="blue">{sense.level}</Tag>
                          ) : null}
                          {sense.frequency !== undefined && (
                            <Tag>词频 {sense.frequency}%</Tag>
                          )}
                          {group ? (
                            <Tag color="purple">
                              语义区间 {group.index}：{group.label}
                            </Tag>
                          ) : null}
                          {boundFormGroupIds(sense).map((groupId) => (
                            <Tag
                              key={groupId}
                              className="tsz-entry-en"
                              color="cyan"
                            >
                              词形与发音：
                              {boundFormGroupLabel(
                                formsPosById.get(pos.pos_id),
                                groupId
                              )}
                            </Tag>
                          ))}
                          {sense.depends_on_context ? (
                            <Tag color="gold">依赖上下文</Tag>
                          ) : null}
                        </Space>
                        <div
                          className="v3-dictionary-definitions"
                          aria-label="多维释义"
                        >
                          {sense.definitions.map((definition, index) => {
                            const grammar = pos.grammar_structures.find(
                              (g) => g.id === definition.grammar_structure_id
                            );
                            const chinese =
                              definition.definition_mode.startsWith("zh_");
                            return (
                              <section
                                className="v3-dictionary-definition"
                                key={definition.id}
                              >
                                <div className="v3-dictionary-definition-meta">
                                  <Tag>{definition.level || "未设等级"}</Tag>
                                  <span>{chinese ? "中文" : "EN"}</span>
                                  <span>
                                    {definition.definition_mode.endsWith(
                                      "_sentence"
                                    )
                                      ? "整句释义"
                                      : "定义释义"}{" "}
                                    {index + 1}
                                  </span>
                                </div>
                                <div className="v3-dictionary-definition-body">
                                  <DefinitionText definition={definition} />
                                  {grammar && (
                                    <div className="v3-dictionary-usage">
                                      <span>用法</span>
                                      {grammar.variants.map((variant) => (
                                        <div key={variant.id}>
                                          <small>
                                            {dialectLabel(variant.dialect)}
                                          </small>
                                          <RichTextReadOnly
                                            value={variant.content}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {definition.grammar_structure_id &&
                                    !grammar && (
                                      <Tag color="warning">语法结构已失效</Tag>
                                    )}
                                </div>
                              </section>
                            );
                          })}
                        </div>
                        {renderSentences?.(sense.id)}
                        {sense.sentences.map((sentence, index) => (
                          <Card
                            key={sentence.id}
                            size="small"
                            title={`例句 ${index + 1}`}
                          >
                            <Flex vertical gap={4}>
                              <V3EnglishTextPreview value={sentence.en_text} />
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
                                    <Typography.Text className="tsz-entry-en">
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
                        <div className="v3-dictionary-relations">
                          <h4>拓展词</h4>
                          {sense.relations.length > 0 ? (
                            <Flex vertical gap={4}>
                              {groupRelations(sense.relations).map((group) => {
                                const relation = group[0]!;
                                const gloss = group
                                  .map(
                                    (item) =>
                                      item.target_gloss ??
                                      item.pending_target_gloss
                                  )
                                  .filter(Boolean)
                                  .join("；");
                                return (
                                  <Typography.Text
                                    className="tsz-entry-en"
                                    key={relation.id}
                                  >
                                    <Tag>
                                      {relationLabel(relation.relation)}
                                    </Tag>
                                    <Tag
                                      color={
                                        relation.target_word_id
                                          ? "green"
                                          : "orange"
                                      }
                                    >
                                      {relation.target_word_id
                                        ? "已关联"
                                        : "待关联"}
                                    </Tag>
                                    <span className="v3-relation-score">
                                      {group
                                        .map((item) => `${item.score}%`)
                                        .join(" / ")}
                                    </span>
                                    {relation.target_headword ??
                                      relation.pending_target_headword ??
                                      "待补充目标词条"}
                                    {gloss ? ` · ${gloss}` : ""}
                                  </Typography.Text>
                                );
                              })}
                            </Flex>
                          ) : null}
                          {["derivative", "synonym", "antonym"]
                            .filter(
                              (type) =>
                                !sense.relations.some(
                                  (relation) =>
                                    relation.relation === type ||
                                    (type === "derivative" &&
                                      relation.relation === "derived")
                                )
                            )
                            .map((type) => (
                              <div className="v3-relation-empty" key={type}>
                                <Empty
                                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                                  description={`暂无${relationLabel(type)}`}
                                />
                              </div>
                            ))}
                        </div>
                      </Flex>
                    </article>
                  );
                })
              )}
            </Flex>
          </section>
        ))
      )}
    </Flex>
  );
  return embedded ? content : <Card title="词义与例句">{content}</Card>;
}
