import type {
  SentenceSourceRangeV3,
  WordSentenceWritableV3
} from "./admin-word-v3";
import type { Dialect } from "./admin-word";

export type SentenceTarget =
  | {
      state: "linked";
      target_entry_id: string;
      target_pos_id: string;
      target_base_form_id: string;
      target_form_id: string;
      target_variant_id: string;
      target_sense_id: string;
      /** 目标变体的方言侧。变体实例 id 随英美结构切换而变，引用按「词形 + 方言侧」重解析时需要它。 */
      target_dialect?: Dialect;
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
  lifecycle_revision: number;
  current_publication_id?: string | null;
  withdrawn_at?: string | null;
  withdrawn_reason?: string | null;
  view: "draft" | "published";
  content: SharedSentenceContent;
  entries: SharedSentenceEntry[];
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface SentenceListQuery {
  view?: "draft" | "published";
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

export interface SentencePublicationInput {
  base_revision: number;
  base_lifecycle_revision: number;
}
export interface SentenceBatchItem extends SentencePublicationInput {
  sentence_id: string;
}
export interface SentencePublication {
  id: string;
  sentence_id: string;
  publication_number: number;
  source_revision: number;
  snapshot: SharedSentenceContent;
  published_at: string;
  published_by_admin_id: string;
  rollback_of_publication_id?: string | null;
}
export interface SentenceWithdrawalImpact {
  sentence_id: string;
  lifecycle_revision: number;
  publication_id: string;
  targets: {
    entry_id: string;
    sense_id: string;
    lifecycle_revision: number;
    hidden: boolean;
  }[];
  fingerprint: string;
}
export interface WithdrawSentenceInput extends SentencePublicationInput {
  reason: string;
  impact_fingerprint: string;
}
export interface SentenceVisibilityInput {
  base_revision: number;
  sense_id: string;
  hidden: boolean;
}
export interface SentenceVisibilityResponse {
  entry_id: string;
  revision: number;
  sense_id: string;
  sentence_id: string;
  hidden: boolean;
}
