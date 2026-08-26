import { describe, expect, it } from "vitest";
import { classifyEntryInput } from "./entryClassification";

describe("classifyEntryInput", () => {
  it.each([
    ["  give   up  ", "give up"],
    ["give\tup", "give up"],
    ["give\nup", "give up"],
    ["give\u00a0up", "give up"]
  ])("归一化内部空白：%j", (raw, normalized) => {
    expect(classifyEntryInput(raw)).toEqual({
      normalized,
      kind: "phrase"
    });
  });

  it.each(["center", "can't", "rock’n’roll", "state-of-the-art"])(
    "单 token 保持单词分类：%s",
    (raw) => {
      expect(classifyEntryInput(raw)).toEqual({
        normalized: raw,
        kind: "word"
      });
    }
  );

  it.each(["give up", "day in, day out", " give\tup "])(
    "内部空白判定短语：%s",
    (raw) => {
      expect(classifyEntryInput(raw).kind).toBe("phrase");
    }
  );
});
