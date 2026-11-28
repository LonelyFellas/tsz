import type {
  Dialect,
  NextEntry,
  WordFormTypeV3,
  PublishedSentenceTargetCandidateV3,
  SentenceTargetCandidateFormV3,
  SentenceTargetSenseV3
} from "@tsz/types";
import { expandFormContents, regionalVariants } from "@tsz/shared";
import { normalizeSentenceSurface } from "@/features/sentences/associationModel";

export interface NextTargetChoice {
  target_word_id: string;
  target_pos_id: string;
  target_base_form_id: string;
  target_form_id: string;
  target_variant_id: string;
  target_sense_id: string;
  target_dialect: Dialect;
  headword: string;
  gloss: string;
  form_type?: WordFormTypeV3;
  part_of_speech?: string;
}

export function nextTargetChoices(
  entry: NextEntry,
  literal: string,
  targetLocale: string,
  mediumLocale: string,
  componentWords = false
): NextTargetChoice[] {
  const editor = entry.draft.form_editor;
  if (!editor || (componentWords && entry.kind !== "word")) return [];
  const wanted = normalizeSentenceSurface(literal);
  const result: NextTargetChoice[] = [];
  for (const pos of expandFormContents(editor).pos) {
    const senses = entry.draft.senses.filter(
      (sense) => sense.part_of_speech === pos.pos
    );
    const firstBase = pos.forms.find((form) => form.form_type === "base");
    if (!firstBase) continue;
    for (const form of pos.forms) {
      const base = componentWords
        ? pos.forms.find(
            (candidate) =>
              candidate.form_type === "base" &&
              (candidate.id === form.id ||
                (form.form_type !== "base" &&
                  pos.form_groups.some(
                    (group) =>
                      group.members.some(
                        (member) => member.form_id === candidate.id
                      ) &&
                      group.members.some((member) => member.form_id === form.id)
                  )))
          )
        : firstBase;
      if (!base) continue;
      const matched = regionalVariants(form.regional_variants).filter(
        (variant) =>
          (targetLocale === "en-GB" || targetLocale === "en-US"
            ? variant.dialect === "common" ||
              variant.dialect === (targetLocale === "en-GB" ? "uk" : "us")
            : true) && normalizeSentenceSurface(variant.spelling) === wanted
      );
      for (const variant of matched) {
        for (const sense of senses) {
          const definition = sense.definitions.find(
            (row) =>
              row.locale === mediumLocale &&
              (!componentWords || row.text.trim())
          );
          const gloss =
            definition?.text ??
            (componentWords
              ? sense.equivalents.find(
                  (row) => row.locale === mediumLocale && row.text.trim()
                )?.text
              : undefined) ??
            "";
          if (componentWords && !gloss.trim()) continue;
          result.push({
            target_word_id: entry.id,
            target_pos_id: pos.pos_id,
            target_base_form_id: base.id,
            target_form_id: form.id,
            target_variant_id: variant.id,
            target_sense_id: sense.id,
            target_dialect: variant.dialect,
            headword: variant.spelling,
            gloss,
            ...(componentWords
              ? { form_type: form.form_type, part_of_speech: pos.pos }
              : {})
          });
        }
      }
    }
  }
  return result;
}

/** Converts a Next entry into the legacy candidate shape used by read-only summaries. */
export function nextTargetCandidate(
  entry: NextEntry,
  literal: string,
  targetLocale: string,
  mediumLocale: string
): PublishedSentenceTargetCandidateV3 | undefined {
  const choices = nextTargetChoices(entry, literal, targetLocale, mediumLocale);
  const first = choices[0];
  if (!first) return undefined;
  const forms: SentenceTargetCandidateFormV3[] = choices.map((choice) => ({
    form_id: choice.target_form_id,
    variant_id: choice.target_variant_id,
    form_type: "base",
    spelling: choice.headword,
    dialect: choice.target_dialect,
    base_form_ids: [choice.target_base_form_id],
    allowed_sense_ids: [choice.target_sense_id]
  }));
  const senses: SentenceTargetSenseV3[] = choices.map((choice) => ({
    sense_id: choice.target_sense_id,
    pos_id: choice.target_pos_id,
    base_form_id: choice.target_base_form_id,
    level: "A1",
    gloss: choice.gloss
  }));
  return {
    entry_id: entry.id,
    pos_id: first.target_pos_id,
    base_form_id: first.target_base_form_id,
    headword: first.headword,
    kind: entry.kind,
    pos:
      entry.draft.senses.find((sense) => sense.id === first.target_sense_id)
        ?.part_of_speech ?? "",
    matched_form_id: first.target_form_id,
    matched_variant_id: first.target_variant_id,
    matched_dialect: first.target_dialect,
    matched_form_type: "base",
    component_usages: [],
    forms,
    matches: [],
    senses
  };
}
