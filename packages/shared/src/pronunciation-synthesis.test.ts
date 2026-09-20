import { describe, expect, it } from "vitest";
import {
  convertDictionaryPhonetic,
  pronunciationSynthesisContent,
  synthesisInputIssue
} from "./pronunciation-synthesis";

describe("独立合成输入", () => {
  it("拼写是正文，选中音素是覆盖全码点区间的参数；未选中候选不参与", () => {
    const synthesis = {
      alphabet: "ups" as const,
      ipa: "manually edited",
      ups: "K AE T"
    };
    const expected = {
      version: 2,
      text: "cat😀",
      annotations: [
        {
          type: "phoneme",
          start: 0,
          end: 4,
          alphabet: "ups",
          phoneme: "K AE T"
        }
      ]
    };
    expect(pronunciationSynthesisContent("cat😀", synthesis)).toEqual(expected);
    expect(
      pronunciationSynthesisContent("cat😀", { ...synthesis, ipa: "changed" })
    ).toEqual(expected);
    expect(
      pronunciationSynthesisContent("cat", { ...synthesis, ups: "" })
    ).toBeUndefined();
    expect(pronunciationSynthesisContent("cat")).toBeUndefined();
  });
  it("只转换可确定的符号；保留原始错误位置且不返回部分结果", () => {
    expect(convertDictionaryPhonetic(" /kæt/ ", "ipa")).toEqual({
      ok: true,
      value: "kæt"
    });
    expect(convertDictionaryPhonetic(" /kæt/ ", "ups")).toEqual({
      ok: true,
      value: "K AE T"
    });
    expect(convertDictionaryPhonetic("/kæt😀/", "ups")).toMatchObject({
      ok: false,
      position: 4,
      symbol: "😀"
    });
    expect(convertDictionaryPhonetic("rɛd", "ipa")).toMatchObject({
      ok: false,
      position: 0
    });
    expect(convertDictionaryPhonetic("iː", "ups")).toMatchObject({
      ok: false,
      position: 0
    });
    expect(convertDictionaryPhonetic("t͡ʃɪn", "ups")).toEqual({
      ok: true,
      value: "CH IH N"
    });
    expect(convertDictionaryPhonetic(".", "ipa")).toMatchObject({ ok: false });
    expect(convertDictionaryPhonetic("ɔɪ", "ups")).toMatchObject({ ok: false });
  });
  it.each(["həˈləʊ", "təˈmeɪtoʊ", "ˌʌndəˈstænd", "hə.ˈləʊ"])(
    "IPA 保留重音位置，不要求重音前额外加音节点：%s",
    (value) => {
      expect(convertDictionaryPhonetic(value, "ipa")).toEqual({
        ok: true,
        value
      });
    }
  );
  it.each(["həˈ", "həˈ.ləʊ", "həˈˌləʊ", "hə..ləʊ"])(
    "仍拒绝非法重音或音节边界：%s",
    (value) => {
      expect(convertDictionaryPhonetic(value, "ipa")).toMatchObject({
        ok: false
      });
    }
  );
  it("不将 IPA 重音直接转换为 UPS", () => {
    expect(convertDictionaryPhonetic("həˈləʊ", "ups")).toMatchObject({
      ok: false,
      position: 2,
      symbol: "ˈ"
    });
  });
  it("UPS 有独立展开长度，控制字符与非 ASCII UPS 不发起试听", () => {
    expect(synthesisInputIssue("ipa", "a".repeat(201))).toContain("200");
    expect(synthesisInputIssue("ups", "A".repeat(1600))).toBeUndefined();
    expect(synthesisInputIssue("ups", "A".repeat(1601))).toContain("1600");
    expect(synthesisInputIssue("ups", "kæt")).toContain("ASCII");
    expect(synthesisInputIssue("ipa", "k\nt")).toContain("控制字符");
  });
});
