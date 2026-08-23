// 智能词库 wire 枚举 ↔ UI 标签映射。提交值一律用 @tsz/types 的英文码,
// 中文/缩写仅用于展示(对接文档 §7 的对照表)。
import type {
  AdminWordKind,
  AdminWordStatus,
  CefrLevel,
  SurfaceMatchCategoryV2
} from "@tsz/types";

/** Record<wire 码, 标签> → antd Select options(码作 value,标签作 label)。 */
export const recordToOptions = <K extends string>(record: Record<K, string>) =>
  (Object.entries(record) as [K, string][]).map(([value, label]) => ({
    value,
    label
  }));

export const KIND_LABEL: Record<AdminWordKind, string> = {
  word: "单词",
  phrase: "短语"
};

export const KIND_OPTIONS = recordToOptions(KIND_LABEL);

export const STATUS_LABEL: Record<AdminWordStatus, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档"
};

export const STATUS_OPTIONS = recordToOptions(STATUS_LABEL);

/**
 * 重复检测的命中原因。呈现次序固定为主词层面在前、词形层面在后——
 * 后端按匹配分数排序，混着看不出冲突的严重程度。
 */
export const MATCH_CATEGORY_ORDER: readonly SurfaceMatchCategoryV2[] = [
  "exact_headword",
  "cross_kind_headword",
  "form_headword",
  "headword_form",
  "form_form"
];

/** candidate 是本次要建的词，existing 是库里已有的，文案一律从「本次录入」的视角写。 */
export const MATCH_CATEGORY_LABEL: Record<SurfaceMatchCategoryV2, string> = {
  exact_headword: "主词相同",
  cross_kind_headword: "主词相同 · 跨词条类型",
  form_headword: "本次词形撞其主词",
  headword_form: "命中其词形",
  form_form: "词形相同"
};

/**
 * 后端新增命中类别时，前端未必同期发版（关联词维度正在后端排期）。
 * 落到白名单之外的码原样透出，让管理员至少看得见「命中了、但前端还不认识这个原因」，
 * 而不是静默当作没有命中原因——后者与 duplicate 分支本就不带原因的情形无法区分。
 */
export function matchCategoryLabel(category: SurfaceMatchCategoryV2): string {
  return MATCH_CATEGORY_LABEL[category] ?? category;
}

export const CEFR_LEVELS: readonly CefrLevel[] = [
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2"
];

export const CEFR_OPTIONS = CEFR_LEVELS.map((v) => ({ value: v, label: v }));

export const CEFR_COLOR: Record<CefrLevel, string> = {
  A1: "#4CCB4B",
  A2: "#00A5CC",
  B1: "#2053FF",
  B2: "#7E2BF8",
  C1: "#B817CF",
  C2: "#D22D8D"
};

/** CEFR 六档独立着色，便于一眼识别具体等级。 */
export function cefrColor(level: CefrLevel): string {
  return CEFR_COLOR[level];
}
