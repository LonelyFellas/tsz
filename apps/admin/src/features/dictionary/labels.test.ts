import { describe, expect, it } from "vitest";
import { CEFR_LEVELS, cefrColor, KIND_OPTIONS, STATUS_LABEL } from "./labels";

describe("labels — wire 枚举 ↔ UI 标签", () => {
  it("kind/status 对照与 CEFR 全集", () => {
    expect(KIND_OPTIONS.map((o) => o.value)).toEqual(["word", "phrase"]);
    expect(STATUS_LABEL.draft).toBe("草稿");
    expect(CEFR_LEVELS).toEqual(["A1", "A2", "B1", "B2", "C1", "C2"]);
  });

  it("cefrColor:六档等级使用独立色值", () => {
    expect(CEFR_LEVELS.map(cefrColor)).toEqual([
      "#4CCB4B",
      "#00A5CC",
      "#2053FF",
      "#7E2BF8",
      "#B817CF",
      "#D22D8D"
    ]);
  });
});
