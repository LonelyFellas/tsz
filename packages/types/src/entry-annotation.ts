import type { MatchedEntryContextV3 } from "./surface-match";

export interface EntryAnnotationUpdate {
  entry_id: string;
  annotation?: string | null;
  base_annotation_revision: number;
}

export interface EntryAnnotationGroup {
  dialect_scope: string;
  normalized_surface: string;
  entry_ids: string[];
}

export interface EntryAnnotationConflict {
  reason: "required" | "duplicate" | "revision_conflict" | "group_changed";
  entries: MatchedEntryContextV3[];
  groups: EntryAnnotationGroup[];
}

export interface UpdateEntryAnnotationInput {
  annotation?: string | null;
  base_annotation_revision: number;
}

export interface EntryAnnotationResponse {
  entry_id: string;
  annotation: string | null;
  annotation_revision: number;
}
