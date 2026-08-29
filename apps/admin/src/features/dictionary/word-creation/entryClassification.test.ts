import { describe, expect, it } from "vitest";
import { classifyEntryInput, validateEntryInput } from "./entryClassification";
import {
  HEADWORD_CHARSET_MESSAGE,
  HEADWORD_NO_LETTER_MESSAGE
} from "./headwordValidation";

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

describe("validateEntryInput", () => {
  it.each([
    ["  center  ", "center", "word"],
    ["  give   up  ", "give up", "phrase"],
    ["give\tup", "give up", "phrase"]
  ])("复用 Step 1 归一化与分类：%j", (raw, normalized, kind) => {
    expect(validateEntryInput(raw)).toEqual({ normalized, kind });
  });

  it.each([
    ["", "请输入词条"],
    ["苹果", HEADWORD_CHARSET_MESSAGE],
    ["123", HEADWORD_NO_LETTER_MESSAGE],
    ["a".repeat(201), "词条不能超过 200 个字符"]
  ])("返回 Step 1 同源错误：%j", (raw, issue) => {
    expect(validateEntryInput(raw)).toMatchObject({ issue });
  });
});
