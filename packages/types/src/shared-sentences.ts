import type {
  SentenceSourceRangeV3,
  WordSentenceWritableV3
} from "./admin-word-v3";

export type SentenceTarget =
  | { state: "linked"; target_entry_id: string }
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
  content: SharedSentenceContent;
}
export interface UpdateSharedSentence {
  base_revision: number;
  content: SharedSentenceContent;
}
export interface SentenceRevision {
  base_revision: number;
}
export interface CollectSharedSentence {
  base_revision: number;
  entry_id: string;
  annotation_ids: string[];
}
export interface SharedSentenceEntry {
  id: string;
  headword: string;
  kind: string;
  collected: boolean;
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
  q?: string;
  level?: string;
  created_from?: string;
  created_to?: string;
  entry_id?: string;
  candidates?: boolean;
  page?: number;
  page_size?: number;
}
export interface SharedSentenceList {
  items: SharedSentence[];
  total: number;
}
