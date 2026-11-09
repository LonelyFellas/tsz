import type { Band } from "./types";

// 结果页/引导页展示文案(产品方案 §7.4 的展示口径)。纯静态映射,无逻辑。

export const VOCAB_RANGE: Record<Band, string> = {
  A1: "约 500 – 1,000 词",
  A2: "约 1,000 – 2,000 词",
  B1: "约 2,000 – 3,000 词",
  B2: "约 3,000 – 4,500 词",
  C1: "约 4,500 – 8,000 词",
  C2: "8,000+ 词"
};

/** 进度条预估总题数(块数不固定,文案一律用「约」)。 */
export const EST_TOTAL = 25;
