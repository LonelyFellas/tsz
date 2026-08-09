import { describe, expect, it } from "vitest";
import {
  DIALECT_LABEL,
  FORM_TYPE_OPTIONS,
  shownDialects,
  toOptions
} from "./editorConstants";
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

describe("editorConstants — 编辑器枚举", () => {
  it("shownDialects:选了方言按所选,否则回退 common", () => {
    expect(shownDialects(["uk", "us"])).toEqual(["uk", "us"]);
    expect(shownDialects([])).toEqual(["common"]);
  });

  it("固定方言与词形枚举的中文标签齐全", () => {
    expect(DIALECT_LABEL.common).toBe("默认");
    expect(DIALECT_LABEL.uk).toBe("英式英语");
    expect(DIALECT_LABEL.us).toBe("美式英语");
    expect(FORM_TYPE_OPTIONS).toContainEqual({ value: "base", label: "原形" });
  });

  it("toOptions:字符串数组转 label/value 对", () => {
    expect(toOptions(["A1"])).toEqual([{ label: "A1", value: "A1" }]);
  });
});
