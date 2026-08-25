import type { AdminWordStatus, Dialect, WordFormType } from "./admin-word";
import type { EntryPresentationV3, WordFormTypeV3 } from "./admin-word-v3";

/** Surface warning wire types; 1:1 mirror of the Rust OpenAPI schemas. */
export type SurfaceContentScopeV2 = "draft" | "current_publication";
export type SurfaceConfirmationReasonV2 =
  "unacknowledged_surface_matches" | "visibility_activation";
export type SurfaceMatchCategoryV2 =
  | "exact_headword"
  | "cross_kind_headword"
  | "headword_form"
  | "form_headword"
  | "form_form";
export type SurfaceAttentionLevelV2 = "high" | "normal";
export type SurfacePolicyNameV2 =
  | "surface_warning_acknowledgement"
  | "allow_new_exact_headword_entries"
  | "allow_multiple_active_exact_headword_publications";
export type SurfacePolicyBlockCodeV2 =
  | "exact_headword_creation_temporarily_disabled"
  | "multiple_active_exact_headword_publications_not_enabled";

export type SurfaceMatchCandidateV2 =
  | {
      candidate_type: "headword";
      candidate_ref: string;
      candidate_word_id?: string;
      surface: string;
      normalized_surface: string;
      dialect: Dialect;
      entry_kind: "word" | "phrase";
    }
  | {
      candidate_type: "form";
      candidate_ref: string;
      candidate_word_id: string;
      candidate_node_id: string;
      surface: string;
      normalized_surface: string;
      dialect: Dialect;
      pos_id: string;
      pos: string;
      form_type: WordFormType;
    };

export type ExistingSurfaceSourceV2 =
  | {
      source_kind: "headword";
      source_id: string;
      content_scope: SurfaceContentScopeV2;
      surface: string;
      dialect: Dialect;
    }
  | {
      source_kind: "form";
      source_id: string;
      source_node_id: string;
      content_scope: SurfaceContentScopeV2;
      surface: string;
      dialect: Dialect;
      pos_id: string;
      pos: string;
      form_type: WordFormType;
    };

export interface ExistingSurfaceMatchV2 {
  word_id: string;
  headword: string;
  kind: "word" | "phrase";
  status: AdminWordStatus;
  source: ExistingSurfaceSourceV2;
}

export interface LexiconSurfaceMatchV2 {
  match_id: string;
  match_category: SurfaceMatchCategoryV2;
  severity: "warning";
  attention_level: SurfaceAttentionLevelV2;
  can_continue: true;
  confirmation_reasons: SurfaceConfirmationReasonV2[];
  candidate: SurfaceMatchCandidateV2;
  existing: ExistingSurfaceMatchV2;
}

export interface RelationReferenceSummaryV2 {
  total: number;
  by_type: {
    synonym: number;
    antonym: number;
    derivative: number;
  };
  previews: Array<{
    source_word_id: string;
    source_headword: string;
    relation: "synonym" | "antonym" | "derivative";
  }>;
  truncated: boolean;
}

export interface MatchedEntryContextV2 {
  word_id: string;
  pos_labels: string[];
  gloss_previews: string[];
  updated_at: string;
  inbound_relations: RelationReferenceSummaryV2;
}

export interface SurfaceMatchPageBaseV2 {
  schema_version: 2;
  snapshot_id: string;
  items: LexiconSurfaceMatchV2[];
  total: number;
  matched_entry_contexts: MatchedEntryContextV2[];
  confirmation_reasons: SurfaceConfirmationReasonV2[];
  policy_name: SurfacePolicyNameV2;
  policy_epoch: number;
}

export type SurfaceMatchPageV2 = SurfaceMatchPageBaseV2 &
  (
    | {
        continuation_policy: "enabled";
        next_cursor: string;
      }
    | {
        continuation_policy: "enabled";
        next_cursor: null;
        surface_confirmation_token: string;
        impact_confirmation_token?: string;
      }
    | {
        continuation_policy: "temporarily_disabled";
        next_cursor: string | null;
        policy_block_code: SurfacePolicyBlockCodeV2;
      }
  );

export interface FormSurfaceMatchV3 {
  source_schema_version: 3;
  entry_id: string;
  status: AdminWordStatus;
  content_scope: SurfaceContentScopeV2;
  pos_id: string;
  group_ids: string[];
  form_id: string;
  variant_id: string;
  form_type: WordFormTypeV3;
  dialect: Dialect;
  spelling: string;
  publication_id?: string;
}

export interface LegacySurfaceMatchV3 {
  source_schema_version: 2;
  existing: ExistingSurfaceMatchV2;
  publication_id?: string;
}

export type SurfaceMatchItemV3 =
  | { match_kind: "legacy_v2"; match: LegacySurfaceMatchV3 }
  | { match_kind: "form_variant_v3"; match: FormSurfaceMatchV3 };

export interface RelationReferencePreviewV3 {
  source_entry_id: string;
  source_presentation: EntryPresentationV3;
  source_status: AdminWordStatus;
  relation: "synonym" | "antonym" | "derivative";
}

export interface RelationReferenceSummaryV3 {
  total: number;
  by_type: {
    synonym: number;
    antonym: number;
    derivative: number;
  };
  previews: RelationReferencePreviewV3[];
  truncated: boolean;
}

export interface MatchedEntryContextV3 {
  entry_id: string;
  presentation: EntryPresentationV3;
  pos_labels: string[];
  gloss_previews: string[];
  updated_at: string;
  inbound_relations: RelationReferenceSummaryV3;
}

export interface SurfaceMatchPageBaseV3 {
  schema_version: 3;
  snapshot_id: string;
  items: SurfaceMatchItemV3[];
  total: number;
  matched_entry_contexts: MatchedEntryContextV3[];
  confirmation_reasons: SurfaceConfirmationReasonV2[];
  policy_name: SurfacePolicyNameV2;
  policy_epoch: number;
}

export type SurfaceMatchEnabledNextPageV3 = SurfaceMatchPageBaseV3 & {
  continuation_policy: "enabled";
  next_cursor: string;
};

export type SurfaceMatchEnabledTerminalPageV3 = SurfaceMatchPageBaseV3 & {
  continuation_policy: "enabled";
  next_cursor: null;
  surface_confirmation_token: string;
  impact_confirmation_token?: string;
};

export type SurfaceMatchTemporarilyDisabledPageV3 = SurfaceMatchPageBaseV3 & {
  continuation_policy: "temporarily_disabled";
  next_cursor: string | null;
  policy_block_code: SurfacePolicyBlockCodeV2;
};

export type SurfaceMatchPageV3 =
  | SurfaceMatchEnabledNextPageV3
  | SurfaceMatchEnabledTerminalPageV3
  | SurfaceMatchTemporarilyDisabledPageV3;

export type SurfaceMatchPageAny = SurfaceMatchPageV2 | SurfaceMatchPageV3;
