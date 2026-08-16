import type { WordCreationStep } from "./admin-word-v2";
import type { PartOfSpeechCode, SubPartOfSpeechCode } from "./part-of-speech";
// 智能词库 V2 列表、筛选与共享枚举；wire 字段 1:1 镜像 Rust OpenAPI。

export type Dialect = "uk" | "us" | "common";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type AdminWordKind = "word" | "phrase";
export type AdminWordStatus = "draft" | "published" | "archived";

/** 基本词性稳定编码；词条内不重复，展示信息从词性配置 catalog 读取。 */
export type WordPosTag = PartOfSpeechCode;

/** 词形类别:base 每 pos+方言唯一且必有,其余类型可重复。 */
export type WordFormType =
  | "base"
  | "present_participle"
  | "past_tense"
  | "past_participle"
  | "third_person_singular"
  | "plural"
  | "comparative"
  | "superlative";

/** 细分词性稳定编码；草稿允许空串，展示与所属关系从 catalog 读取。 */
export type WordSubPos = "" | SubPartOfSpeechCode;

export type WordRelationType = "synonym" | "antonym" | "derivative";
export type PronunciationStyle = "normal" | "strong" | "weak";

/** GET /admin/lexicon/entries 查询参数。 */
export interface AdminWordListQuery {
  page?: number;
  /** 上限 100,缺省 20 */
  page_size?: number;
  /** 词汇或创建人姓名,子串匹配 */
  q?: string;
  /** 释义文本,子串匹配 */
  gloss?: string;
  kind?: AdminWordKind;
  pos?: WordPosTag;
  /** 命中任意一个词义等级即算 */
  level?: CefrLevel;
  status?: AdminWordStatus;
  /** RFC3339,半开区间 [from, to) */
  created_from?: string;
  created_to?: string;
}

/** 列表行(读取时派生:gloss 取第一个词性第一个词义的第一条释义)。 */
export interface AdminWordListItem {
  schema_version: 2;
  id: string;
  headword: string;
  kind: AdminWordKind;
  dialects: Dialect[];
  gloss: string;
  pos_list: WordPosTag[];
  /** 聚合所有词义等级,升序 */
  levels: CefrLevel[];
  status: AdminWordStatus;
  revision: number;
  lifecycle_revision: number;
  max_reachable_step: WordCreationStep;
  /** V2 当前线上 publication 的源 revision；legacy/未发布行缺省。 */
  published_revision?: number;
  /** 当前工作 revision 是否包含尚未发布的修改。 */
  has_unpublished_changes: boolean;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

/** GET /admin/lexicon/entries 的真实 V2 wire 行；必填性与 OpenAPI 完全一致。 */
export type AdminWordV2ListItem = AdminWordListItem;

export interface AdminWordListPage {
  page: number;
  page_size: number;
  total: number;
}

export interface AdminWordListResponse {
  words: AdminWordListItem[];
  page: AdminWordListPage;
}

/** GET /admin/lexicon/entries 的真实 V2 wire 响应。 */
export interface AdminWordV2ListResponse {
  words: AdminWordV2ListItem[];
  page: AdminWordListPage;
}

/** GET /admin/lexicon/entries/stats。 */
export interface AdminWordStats {
  total: number;
  today: number;
  month: number;
}

/** GET /admin/lexicon/entries/related-search 结果项。 */
export interface RelatedWordResult {
  word_id: string;
  headword: string;
  kind: AdminWordKind;
  dialects: Dialect[];
  pos_labels: string[];
  senses: RelatedWordSense[];
}

export interface RelatedWordSense {
  sense_id: string;
  /** 优先取该词义第一条中文释义(与快照规则一致,D6) */
  gloss: string;
}

export interface RelatedSearchLegacyResponse {
  results: RelatedWordResult[];
}

export interface RelatedSearchV2Response {
  results: RelatedWordResult[];
  total: number;
  next_cursor: string | null;
}

export type RelatedSearchResponse =
  RelatedSearchLegacyResponse | RelatedSearchV2Response;

export type RelatedSearchMatchMode = "exact" | "contains";

export interface RelatedSearchQuery {
  kind?: AdminWordKind;
  match_mode?: RelatedSearchMatchMode;
  exclude_exact?: boolean;
  page_size?: number;
  /** deprecated legacy alias; cannot be combined with page_size */
  limit?: number;
  cursor?: string;
}
