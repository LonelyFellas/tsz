import { describe, expect, it } from "vitest";
import {
  DIALECT_LABEL,
  FORM_TYPE_OPTIONS,
  POS_TAG_ZH,
  shownDialects,
  SUB_POS_OPTIONS,
  toOptions
} from "./editorConstants";
import {
  CEFR_LEVELS,
  cefrColor,
  KIND_OPTIONS,
  POS_TAG_ABBR,
  POS_TAG_OPTIONS,
  STATUS_LABEL
} from "./labels";

describe("labels — wire 枚举 ↔ UI 标签", () => {
  it("11 个基本词性都有徽章缩写与选项", () => {
    expect(Object.keys(POS_TAG_ABBR)).toHaveLength(11);
    expect(POS_TAG_OPTIONS).toContainEqual({ value: "noun", label: "n." });
    expect(POS_TAG_ABBR.interjection).toBe("int.");
  });

  it("kind/status 对照与 CEFR 全集", () => {
    expect(KIND_OPTIONS.map((o) => o.value)).toEqual(["word", "phrase"]);
    expect(STATUS_LABEL.draft).toBe("草稿");
    expect(CEFR_LEVELS).toEqual(["A1", "A2", "B1", "B2", "C1", "C2"]);
  });

  it("cefrColor:A 绿 / B 蓝 / C 金", () => {
    expect(cefrColor("A1")).toBe("green");
    expect(cefrColor("B2")).toBe("blue");
    expect(cefrColor("C1")).toBe("gold");
  });
});

describe("editorConstants — 编辑器枚举", () => {
  it("shownDialects:选了方言按所选,否则回退 common", () => {
    expect(shownDialects(["uk", "us"])).toEqual(["uk", "us"]);
    expect(shownDialects([])).toEqual(["common"]);
  });

  it("方言/词形/细分词性的中文标签齐全", () => {
    expect(DIALECT_LABEL.common).toBe("默认");
    expect(FORM_TYPE_OPTIONS).toContainEqual({ value: "base", label: "原形" });
    // 细分词性选项 = §7 的 19 个码,标签带中英对照。
    expect(SUB_POS_OPTIONS).toHaveLength(19);
    expect(SUB_POS_OPTIONS.find((o) => o.value === "V-T")!.label).toBe(
      "及物动词 (V-T)"
    );
    expect(Object.keys(POS_TAG_ZH)).toHaveLength(11);
  });

  it("toOptions:字符串数组转 label/value 对", () => {
    expect(toOptions(["A1"])).toEqual([{ label: "A1", value: "A1" }]);
  });
});
