import { describe, expect, it } from "vitest";
import type { VoiceOption } from "../../types";
import {
  formatPauseLabel,
  normalizeGrammarLevel,
  voiceShortName
} from "./roles";

function voice(label: string): VoiceOption {
  return {
    id: "v",
    label,
    locale: "en-GB",
    gender: "female",
    styles: [],
    supportsRate: true,
    supportsPitch: true,
    isDefault: false
  };
}

describe("normalizeGrammarLevel", () => {
  it("maps the legacy wire level onto the core role", () => {
    expect(normalizeGrammarLevel("strong")).toBe("core");
  });

  it("passes the three roles through untouched", () => {
    expect(normalizeGrammarLevel("function")).toBe("function");
    expect(normalizeGrammarLevel("core")).toBe("core");
    expect(normalizeGrammarLevel("grammar")).toBe("grammar");
  });

  it("treats missing or empty levels as unmarked", () => {
    expect(normalizeGrammarLevel(undefined)).toBeUndefined();
    expect(normalizeGrammarLevel(null)).toBeUndefined();
    expect(normalizeGrammarLevel("")).toBeUndefined();
  });
});

describe("formatPauseLabel", () => {
  it("不足 1 秒用 ms", () => {
    expect(formatPauseLabel(500)).toBe("500ms");
    expect(formatPauseLabel(999)).toBe("999ms");
  });

  it("整秒不补小数零", () => {
    expect(formatPauseLabel(1000)).toBe("1s");
    expect(formatPauseLabel(5000)).toBe("5s");
  });

  it("非整秒保留一位小数", () => {
    expect(formatPauseLabel(1500)).toBe("1.5s");
  });
});

describe("voiceShortName", () => {
  it("keeps only the name ahead of the separator", () => {
    expect(voiceShortName(voice("Sonia · 英式女声"))).toBe("Sonia");
  });

  it("falls back to the whole label when there is no separator", () => {
    expect(voiceShortName(voice("Sonia"))).toBe("Sonia");
  });

  it("falls back to the whole label when the name part is blank", () => {
    expect(voiceShortName(voice(" · 英式女声"))).toBe(" · 英式女声");
  });
});
