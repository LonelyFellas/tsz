// 词条编辑器的下拉/枚举选项:值一律用 @tsz/types 的 wire 英文码,中文仅作展示标签
// (对接文档 §7 的对照表)。表单里存英文码,保存时无需再做值转换。
import type { Dialect, PronunciationStyle, WordFormType } from "@tsz/types";
import { CEFR_LEVELS, recordToOptions } from "./labels";

// 方言类型(可多选,动态展示英式/美式两套词形)。common 是「无需分方言」的兜底块。
export const DIALECT_LABEL: Record<Dialect, string> = {
  uk: "英式英语",
  us: "美式英语",
  common: "默认"
};

/** 用于“英式词形”“美式语法结构”等组合文案，避免重复“英语”。 */
export const DIALECT_SHORT_LABEL: Record<Dialect, string> = {
  uk: "英式",
  us: "美式",
  common: "默认"
};

export const DIALECT_OPTIONS = (["uk", "us"] as const).map((d) => ({
  value: d,
  label: DIALECT_LABEL[d]
}));

// 当前应展示的方言分块:区分方言时按所选方言,否则回退到单一 common 块。
export const shownDialects = (dialects: Dialect[]): Dialect[] =>
  dialects.length > 0 ? dialects : ["common"];

// 词形类别:base(原形)固定存在于每块首行,UI 不可删;其余可增删选择。
export const FORM_TYPE_LABEL: Record<WordFormType, string> = {
  base: "原形",
  present_participle: "现在分词",
  past_tense: "过去式",
  past_participle: "过去分词",
  third_person_singular: "第三人称单数",
  plural: "复数",
  comparative: "比较级",
  superlative: "最高级"
};

export const FORM_TYPE_OPTIONS = recordToOptions(FORM_TYPE_LABEL);

// 发音方式。
export const PRON_STYLE_OPTIONS: {
  value: PronunciationStyle;
  label: string;
}[] = [
  { value: "normal", label: "正常" },
  { value: "strong", label: "强读" },
  { value: "weak", label: "弱读" }
];

// 释义类型(多维释义每行可切换)。
export const DEF_TYPE_OPTIONS = [
  { value: "zh" as const, label: "中文释义" },
  { value: "en" as const, label: "英语释义" }
];

// 词义等级复用 CEFR。
export const SENSE_LEVEL_OPTIONS = CEFR_LEVELS;

// 关联词三组 → wire relation 类型,各自的「度量」标签不同。
export const RELATION_GROUPS = [
  { key: "synonyms", relation: "synonym", title: "近义词", metric: "近似度" },
  { key: "antonyms", relation: "antonym", title: "反义词", metric: "对立度" },
  {
    key: "derivatives",
    relation: "derivative",
    title: "派生词",
    metric: "关联度"
  }
] as const;
export type RelationGroupKey = (typeof RELATION_GROUPS)[number]["key"];

export const toOptions = (arr: readonly string[]) =>
  arr.map((v) => ({ label: v, value: v }));
