import { DialectPreview } from "./DialectPairs";
import type { NextDialectSense } from "@tsz/types";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { RelationsPreview } from "./Relations";
import { SentenceExamplesPreview } from "./SenseSentenceExamples";
import type { LexiconNextRequests } from "@/pages/LexiconNext";
import { EquivalentPreview } from "./EquivalentPreview";
import { RichTextReadOnly } from "@tsz/voice-editor/reader";
import { toRichTextV2 } from "@tsz/voice-editor/core";
import {
  PronunciationPreviewControls,
  PronunciationPreviewProvider
} from "@/features/dictionary/word-creation/PronunciationPreview";
import { EntryDialectContext } from "@/features/settings/useDialectPreference";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { localizedCatalogName } from "@/features/dictionary/part-of-speech/catalog";
import { partOfSpeechLabel } from "@/features/dictionary/word-creation-v3/presentation";
import { Alert, Button, Card, Empty } from "@tsz/ui/admin/display";
import type {
  NextDefinition,
  NextDraft,
  NextEntryView,
  NextGrammarIssue,
  PartOfSpeechCatalogResponse,
  NextSense,
  NextPublication,
  NextSentence
} from "@tsz/types";
import { draftForms, localeLabels } from "./model";
import "./preview.css";

function Lines({
  rows,
  missing,
  textClassName
}: {
  rows: { id: string; locale: string; text: string }[];
  missing: string;
  textClassName?: string;
}) {
  return rows.length ? (
    <ul>
      {rows.map((row) => (
        <li key={row.id}>
          <span className="lexicon-next-muted">
            {localeLabels[row.locale] ?? row.locale}：
          </span>
          <span className={textClassName}>{row.text || "（空白）"}</span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="lexicon-next-muted">缺少{missing}</p>
  );
}
function ReviewForms({ rows }: { rows: NextEntryView["forms"] }) {
  return rows.length ? (
    <dl className="lexicon-review-forms">
      {[...new Set(rows.map((row) => row.locale))].map((locale) => (
        <div key={locale}>
          <dt>{localeLabels[locale] ?? locale}</dt>
          <dd>
            <ul>
              {rows
                .filter((row) => row.locale === locale)
                .map((row) => (
                  <li key={row.id} className="tsz-words">
                    {row.text || "（空白）"}
                  </li>
                ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  ) : (
    <p className="lexicon-next-muted">缺少词形</p>
  );
}
function Definitions({
  rows,
  missing,
  issues
}: {
  rows: NextDefinition[];
  missing: string;
  issues?: NextGrammarIssue[];
}) {
  return rows.length ? (
    <ul className="lexicon-review-definitions">
      {rows.map((row) => {
        const english = row.locale === "en" || row.locale.startsWith("en-");
        const content = row.content ?? {
          version: 2 as const,
          text: row.text,
          annotations: []
        };
        return (
          <li key={row.id}>
            <div className="lexicon-review-definition-text">
              {english ? (
                <>
                  <PronunciationPreviewControls
                    pronunciationId={row.id}
                    recommendationArea="meaning"
                    playbackOnly
                    assetOnly
                    dialect={
                      row.locale === "en-GB"
                        ? "uk"
                        : row.locale === "en-US"
                          ? "us"
                          : "common"
                    }
                    ariaLabelPrefix={missing}
                    content={toRichTextV2(content)}
                    voiceProfile={row.voice_profile}
                    audioAssets={row.audio_assets}
                  />
                  <RichTextReadOnly
                    className="tsz-words"
                    value={content}
                    emptyText="（空白）"
                  />
                </>
              ) : (
                <span>{row.text || "（空白）"}</span>
              )}
            </div>
            <span className="lexicon-next-muted">
              {localeLabels[row.locale] ?? row.locale} · {row.level ?? "未评估"}{" "}
              · {row.style === "sentence" ? "整句" : "定义"} ·{" "}
              {row.grammar_unbound
                ? "不绑定"
                : row.grammar_structure_id
                  ? issues?.some(
                      (issue) =>
                        issue.node_id === row.id &&
                        issue.field === "grammar_structure_id"
                    )
                    ? "语法引用失效"
                    : "已关联语法"
                  : "未选择语法"}
            </span>
          </li>
        );
      })}
    </ul>
  ) : (
    <p className="lexicon-next-muted">缺少{missing}</p>
  );
}
function SenseGroups({ groups }: { groups: NextDraft["sense_groups"] }) {
  return groups?.length ? (
    <section aria-label="语义区间">
      <h4>语义区间</h4>
      <ul>
        {groups.map((group) => (
          <li key={group.id}>
            {group.name_zh || "（未填写中文）"} ·{" "}
            <span className="tsz-words">
              {group.name_en || "（未填写英文）"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  ) : null;
}
function senseGroupName(groups: NextDraft["sense_groups"], id?: string) {
  const group = groups?.find((row) => row.id === id);
  return group
    ? ` · ${group.name_zh || group.name_en || "未填写语义区间"}`
    : "";
}
function SenseMetadataSummary({
  sense
}: {
  sense: Pick<NextSense, "level" | "frequency" | "depends_on_context">;
}) {
  const items = [
    sense.level && `词义等级：${sense.level}`,
    sense.frequency !== undefined && `词频：${sense.frequency}%`,
    sense.depends_on_context !== undefined &&
      `是否依赖语境：${sense.depends_on_context ? "是" : "否"}`
  ].filter(Boolean);
  return items.length ? <p>{items.join(" · ")}</p> : null;
}
export function Preview({
  relationTargets,
  dialectSenses,
  dialectDraft,
  published = false,
  focusSense,
  view,
  requests,
  sentenceDetailsAvailable = false,
  sentenceResources,
  heading,
  versionControl,
  catalog,
  headwordField,
  onEditSense
}: {
  heading?: string;
  versionControl?: ReactNode;
  catalog?: PartOfSpeechCatalogResponse;
  headwordField?: ReactNode;
  onEditSense?: (id: string) => void;
  view: NextEntryView;
  dialectSenses?: NextDialectSense[];
  dialectDraft?: NextDraft;
  published?: boolean;
  focusSense?: string | null;
  sentenceDetailsAvailable?: boolean;
  sentenceResources?: Record<string, NextSentence>;
  relationTargets?: NextPublication["snapshot"]["relation_targets"];
  requests?: LexiconNextRequests;
}) {
  const { t, i18n } = useLexiconEditorTranslation();
  const headingId = useId();
  const showIndex = Boolean(heading && view.senses.length > 1);
  const warnings = [
    ...new Set(view.grammar_issues?.map((issue) => issue.message))
  ];
  const posBySense = new Map(
    dialectDraft?.senses.map((sense) => {
      const code = sense.part_of_speech;
      const item = catalog?.items.find((row) => row.code === code);
      return [
        sense.id,
        item
          ? localizedCatalogName(item, i18n.language)
          : code && partOfSpeechLabel(code, t, code)
      ];
    })
  );
  const focus = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusSense && focus.current) {
      focus.current.scrollIntoView({ block: "center" });
      focus.current.focus({ preventScroll: true });
    }
  }, [focusSense]);
  return (
    <EntryDialectContext.Provider
      value={view.target_locale === "en-US" ? "en-US" : "en-GB"}
    >
      <PronunciationPreviewProvider readOnly>
        <section
          className="lexicon-next-preview lexicon-review-content"
          aria-labelledby={headingId}
        >
          <Card
            className="lexicon-review-overview"
            aria-labelledby={headingId}
            title={<h2 id={headingId}>{heading ?? t("review_draft")}</h2>}
            extra={versionControl}
          >
            <div className="lexicon-review-entry">
              <div>
                {headwordField ?? (
                  <>
                    <div className="lexicon-review-label">
                      {t("review_headword")}
                    </div>
                    <strong className="lexicon-review-headword tsz-words">
                      {dialectDraft?.headword || view.forms[0]?.text || "—"}
                    </strong>
                  </>
                )}
              </div>
              <div className="lexicon-review-entry-details">
                <div>
                  <h3>{t("form")}</h3>
                  <ReviewForms rows={view.forms} />
                </div>
                <SenseGroups groups={view.sense_groups} />
              </div>
            </div>
          </Card>
          {warnings.length > 0 && (
            <Alert
              type="warning"
              showIcon
              title={
                warnings.length === 1 ? (
                  "语法结构尚未完整配置"
                ) : (
                  <details className="lexicon-review-warning">
                    <summary>
                      <span>语法结构尚未完整配置</span>{" "}
                      <span>
                        {t("summary_items_count", { count: warnings.length })}
                      </span>
                    </summary>
                    <ul>
                      {warnings.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  </details>
                )
              }
              description={warnings.length === 1 ? warnings[0] : undefined}
            />
          )}
          <div
            className={
              showIndex
                ? "lexicon-review-reading has-index"
                : "lexicon-review-reading"
            }
          >
            {showIndex && (
              <nav
                className="lexicon-review-index"
                aria-label={t("review_sense_index")}
              >
                <span>{t("review_sense_index")}</span>
                {view.senses.map((sense, index) => {
                  const pos = posBySense.get(sense.id);
                  const gloss =
                    sense.equivalents.find((row) => row.text.trim())?.text ||
                    sense.medium_definitions.find((row) => row.text.trim())
                      ?.text;
                  return (
                    <Button
                      type="text"
                      aria-label={t("review_sense", { index: index + 1 })}
                      size="small"
                      key={sense.id}
                      onClick={() => {
                        const card = document.getElementById(
                          `${headingId}-card-${sense.id}`
                        );
                        card?.scrollIntoView({ block: "start" });
                        card?.focus({ preventScroll: true });
                      }}
                    >
                      <span className="lexicon-review-index-line">
                        <strong>
                          {t("review_sense", { index: index + 1 })}
                        </strong>
                        {pos && <span>{pos}</span>}
                      </span>
                      {gloss && (
                        <span
                          className="lexicon-review-index-gloss"
                          title={gloss}
                        >
                          {gloss}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </nav>
            )}
            <div className="lexicon-review-senses">
              {!view.senses.length && (
                <Card>
                  <Empty description={t("panel_no_meanings_or_examples_yet")} />
                </Card>
              )}
              {view.senses.map((sense, index) => {
                const pos = posBySense.get(sense.id);
                const hasGlosses =
                  sense.target_definitions.length ||
                  sense.medium_definitions.length ||
                  sense.equivalents.length ||
                  sense.no_equivalents;
                const senseTitleId = `${headingId}-${sense.id}`;
                return (
                  <Card
                    className="lexicon-review-sense"
                    key={sense.id}
                    aria-labelledby={senseTitleId}
                    ref={sense.id === focusSense ? focus : undefined}
                    id={`${headingId}-card-${sense.id}`}
                    tabIndex={-1}
                    title={
                      <>
                        <h2 id={senseTitleId}>
                          {t("review_sense", { index: index + 1 })}
                          {pos && (
                            <span className="lexicon-review-pos">{pos}</span>
                          )}
                          <span className="lexicon-review-group">
                            {senseGroupName(
                              view.sense_groups,
                              sense.sense_group_id
                            )}
                          </span>
                        </h2>
                        <SenseMetadataSummary sense={sense} />
                      </>
                    }
                    extra={
                      onEditSense && (
                        <Button
                          size="small"
                          type="link"
                          onClick={() => onEditSense(sense.id)}
                          aria-label={t("panel_edit_meaning", {
                            p0: index + 1
                          })}
                        >
                          {t("panel_edit")}
                        </Button>
                      )
                    }
                  >
                    {dialectDraft && (
                      <DialectPreview
                        row={(dialectSenses ?? view.dialect_senses)?.find(
                          (v) => v.sense_id === sense.id
                        )}
                        locale={view.target_locale}
                        medium={view.medium_locale}
                        draft={dialectDraft}
                        published={published}
                      />
                    )}

                    {hasGlosses ? (
                      <>
                        <div className="lexicon-review-bilingual">
                          <div>
                            <h3>{t("snapshot_definition_en")}</h3>
                            <Definitions
                              rows={sense.target_definitions}
                              missing="英文释义"
                              issues={view.grammar_issues}
                            />
                          </div>
                          <div>
                            <h3>{t("review_explanation")}</h3>
                            <Definitions
                              rows={sense.medium_definitions}
                              missing="中文解释"
                              issues={view.grammar_issues}
                            />
                          </div>
                        </div>
                        <div>
                          <h3>{t("review_equivalents")}</h3>
                          <EquivalentPreview
                            rows={sense.equivalents}
                            noEquivalents={sense.no_equivalents}
                          />
                        </div>
                      </>
                    ) : (
                      <p className="lexicon-next-muted">
                        {t("panel_no_definitions_yet")} · {t("eq_empty")}
                      </p>
                    )}
                    {requests && !!sense.sentence_ids?.length && (
                      <div>
                        <h3>{t("panel_examples_2")}</h3>
                        <SentenceExamplesPreview
                          detailsAvailable={sentenceDetailsAvailable}
                          senseLevel={sense.level}
                          resources={
                            sentenceResources ??
                            (view.sentence_resources
                              ? Object.fromEntries(
                                  view.sentence_resources.map((v) => [v.id, v])
                                )
                              : undefined)
                          }
                          ids={sense.sentence_ids}
                          target={view.target_locale}
                          medium={view.medium_locale}
                          requests={requests}
                        />
                      </div>
                    )}
                    {requests && sense.relations && (
                      <RelationsPreview
                        frozenTargets={relationTargets}
                        rows={sense.relations}
                        target={view.target_locale}
                        medium={view.medium_locale}
                        requests={requests}
                      />
                    )}
                    {[
                      ...new Set(
                        [
                          ...sense.target_definitions,
                          ...sense.medium_definitions
                        ]
                          .map((d) => d.grammar_structure_id)
                          .filter(Boolean)
                      )
                    ].map((id) => {
                      const grammar = view.grammar_structures?.find(
                        (g) => g.id === id
                      );
                      return grammar ? (
                        <div key={id} aria-label="语法结构">
                          <h3>{t("grammar")}</h3>
                          {grammar.variants.map((variant) => (
                            <RichTextReadOnly
                              className="tsz-words"
                              key={variant.id}
                              value={variant.content}
                              emptyText="未填写语法结构"
                            />
                          ))}
                        </div>
                      ) : null;
                    })}
                  </Card>
                );
              })}
            </div>
          </div>
        </section>
      </PronunciationPreviewProvider>
    </EntryDialectContext.Provider>
  );
}
export function DraftSummary({
  draft,
  dialectSenses,
  sentenceResources,
  requests,
  target = "en-GB",
  medium = "zh-Hans"
}: {
  draft: NextDraft;
  dialectSenses?: NextDialectSense[];
  sentenceResources?: Record<string, NextSentence>;
  requests?: LexiconNextRequests;
  target?: string;
  medium?: string;
}) {
  return (
    <PronunciationPreviewProvider readOnly>
      <div className="lexicon-next-preview">
        <h4 className="tsz-words">{draft.headword}</h4>
        <SenseGroups groups={draft.sense_groups} />
        <Lines
          rows={draftForms(draft)}
          missing="词形"
          textClassName="tsz-words"
        />
        {draft.grammar_structures?.map((grammar, index) => (
          <section key={grammar.id}>
            <h4>语法结构 {index + 1}</h4>
            {grammar.variants.map((variant) => (
              <div key={variant.id}>
                {localeLabels[variant.locale]}：
                <RichTextReadOnly
                  className="tsz-words"
                  value={variant.content}
                />
              </div>
            ))}
          </section>
        ))}
        {draft.senses.map((sense, index) => (
          <section key={sense.id}>
            <h4>
              词义 {index + 1} · {sense.part_of_speech ?? "未指定词性"}
              {senseGroupName(draft.sense_groups, sense.sense_group_id)}
            </h4>
            <SenseMetadataSummary sense={sense} />
            <DialectPreview
              row={dialectSenses?.find((s) => s.sense_id === sense.id)}
              draft={draft}
              medium={medium}
              locale={target}
            />
            <Definitions rows={sense.definitions} missing="释义" />
            <DraftEquivalentSummary sense={sense} />
            {sense.sentence_ids?.flatMap(
              (id) =>
                sentenceResources?.[id]?.draft.variants.map((variant) => (
                  <div key={`${id}:${variant.locale}`}>
                    <span>
                      {localeLabels[variant.locale]} · {variant.level} ·
                      例句版本 {sentenceResources![id]!.revision}
                    </span>
                    <RichTextReadOnly
                      className="tsz-words"
                      value={variant.content}
                    />
                    {variant.translations.map((row) => (
                      <div key={row.id}>
                        <span>
                          {localeLabels[row.locale]} ·
                          {`自由度 ${row.metadata?.freedom ?? 0}%`}：
                        </span>
                        <RichTextReadOnly value={row.content} />
                      </div>
                    ))}
                  </div>
                )) ?? []
            )}
            {requests && sense.relations && (
              <RelationsPreview
                rows={sense.relations}
                target={target}
                medium={medium}
                requests={requests}
              />
            )}
          </section>
        ))}
      </div>
    </PronunciationPreviewProvider>
  );
}

function DraftEquivalentSummary({ sense }: { sense: NextSense }) {
  const locales = [
    ...new Set([
      ...sense.equivalents.map((row) => row.locale),
      ...(sense.no_equivalents ?? [])
    ])
  ];
  return locales.length ? (
    locales.map((locale) => (
      <div key={locale}>
        <span className="lexicon-next-muted">
          {localeLabels[locale] ?? locale}
        </span>
        <EquivalentPreview
          rows={sense.equivalents.filter((row) => row.locale === locale)}
          noEquivalents={sense.no_equivalents?.includes(locale)}
        />
      </div>
    ))
  ) : (
    <EquivalentPreview rows={[]} />
  );
}
