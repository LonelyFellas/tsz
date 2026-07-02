// 智能词库 wire 枚举 ↔ UI 标签映射。提交值一律用 @tsz/types 的英文码,
// 中文/缩写仅用于展示(对接文档 §7 的对照表)。
import type {
  AdminWordKind,
  AdminWordStatus,
  CefrLevel,
  WordPosTag
} from "@tsz/types";

/** Record<wire 码, 标签> → antd Select options(码作 value,标签作 label)。 */
export const recordToOptions = <K extends string>(record: Record<K, string>) =>
  (Object.entries(record) as [K, string][]).map(([value, label]) => ({
    value,
    label
  }));

/** 基本词性 → 列表徽章缩写。 */
export const POS_TAG_ABBR: Record<WordPosTag, string> = {
  noun: "n.",
  pronoun: "pron.",
  verb: "v.",
  adjective: "adj.",
  adverb: "adv.",
  preposition: "prep.",
  article: "art.",
  determiner: "det.",
  conjunction: "conj.",
  numeral: "num.",
  interjection: "int."
};

export const POS_TAG_OPTIONS = recordToOptions(POS_TAG_ABBR);

export const KIND_LABEL: Record<AdminWordKind, string> = {
  word: "单词",
  phrase: "短语"
};

export const KIND_OPTIONS = recordToOptions(KIND_LABEL);

export const STATUS_LABEL: Record<AdminWordStatus, string> = {
  draft: "草稿",
  published: "已发布"
};

export const STATUS_OPTIONS = recordToOptions(STATUS_LABEL);

export const CEFR_LEVELS: readonly CefrLevel[] = [
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2"
];

export const CEFR_OPTIONS = CEFR_LEVELS.map((v) => ({ value: v, label: v }));

/** CEFR 难度着色:A 绿、B 蓝、C 金,便于一眼分级。 */
export function cefrColor(level: CefrLevel): string {
  if (level.startsWith("A")) return "green";
  if (level.startsWith("B")) return "blue";
  return "gold";
}
