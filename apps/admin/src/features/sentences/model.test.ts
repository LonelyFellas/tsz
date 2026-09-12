import { describe, expect, it } from "vitest";
import { sentenceTokens } from "../dictionary/word-creation-v3/tokens";
import { selectedSegments } from "./model";

describe("例句片段位置", () => {
  it("使用码点偏移，连续词合并、非连续短语保留分段，重复单词按位置区分", () => {
    const text = "🌼 give it up, give up";
    const tokens = sentenceTokens(text);
    expect(selectedSegments(text, [tokens[0]!, tokens[2]!])).toEqual([
      { start: 2, end: 6, surface: "give" },
      { start: 10, end: 12, surface: "up" }
    ]);
    expect(selectedSegments(text, [tokens[4]!, tokens[3]!])).toEqual([
      { start: 14, end: 21, surface: "give up" }
    ]);
  });
});
