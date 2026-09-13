import type {
  AdminWordV3,
  SentenceTarget,
  SentenceEntryTarget,
  SharedSentenceAnnotation,
  SentenceSourceRangeV3
} from "@tsz/types";
import {
  associationWords,
  codePointSlice,
  rangesOverlap,
  wordSegments
} from "@tsz/voice-editor/core";

// Mirrors the backend's versioned headword normalization for immediate feedback.
export const normalizeSentenceSurface = (text: string) =>
  text
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/[‘’ʼ]/gu, "'")
    .replace(/[‐‑‒–—−]/gu, "-")
    .toLowerCase();

export function matchesSentenceTarget(
  text: string,
  segments: SentenceSourceRangeV3[],
  dialect: string,
  target: SentenceEntryTarget
): boolean {
  const words = associationWords(text);
  if (
    !segments.length ||
    segments.some(
      (segment, index) =>
        segment.start < (segments[index - 1]?.end ?? 0) ||
        codePointSlice(text, segment.start, segment.end) !== segment.surface ||
        !words.some((word) => word.start === segment.start) ||
        !words.some((word) => word.end === segment.end)
    )
  )
    return false;
  if (
    /[.!?;:\n\r。！？；：]/u.test(
      codePointSlice(text, segments[0]!.start, segments.at(-1)!.end)
    )
  )
    return false;
  const literal = segments.map((segment) => segment.surface).join(" ");
  if (target.kind === "word" && associationWords(literal).length !== 1)
    return false;
  return target.surfaces.some(
    (form) =>
      (dialect === "common" || form.dialect === dialect) &&
      normalizeSentenceSurface(form.surface) ===
        normalizeSentenceSurface(literal)
  );
}

export function currentSentenceCandidates(
  text: string,
  dialect: string,
  target: SentenceEntryTarget,
  annotations: SharedSentenceAnnotation[]
): SentenceSourceRangeV3[][] {
  const words = associationWords(text);
  const result: SentenceSourceRangeV3[][] = [];
  const lengths = new Set(
    target.surfaces.map((form) => associationWords(form.surface).length)
  );
  for (let start = 0; start < words.length; start++) {
    for (const length of lengths) {
      if (!length || start + length > words.length) continue;
      const segments = wordSegments(text, words.slice(start, start + length));
      if (
        matchesSentenceTarget(text, segments, dialect, target) &&
        !annotations.some(
          (a) =>
            a.source_dialect === dialect &&
            rangesOverlap(a.source_segments, segments)
        )
      )
        result.push(segments);
    }
  }
  return result;
}

export function savedSenseTargets(word: AdminWordV3, senseId: string) {
  const pos = word.meanings.pos.find((row) =>
    row.senses.some((sense) => sense.id === senseId)
  );
  const sense = pos?.senses.find((item) => item.id === senseId);
  const forms = word.forms.pos.find((row) => row.pos_id === pos?.pos_id);
  if (!sense || !forms) return [];
  const definition = sense.definitions.find(
    (item) =>
      item.definition_mode === "zh_definition" ||
      item.definition_mode === "zh_sentence"
  );
  const gloss =
    definition?.definition_mode === "zh_definition" ||
    definition?.definition_mode === "zh_sentence"
      ? definition.content.text
      : "暂无释义";
  return forms.forms.flatMap((form) => {
    const bases =
      form.form_type === "base"
        ? [form]
        : forms.forms.filter(
            (base) =>
              base.form_type === "base" &&
              forms.form_groups.some(
                (group) =>
                  group.members.some((member) => member.form_id === base.id) &&
                  group.members.some((member) => member.form_id === form.id)
              )
          );
    const variants =
      form.regional_variants.mode === "common"
        ? [form.regional_variants.common]
        : [form.regional_variants.uk, form.regional_variants.us];
    return bases.flatMap((base) =>
      variants.map((variant) => ({
        target: {
          state: "linked",
          target_entry_id: word.id,
          target_pos_id: forms.pos_id,
          target_base_form_id: base.id,
          target_form_id: form.id,
          target_variant_id: variant.id,
          target_sense_id: senseId
        } satisfies Extract<SentenceTarget, { state: "linked" }>,
        gloss,
        surface: {
          id: word.id,
          headword: variant.spelling,
          kind: word.kind,
          surfaces: (variant.dialect === "common"
            ? ["uk", "us"]
            : [variant.dialect]
          ).map((dialect) => ({ dialect, surface: variant.spelling }))
        } satisfies SentenceEntryTarget
      }))
    );
  });
}

export function sameSentenceTarget(
  left: SentenceTarget,
  right: SentenceTarget
) {
  return (
    left.state === "linked" &&
    right.state === "linked" &&
    left.target_entry_id === right.target_entry_id &&
    left.target_sense_id === right.target_sense_id &&
    left.target_pos_id === right.target_pos_id &&
    left.target_base_form_id === right.target_base_form_id &&
    left.target_form_id === right.target_form_id &&
    left.target_variant_id === right.target_variant_id
  );
}
