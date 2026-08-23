import type {
  CefrLevel,
  Dialect,
  DraftMeaningsStepContent,
  RichText,
  WordFormType
} from "@tsz/types";

/**
 * 多维例句的前端开发契约。
 *
 * Rust OpenAPI 尚未发布这些字段，因此类型只放在 admin 功能内部，并且只能在
 * 显式 mock 能力下写入；`@tsz/types` 继续只镜像真实 wire 契约。
 */
export interface SentenceSourceRangeV1 {
  start: number;
  end: number;
  surface: string;
}

export interface SentenceFormVariantV1 {
  dialect: Dialect;
  spelling: string;
}

export interface LinkedSentenceAssociationV1 {
  id: string;
  state: "linked";
  source_range: SentenceSourceRangeV1;
  target_word_id: string;
  target_sense_id: string;
  form_slot_id: string;
  sort_order: number;
  /** 以下字段是读取投影，不属于保存输入。 */
  resolved_pos?: string;
  resolved_form_type?: WordFormType;
  target_headword?: string;
  target_gloss?: string;
  form_variants?: SentenceFormVariantV1[];
}

export interface PendingSentenceAssociationV1 {
  id: string;
  state: "pending";
  source_range: SentenceSourceRangeV1;
  pending_word: string;
  /** 以下字段由数据源规范化或审计，不属于保存输入。 */
  normalized_pending_word?: string;
  created_by?: string;
  created_at?: string;
}

export interface LegacySentenceAssociationV1 {
  id: string;
  state: "legacy_unpositioned";
  target_word_id: string;
  target_sense_id: string;
  legacy_role: "focus" | "context";
  sort_order: number;
}

export type SentenceAssociationV1 =
  | LinkedSentenceAssociationV1
  | PendingSentenceAssociationV1
  | LegacySentenceAssociationV1;

export interface SharedWordSentenceV1 {
  id: string;
  level: CefrLevel;
  en_text_id: string;
  en_text: RichText;
  zh_text_id: string;
  zh_text: RichText;
  associations: SentenceAssociationV1[];
}

export interface ResolveSentenceAssociationInput {
  en_text: RichText;
  source_range: SentenceSourceRangeV1;
  target_word_id: string;
  target_sense_id: string;
  /** 开发 mock 用于只允许当前草稿自关联；真实契约就绪后由后端上下文替代。 */
  current_word_id?: string;
}

export interface SentenceFormCandidateV1 {
  pos_id: string;
  pos: string;
  form_slot_id: string;
  form_type: WordFormType;
  variants: SentenceFormVariantV1[];
}

export type ResolveSentenceAssociationResponse =
  | { resolution: "resolved"; candidate: SentenceFormCandidateV1 }
  | { resolution: "ambiguous"; candidates: SentenceFormCandidateV1[] }
  | { resolution: "unmatched"; candidates: [] };

export interface PendingSentenceAssociationItemV1 {
  association_id: string;
  sentence_id: string;
  owner_entry_id: string;
  owner_entry_revision: number;
  en_text: RichText;
  zh_text: RichText;
  source_range: SentenceSourceRangeV1;
  pending_word: string;
  created_at: string;
}

export interface PendingSentenceAssociationPageV1 {
  results: PendingSentenceAssociationItemV1[];
  total: number;
  next_cursor: string | null;
}

export interface ClaimPendingSentenceAssociationInput {
  target_word_id: string;
  target_sense_id: string;
  form_slot_id: string;
  base_owner_entry_revision: number;
}

export interface ClaimPendingSentenceAssociationResponse {
  association: LinkedSentenceAssociationV1;
  owner_entry_id: string;
  owner_entry_revision: number;
}

/** 仅 admin 开发/mock 状态使用；不会扩展或替代正式 meanings wire。 */
export type DraftMeaningsWithSentenceAssociations = DraftMeaningsStepContent & {
  shared_sentences?: SharedWordSentenceV1[];
};

/** 在明确的开发/mock 边界读取本地扩展，不放宽 `@tsz/types` 保存输入。 */
export function sentenceAssociationMeanings(
  content: DraftMeaningsStepContent
): DraftMeaningsWithSentenceAssociations {
  return content as DraftMeaningsWithSentenceAssociations;
}
