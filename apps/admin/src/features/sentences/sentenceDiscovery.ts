import type {
  Dialect,
  PublishedSentenceTargetCandidateV3,
  ResolveSentenceTargetsV3Input,
  ResolveSentenceTargetsV3Response
} from "@tsz/types";
import type {
  V3SentenceTargetDiscoveryCandidate,
  V3SentenceTargetDiscoveryOccurrence,
  V3SentenceTargetDiscoveryRequest,
  V3SentenceTargetDiscoveryResult,
  V3SentenceTargetDiscoverySense
} from "../dictionary/word-creation-v3/components/V3SentenceTargetDiscovery";
import { linkedSentenceAnnotation } from "./associationModel";

export function discoveryInput(
  request: V3SentenceTargetDiscoveryRequest
): ResolveSentenceTargetsV3Input {
  const common = {
    schema_version: 3 as const,
    sentence_text: request.sentenceText,
    source_dialect: request.dialect,
    page_size_per_range: 50
  };
  return request.mode === "all_published_targets"
    ? { ...common, mode: request.mode }
    : {
        ...common,
        mode: request.mode,
        selected_segments: request.segments,
        include_drafts: request.scope === "published_and_draft",
        ...(request.cursor ? { cursor: request.cursor } : {})
      };
}

interface Labels {
  pos: (code: string) => string;
  form: (code: string) => string;
}

function discoveryCandidate(
  candidate: PublishedSentenceTargetCandidateV3,
  labels: Labels
): V3SentenceTargetDiscoveryCandidate {
  const matched = candidate.forms.find(
    (form) =>
      form.form_id === candidate.matched_form_id &&
      form.variant_id === candidate.matched_variant_id
  );
  const bases = candidate.forms.filter(
    (form) => form.form_id === candidate.base_form_id
  );
  const base =
    bases.find(
      (form) =>
        form.dialect === candidate.matched_dialect || form.dialect === "common"
    ) ?? bases[0];
  if (
    !matched ||
    !base ||
    !matched.base_form_ids.includes(candidate.base_form_id)
  ) {
    throw new Error("候选词形身份不完整，请重新查询");
  }
  const senses = candidate.senses
    .filter(
      (sense) =>
        sense.pos_id === candidate.pos_id &&
        sense.base_form_id === candidate.base_form_id &&
        (matched.allowed_sense_ids === undefined ||
          matched.allowed_sense_ids.includes(sense.sense_id))
    )
    .map((sense) => {
      if (sense.publication_id !== candidate.publication_id)
        throw new Error("候选词义发布状态不一致，请重新查询");
      return {
        id: sense.sense_id,
        gloss: sense.gloss,
        componentUsages: sense.component_usages
      };
    });
  return {
    id: JSON.stringify([
      candidate.entry_id,
      candidate.pos_id,
      candidate.base_form_id,
      candidate.matched_variant_id,
      candidate.publication_id ? "published" : "draft"
    ]),
    entryId: candidate.entry_id,
    posId: candidate.pos_id,
    baseFormId: candidate.base_form_id,
    kind: candidate.kind,
    publicationId: candidate.publication_id,
    headword: candidate.headword,
    baseForm: base.spelling,
    matchedForm: matched.spelling,
    posLabel: labels.pos(candidate.pos),
    formTypeLabel: labels.form(candidate.matched_form_type),
    matchedFormType: candidate.matched_form_type,
    matchedDialect: candidate.matched_dialect,
    matchedFormId: candidate.matched_form_id,
    matchedVariantId: candidate.matched_variant_id,
    state: candidate.publication_id ? "published" : "draft",
    senses,
    senseTotal: senses.length,
    componentUsages: candidate.component_usages
  };
}

export function discoveryResult(
  response: ResolveSentenceTargetsV3Response,
  dialect: Dialect,
  labels: Labels
): V3SentenceTargetDiscoveryResult {
  return {
    complete: response.completeness === "complete",
    overloaded: response.completeness === "overloaded",
    occurrences: response.range_results.map((range) => ({
      id: `${dialect}:${range.segments_fingerprint}`,
      kind:
        range.source_segments.length > 1
          ? "separable_phrase"
          : range.normalized_surface.includes(" ")
            ? "phrase"
            : "word",
      surface: range.source_segments
        .map((segment) => segment.surface)
        .join(" … "),
      segments: range.source_segments,
      candidates: [...range.published_matches, ...range.draft_matches].map(
        (candidate) => discoveryCandidate(candidate, labels)
      ),
      publishedTotal: range.published_total,
      draftTotal: range.draft_total,
      nextCursor: range.next_cursor
    }))
  };
}

export function discoveredAnnotation(
  dialect: Dialect,
  occurrence: V3SentenceTargetDiscoveryOccurrence,
  candidate: V3SentenceTargetDiscoveryCandidate,
  sense: V3SentenceTargetDiscoverySense
) {
  if (!candidate.senses.some((item) => item.id === sense.id))
    throw new Error("请选择候选中的具体词义");
  return linkedSentenceAnnotation(dialect, occurrence.segments, {
    state: "resolved",
    target_word_id: candidate.entryId,
    target_pos_id: candidate.posId,
    target_base_form_id: candidate.baseFormId,
    target_form_id: candidate.matchedFormId,
    target_variant_id: candidate.matchedVariantId,
    target_sense_id: sense.id,
    target_dialect: candidate.matchedDialect,
    target_form_type: candidate.matchedFormType,
    ...(candidate.publicationId
      ? { target_publication_id: candidate.publicationId }
      : {}),
    target_headword: candidate.headword,
    target_gloss: sense.gloss
  });
}
