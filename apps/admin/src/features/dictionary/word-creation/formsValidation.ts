import type {
  WordFormSlotV2,
  WordHeadwordsV2,
  WordPosFormsV2
} from "@tsz/types";

function expectedDialects(rules: WordPosFormsV2["dialect_rules"]) {
  return rules.spelling_mode === "distinguish" ||
    rules.phonetic_mode === "distinguish"
    ? (["uk", "us"] as const)
    : (["common"] as const);
}

export interface FormIssueTarget {
  node_id: string;
  field: string;
}

function invalidSpelling(value: string): boolean {
  return (
    value.trim() !== value || value.length === 0 || [...value].length > 200
  );
}

function invalidPronunciation(value: string): boolean {
  return value.trim().length === 0 || [...value].length > 200;
}

export function formSlotIssueTarget(
  slot: WordFormSlotV2,
  rules: WordPosFormsV2["dialect_rules"]
): FormIssueTarget | undefined {
  const expected = expectedDialects(rules);
  const actual = new Set(slot.variants.map((variant) => variant.dialect));
  const missingDialect = expected.find((dialect) => !actual.has(dialect));
  if (missingDialect) {
    return {
      node_id: slot.id,
      field: `variants.${missingDialect}`
    };
  }
  if (
    slot.variants.length !== expected.length ||
    actual.size !== expected.length
  ) {
    return { node_id: slot.id, field: "variants" };
  }
  for (const dialect of expected) {
    const variant = slot.variants.find((item) => item.dialect === dialect)!;
    if (invalidSpelling(variant.spelling)) {
      return {
        node_id: slot.id,
        field: `variants.${dialect}.spelling`
      };
    }
    if (variant.pronunciations.length === 0) {
      return { node_id: variant.id, field: "pronunciations" };
    }
    for (const pronunciation of variant.pronunciations) {
      if (invalidPronunciation(pronunciation.dict_phonetic)) {
        return { node_id: pronunciation.id, field: "dict_phonetic" };
      }
      if (invalidPronunciation(pronunciation.actual_pron)) {
        return { node_id: pronunciation.id, field: "actual_pron" };
      }
    }
  }
  return undefined;
}

export function formSlotComplete(
  slot: WordFormSlotV2,
  rules: WordPosFormsV2["dialect_rules"]
): boolean {
  return !formSlotIssueTarget(slot, rules);
}

export function baseFormIssueTarget(
  pos: WordPosFormsV2,
  headwords?: WordHeadwordsV2
): FormIssueTarget | undefined {
  const issue = formSlotIssueTarget(pos.base_form, pos.dialect_rules);
  if (issue) return issue;
  if (!headwords) return undefined;
  for (const variant of pos.base_form.variants) {
    const expected =
      headwords.mode === "unified"
        ? headwords.common
        : variant.dialect === "uk"
          ? headwords.uk
          : variant.dialect === "us"
            ? headwords.us
            : undefined;
    if (variant.spelling !== expected) {
      return {
        node_id: pos.base_form.id,
        field: `variants.${variant.dialect}.spelling`
      };
    }
  }
  return undefined;
}

export function baseFormComplete(
  pos: WordPosFormsV2,
  headwords?: WordHeadwordsV2
): boolean {
  return !baseFormIssueTarget(pos, headwords);
}
