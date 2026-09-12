import type {
  AdminWordV3,
  AdminWordStatus,
  MatchedEntryContextV3,
  SurfaceMatchItemV3,
  WordHeadwordsV2
} from "@tsz/types";

export interface DetectedBaseForm {
  key: string;
  entryId: string;
  formId: string;
  status: AdminWordStatus;
  label: string;
  spellings: string[];
  posLabels: string[];
  glossPreviews: string[];
}

type SurfaceItem = SurfaceMatchItemV3;
type SurfaceContext = MatchedEntryContextV3;

function addUnique(values: string[], value: string) {
  const trimmed = value.trim();
  if (trimmed && !values.includes(trimmed)) values.push(trimmed);
}

export function extractDetectedBaseForms(
  items: SurfaceItem[],
  contexts: SurfaceContext[]
): DetectedBaseForm[] {
  const contextByEntry = new Map(
    contexts.map((context) => [context.entry_id, context])
  );
  const candidates = new Map<string, DetectedBaseForm>();

  const add = (candidate: DetectedBaseForm, spelling: string) => {
    const existing = candidates.get(candidate.key);
    if (existing) {
      addUnique(existing.spellings, spelling);
      candidate.posLabels.forEach((label) =>
        addUnique(existing.posLabels, label)
      );
      candidate.glossPreviews.forEach((gloss) =>
        addUnique(existing.glossPreviews, gloss)
      );
      return;
    }
    addUnique(candidate.spellings, spelling);
    candidates.set(candidate.key, candidate);
  };

  for (const item of items) {
    const match = item.match;
    if (match.form_type !== "base") continue;
    const context = contextByEntry.get(match.entry_id);
    add(
      {
        key: `3:${match.entry_id}`,
        entryId: match.entry_id,
        formId: match.form_id,
        status: match.status,
        label: context ? context.presentation.label : match.spelling,
        spellings: [],
        posLabels: context ? context.pos_labels : [],
        glossPreviews: context ? context.gloss_previews : []
      },
      match.spelling
    );
  }

  return [...candidates.values()];
}

export function resolveDetectedBaseForm(
  word: AdminWordV3,
  candidate: DetectedBaseForm
): WordHeadwordsV2 | undefined {
  if (word.id !== candidate.entryId) return undefined;
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
