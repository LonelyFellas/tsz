import type {
  AdminWordAny,
  AdminWordStatus,
  LexiconSurfaceMatchV2,
  MatchedEntryContextV2,
  MatchedEntryContextV3,
  SurfaceMatchItemV3,
  WordHeadwordsV2
} from "@tsz/types";

export interface DetectedBaseForm {
  key: string;
  schemaVersion: 2 | 3;
  entryId: string;
  formId: string;
  status: AdminWordStatus;
  label: string;
  spellings: string[];
  posLabels: string[];
  glossPreviews: string[];
}

type SurfaceItem = LexiconSurfaceMatchV2 | SurfaceMatchItemV3;
type SurfaceContext = MatchedEntryContextV2 | MatchedEntryContextV3;

function addUnique(values: string[], value: string) {
  const trimmed = value.trim();
  if (trimmed && !values.includes(trimmed)) values.push(trimmed);
}

export function extractDetectedBaseForms(
  schemaVersion: 2 | 3,
  items: SurfaceItem[],
  contexts: SurfaceContext[]
): DetectedBaseForm[] {
  const contextByEntry = new Map(
    contexts.map((context) => [
      "entry_id" in context ? context.entry_id : context.word_id,
      context
    ])
  );
  const candidates = new Map<string, DetectedBaseForm>();

  const add = (candidate: DetectedBaseForm, spelling: string) => {
    const existing = candidates.get(candidate.key);
    if (existing) {
      addUnique(existing.spellings, spelling);
      if (candidate.schemaVersion === 3) {
        candidate.posLabels.forEach((label) =>
          addUnique(existing.posLabels, label)
        );
        candidate.glossPreviews.forEach((gloss) =>
          addUnique(existing.glossPreviews, gloss)
        );
      }
      return;
    }
    addUnique(candidate.spellings, spelling);
    candidates.set(candidate.key, candidate);
  };

  for (const item of items) {
    if (schemaVersion === 2) {
      if (!("match_id" in item)) continue;
      const source = item.existing.source;
      if (source.source_kind !== "form" || source.form_type !== "base") {
        continue;
      }
      const context = contextByEntry.get(item.existing.word_id);
      add(
        {
          key: `2:${item.existing.word_id}:${source.source_node_id}`,
          schemaVersion: 2,
          entryId: item.existing.word_id,
          formId: source.source_node_id,
          status: item.existing.status,
          label: item.existing.headword,
          spellings: [],
          posLabels:
            context && "word_id" in context ? context.pos_labels : [source.pos],
          glossPreviews:
            context && "word_id" in context ? context.gloss_previews : []
        },
        source.surface
      );
      continue;
    }

    if ("match_id" in item) continue;
    if (item.match_kind === "form_variant_v3") {
      const match = item.match;
      if (match.form_type !== "base") continue;
      const context = contextByEntry.get(match.entry_id);
      add(
        {
          key: `3:${match.entry_id}`,
          schemaVersion: 3,
          entryId: match.entry_id,
          formId: match.form_id,
          status: match.status,
          label:
            context && "entry_id" in context
              ? context.presentation.label
              : match.spelling,
          spellings: [],
          posLabels: context && "entry_id" in context ? context.pos_labels : [],
          glossPreviews:
            context && "entry_id" in context ? context.gloss_previews : []
        },
        match.spelling
      );
      continue;
    }

    const existing = item.match.existing;
    const source = existing.source;
    if (source.source_kind !== "form" || source.form_type !== "base") {
      continue;
    }
    add(
      {
        key: `2:${existing.word_id}:${source.source_node_id}`,
        schemaVersion: 2,
        entryId: existing.word_id,
        formId: source.source_node_id,
        status: existing.status,
        label: existing.headword,
        spellings: [],
        posLabels: [source.pos],
        glossPreviews: []
      },
      source.surface
    );
  }

  return [...candidates.values()];
}

function regionalFromVariants(
  variants: Array<{ dialect: "common" | "uk" | "us"; spelling: string }>
): WordHeadwordsV2 | undefined {
  const common = variants.find((variant) => variant.dialect === "common");
  if (common) return { mode: "unified", common: common.spelling };
  const uk = variants.find((variant) => variant.dialect === "uk");
  const us = variants.find((variant) => variant.dialect === "us");
  if (!uk || !us) return undefined;
  return {
    mode: "distinguish",
    uk: uk.spelling,
    us: us.spelling,
    source_dialect: "us"
  };
}

export function resolveDetectedBaseForm(
  word: AdminWordAny,
  candidate: DetectedBaseForm
): WordHeadwordsV2 | undefined {
  if (
    word.id !== candidate.entryId ||
    word.schema_version !== candidate.schemaVersion
  ) {
    return undefined;
  }
  if (word.schema_version === 2) {
    const form = word.forms.pos
      .map((pos) => pos.base_form)
      .find(
        (baseForm) =>
          baseForm.id === candidate.formId ||
          baseForm.variants.some((variant) => variant.id === candidate.formId)
      );
    return form ? regionalFromVariants(form.variants) : undefined;
  }
  const form = word.forms.pos
    .flatMap((pos) => pos.forms)
    .find(
      (concreteForm) =>
        concreteForm.id === candidate.formId &&
        concreteForm.form_type === "base"
    );
  if (!form) return undefined;
  return form.regional_variants.mode === "common"
    ? {
        mode: "unified",
        common: form.regional_variants.common.spelling
      }
    : {
        mode: "distinguish",
        uk: form.regional_variants.uk.spelling,
        us: form.regional_variants.us.spelling,
        source_dialect: "us"
      };
}
