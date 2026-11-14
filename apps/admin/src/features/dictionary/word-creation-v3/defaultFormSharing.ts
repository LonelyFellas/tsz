import { regionalVariants } from "@tsz/shared";
import type {
  FormContentV3,
  PartOfSpeechCatalogResponse,
  SharedFormsStepContentV3
} from "@tsz/types";
import {
  assignSharedFormContent,
  createPronunciationReferenceIds
} from "./sharedFormsModel";
import { createStableVariantIdFactory } from "./operations";
import { expandFormContents } from "@tsz/shared";

// Only structural IDs are ignored. Audio, rich text, voice configuration and reading order count.
function contentValue(content: FormContentV3) {
  const regions = content.regional_variants;
  return {
    dialect_rules: content.dialect_rules,
    mode: regions.mode,
    uk_count: regions.mode === "uk_us_many" ? regions.uk.length : 1,
    variants: regionalVariants(regions).map(
      ({ id, origin, pronunciations, ...row }) => {
        void id;
        void origin;
        return {
          ...row,
          pronunciations: pronunciations.map(({ id, ...reading }) => {
            void id;
            return reading;
          })
        };
      }
    )
  };
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b))
        )
      : item
  );
}

/** A generated row can receive existing content; a dictionary/user row cannot be overwritten. */
function isEmptyTemplate(content: FormContentV3): boolean {
  return regionalVariants(content.regional_variants).every(
    (variant) =>
      variant.origin === "manual" &&
      Object.keys(variant).every((key) =>
        ["id", "spelling", "origin", "pronunciations"].includes(key)
      ) &&
      variant.pronunciations.length <= 1 &&
      variant.pronunciations.every(
        (row) =>
          !row.dict_phonetic &&
          !row.actual_pron &&
          row.style === "citation" &&
          Object.keys(row).every((key) =>
            ["id", "dict_phonetic", "actual_pron", "style"].includes(key)
          )
      )
  );
}

function compatible(source: FormContentV3, target: FormContentV3) {
  if (canonical(contentValue(source)) === canonical(contentValue(target)))
    return true;
  if (
    !isEmptyTemplate(source) ||
    source.regional_variants.mode !== target.regional_variants.mode ||
    (source.regional_variants.mode === "uk_us_many" &&
      target.regional_variants.mode === "uk_us_many" &&
      source.regional_variants.uk.length !==
        target.regional_variants.uk.length) ||
    canonical(source.dialect_rules) !== canonical(target.dialect_rules)
  )
    return false;
  const sourceRows = regionalVariants(source.regional_variants);
  const targetRows = regionalVariants(target.regional_variants);
  return (
    sourceRows.length === targetRows.length &&
    sourceRows.every(
      (row, index) =>
        !row.spelling || row.spelling === targetRows[index]!.spelling
    )
  );
}

/** Explicit new-label scope is required. Never call this from hydration or an ordinary edit. */
export function applyDefaultFormSharing(
  forms: SharedFormsStepContentV3,
  catalog: PartOfSpeechCatalogResponse | undefined,
  newFormIds: ReadonlySet<string>
): SharedFormsStepContentV3 {
  if (!catalog?.form_sharing || !newFormIds.size) return forms;
  let next = forms;
  const stableIds = createStableVariantIdFactory(expandFormContents(forms), []);
  const pronunciationIds = createPronunciationReferenceIds(forms);
  const labels = forms.pos.flatMap((pos) => {
    const part = catalog.items.find(
      (item) => item.kind === "word" && item.code === pos.pos
    );
    const first = pos.form_groups[0];
    if (!part || first?.scope !== "general") return [];
    return pos.forms.flatMap((form) => {
      if (!first.members.some((member) => member.form_id === form.id))
        return [];
      // Multiple dictionary rows of the same label retain their separate content.
      if (
        pos.forms.filter(
          (row) =>
            row.form_type === form.form_type &&
            first.members.some((member) => member.form_id === row.id)
        ).length > 1
      )
        return [];
      if (
        form.form_type !== "base" &&
        !(part.default_form_types ?? part.allowed_form_types ?? []).includes(
          form.form_type
        )
      )
        return [];
      const type = catalog.form_types?.find(
        (item) =>
          item.code === form.form_type &&
          (item.code === "base" || item.part_of_speech_id === part.id)
      );
      return type ? [{ id: form.id, partId: part.id, typeId: type.id }] : [];
    });
  });
  const binding = (id: string) =>
    next.pos.flatMap((pos) => pos.forms).find((form) => form.id === id)!;
  const content = (id: string) =>
    next.contents.find((row) => row.id === binding(id).content_id)!;
  for (const group of catalog.form_sharing.groups) {
    const members = labels.filter((label) =>
      group.members.some(
        (member) =>
          member.part_of_speech_id === label.partId &&
          member.form_type_id === label.typeId
      )
    );
    // Existing content wins; among new labels, filled dictionary rows precede empty templates.
    members.sort(
      (a, b) =>
        Number(newFormIds.has(a.id)) - Number(newFormIds.has(b.id)) ||
        Number(isEmptyTemplate(content(a.id))) -
          Number(isEmptyTemplate(content(b.id)))
    );
    for (let index = 0; index < members.length; index++) {
      const source = members[index]!;
      if (!newFormIds.has(source.id)) continue;
      const target = members
        .slice(0, index)
        .find(
          (candidate) =>
            binding(candidate.id).content_id !==
              binding(source.id).content_id &&
            compatible(content(source.id), content(candidate.id))
        );
      if (target)
        next = assignSharedFormContent(
          next,
          binding(target.id).content_id,
          source.id,
          stableIds,
          pronunciationIds
        );
    }
  }
  return next;
}
