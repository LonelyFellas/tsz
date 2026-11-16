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
import { Alert } from "@tsz/ui/admin/display";
import type {
  NextDefinition,
  NextDraft,
  NextEntryView,
  NextGrammarIssue,
  NextSense,
  NextPublication,
  NextSentence
} from "@tsz/types";
import { draftForms, localeLabels } from "./model";

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
    <ul>
      {rows.map((row) => {
        const english = row.locale === "en" || row.locale.startsWith("en-");
        const content = row.content ?? {
          version: 2 as const,
          text: row.text,
          annotations: []
        };
        return (
          <li key={row.id}>
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
              ：
            </span>
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
  view,
  requests,
  sentenceDetailsAvailable = false,
  sentenceResources
}: {
  view: NextEntryView;
  sentenceDetailsAvailable?: boolean;
  sentenceResources?: Record<string, NextSentence>;
  relationTargets?: NextPublication["snapshot"]["relation_targets"];
  requests?: LexiconNextRequests;
}) {
  return (
    <EntryDialectContext.Provider
      value={view.target_locale === "en-US" ? "en-US" : "en-GB"}
    >
      <PronunciationPreviewProvider readOnly>
        <div className="lexicon-next-preview">
          <SenseGroups groups={view.sense_groups} />
          {!!view.grammar_issues?.length && (
            <Alert
              type="warning"
              title="语法结构尚未完整配置"
              description={
                <ul>
                  {[
                    ...new Set(
                      view.grammar_issues.map((issue) => issue.message)
                    )
                  ].map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              }
            />
          )}
          <Lines rows={view.forms} missing="词形" textClassName="tsz-words" />
          {!view.senses.length && <p>尚无词义</p>}
          {view.senses.map((sense, index) => (
            <section key={sense.id}>
              <h4>
                词义 {index + 1}
                {senseGroupName(view.sense_groups, sense.sense_group_id)}
              </h4>
              <SenseMetadataSummary sense={sense} />

              <Definitions
                rows={sense.target_definitions}
                missing="英文释义"
                issues={view.grammar_issues}
              />
              <Definitions
                rows={sense.medium_definitions}
                missing="中文解释"
                issues={view.grammar_issues}
              />
              <EquivalentPreview
                rows={sense.equivalents}
                noEquivalents={sense.no_equivalents}
              />
              {requests && (
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
                  [...sense.target_definitions, ...sense.medium_definitions]
                    .map((d) => d.grammar_structure_id)
                    .filter(Boolean)
                )
              ].map((id) => {
                const grammar = view.grammar_structures?.find(
                  (g) => g.id === id
                );
                return grammar ? (
                  <div key={id} aria-label="语法结构">
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
            </section>
          ))}
        </div>
      </PronunciationPreviewProvider>
    </EntryDialectContext.Provider>
  );
}
export function DraftSummary({
  draft,
  sentenceResources,
  requests,
  target = "en-GB",
  medium = "zh-Hans"
}: {
  draft: NextDraft;
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
