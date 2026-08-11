// 智能词库 wire 枚举 ↔ UI 标签映射。提交值一律用 @tsz/types 的英文码,
// 中文/缩写仅用于展示(对接文档 §7 的对照表)。
import type { AdminWordKind, AdminWordStatus, CefrLevel } from "@tsz/types";

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
