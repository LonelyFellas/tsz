import {
  Card as MuiCard,
  CardHeader as MuiCardHeader,
  CardContent as MuiCardContent
} from "@mui/material";
import {
  Button as MuiButton,
  Chip as MuiChip,
  Stack as MuiStack,
  Typography as MuiTypography
} from "@mui/material";
import { boundFormGroupIds } from "./meaningsModel";
import type {
  AdminWordV3,
  EnglishTextV3,
  SentenceTranslationBandV3,
  WordDefinitionV3,
  WordSenseV3,
  WordPosFormsV3
} from "@tsz/types";

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
    <MuiStack direction="column" spacing={2}>
      {word.meanings.sense_groups.length > 0 ? (
        <MuiStack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {word.meanings.sense_groups.map((group, index) => (
            <MuiChip
              key={group.id}
              label={
                <>
                  语义区间 {index + 1}：
                  {[group.name_zh, group.name_en].filter(Boolean).join(" / ")}
                </>
              }
            />
          ))}
        </MuiStack>
      ) : null}
      {word.meanings.pos.length === 0 ? (
        <MuiTypography color="text.secondary">{"暂无词义与例句"}</MuiTypography>
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
            <MuiStack direction="column" spacing={2}>
              {pos.grammar_structures.length > 0 ? (
                <MuiStack direction="column" spacing={1}>
                  <MuiTypography component="span" fontWeight={600}>
                    语法结构
                  </MuiTypography>
                  {pos.grammar_structures.map((structure, index) => (
                    <MuiStack
                      key={structure.id}
                      direction="row"
                      spacing={1}
                      useFlexGap
                      flexWrap="wrap"
                    >
                      <MuiChip label={<>语法结构 {index + 1}</>} />
                      {structure.variants.map((variant) => (
                        <MuiTypography
                          className="tsz-words"
                          key={variant.id}
                          component="span"
                        >
                          {dialectLabel(variant.dialect)}：
                          {variant.content.text}
                          {variant.audio_assets?.length ? (
                            <MuiChip
                              style={{ marginInlineStart: 6 }}
                              label={<>音频 {variant.audio_assets.length} 条</>}
                            />
                          ) : null}
                        </MuiTypography>
                      ))}
                    </MuiStack>
                  ))}
                </MuiStack>
              ) : null}
              {pos.senses.length === 0 ? (
                <MuiTypography component="span" color="text.secondary">
                  暂无释义
                </MuiTypography>
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
                          <MuiButton
                            onClick={() => onEdit(sense.id)}
                            aria-label={`编辑词义 ${senseIndex + 1}`}
                            variant={"text"}
                          >
                            编辑
                          </MuiButton>
                        )}
                      </header>
                      <MuiStack direction="column" spacing={1}>
                        <MuiStack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          useFlexGap
                          flexWrap="wrap"
                        >
                          {sense.sub_pos ? (
                            <MuiChip
                              color={"primary"}
                              label={<>{subPartOfSpeechLabel(sense.sub_pos)}</>}
                            />
                          ) : null}
                          {sense.level ? (
                            <MuiChip
                              color={"primary"}
                              label={<>{sense.level}</>}
                            />
                          ) : null}
                          {sense.frequency !== undefined && (
                            <MuiChip label={<>词频 {sense.frequency}%</>} />
                          )}
                          {group ? (
                            <MuiChip
                              color={"secondary"}
                              label={
                                <>
                                  语义区间 {group.index}：{group.label}
                                </>
                              }
                            />
                          ) : null}
                          {boundFormGroupIds(sense).map((groupId) => (
                            <MuiChip
                              key={groupId}
                              className="tsz-words"
                              color={"info"}
                              label={
                                <>
                                  词形与发音：
                                  {boundFormGroupLabel(
                                    formsPosById.get(pos.pos_id),
                                    groupId
                                  )}
                                </>
                              }
                            />
                          ))}
                          {sense.depends_on_context ? (
                            <MuiChip
                              color={"warning"}
                              label={<>依赖上下文</>}
                            />
                          ) : null}
                        </MuiStack>
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
                                  <MuiChip
                                    label={
                                      <>{definition.level || "未设等级"}</>
                                    }
                                  />
                                  <span>{chinese ? "中文" : "英文"}</span>
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
                                            className="tsz-words"
                                            value={variant.content}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {definition.grammar_structure_id &&
                                    !grammar && (
                                      <MuiChip
                                        color={"warning"}
                                        label={<>语法结构已失效</>}
                                      />
                                    )}
                                </div>
                              </section>
                            );
                          })}
                        </div>
                        {renderSentences?.(sense.id)}
                        {sense.sentences.map((sentence, index) => (
                          <MuiCard key={sentence.id} variant="outlined">
                            <MuiCardHeader
                              className="admin-card-header"
                              title={`例句 ${index + 1}`}
                              slotProps={{
                                title: {
                                  variant: "subtitle1",
                                  className: "admin-card-title"
                                }
                              }}
                              sx={{
                                p: 2,
                                borderBottom: 1,
                                borderColor: "divider"
                              }}
                            />
                            <MuiCardContent className="admin-card-body">
                              <MuiStack direction="column" spacing={0.5}>
                                <V3EnglishTextPreview
                                  value={sentence.en_text}
                                />
                                {sentenceTranslationsV3(sentence).map(
                                  (translation) => (
                                    <MuiTypography
                                      key={translation.id}
                                      component="span"
                                    >
                                      <MuiChip
                                        label={
                                          <>
                                            {translationBandLabel(
                                              translation.band
                                            )}
                                          </>
                                        }
                                      />
                                      {translation.content.text}
                                    </MuiTypography>
                                  )
                                )}
                                {sentence.links.length > 0 ? (
                                  <MuiStack
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    useFlexGap
                                    flexWrap="wrap"
                                  >
                                    {sentence.links.map((link, linkIndex) => (
                                      <MuiChip
                                        key={`${sentence.id}-link-${linkIndex}`}
                                        label={
                                          <>
                                            {sentenceLinkRoleLabel(link.role)}
                                          </>
                                        }
                                      />
                                    ))}
                                  </MuiStack>
                                ) : null}
                                {sentence.associations.map((association) => {
                                  const pending =
                                    association.state === "pending";
                                  const headword = pending
                                    ? association.pending_target_headword
                                    : association.target_headword;
                                  const gloss = pending
                                    ? association.pending_target_gloss
                                    : association.target_gloss;
                                  return (
                                    <MuiStack
                                      key={association.id}
                                      direction="row"
                                      spacing={0.5}
                                      alignItems="center"
                                      useFlexGap
                                      flexWrap="wrap"
                                    >
                                      <MuiChip
                                        color={pending ? "warning" : "success"}
                                        label={
                                          <>{pending ? "待关联" : "已关联"}</>
                                        }
                                      />
                                      <MuiTypography
                                        className="tsz-entry-en"
                                        component="span"
                                      >
                                        {pending ? "待关联词条" : "上下文关联"}
                                        ：
                                        {headword ??
                                          association.source_segments
                                            .map((segment) => segment.surface)
                                            .join(" … ")}
                                        {gloss ? ` · ${gloss}` : ""}
                                      </MuiTypography>
                                    </MuiStack>
                                  );
                                })}
                              </MuiStack>
                            </MuiCardContent>
                          </MuiCard>
                        ))}
                        <div className="v3-dictionary-relations">
                          <h4>拓展词</h4>
                          {sense.relations.length > 0 ? (
                            <MuiStack direction="column" spacing={0.5}>
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
                                  <MuiTypography
                                    className="tsz-entry-en"
                                    key={relation.id}
                                    component="span"
                                  >
                                    <MuiChip
                                      label={
                                        <>{relationLabel(relation.relation)}</>
                                      }
                                    />
                                    <MuiChip
                                      color={
                                        relation.target_word_id
                                          ? "success"
                                          : "warning"
                                      }
                                      label={
                                        <>
                                          {relation.target_word_id
                                            ? "已关联"
                                            : "待关联"}
                                        </>
                                      }
                                    />
                                    <span className="v3-relation-score">
                                      {group
                                        .map((item) => `${item.score}%`)
                                        .join(" / ")}
                                    </span>
                                    {relation.target_headword ??
                                      relation.pending_target_headword ??
                                      "待补充目标词条"}
                                    {gloss ? ` · ${gloss}` : ""}
                                  </MuiTypography>
                                );
                              })}
                            </MuiStack>
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
                                <MuiTypography color="text.secondary">{`暂无${relationLabel(type)}`}</MuiTypography>
                              </div>
                            ))}
                        </div>
                      </MuiStack>
                    </article>
                  );
                })
              )}
            </MuiStack>
          </section>
        ))
      )}
    </MuiStack>
  );
  return embedded ? (
    content
  ) : (
    <MuiCard variant="outlined">
      <MuiCardHeader
        className="admin-card-header"
        title={"词义与例句"}
        slotProps={{
          title: { variant: "subtitle1", className: "admin-card-title" }
        }}
        sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
      />
      <MuiCardContent className="admin-card-body">{content}</MuiCardContent>
    </MuiCard>
  );
}
