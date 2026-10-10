import { expect, it } from "vitest";
import type { RichTextV2 } from "@tsz/types";
import { normalizeSpellingRich, spellingAnnotationsEqual } from "./spelling";

it("拼写 display 与后端 NFKC/Unicode 空白口径一致，按码点迁移未改片段", () => {
  const input: RichTextV2 = {
    version: 2,
    text: "\u2003Ａ  café\u00a0",
    annotations: [{ type: "italic", start: 4, end: 8 }]
  };
  expect(normalizeSpellingRich(input)).toEqual({
    version: 2,
    text: "A café",
    annotations: [{ type: "italic", start: 2, end: 6 }]
  });
  const invalid: RichTextV2 = { version: 2, text: "a\tb", annotations: [] };
  expect(normalizeSpellingRich(invalid)).toBe(invalid);
  const bom: RichTextV2 = { version: 2, text: "\ufeffa", annotations: [] };
  expect(normalizeSpellingRich(bom)).toBe(bom);
});

it("省略和显式默认连读端宽等价，实际端宽差异仍不等价", () => {
  const loaded: RichTextV2 = {
    version: 2,
    text: "boiled potatoes",
    annotations: [{ type: "liaison", start: 5, end: 8 }]
  };
  for (const widths of [
    { start_len: 1, end_len: 1 },
    { start_len: 1 },
    { end_len: 1 }
  ]) {
    const edited: RichTextV2 = {
      ...loaded,
      annotations: [{ type: "liaison", start: 5, end: 8, ...widths }]
    };
    expect(spellingAnnotationsEqual(loaded, edited)).toBe(true);
    expect(spellingAnnotationsEqual(edited, loaded)).toBe(true);
  }
  for (const widths of [{ start_len: 2 }, { end_len: 2 }]) {
    expect(
      spellingAnnotationsEqual(loaded, {
        ...loaded,
        annotations: [{ type: "liaison", start: 5, end: 8, ...widths }]
      })
    ).toBe(false);
  }
  expect(loaded.annotations).toEqual([{ type: "liaison", start: 5, end: 8 }]);
});

it("连读和斜体字段顺序不影响标注等价性", () => {
  const loaded: RichTextV2 = {
    version: 2,
    text: "boiled potatoes",
    annotations: [
      { end: 8, start: 5, type: "liaison" },
      { end: 15, start: 7, type: "italic" }
    ]
  };
  const edited: RichTextV2 = {
    ...loaded,
    annotations: [
      { type: "italic", start: 7, end: 15 },
      { type: "liaison", start: 5, end: 8, start_len: 1, end_len: 1 }
    ]
  };
  expect(spellingAnnotationsEqual(loaded, edited)).toBe(true);
});
