import { describe, expect, it } from "vitest";
import type { TextLinkV3 } from "@tsz/types";
import {
  associationWords,
  rangesOverlap,
  remapTextLinks,
  wordSegments
} from "./text-links";

const link = (start: number, end: number, surface: string): TextLinkV3 => ({
  id: "link",
  source_segments: [{ start, end, surface }],
  target_word_id: "word",
  target_publication_id: "pub",
  target_pos_id: "pos",
  target_base_form_id: "base",
  target_form_id: "form",
  target_variant_id: "variant",
  target_sense_id: "sense"
});

describe("正文关联区间", () => {
  it("重复词按位置平移，emoji 使用码点", () => {
    const selected = link(7, 13, "mother");
    expect(
      remapTextLinks("mother mother", "👩 mother mother", [selected])[0]
        ?.source_segments
    ).toEqual([{ start: 9, end: 15, surface: "mother" }]);
    expect(
      remapTextLinks("mother mother", "father mother", [selected])[0]
        ?.source_segments
    ).toEqual(selected.source_segments);
  });
  it("改写关联词或在边界把它接成新词时清除，不移植到同名词", () => {
    const selected = link(0, 6, "mother");
    expect(
      remapTextLinks("mother mother", "mothers mother", [selected])
    ).toEqual([]);
    expect(remapTextLinks("mother mother", "mother", [selected])).toEqual([
      selected
    ]);
    expect(
      remapTextLinks("mother mother", "father mother", [selected])
    ).toEqual([]);
  });
  it("连续词合段，可分离短语保留中间未选词", () => {
    const text = "dress me up";
    const segments = wordSegments(text, [
      { start: 9, end: 11 },
      { start: 0, end: 5 }
    ]);
    expect(segments).toEqual([
      { start: 0, end: 5, surface: "dress" },
      { start: 9, end: 11, surface: "up" }
    ]);
    expect(rangesOverlap(segments, [{ start: 6, end: 8, surface: "me" }])).toBe(
      false
    );
    expect(
      wordSegments(text, [
        { start: 0, end: 5 },
        { start: 6, end: 8 }
      ])
    ).toEqual([{ start: 0, end: 8, surface: "dress me" }]);
  });
});

it("关联切词排除句尾标点，逗号两侧独立且保留词内连接符", () => {
  expect(associationWords("👩 Mother,don't dress-up!")).toEqual([
    { start: 2, end: 8, surface: "Mother" },
    { start: 9, end: 14, surface: "don't" },
    { start: 15, end: 23, surface: "dress-up" }
  ]);
});
