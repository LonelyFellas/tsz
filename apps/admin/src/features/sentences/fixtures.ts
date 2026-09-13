import type {
  AdminWordV3,
  PublishedSentenceTargetCandidateV3,
  SentenceTarget
} from "@tsz/types";

export function sentenceWord(id = "entry", spelling = "make up"): AdminWordV3 {
  return {
    schema_version: 3,
    id,
    language: "en",
    kind: spelling.includes(" ") ? "phrase" : "word",
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    annotation: null,
    annotation_revision: 1,
    has_unpublished_changes: true,
    presentation: {
      label: spelling,
      matched_surfaces: [spelling],
      strategy_version: "test"
    },
    capabilities: {
      publication: { mode: "native" },
      pronunciation_normalization_version: "nfkc_trim_lower_v1"
    },
    forms: {
      pos: [
        {
          pos_id: "pos",
          pos: "verb",
          dialect_rules: { spelling_mode: "unified", phonetic_mode: "unified" },
          forms: [
            {
              id: "base",
              form_type: "base",
              regional_variants: {
                mode: "common",
                common: {
                  id: "variant",
                  dialect: "common",
                  spelling,
                  origin: "manual",
                  pronunciations: []
                }
              }
            }
          ],
          form_groups: []
        }
      ]
    },
    meanings: {
      sense_groups: [],
      pos: [
        {
          pos_id: "pos",
          grammar_structures: [],
          senses: [
            {
              id: "sense",
              sub_pos: "",
              level: "B1",
              depends_on_context: false,
              definitions: [
                {
                  definition_mode: "zh_definition",
                  id: "definition",
                  content_id: "definition-text",
                  level: "B1",
                  content: {
                    version: 2,
                    text: "编造（故事、借口等）",
                    annotations: []
                  }
                }
              ],
              sentences: [],
              relations: []
            }
          ]
        }
      ]
    },
    completed_steps: ["basics", "forms", "meanings"],
    max_reachable_step: "preview",
    created_by: "admin",
    created_at: "2026-09-13T00:00:00Z",
    updated_at: "2026-09-13T00:00:00Z"
  };
}
export function sentenceTarget(
  id = "entry"
): Extract<SentenceTarget, { state: "linked" }> {
  return {
    state: "linked",
    target_entry_id: id,
    target_pos_id: "pos",
    target_base_form_id: "base",
    target_form_id: "base",
    target_variant_id: "variant",
    target_sense_id: "sense"
  };
}
export function sentenceCandidate(
  id = "entry",
  spelling = "make up"
): PublishedSentenceTargetCandidateV3 {
  return {
    entry_id: id,
    headword: spelling,
    kind: spelling.includes(" ") ? "phrase" : "word",
    pos: "verb",
    pos_id: "pos",
    base_form_id: "base",
    matched_form_id: "base",
    matched_variant_id: "variant",
    matched_dialect: "common",
    matched_form_type: "base",
    component_usages: [],
    forms: [
      {
        form_id: "base",
        variant_id: "variant",
        form_type: "base",
        spelling,
        dialect: "common",
        base_form_ids: ["base"]
      }
    ],
    matches: [
      {
        surface: spelling,
        normalized_surface: spelling,
        match_kind: spelling.includes(" ") ? "contiguous_phrase" : "word"
      }
    ],
    senses: [
      {
        sense_id: "sense",
        pos_id: "pos",
        base_form_id: "base",
        level: "B1",
        gloss: "编造（故事、借口等）"
      }
    ]
  };
}
