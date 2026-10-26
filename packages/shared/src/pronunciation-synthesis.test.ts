import { describe, expect, it } from "vitest";
import {
  convertDictionaryPhonetic,
  convertDictionaryToAzureIpa,
  convertAzureIpaToUps,
  synthesisForLocale,
  grammarSynthesisContent,
  pronunciationSynthesisContent,
  pronunciationSynthesisLabel,
  editSynthesisUpsWords,
  synthesisPhonemeWordRanges,
  synthesisInputIssue,
  readingRevision,
  mapSynthesisSpeechContent
} from "./pronunciation-synthesis";

describe("手动选源", () => {
  it.each(["ipa", "ups", "spelling"] as const)(
    "已有 IPA 和 UPS 时仍使用明确选择的 %s",
    (source) => {
      const synthesis = {
        alphabet: source === "ups" ? ("ups" as const) : ("ipa" as const),
        use_spelling: source === "spelling",
        ipa: "",
        ups: "",
        uk: { ipa: "fɑː", ups: "F AA" },
        us: { ipa: "fɑɹ", ups: "F AA R" }
      };
      const selected = synthesisForLocale(synthesis, "en-US");
      expect(selected.alphabet).toBe(synthesis.alphabet);
      expect(selected.use_spelling).toBe(synthesis.use_spelling);
      expect(
        pronunciationSynthesisContent("far", selected)?.annotations
      ).toEqual(
        source === "spelling"
          ? []
          : [
              {
                type: "phoneme",
                start: 0,
                end: 3,
                alphabet: source,
                phoneme: source === "ipa" ? "fɑɹ" : "F AA R"
              }
            ]
      );
      expect(pronunciationSynthesisLabel(synthesis, "common")).toContain(
        source === "spelling" ? "词形拼写" : `Azure ${source.toUpperCase()}`
      );
    }
  );

  it("选中 UPS 后留空不静默切换成 IPA，也不借用另一侧 UPS", () => {
    const synthesis = {
      alphabet: "ups" as const,
      use_spelling: false,
      ipa: "",
      ups: "",
      uk: { ipa: "fɑː", ups: "F AA" },
      us: { ipa: "fɑɹ", ups: "" }
    };
    expect(
      pronunciationSynthesisContent("far", synthesis, "en-US")
    ).toBeUndefined();
    expect(
      pronunciationSynthesisContent("far", synthesis, "en-GB")?.annotations
    ).toEqual([
      { type: "phoneme", start: 0, end: 3, alphabet: "ups", phoneme: "F AA" }
    ]);
  });
});

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
  it("明确选择第二读法及源字段，版本或口音失配时不回退首条", () => {
    const second = {
      ...first,
      id: "selected-second",
      synthesis: { ...first.synthesis, ipa: "dʒɛb" }
    };
    const reference = {
      uk: {
        pronunciation_id: second.id,
        alphabet: "ipa" as const,
        locale: "en-GB" as const,
        revision: readingRevision(second.synthesis, "en-GB", "uk", "ipa")
      }
    };
    const precise = {
      ...binding,
      pronunciations: [first, second],
      reading_reference: reference
    };
    expect(
      grammarSynthesisContent(content, [precise], "en-GB").annotations
    ).toEqual([
      { type: "phoneme", start: 4, end: 7, alphabet: "ipa", phoneme: "dʒɛb" }
    ]);
    expect(() => grammarSynthesisContent(content, [precise], "en-US")).toThrow(
      /当前口音未选择读法/
    );
    expect(() =>
      grammarSynthesisContent(
        content,
        [
          {
            ...precise,
            reading_reference: { uk: { ...reference.uk, revision: "stale" } }
          }
        ],
        "en-GB"
      )
    ).toThrow(/版本变化/);
  });
  it("明确自然朗读覆盖源词形口音，源设置的特殊读法不抹掉关联指定音素", () => {
    const natural = {
      ...first,
      synthesis: { ...first.synthesis, use_spelling: true }
    };
    const reference = {
      uk: {
        pronunciation_id: first.id,
        alphabet: "ipa" as const,
        locale: "en-GB" as const,
        use_spelling: true,
        revision: readingRevision(natural.synthesis, "en-GB", "us", "ipa")
      }
    };
    expect(
      grammarSynthesisContent(
        content,
        [
          {
            ...binding,
            dialect: "us",
            pronunciations: [first],
            reading_reference: reference
          }
        ],
        "en-GB"
      ).annotations
    ).toEqual([]);
    const annotated = {
      ...first,
      synthesis: {
        ...first.synthesis,
        uk: {
          ipa: "dʒɒb",
          ups: "JH Q B",
          ipa_speech: {
            content: {
              version: 2 as const,
              text: "job",
              annotations: [
                { type: "sub" as const, start: 0, end: 3, alias: "work" }
              ]
            },
            voice_profile: { voices: [] }
          }
        }
      }
    };
    expect(
      grammarSynthesisContent(
        content,
        [{ ...binding, pronunciations: [annotated] }],
        "en-GB"
      ).annotations
    ).toEqual([
      { type: "phoneme", start: 4, end: 7, alphabet: "ipa", phoneme: "dʒɒb" }
    ]);
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

describe("IPA/UPS 来源与独立停顿", () => {
  it("特殊读法按完整 UPS 词界往返，覆盖当前词音素且保留其余词", () => {
    const candidate = {
      ipa: "fɑː əˈweɪ",
      ups: "F AA lng AX W EY",
      ups_words: [
        { text: "far", phoneme: "F AA lng" },
        { text: "away", phoneme: "AX W EY" }
      ]
    };
    const phones = {
      version: 2 as const,
      text: candidate.ups,
      annotations: [
        { type: "sub" as const, start: 0, end: 8, alias: "distant" }
      ]
    };
    const speech = mapSynthesisSpeechContent(
      phones,
      "far away",
      candidate,
      "ups",
      true
    )!;
    expect(speech.annotations).toEqual([
      { type: "sub", start: 0, end: 3, alias: "distant" }
    ]);
    expect(
      mapSynthesisSpeechContent(speech, "far away", candidate, "ups", false)
    ).toEqual(phones);
    expect(
      mapSynthesisSpeechContent(
        { ...phones, annotations: [{ ...phones.annotations[0]!, end: 4 }] },
        "far away",
        candidate,
        "ups",
        true
      )
    ).toBeUndefined();
    const content = pronunciationSynthesisContent("far away", {
      ...candidate,
      alphabet: "ups",
      ups_speech: { content: speech, voice_profile: { voices: [] } }
    })!;
    expect(content.annotations).toEqual([
      {
        type: "phoneme",
        start: 4,
        end: 8,
        alphabet: "ups",
        phoneme: "AX W EY"
      },
      { type: "sub", start: 0, end: 3, alias: "distant" }
    ]);
  });
  it("读法版本的 UPS 词界使用固定数组格式，不受 JSON 对象键顺序影响", () => {
    const synthesis = {
      alphabet: "ups" as const,
      ipa: "kæt",
      ups: "K AE T",
      ups_words: [{ phoneme: "K AE T", text: "cat" }]
    };
    expect(readingRevision(synthesis, "en-GB", "uk", "ups")).toBe(
      '["en-GB","ups","K AE T",[["cat","K AE T"]],false]'
    );
  });
  it("将音标词界映射到正文词界，UPS 音素间空格不视为正文词界", () => {
    const candidate = {
      ipa: "fɑː ə.ˈweɪ",
      ups: "F AA lng AX . S1 W EY",
      ups_words: [
        { text: "far", phoneme: "F AA lng" },
        { text: "away", phoneme: "AX . S1 W EY" }
      ]
    };
    expect(synthesisPhonemeWordRanges("far away", candidate, "ipa")).toEqual([
      { textEnd: 3, start: 0, end: 3 },
      { textEnd: 8, start: 4, end: 10 }
    ]);
    expect(synthesisPhonemeWordRanges("far away", candidate, "ups")).toEqual([
      { textEnd: 3, start: 0, end: 8 },
      { textEnd: 8, start: 9, end: 21 }
    ]);
    expect(
      synthesisPhonemeWordRanges(
        "far away",
        { ...candidate, ups_words: null },
        "ups"
      )
    ).toBeUndefined();
    expect(
      synthesisPhonemeWordRanges("job", { ipa: "dʒɒb", ups: "JH Q B" }, "ups")
    ).toEqual([{ textEnd: 3, start: 0, end: 6 }]);
  });
  it("只在单个词的 UPS 音素内编辑时保留显式词界，不猜测跨词修改的归属", () => {
    const candidate = {
      ipa: "",
      ups: "F AA lng AX W EY",
      ups_words: [
        { text: "far", phoneme: "F AA lng" },
        { text: "away", phoneme: "AX W EY" }
      ]
    };
    expect(
      editSynthesisUpsWords("far away", candidate, "F AA R lng AX W EY")
    ).toEqual([
      { text: "far", phoneme: "F AA R lng" },
      { text: "away", phoneme: "AX W EY" }
    ]);
    expect(
      editSynthesisUpsWords("far away", candidate, "F AA lng AX W I")
    ).toEqual([
      { text: "far", phoneme: "F AA lng" },
      { text: "away", phoneme: "AX W I" }
    ]);
    expect(editSynthesisUpsWords("far away", candidate, candidate.ups)).toBe(
      candidate.ups_words
    );
    expect(editSynthesisUpsWords("far away", candidate, "JH Q B")).toBeNull();
    expect(
      editSynthesisUpsWords("far away", candidate, "F AA lngAX W EY")
    ).toBeNull();
  });
  it.each(["en-GB", "en-US"] as const)(
    "%s 从 different 字典音标生成规范 IPA，严格 UPS 拒绝原始 r",
    (locale) => {
      expect(
        convertDictionaryToAzureIpa("ˈdɪfrənt", "different", locale)
      ).toMatchObject({
        ok: true,
        value: "ˈdɪfɹənt"
      });
      expect(
        convertAzureIpaToUps("ˈdɪfrənt", "different", locale)
      ).toMatchObject({
        ok: false,
        message: expect.stringContaining("第 5 个字符「r」")
      });
      expect(
        convertAzureIpaToUps("ˈdɪfɹənt", "different", locale)
      ).toMatchObject({
        ok: true,
        value: "S1 D IH F R AX N T"
      });
    }
  );
  it("字典括号不进入 IPA，UPS 直接保留人工 IPA 的音素", () => {
    expect(
      convertDictionaryToAzureIpa("/k(æ)t/", "cat", "en-US")
    ).toMatchObject({ ok: true, value: "kæt" });
    expect(convertAzureIpaToUps("kɛt", "cat", "en-US")).toEqual({
      ok: true,
      value: "K EH T",
      ups_words: [{ text: "cat", phoneme: "K EH T" }]
    });
    expect(convertAzureIpaToUps("", "cat", "en-US")).toMatchObject({
      ok: false
    });
    expect(convertAzureIpaToUps("kæt dɔg", "cat", "en-US")).toMatchObject({
      ok: false
    });
  });
  it("每种口音与格式仅应用自己的停顿；UPS 依据逐词元数据而非音素空格", () => {
    const speech = (duration_ms: number) => ({
      content: {
        version: 2 as const,
        text: "far away",
        annotations: [{ type: "pause" as const, at: 3, duration_ms }]
      },
      voice_profile: { voices: [] }
    });
    const synthesis = {
      alphabet: "ipa" as const,
      use_spelling: false,
      ipa: "",
      ups: "",
      uk: {
        ipa: "fɑː əˈweɪ",
        ups: "F AA lng AX W EY",
        ups_words: [
          { text: "far", phoneme: "F AA lng" },
          { text: "away", phoneme: "AX W EY" }
        ],
        ipa_speech: speech(500),
        ups_speech: speech(1000)
      },
      us: {
        ipa: "fɑɹ əˈweɪ",
        ups: "F AA R AX W EY",
        ups_words: [
          { text: "far", phoneme: "F AA R" },
          { text: "away", phoneme: "AX W EY" }
        ],
        ipa_speech: speech(1500),
        ups_speech: speech(2000)
      }
    };
    for (const [locale, ipaPause, upsPause] of [
      ["en-GB", 500, 1000],
      ["en-US", 1500, 2000]
    ] as const) {
      for (const [alphabet, duration_ms] of [
        ["ipa", ipaPause],
        ["ups", upsPause]
      ] as const) {
        const selected = synthesisForLocale({ ...synthesis, alphabet }, locale);
        const content = pronunciationSynthesisContent(
          "far away",
          selected,
          locale
        )!;
        expect(content.annotations).toContainEqual({
          type: "pause",
          at: 3,
          duration_ms
        });
        expect(
          content.annotations.filter((mark) => mark.type === "phoneme")
        ).toHaveLength(2);
      }
    }
    expect(
      pronunciationSynthesisContent(
        "far away",
        { ...synthesis, use_spelling: true },
        "en-GB"
      )?.annotations
    ).toEqual([]);
    const legacy = {
      ...synthesis,
      alphabet: "ups" as const,
      uk: { ...synthesis.uk, ups_words: undefined }
    };
    expect(
      pronunciationSynthesisContent("far away", legacy, "en-GB")
    ).toBeUndefined();
  });
});
