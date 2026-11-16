import { expect, it } from "vitest";
import type { NextSentenceTranslation, NextSentenceVariant } from "@tsz/types";
import {
  exampleLevelContext,
  exampleWordCount,
  freedomCategory,
  nextTranslation,
  sentenceError,
  sortExamples,
  translationStyle
} from "./sentenceModel";
const translation = (
  id: string,
  freedom: number | null
): NextSentenceTranslation => ({
  id,
  locale: "zh-Hans",
  style: "balanced_fluency",
  content: { version: 2, text: id, annotations: [] },
  metadata: { freedom, sources: [] }
});
const example = (
  id: string,
  level: string,
  text: string
): NextSentenceVariant => ({
  id,
  level,
  locale: "en-GB",
  content: { version: 2, text, annotations: [] },
  translations: []
});
it("自由度按连续边界分类，空值默认直译且非法精度不伪造类型", () => {
  expect([0, 33.3, 33.4, 66.6, 66.7, 100].map(freedomCategory)).toEqual([
    "word_for_word",
    "word_for_word",
    "balanced_fluency",
    "balanced_fluency",
    "adapted_creation",
    "adapted_creation"
  ]);
  for (const value of [-0.1, 100.1, 33.33, NaN, Infinity])
    expect(freedomCategory(value)).toBeUndefined();
  expect(translationStyle(translation("default", null))).toBe("word_for_word");
  const row = example("one", "A2", "A job.");
  row.translations = [translation("bad", 33.33)];
  expect(sentenceError(row)).toContain("一位小数");
});
it("先按可读等级选择，缺档时就近回退且同距取较低档", () => {
  const rows = [
    example("a", "A1", "A job."),
    example("b", "B1", "A new job."),
    example("c", "C1", "An interesting job.")
  ];
  expect(exampleLevelContext(rows, "B2", "C1")).toMatchObject({
    selectable: ["A1", "B1"],
    preferred: "B1",
    fallback: false
  });
  expect(exampleLevelContext(rows.slice(1), "A1", "A1")).toMatchObject({
    selectable: ["B1"],
    preferred: "B1",
    fallback: true
  });
  expect(exampleLevelContext([rows[0]!, rows[1]!], "C2", "A2").preferred).toBe(
    "A1"
  );
  expect(exampleLevelContext([], "B1").preferred).toBeUndefined();
});
it("同级按词数、字母序和稳定身份排序，不随输入顺序漂移", () => {
  const rows = [
    example("c", "A2", "Zebra works."),
    example("b", "A2", "Alpha works."),
    example("a", "A2", "Alpha works."),
    example("d", "A1", "A longer example here.")
  ];
  expect(sortExamples(rows).map((r) => r.id)).toEqual(["d", "a", "b", "c"]);
  expect(rows[0]!.id).toBe("c");
  expect(exampleWordCount("It's a well-paid job in the U.S.")).toBe(7);
});
it("首次切换按阅读水平选类型，随后不重复，缺类时使用已有译文", () => {
  const rows = [
    translation("literal", 0),
    translation("natural", 50),
    translation("creative", 100)
  ];
  const low = nextTranslation(rows, "natural", ["natural"], 0, "A2", () => 0);
  expect(low.row?.id).toBe("literal");
  expect(
    nextTranslation(rows, "natural", ["natural"], 0, "B1", () => 0).row?.id
  ).toBe("creative");
  expect(
    nextTranslation(rows, "literal", low.seen, 1, "A2", () => 0).row?.id
  ).toBe("creative");
  expect(
    nextTranslation(rows.slice(1), "natural", ["natural"], 0, "A2", () => 0)
  ).toMatchObject({ row: { id: "creative" }, missing: "word_for_word" });
  expect(
    nextTranslation(
      [rows[0]!, rows[2]!],
      "creative",
      ["creative"],
      0,
      "B1",
      () => 0
    )
  ).toMatchObject({ row: { id: "literal" }, missing: undefined });
});
