import {
  defaultLexiconEditorTranslation as creationDefaultT,
  type LexiconEditorTranslation as CreationTranslation
} from "../i18n/editor";
import { headwordIssue } from "./headwordValidation";

export type ClassifiedEntryInput = {
  normalized: string;
  kind: "word" | "phrase";
};

export type ValidatedEntryInput = ClassifiedEntryInput & { issue?: string };

/** Product-only routing decision; backend detection remains authoritative. */
export function classifyEntryInput(raw: string): ClassifiedEntryInput {
  const normalized = raw.trim().replace(/\s+/gu, " ");
  return {
    normalized,
    kind: normalized.includes(" ") ? "phrase" : "word"
  };
}

/** Step 1 与关联词共用的英文词条输入准备规则。 */
export function validateEntryInput(
  raw: string,
  t: CreationTranslation = creationDefaultT
): ValidatedEntryInput {
  const classified = classifyEntryInput(raw);
  const issue = !classified.normalized
    ? t("creation_enter_a_word_or_phrase")
    : (headwordIssue(classified.normalized, t) ??
      (classified.normalized.length > 200
        ? t("creation_entries_cannot_exceed_200_characters")
        : undefined));
  return {
    ...classified,
    ...(issue ? { issue } : {})
  };
}
