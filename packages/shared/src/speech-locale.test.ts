import { describe, expect, it } from "vitest";
import {
  speechAccentGroup,
  speechLocaleMatchesScope,
  speechSelectionGroup
} from "./speech-locale";

describe("英语音色地区分类", () => {
  it("按国家分区，其他音色的选用按具体地区隔离", () => {
    for (const locale of ["en-GB", "en-AU", "en-NZ"])
      expect(speechAccentGroup(locale)).toBe("uk");
    for (const locale of ["en-US", "en-CA"])
      expect(speechAccentGroup(locale)).toBe("us");
    expect(speechAccentGroup("en-IN")).toBe("other");
    expect(speechSelectionGroup("en-IN")).toBe("en-IN");
    expect(speechSelectionGroup("en-IE")).toBe("en-IE");
    expect(speechAccentGroup("fr-FR")).toBeUndefined();
    expect(speechAccentGroup("en-US:anything")).toBeUndefined();
  });
  it("人工当前归属覆盖工厂映射，原生 locale 保留独立语义", () => {
    expect(speechAccentGroup("en-SG", "gb")).toBe("uk");
    expect(speechAccentGroup("en-GB", "none")).toBe("other");
    expect(speechAccentGroup("en-IE")).toBe("other");
    expect(speechLocaleMatchesScope("en-SG", "en-GB", "gb")).toBe(true);
    expect(speechLocaleMatchesScope("en-SG", "en-US", "gb")).toBe(false);
  });
  it("英美栏保留对应分类和补充音色，不把另一侧当默认", () => {
    expect(speechLocaleMatchesScope("en-AU", "en-GB")).toBe(true);
    expect(speechLocaleMatchesScope("en-CA", "en-US")).toBe(true);
    expect(speechLocaleMatchesScope("en-IN", "en-GB")).toBe(true);
    expect(speechLocaleMatchesScope("en-IN", "en-US")).toBe(true);
    expect(speechLocaleMatchesScope("en-CA", "en-GB")).toBe(false);
  });
});
