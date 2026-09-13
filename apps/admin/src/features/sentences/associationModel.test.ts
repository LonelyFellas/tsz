import { sentenceTarget } from "./fixtures";
import { describe, expect, it } from "vitest";
import {
  currentSentenceCandidates,
  matchesSentenceTarget
} from "./associationModel";
const phrase = {
  id: "entry",
  kind: "phrase",
  headword: "make up",
  surfaces: [
    { surface: "make up", dialect: "uk" },
    { surface: "made up", dialect: "uk" }
  ]
};
describe("当前词条关联的即时检查", () => {
  it("完整单词及登记变形可通过，子串、未登记变形、跨句和错误方言不可通过", () => {
    expect(
      matchesSentenceTarget(
        "We made the story up.",
        [
          { start: 3, end: 7, surface: "made" },
          { start: 18, end: 20, surface: "up" }
        ],
        "common",
        phrase
      )
    ).toBe(true);
    expect(
      matchesSentenceTarget(
        "We maker the story up.",
        [
          { start: 3, end: 7, surface: "make" },
          { start: 19, end: 21, surface: "up" }
        ],
        "common",
        phrase
      )
    ).toBe(false);
    expect(
      matchesSentenceTarget(
        "making up",
        [{ start: 0, end: 9, surface: "making up" }],
        "common",
        phrase
      )
    ).toBe(false);
    expect(
      matchesSentenceTarget(
        "make. up",
        [
          { start: 0, end: 4, surface: "make" },
          { start: 6, end: 8, surface: "up" }
        ],
        "common",
        phrase
      )
    ).toBe(false);
    expect(
      matchesSentenceTarget(
        "made up",
        [{ start: 0, end: 7, surface: "made up" }],
        "us",
        phrase
      )
    ).toBe(false);
  });
  it("重复出现时返回可区分位置，不重复提供已被其他关联占用的片段", () => {
    const target = {
      ...phrase,
      kind: "word",
      headword: "make",
      surfaces: [{ surface: "make", dialect: "uk" }]
    };
    const candidates = currentSentenceCandidates(
      "make make maker",
      "common",
      target,
      []
    );
    expect(candidates).toEqual([
      [{ start: 0, end: 4, surface: "make" }],
      [{ start: 5, end: 9, surface: "make" }]
    ]);
    expect(
      currentSentenceCandidates("make make maker", "common", target, [
        {
          id: "a",
          source_dialect: "common",
          source_segments: candidates[0]!,
          target: sentenceTarget("other")
        }
      ])
    ).toEqual([candidates[1]]);
  });
});
