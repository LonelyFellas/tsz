// 智能词库领域模型（前端 Mock 阶段自定义；后端接口就绪后以 @tsz/types 的 wire 类型替换）。
export type WordType = "单词" | "短语";
export type WordStatus = "草稿" | "已发布";

// 基本词性：与截图一致的英文缩写枚举。
export const POS_OPTIONS = [
  "n.",
  "pron.",
  "v.",
  "adj.",
  "adv.",
  "prep.",
  "art.",
  "det.",
  "conj.",
  "num.",
  "int."
] as const;
export type Pos = (typeof POS_OPTIONS)[number];

// CEFR 难度等级。
export const CEFR_OPTIONS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Cefr = (typeof CEFR_OPTIONS)[number];

export interface DictWord {
  id: number;
  word: string;
  type: WordType;
  meaning: string;
  pos: Pos[];
  difficulty: Cefr[];
  creator: string;
  status: WordStatus;
  createdAt: string; // "YYYY-MM-DD HH:mm"
  updatedAt: string; // "YYYY-MM-DD HH:mm"
}
