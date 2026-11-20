import type {
  Dialect,
  FormContentRegionalVariantsV3,
  FormRegionalBindingsV3,
  NextEntry,
  PublishedSentenceTargetCandidateV3,
  SentenceTargetCandidateFormV3,
  SentenceTargetSenseV3
} from "@tsz/types";
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
}

export function nextTargetChoices(
  entry: NextEntry,
  literal: string,
  targetLocale: string,
  mediumLocale: string
): NextTargetChoice[] {
  const editor = entry.draft.form_editor;
  if (!editor) return [];
  const wanted = normalizeSentenceSurface(literal);
  const result: NextTargetChoice[] = [];
  for (const pos of editor.pos) {
    const senses = entry.draft.senses.filter(
      (sense) => sense.part_of_speech === pos.pos
    );
    const base = pos.forms.find((form) => form.form_type === "base");
    if (!base) continue;
    for (const form of pos.forms) {
      const content = editor.contents.find(
        (item) => item.id === form.content_id
      );
      if (!content) continue;
      const variants = contentVariants(
        content.regional_variants,
        form.regional_bindings
      );
      const matched = variants.filter(
        (variant) =>
          (targetLocale === "en-GB" || targetLocale === "en-US"
            ? variant.dialect === "common" ||
              variant.dialect === (targetLocale === "en-GB" ? "uk" : "us")
            : true) && normalizeSentenceSurface(variant.spelling) === wanted
      );
      for (const variant of matched) {
        for (const sense of senses) {
          const definition = sense.definitions.find(
            (row) => row.locale === mediumLocale
          );
          result.push({
            target_word_id: entry.id,
            target_pos_id: pos.pos_id,
            target_base_form_id: base.id,
            target_form_id: form.id,
            target_variant_id: variant.id,
            target_sense_id: sense.id,
            target_dialect: variant.dialect,
            headword: variant.spelling,
            gloss: definition?.text ?? ""
          });
        }
      }
    }
  }
  return result;
}

function contentVariants(
  content: FormContentRegionalVariantsV3,
  bindings: FormRegionalBindingsV3
): Array<{ id: string; spelling: string; dialect: Dialect }> {
  if (content.mode === "common" && bindings.mode === "common") {
    return [{ ...content.common, id: bindings.common.id, dialect: "common" }];
  }
  if (content.mode === "uk_us" && bindings.mode === "uk_us") {
    return [
      { ...content.uk, id: bindings.uk.id, dialect: "uk" },
      { ...content.us, id: bindings.us.id, dialect: "us" }
    ];
  }
  if (content.mode === "uk_us_many" && bindings.mode === "uk_us_many") {
    return [
      ...content.uk.map((variant, index) => ({
        ...variant,
        id: bindings.uk[index]?.id ?? variant.id,
        dialect: "uk" as const
      })),
      ...content.us.map((variant, index) => ({
        ...variant,
        id: bindings.us[index]?.id ?? variant.id,
        dialect: "us" as const
      }))
    ];
  }
  return [];
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
