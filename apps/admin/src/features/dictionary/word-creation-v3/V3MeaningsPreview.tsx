import {
  useLexiconEditorTranslation,
  defaultLexiconEditorTranslation,
  type LexiconEditorTranslation
} from "../i18n/editor";
import { expandFormContents } from "@tsz/shared";
import { boundFormGroupIds } from "./meaningsModel";
import type {
  AdminWordV3,
  EnglishTextV3,
  SentenceTranslationBandV3,
  WordDefinitionV3,
  WordSenseV3,
  WordPosFormsV3
} from "@tsz/types";
import {
  Button,
  Card,
  Empty,
  Flex,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
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

export function reviewSenseTitle(
  sense: WordSenseV3,
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
): string {
  for (const definition of sense.definitions) {
    if (
      (definition.definition_mode === "zh_definition" ||
        definition.definition_mode === "zh_sentence") &&
      definition.content.text.trim()
    )
      return definition.content.text;
  }
  return t("panel_definition_not_entered");
}

function DefinitionText({ definition }: { definition: WordDefinitionV3 }) {
  if (
    definition.definition_mode === "zh_definition" ||
    definition.definition_mode === "zh_sentence"
  ) {
    return (
      <RichTextReadOnly value={definition.content} textRole="definition" />
    );
  }
  return (
    <V3EnglishTextPreview
      value={definition.content as EnglishTextV3}
      hideCommonDialect
      textRole="definition"
    />
  );
}

function boundFormGroupLabel(
  pos: WordPosFormsV3 | undefined,
  groupId: string,
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
) {
  return (
    (pos &&
      formGroupLabel(pos, groupId, (index, spelling) =>
        t("review_form_group", {
          index,
          spelling: spelling || t("review_base_not_entered")
        })
      )) ??
    t("panel_unavailable_form_group")
  );
}

function translationBandLabel(
  band: SentenceTranslationBandV3,
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
) {
  if (band === "word_for_word") return t("panel_w");
  if (band === "balanced_fluency") return t("panel_b");
  return t("panel_a");
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
  const { t } = useLexiconEditorTranslation();
  const partOfSpeechLabel = usePartOfSpeechLabel();
  const subPartOfSpeechLabel = useSubPartOfSpeechLabel();
  const posCodeById = new Map(
    expandFormContents(word.forms).pos.map(
      (pos) => [pos.pos_id, pos.pos] as const
    )
  );
  const formsPosById = new Map(
    expandFormContents(word.forms).pos.map((pos) => [pos.pos_id, pos] as const)
  );
  const senseGroupById = new Map(
    word.meanings.sense_groups.map((group, index) => [
      group.id,
      {
        index: index + 1,
        label:
          group.name_zh ||
          group.name_en ||
          t("panel_sense_group", { p0: index + 1 })
      }
    ])
  );

  const content = (
    <Flex vertical gap="middle">
      {word.meanings.sense_groups.length > 0 ? (
        <Flex gap="small" wrap>
          {word.meanings.sense_groups.map((group, index) => (
            <Tag key={group.id}>
              {t("panel_sense_group_2")} {index + 1}：
              {[group.name_zh, group.name_en].filter(Boolean).join(" / ")}
            </Tag>
          ))}
        </Flex>
      ) : null}
      {word.meanings.pos.length === 0 ? (
        <Empty description={t("panel_no_meanings_or_examples_yet")} />
      ) : (
        word.meanings.pos.map((pos) => (
          <section
            className="v3-dictionary-pos"
            key={pos.pos_id}
            id={`review-pos-${pos.pos_id}`}
          >
            <header className="v3-dictionary-pos-heading">
              <h2>{partOfSpeechLabel(posCodeById.get(pos.pos_id) ?? "")}</h2>
              <span>
                {t("preview_meaning_count", { count: pos.senses.length })}
              </span>
            </header>
            <Flex vertical gap="middle">
              {pos.grammar_structures.length > 0 ? (
                <Flex vertical gap="small">
                  <Typography.Text strong>
                    {t("panel_grammar_structures")}
                  </Typography.Text>
                  {pos.grammar_structures.map((structure, index) => (
                    <Flex key={structure.id} gap="small" wrap>
                      <Tag>
                        {t("panel_grammar_structures")} {index + 1}
                      </Tag>
                      {structure.variants.map((variant) => (
                        <Typography.Text className="tsz-words" key={variant.id}>
                          {dialectLabel(variant.dialect, t)}：
                          {variant.content.text}
                          {variant.audio_assets?.length ? (
                            <Tag style={{ marginInlineStart: 6 }}>
                              {t("panel_audio")} {variant.audio_assets.length}{" "}
                              {t("panel_items_3")}
                            </Tag>
                          ) : null}
                        </Typography.Text>
                      ))}
                    </Flex>
                  ))}
                </Flex>
              ) : null}
              {pos.senses.length === 0 ? (
                <Typography.Text type="secondary">
                  {t("panel_no_definitions_yet")}
                </Typography.Text>
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
                        <h3>{reviewSenseTitle(sense, t)}</h3>
                        {onEdit && (
                          <Button
                            type="link"
                            onClick={() => onEdit(sense.id)}
                            aria-label={t("panel_edit_meaning", {
                              p0: senseIndex + 1
                            })}
                          >
                            {t("panel_edit")}
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
                            <Tag>
                              {t("panel_frequency")} {sense.frequency}%
                            </Tag>
                          )}
                          {group ? (
                            <Tag color="purple">
                              {t("panel_sense_group_2")} {group.index}：
                              {group.label}
                            </Tag>
                          ) : null}
                          {boundFormGroupIds(sense).map((groupId) => (
                            <Tag
                              key={groupId}
                              className="tsz-words"
                              color="cyan"
                            >
                              {t("panel_forms_and_pronunciation_2")}
                              {boundFormGroupLabel(
                                formsPosById.get(pos.pos_id),
                                groupId,
                                t
                              )}
                            </Tag>
                          ))}
                          {sense.depends_on_context ? (
                            <Tag color="gold">
                              {t("panel_context_dependent")}
                            </Tag>
                          ) : null}
                        </Space>
                        <div
                          className="v3-dictionary-definitions"
                          aria-label={t("panel_definitions")}
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
                                  <Tag>
                                    {definition.level ||
                                      t("panel_level_not_set")}
                                  </Tag>
                                  <span>
                                    {chinese
                                      ? t("panel_chinese")
                                      : t("panel_english")}
                                  </span>
                                  <span>
                                    {definition.definition_mode.endsWith(
                                      "_sentence"
                                    )
                                      ? t("panel_full_sentence_definition")
                                      : t("panel_definition")}{" "}
                                    {index + 1}
                                  </span>
                                </div>
                                <div className="v3-dictionary-definition-body">
                                  <DefinitionText definition={definition} />
                                  {grammar && (
                                    <div className="v3-dictionary-usage">
                                      <span>{t("panel_usage")}</span>
                                      {grammar.variants.map((variant) => (
                                        <div key={variant.id}>
                                          <small>
                                            {dialectLabel(variant.dialect, t)}
                                          </small>
                                          <RichTextReadOnly
                                            className="tsz-words"
                                            value={variant.content}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {definition.grammar_structure_id &&
                                    !grammar && (
                                      <Tag color="warning">
                                        {t(
                                          "panel_grammar_structure_is_unavailable"
                                        )}
                                      </Tag>
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
                            title={t("panel_example", { p0: index + 1 })}
                          >
                            <Flex vertical gap={4}>
                              <V3EnglishTextPreview value={sentence.en_text} />
                              {sentenceTranslationsV3(sentence).map(
                                (translation) => (
                                  <Typography.Text key={translation.id}>
                                    <Tag>
                                      {translationBandLabel(
                                        translation.band,
                                        t
                                      )}
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
                                      {sentenceLinkRoleLabel(link.role, t)}
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
                                      {pending
                                        ? t("panel_pending_link")
                                        : t("panel_linked")}
                                    </Tag>
                                    <Typography.Text className="tsz-entry-en">
                                      {pending
                                        ? t("panel_pending_entry")
                                        : t("panel_context_link")}
                                      ：
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
                          <h4>{t("panel_related_entries")}</h4>
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
                                      {relationLabel(relation.relation, t)}
                                    </Tag>
                                    <Tag
                                      color={
                                        relation.target_word_id
                                          ? "green"
                                          : "orange"
                                      }
                                    >
                                      {relation.target_word_id
                                        ? t("panel_linked")
                                        : t("panel_pending_link")}
                                    </Tag>
                                    <span className="v3-relation-score">
                                      {group
                                        .map((item) => `${item.score}%`)
                                        .join(" / ")}
                                    </span>
                                    {relation.target_headword ??
                                      relation.pending_target_headword ??
                                      t("panel_target_entry_needed")}
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
                                  description={t("panel_no_yet", {
                                    p0: relationLabel(type, t)
                                  })}
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
  return embedded ? (
    content
  ) : (
    <Card title={t("panel_meanings_and_examples_2")}>{content}</Card>
  );
}
