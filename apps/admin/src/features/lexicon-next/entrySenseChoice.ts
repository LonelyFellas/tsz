import type { NextEntry } from "@tsz/types";
import type { RelatedWordChoice } from "@/features/dictionary/relatedSuggestions";
import { draftForms } from "./model";

export function entrySenseChoice(
  entry: NextEntry,
  target: string,
  medium: string
): RelatedWordChoice {
  const forms = draftForms(entry.draft);
  const headword =
    forms.find((row) => row.locale === target)?.text ||
    forms.find((row) => row.locale === "en")?.text ||
    entry.draft.headword;
  const senses = entry.draft.senses.map((sense) => ({
    sense_id: sense.id,
    gloss:
      sense.definitions.find((row) => row.locale === medium)?.text ||
      sense.equivalents.find((row) => row.locale === medium)?.text ||
      "",
    status: "draft" as const
  }));
  return {
    word_id: entry.id,
    headword,
    matchedHeadword: headword,
    status: "draft",
    senses,
    senseCount: senses.length,
    preview: senses
      .map((sense) => sense.gloss)
      .filter(Boolean)
      .join("；")
  };
}
