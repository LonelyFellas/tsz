import type { NextAgentInput, NextAgentProposals } from "@tsz/types";
import { Empty } from "@tsz/ui/admin/display";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { usePartOfSpeechLabel } from "@/features/dictionary/part-of-speech/PartOfSpeechLabels";
import {
  RELATION_TYPES,
  relationLabel,
  relationMetricLabel
} from "@/features/dictionary/word-creation-v3/presentation";
import type { MeaningGenerationSection } from "./generationContext";
import { useFormGenerationTranslation } from "./formGenerationMessages";

export type MeaningCandidates = {
  section: MeaningGenerationSection;
  proposals: NextAgentProposals;
  input: NextAgentInput;
  locale?: string;
  senseLabel?: string;
  medium: string;
  sectionLabel: string;
};

type CandidateRow = {
  context: string;
  text: string;
  lang?: string;
  note?: string;
};

export function MeaningCandidateTable({
  section,
  proposals,
  input,
  locale,
  senseLabel,
  medium,
  sectionLabel,
  titleId
}: MeaningCandidates & { titleId: string }) {
  const { t } = useLexiconEditorTranslation();
  const { t: generationText } = useFormGenerationTranslation();
  const posLabel = usePartOfSpeechLabel();
  const describeSense = (index: number) => {
    const sense = input.senses[index];
    const label = senseLabel ?? t("review_sense", { index: index + 1 });
    return [label, sense?.gloss].filter(Boolean).join(" · ");
  };
  const dialectLabel = (usage: string) =>
    t(usage === "en-GB" ? "dialect_pair_gb" : "dialect_pair_us");
  let contextTitle = t("sense");
  let rows: CandidateRow[];

  switch (section) {
    case "senses": {
      const existingCount = input.senses.length;
      rows = proposals.senses.map((sense, index) => {
        const dialect = proposals.dialect.find(
          (row) => row.sense === existingCount + index
        );
        return {
          context: posLabel(sense.pos),
          text: sense.gloss,
          lang: medium,
          note: [sense.level, dialect && dialectLabel(dialect.usage)]
            .filter(Boolean)
            .join(" · ")
        };
      });
      rows.push(
        ...proposals.dialect
          .filter((row) => row.sense < existingCount)
          .map((row) => ({
            context: describeSense(row.sense),
            text: dialectLabel(row.usage),
            note: row.evidence
          }))
      );
      break;
    }
    case "definitions":
      rows = proposals.definitions.flatMap(
        ({ sense, english, explanation }) => {
          const context = describeSense(sense);
          const entries: CandidateRow[] = [];
          if (!locale || locale === input.target)
            entries.push({ context, text: english, lang: input.target });
          if (!locale || locale === medium)
            entries.push({ context, text: explanation, lang: medium });
          return entries;
        }
      );
      break;
    case "equivalents":
      rows = proposals.equivalents.map(({ sense, word }) => ({
        context: describeSense(sense),
        text: word,
        lang: medium
      }));
      break;
    case "relations":
      rows = RELATION_TYPES.flatMap((kind) =>
        proposals.relations
          .filter((row) => row.kind === kind)
          .map((row) => ({ ...row, kind }))
      )
        .sort((left, right) => Number(!left.target) - Number(!right.target))
        .map(({ sense, kind, word, gloss, score, target }) => ({
          context: describeSense(sense),
          text: word,
          lang: input.target,
          note: [
            relationLabel(kind, t),
            gloss,
            `${relationMetricLabel(kind, t)} ${score.toFixed(2)}%`,
            target && generationText("entry_ai_relation_in_lexicon")
          ]
            .filter(Boolean)
            .join(" · ")
        }));
      break;
    case "examples":
      rows = proposals.examples.map(({ sense, text, level }) => ({
        context: describeSense(sense),
        text,
        lang: input.target,
        note: level
      }));
      break;
    case "translations":
      contextTitle = t("entry_ai_examples");
      rows = proposals.translations.map(({ example, text }) => ({
        context: input.examples[example] ?? sectionLabel,
        text,
        lang: medium
      }));
      break;
  }

  if (!rows.length)
    return (
      <Empty description={generationText("entry_ai_no_content_proposals")} />
    );

  const distinctRows = new Map(rows.map((row) => [JSON.stringify(row), row]));
  return (
    <table
      className="lexicon-proposal-table lexicon-proposal-meaning"
      aria-labelledby={titleId}
    >
      <thead>
        <tr>
          <th scope="col">{contextTitle}</th>
          <th scope="col">{generationText("entry_ai_content_column")}</th>
        </tr>
      </thead>
      <tbody>
        {[...distinctRows].map(([key, { context, text, lang, note }]) => (
          <tr key={key}>
            <th scope="row">{context}</th>
            <td>
              <span lang={lang}>{text}</span>
              {note && <div className="lexicon-proposal-secondary">{note}</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
