import { describe, expect, it } from "vitest";
import {
  convertDictionaryPhonetic,
  grammarSynthesisContent,
  pronunciationSynthesisContent,
  pronunciationSynthesisLabel,
  synthesisInputIssue
} from "./pronunciation-synthesis";

it("区分词形的合成摘要只显示自身方言", () => {
  const uk = {
    alphabet: "ipa" as const,
    ipa: "",
    ups: "",
    uk: { ipa: "sɛn.tə", ups: "" }
  };
  const us = {
    alphabet: "ipa" as const,
    ipa: "",
    ups: "",
    us: { ipa: "sɛn.tɚ", ups: "" }
  };
  expect(pronunciationSynthesisLabel(uk, "uk")).toBe(
    "Azure IPA · 英式：sɛn.tə"
  );
  expect(pronunciationSynthesisLabel(us, "us")).toBe(
    "Azure IPA · 美式：sɛn.tɚ"
  );
});

describe("语法结构整段合成", () => {
  const first = {
    id: "first",
    dict_phonetic: "",
    actual_pron: "",
    synthesis: {
      alphabet: "ipa" as const,
      ipa: "dʒɒb",
      ups: "",
      ipa_locale: "en-GB" as const
    }
  };
  const binding = {
    source_segments: [{ start: 4, end: 7, surface: "job" }],
    dialect: "uk" as const,
    pronunciations: [
      first,
      {
        ...first,
        id: "second",
        synthesis: { ...first.synthesis, ipa: "never-read-this" }
      }
    ]
  };
  const content = { version: 2 as const, text: "😀 a job", annotations: [] };
  it("大写正文关联小写词形时，UPS 仍覆盖当前完整单词", () => {
    expect(
      grammarSynthesisContent(
        { version: 2, text: "a Job", annotations: [] },
        [
          {
            source_segments: [{ start: 2, end: 5, surface: "Job" }],
            dialect: "uk",
            pronunciations: [
              {
                ...first,
                synthesis: {
                  alphabet: "ups",
                  ipa: "",
                  ups: "JH Q B",
                  ups_locale: "en-GB",
                  ups_words: [{ text: "job", phoneme: "JH Q B" }]
                }
              }
            ]
          }
        ],
        "en-GB"
      )
    ).toEqual({
      version: 2,
      text: "a Job",
      annotations: [
        {
          type: "phoneme",
          start: 2,
          end: 5,
          alphabet: "ups",
          phoneme: "JH Q B"
        }
      ]
    });
  });
  it("保持整段正文，只将关联词形的第一条发音标注到对应码点", () => {
    expect(grammarSynthesisContent(content, [binding], "en-GB")).toEqual({
      ...content,
      annotations: [
        { type: "phoneme", start: 4, end: 7, alphabet: "ipa", phoneme: "dʒɒb" }
      ]
    });
  });
  it("词形发音注入保留斜体和加粗，正文与音素不因视觉标注改变", () => {
    const visual = [
      { type: "italic" as const, start: 5, end: 7 },
      { type: "emphasis" as const, start: 4, end: 7, level: "core" as const }
    ];
    const plain = grammarSynthesisContent(content, [binding], "en-GB");
    const styled = grammarSynthesisContent(
      { ...content, annotations: visual },
      [binding],
      "en-GB"
    );
    expect(styled.text).toBe(plain.text);
    expect(
      styled.annotations.filter((item) => item.type === "phoneme")
    ).toEqual(plain.annotations);
    expect(
      styled.annotations.filter((item) => item.type !== "phoneme")
    ).toEqual(visual);
  });
  it("首条未配置或口音不匹配时明确报错，不跳到第二条或默认发音", () => {
    expect(() =>
      grammarSynthesisContent(
        content,
        [
          {
            ...binding,
            pronunciations: [{ ...first, synthesis: undefined }, first]
          }
        ],
        "en-GB"
      )
    ).toThrow(/第一个发音/);
    expect(() => grammarSynthesisContent(content, [binding], "en-US")).toThrow(
      /第一个发音/
    );
    expect(() =>
      grammarSynthesisContent(
        content,
        [{ ...binding, pronunciations: [] }],
        "en-GB"
      )
    ).toThrow(/第一个发音/);
  });
  it("旧英式词形未记录音素口音时也不借用美式发音人", () => {
    expect(() =>
      grammarSynthesisContent(
        content,
        [
          {
            ...binding,
            pronunciations: [
              {
                ...first,
                synthesis: { ...first.synthesis, ipa_locale: undefined }
              }
            ]
          }
        ],
        "en-US"
      )
    ).toThrow(/第一个发音/);
  });
  it("首条明确选择按拼写合成时尊重该设置，未关联文本和停顿原样保留", () => {
    const paused = {
      ...content,
      annotations: [{ type: "pause" as const, at: 3, duration_ms: 500 }]
    };
    expect(
      grammarSynthesisContent(
        paused,
        [
          {
            ...binding,
            pronunciations: [
              {
                ...first,
                synthesis: { ...first.synthesis, use_spelling: true }
              },
              first
            ]
          }
        ],
        "en-GB"
      )
    ).toEqual(paused);
    expect(grammarSynthesisContent(paused, [], "en-GB")).toEqual(paused);
  });
});

describe("英美独立合成候选", () => {
  const synthesis = {
    alphabet: "ipa" as const,
    use_spelling: false,
    ipa: "",
    ups: "",
    uk: { ipa: "fɑː", ups: "F AA" },
    us: { ipa: "fɑɹ", ups: "F AA R" }
  };
  it("按目标口音使用对应候选，不将英式借给美式", () => {
    expect(
      pronunciationSynthesisContent("far", synthesis, "en-GB")?.annotations
    ).toEqual([
      { type: "phoneme", start: 0, end: 3, alphabet: "ipa", phoneme: "fɑː" }
    ]);
    expect(
      pronunciationSynthesisContent("far", synthesis, "en-US")?.annotations
    ).toEqual([
      { type: "phoneme", start: 0, end: 3, alphabet: "ipa", phoneme: "fɑɹ" }
    ]);
    expect(
      pronunciationSynthesisContent(
        "far",
        { ...synthesis, us: { ipa: "", ups: "" } },
        "en-US"
      )
    ).toBeUndefined();
  });
  it("双口音记录缺少一侧时，不借用未确认的旧顶层音素", () => {
    expect(
      pronunciationSynthesisContent(
        "far",
        { ...synthesis, ipa: "legacy-unknown", us: undefined },
        "en-US"
      )
    ).toBeUndefined();
  });
  it("补美式候选后保留明确英式词形的历史英式音素", () => {
    expect(
      grammarSynthesisContent(
        { version: 2, text: "far", annotations: [] },
        [
          {
            dialect: "uk",
            source_segments: [{ start: 0, end: 3, surface: "far" }],
            pronunciations: [
              {
                id: "p",
                dict_phonetic: "",
                actual_pron: "",
                synthesis: { ...synthesis, uk: undefined, ipa: "fɑː" }
              }
            ]
          }
        ],
        "en-GB"
      ).annotations
    ).toEqual([
      { type: "phoneme", start: 0, end: 3, alphabet: "ipa", phoneme: "fɑː" }
    ]);
  });
  it("词形地区不限制已独立配置的另一口音，语法整段合成取目标侧", () => {
    expect(
      grammarSynthesisContent(
        { version: 2, text: "far", annotations: [] },
        [
          {
            dialect: "uk",
            source_segments: [{ start: 0, end: 3, surface: "far" }],
            pronunciations: [
              { id: "p", dict_phonetic: "fɑː", actual_pron: "fɑː", synthesis }
            ]
          }
        ],
        "en-US"
      ).annotations
    ).toEqual([
      { type: "phoneme", start: 0, end: 3, alphabet: "ipa", phoneme: "fɑɹ" }
    ]);
  });
});

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
