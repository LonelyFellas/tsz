import type { AdminPaginationMeta } from "./admin";
import type { Actor } from "./api";
import type { WordFormType } from "./admin-word";

/**
 * 可配置基本词性/细分词性的稳定 wire 编码。
 *
 * 编码由系统设置目录创建并在词条中长期引用，创建后不可修改。管理端新建词性时由英文全称
 * 派生一次（用户不填不看），此后业务输入只能来自 catalog、词典检测响应或历史词条 wire，
 * 不得再自行拼接。
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
  /** 简洁显示：业务页面用的短中文名，去空白后 1–16 字，全局唯一。 */
  short_name_zh: string;
  /** 英文全称，去空白后 1–64 字，忽略大小写唯一。 */
  full_name_en: string;
  sort_order: number;
  usage_count: number;
  sub_part_count: number;
  /** 该词性名下的非原形词形变化编码，按 sort_order 有序；删除前可据此预判。 */
  allowed_form_types?: WordFormType[];
  /** “添加派生词形”的默认补齐顺序，必须是 allowed_form_types 子集。 */
  default_form_types?: WordFormType[];
  /** 任意基本词性都可以扩展细分词性，恒为 true。 */
  sub_parts_extensible: boolean;
  /** 后端按固定编码集合（名词/动词/代词/形容词/副词）派生：该词性下的释义是否必须选中细分词性。 */
  sub_pos_required?: boolean;
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
  short_name_zh: string;
  abbreviation: string;
  full_name_en: string;
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
  short_name_zh: string;
  abbreviation: string;
  full_name_en: string;
  sort_order: number;
}

export interface PartOfSpeechCatalogItem {
  id: string;
  code: PartOfSpeechCode;
  name_zh: string;
  name_en: string;
  abbreviation: string;
  short_name_zh: string;
  full_name_en: string;
  sort_order: number;
  /** 词条创编允许的派生词形；缺省时客户端保留已有数据，不提供新增候选。 */
  allowed_form_types?: WordFormType[];
  /** “添加派生词形”的默认补齐顺序，必须是 allowed_form_types 子集。 */
  default_form_types?: WordFormType[];
  /** 与 PartOfSpeechConfig.sub_parts_extensible 同源，恒为 true。 */
  sub_parts_extensible: boolean;
  /** 与 PartOfSpeechConfig.sub_pos_required 同源；前端据此决定释义是否必填细分词性。 */
  sub_pos_required?: boolean;
  sub_parts: SubPartOfSpeechCatalogItem[];
}

export interface PartOfSpeechCatalogResponse {
  /** Absent only when connected to a pre-catalog backend. */
  form_types?: FormTypeCatalogItem[];
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
  short_name_zh: string;
  full_name_en: string;
  sort_order: number;
}

export interface UpdatePartOfSpeechInput {
  base_revision: number;
  name_zh: string;
  name_en: string;
  abbreviation: string;
  short_name_zh: string;
  full_name_en: string;
  sort_order: number;
}

export interface CreateSubPartOfSpeechInput {
  code: SubPartOfSpeechCode;
  name_zh: string;
  name_en: string;
  short_name_zh: string;
  abbreviation: string;
  full_name_en: string;
  sort_order: number;
}

export interface UpdateSubPartOfSpeechInput {
  base_revision: number;
  name_zh: string;
  name_en: string;
  short_name_zh: string;
  abbreviation: string;
  full_name_en: string;
  sort_order: number;
}

/** 基本/细分 DELETE 共用的必填并发版本 query。 */
export interface DeletePartOfSpeechQuery {
  base_revision: number;
}

export interface SubPartOfSpeechListResponse {
  items: SubPartOfSpeechConfig[];
}

export interface FormTypeCatalogItem {
  id: string;
  /** 所属基本词性；原形对所有词性通用，catalog 侧省略该键，管理侧为 null。 */
  part_of_speech_id?: string | null;
  code: string;
  name_zh: string;
  name_en: string;
  short_name_zh: string;
  abbreviation: string;
  full_name_en: string;
  sort_order: number;
}

export interface FormTypeConfig extends FormTypeCatalogItem {
  usage_count: number;
  revision: number;
  created_by: Actor;
  created_at: string;
  updated_by?: Actor;
  updated_at: string;
}

export interface FormTypeConfigListQuery extends PartOfSpeechConfigListQuery {
  /** 只看该基本词性名下的词形变化；缺省返回全部（含通用的原形）。 */
  part_of_speech_id?: string;
}

export interface CreateFormTypeInput extends CreatePartOfSpeechInput {
  /** 词形变化必须挂在某个基本词性下。 */
  part_of_speech_id: string;
}

export interface UpdateFormTypeInput extends UpdatePartOfSpeechInput {
  /** 改挂到另一个基本词性；原形不接受该字段。 */
  part_of_speech_id?: string;
}

export interface FormTypeConfigListResponse {
  items: FormTypeConfig[];
  pagination: AdminPaginationMeta;
}
