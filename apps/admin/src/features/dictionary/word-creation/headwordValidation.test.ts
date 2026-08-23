import { describe, expect, it } from "vitest";
import {
  HEADWORD_CHARSET_MESSAGE,
  HEADWORD_NO_LETTER_MESSAGE,
  hasHeadwordsIssue,
  headwordIssue,
  headwordsIssues
} from "./headwordValidation";

describe("headwordIssue", () => {
  it("空值与纯空格交给 required 规则，不在这里报错", () => {
    expect(headwordIssue("")).toBeUndefined();
    expect(headwordIssue("   ")).toBeUndefined();
  });

  it.each([
    ["单词", "table"],
    ["短语", "give up"],
    ["撇号", "don't"],
    ["弯撇号", "don’t"],
    ["连字符", "e-mail"],
    ["句点", "U.S.A."],
    ["与号", "R&D"],
    ["斜杠", "and/or"],
    ["字母数字混排", "COVID-19"],
    ["逗号短语", "day in, day out"],
    ["预组合变音符", "caf\u00E9"],
    ["组合变音符", "cafe\u0301"],
    ["首尾空格", "  table  "],
    ["大写", "COLOUR"]
  ])("放行合法英文词条：%s", (_label, value) => {
    expect(headwordIssue(value)).toBeUndefined();
  });

  it.each([
    ["中文", "苹果"],
    ["中英混排", "apple苹果"],
    ["假名", "りんご"],
    ["谚文", "사과"],
    ["西里尔", "яблоко"],
    ["emoji", "apple🍎"],
    // \s 会把这几类一起放过，而全角空格正是中文输入法的产物，看着与半角一模一样。
    ["全角空格", "give\u3000up"],
    ["不换行空格", "give\u00A0up"],
    ["换行", "give\nup"],
    ["制表符", "give\tup"]
  ])("拦下非拉丁字符：%s", (_label, value) => {
    expect(headwordIssue(value)).toBe(HEADWORD_CHARSET_MESSAGE);
  });

  it.each([
    ["纯数字", "123456"],
    ["纯连字符", "---"],
    // 已知误伤：24/7 是真实存在的英语词条，为拦住 123456 这类垃圾录入一并拦下。
    ["数字与符号", "24/7"]
  ])("拦下不含字母的输入：%s", (_label, value) => {
    expect(headwordIssue(value)).toBe(HEADWORD_NO_LETTER_MESSAGE);
  });
});

describe("headwordsIssues / hasHeadwordsIssue", () => {
  it("unified 模式下两侧同源，问题同时挂到两个展示位", () => {
    expect(headwordsIssues({ mode: "unified", common: "table" })).toEqual({
      uk: undefined,
      us: undefined
    });
    expect(headwordsIssues({ mode: "unified", common: "苹果" })).toEqual({
      uk: HEADWORD_CHARSET_MESSAGE,
      us: HEADWORD_CHARSET_MESSAGE
    });
  });

  it("distinguish 模式下分侧判定，只标出问题的那一侧", () => {
    expect(
      headwordsIssues({
        mode: "distinguish",
        uk: "colour",
        us: "苹果",
        source_dialect: "uk"
      })
    ).toEqual({ uk: undefined, us: HEADWORD_CHARSET_MESSAGE });
  });

  it("任一侧不合法即视为整体不合法", () => {
    expect(hasHeadwordsIssue({ mode: "unified", common: "table" })).toBe(false);
    expect(
      hasHeadwordsIssue({
        mode: "distinguish",
        uk: "colour",
        us: "color",
        source_dialect: "uk"
      })
    ).toBe(false);
    expect(
      hasHeadwordsIssue({
        mode: "distinguish",
        uk: "colour",
        us: "123",
        source_dialect: "uk"
      })
    ).toBe(true);
  });
});
