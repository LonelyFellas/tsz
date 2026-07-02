// 「创建单词」整页表单用到的下拉/枚举选项。Mock 阶段前端自定；后端就绪后以 wire 类型替换。
import { CEFR_OPTIONS } from "./types";

// 方言类型（可多选，动态展示英式/美式两套词形）。
export const DIALECTS = ["英式", "美式"] as const;
export type Dialect = (typeof DIALECTS)[number];

// 未区分方言时的兜底分块名：词形/语法结构在「无需分方言」下归入此单一块。
export const DEFAULT_DIALECT = "默认";

// 当前应展示的方言分块：区分方言时按所选方言，否则回退到单一「默认」块。
export const shownDialects = (dialects: string[]): string[] =>
  dialects.length > 0 ? dialects : [DEFAULT_DIALECT];

// 词形类别：原形固定存在，其余可增删选择。
export const FORM_CATEGORY_OPTIONS = [
  "原形",
  "现在分词",
  "过去式",
  "过去分词",
  "第三人称单数",
  "复数",
  "比较级",
  "最高级"
] as const;

// 发音方式。
export const PRONOUNCE_STYLE_OPTIONS = ["强读", "弱读", "正常"] as const;

// 细分词性（示例集，中英对照，与截图一致）。
export const SUB_POS_OPTIONS = [
  "及物动词 (V-T; transitive verb)",
  "不及物动词 (V-I; intransitive verb)",
  "可数名词 (C; countable noun)",
  "不可数名词 (U; uncountable noun)",
  "形容词 (adj.; adjective)",
  "副词 (adv.; adverb)"
] as const;

// 释义类型（多维释义每行可切换）。
export const MEANING_TYPE_OPTIONS = ["中文释义", "英语释义"] as const;

// 词义等级复用 CEFR。
export const SENSE_LEVEL_OPTIONS = CEFR_OPTIONS;

// 基本词性 Tab 的候选（新增词性 Tab 时选择）。
export const BASE_POS_OPTIONS = [
  "动词",
  "名词",
  "形容词",
  "副词",
  "介词",
  "代词",
  "连词",
  "数词"
] as const;

// 关联词三类：近义词/反义词/派生词，各自的「度量」标签不同。
export const RELATION_GROUPS = [
  { key: "synonyms", title: "近义词", metric: "近似度" },
  { key: "antonyms", title: "反义词", metric: "对立度" },
  { key: "derivatives", title: "派生词", metric: "关联度" }
] as const;
export type RelationGroupKey = (typeof RELATION_GROUPS)[number]["key"];

export const toOptions = (arr: readonly string[]) =>
  arr.map((v) => ({ label: v, value: v }));
