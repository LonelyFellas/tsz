import type { AdminPaginationMeta } from "./admin";
import type { Actor } from "./api";
import type { WordFormType } from "./admin-word";

/**
 * 可配置基本词性/细分词性的稳定 wire 编码。
 *
 * 编码由系统设置目录创建并在词条中长期引用，创建后不可修改。前端不得自行拼接；
 * 业务输入只能来自 catalog、词典检测响应或历史词条 wire。
 */
export type PartOfSpeechCode = string;
export type SubPartOfSpeechCode = string;

/** @deprecated OpenAPI 审计主体已统一为 Actor。 */
export type PartOfSpeechActor = Actor;

export interface PartOfSpeechConfig {
  id: string;
  code: PartOfSpeechCode;
  name_zh: string;
  name_en: string;
  abbreviation: string;
  sort_order: number;
  usage_count: number;
  sub_part_count: number;
  revision: number;
  created_by: Actor;
  created_at: string;
  updated_by?: Actor;
  updated_at: string;
}

export interface SubPartOfSpeechConfig {
  id: string;
  part_of_speech_id: string;
  code: SubPartOfSpeechCode;
  name_zh: string;
  name_en: string;
  sort_order: number;
  usage_count: number;
  revision: number;
  created_by: Actor;
  created_at: string;
  updated_by?: Actor;
  updated_at: string;
}

export interface SubPartOfSpeechCatalogItem {
  id: string;
  code: SubPartOfSpeechCode;
  name_zh: string;
  name_en: string;
  sort_order: number;
}

export interface PartOfSpeechCatalogItem {
  id: string;
  code: PartOfSpeechCode;
  name_zh: string;
  name_en: string;
  abbreviation: string;
  sort_order: number;
  /** 词条创编允许的派生词形；缺省时客户端保留已有数据，不提供新增候选。 */
  allowed_form_types?: Exclude<WordFormType, "base">[];
  /** “添加派生词形”的默认补齐顺序，必须是 allowed_form_types 子集。 */
  default_form_types?: Exclude<WordFormType, "base">[];
  sub_parts: SubPartOfSpeechCatalogItem[];
}

export interface PartOfSpeechCatalogResponse {
  catalog_version: number;
  items: PartOfSpeechCatalogItem[];
}

export interface PartOfSpeechConfigListQuery {
  q?: string;
  page?: number;
  page_size?: number;
}

export interface PartOfSpeechConfigListResponse {
  items: PartOfSpeechConfig[];
  pagination: AdminPaginationMeta;
}

export interface CreatePartOfSpeechInput {
  code: PartOfSpeechCode;
  name_zh: string;
  name_en: string;
  abbreviation: string;
  sort_order: number;
}

export interface UpdatePartOfSpeechInput {
  base_revision: number;
  name_zh: string;
  name_en: string;
  abbreviation: string;
  sort_order: number;
}

export interface CreateSubPartOfSpeechInput {
  code: SubPartOfSpeechCode;
  name_zh: string;
  name_en: string;
  sort_order: number;
}

export interface UpdateSubPartOfSpeechInput {
  base_revision: number;
  name_zh: string;
  name_en: string;
  sort_order: number;
}

/** 基本/细分 DELETE 共用的必填并发版本 query。 */
export interface DeletePartOfSpeechQuery {
  base_revision: number;
}

export interface SubPartOfSpeechListResponse {
  items: SubPartOfSpeechConfig[];
}
