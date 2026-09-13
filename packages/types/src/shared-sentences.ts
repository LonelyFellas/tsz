import type {
  SentenceSourceRangeV3,
  WordSentenceWritableV3
} from "./admin-word-v3";

export type SentenceTarget =
  | {
      state: "linked";
      target_entry_id: string;
      target_pos_id: string;
      target_base_form_id: string;
      target_form_id: string;
      target_variant_id: string;
      target_sense_id: string;
      target_publication_id?: string;
    }
  | { state: "entry_only"; target_entry_id: string }
  | { state: "pending"; kind: string; headword: string; gloss?: string | null };
export interface SharedSentenceAnnotation {
  id: string;
  source_dialect: string;
  source_segments: SentenceSourceRangeV3[];
  target: SentenceTarget;
}
export interface SharedSentenceContent {
  sentence: WordSentenceWritableV3;
  annotations: SharedSentenceAnnotation[];
}
export interface CreateSharedSentence {
  source_entry_id: string;
  source_sense_id: string;
  content: SharedSentenceContent;
}
export interface UpdateSharedSentence {
  base_revision: number;
  context_entry_id?: string;
  context_sense_id?: string;
  content: SharedSentenceContent;
}
export interface SentenceRevision {
  base_revision: number;
}
export interface UnlinkSentenceSense extends SentenceRevision {
  sense_id: string;
}
export interface SharedSentenceEntry {
  id: string;
  headword: string;
  kind: string;
  senses: { id: string; gloss: string }[];
}
export interface SentenceEntryTarget extends Omit<
  SharedSentenceEntry,
  "senses"
> {
  surfaces: { surface: string; dialect: string }[];
}
export interface SentenceEntryTargets {
  items: SentenceEntryTarget[];
  total: number;
}
export interface SentenceTargetQuery {
  entry_id?: string;
  context_entry_id?: string;
  q?: string;
  kind?: string;
  dialect?: string;
  page?: number;
}
export interface SharedSentence {
  id: string;
  revision: number;
  content: SharedSentenceContent;
  entries: SharedSentenceEntry[];
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface SentenceListQuery {
  sense_id?: string;
  q?: string;
  level?: string;
  created_from?: string;
  created_to?: string;
  entry_id?: string;
  page?: number;
  page_size?: number;
}
export interface SharedSentenceList {
  items: SharedSentence[];
  total: number;
}
