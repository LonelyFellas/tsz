import type { NextAgentSource } from "@tsz/types";
import { useAdminModuleTranslation } from "@/i18n";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { useFormTypeLabel } from "@/features/dictionary/part-of-speech/FormTypeLabels";
import { usePartOfSpeechLabel } from "@/features/dictionary/part-of-speech/PartOfSpeechLabels";
import { dictionaryMatchPosLabel } from "./dictionaryPosLabel";
import {
  dictionaryReferenceEntry,
  dictionaryReferenceLayout
} from "./referenceEntryModel";
import { useFormGenerationTranslation } from "./formGenerationMessages";

const messages = {
  summary: ["词条摘要", "詞條摘要", "Entry summary"],
  reading: ["原站读音标记", "原站讀音標記", "Source pronunciation notation"],
  pronunciation: ["发音", "發音", "Pronunciation"],
  meaning: ["词义参考", "詞義參考", "Meaning reference"],
  spellings: ["拼写变体", "拼寫變體", "Spelling variants"],
  unassigned: ["未标注词性", "未標註詞性", "Part of speech unmarked"],
  formCount: ["{{count}} 项", "{{count}} 項", "Forms ({{count}})"],
  indexOnly: [
    "本次只取得词条索引，可打开原词条查看释义。",
    "本次僅取得詞條索引，可開啟原詞條查看釋義。",
    "Only entry index information was returned. Open the original entry for definitions."
  ]
} as const;

type ReferenceMessages = Record<keyof typeof messages, string>;

declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminLexiconDictionaryReference: ReferenceMessages;
  }
}

function bundle(index: 0 | 1 | 2) {
  return {
    adminLexiconDictionaryReference: Object.fromEntries(
      Object.entries(messages).map(([key, values]) => [key, values[index]])
    ) as ReferenceMessages
  };
}

const resources = { "zh-Hans": bundle(0), "zh-Hant": bundle(1), en: bundle(2) };

export function ReferenceEntryContent({
  source,
  headword
}: {
  source?: NextAgentSource;
  headword: string;
}) {
  const { t } = useAdminModuleTranslation(
    "adminLexiconDictionaryReference",
    resources
  );
  const { t: editor } = useLexiconEditorTranslation();
  const { t: form } = useFormGenerationTranslation();
  const formTypeLabel = useFormTypeLabel();
  const posLabel = usePartOfSpeechLabel();
  const entry = dictionaryReferenceEntry(source, headword);
  const { partsOfSpeech, groups } = dictionaryReferenceLayout(entry);
  const labelForPos = (pos: string) =>
    dictionaryMatchPosLabel(pos, undefined, posLabel);

  const missing = (
    <span className="lexicon-reference-missing">
      {form("entry_ai_source_missing")}
    </span>
  );
  const pronunciations = [
    { label: editor("dialect_uk"), value: entry.pronunciation?.uk },
    { label: editor("dialect_us"), value: entry.pronunciation?.us },
    { label: t("reading"), value: entry.reading }
  ].filter(({ value }) => value);

  const renderForms = (forms: NonNullable<typeof entry.forms>) => (
    <ul className="lexicon-reference-forms">
      {forms.map(({ type, text, indexed }, index) => (
        <li key={`${type}-${index}`}>
          {type && (
            <span>
              {type === "british_spelling" || type === "american_spelling"
                ? editor(type)
                : formTypeLabel(type)}
              {indexed && ` · ${form("entry_ai_source_index_inflection")}`}
            </span>
          )}
          <span className="tsz-words" lang="en">
            {text}
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="lexicon-reference-entry">
      <h3 lang="en" className="tsz-words">
        {headword}
      </h3>
      <dl className="lexicon-reference-facts">
        <div>
          <dt>{editor("pos")}</dt>
          <dd>
            {partsOfSpeech.length
              ? partsOfSpeech.map(labelForPos).join(" · ")
              : missing}
          </dd>
        </div>
        <div>
          <dt>{t("pronunciation")}</dt>
          <dd className="lexicon-reference-pronunciations">
            {pronunciations.length
              ? pronunciations.map(({ label, value }) => (
                  <span key={label}>
                    <span className="lexicon-reference-label">{label}</span>{" "}
                    <span className="tsz-phonetics">{value}</span>
                  </span>
                ))
              : missing}
          </dd>
        </div>
        <div>
          <dt>{form("entry_ai_form_column")}</dt>
          <dd className="lexicon-reference-form-groups">
            {groups.length
              ? groups.map((group) => {
                  const label =
                    group.kind === "pos"
                      ? labelForPos(group.pos)
                      : t(group.kind);
                  return (
                    <div
                      key={group.kind === "pos" ? group.pos : group.kind}
                      className="lexicon-reference-form-group"
                      role="group"
                      aria-label={label}
                    >
                      <p className="lexicon-reference-form-heading">
                        <strong>{label}</strong>
                        {group.forms.length > 0 && (
                          <span className="lexicon-reference-label">
                            {t("formCount", { count: group.forms.length })}
                          </span>
                        )}
                      </p>
                      {group.forms.length ? (
                        renderForms(group.forms)
                      ) : (
                        <span className="lexicon-reference-missing">
                          {form("entry_ai_source_no_inflections")}
                        </span>
                      )}
                    </div>
                  );
                })
              : missing}
          </dd>
        </div>
      </dl>
      {!!entry.definitions?.length && (
        <div className="lexicon-reference-definitions">
          <h4>{t("meaning")}</h4>
          {entry.definitions.length === 1 ? (
            <p lang="en">{entry.definitions[0]}</p>
          ) : (
            <ol lang="en">
              {entry.definitions.map((definition, index) => (
                <li key={index}>{definition}</li>
              ))}
            </ol>
          )}
        </div>
      )}
      {entry.summary && (
        <div className="lexicon-reference-definitions">
          <h4>{t("summary")}</h4>
          <p>{entry.summary}</p>
        </div>
      )}
      {entry.indexOnly && (
        <p className="lexicon-reference-index-hint">{t("indexOnly")}</p>
      )}
    </div>
  );
}
