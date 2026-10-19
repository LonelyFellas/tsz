import { describe, expect, it } from "vitest";
import { convertDictionaryToUnified } from "./unified-phonetic";
import {
  convertActualPronunciation,
  pronunciationSynthesisContent
} from "./pronunciation-synthesis";

describe("语雀统一音标规则", () => {
  it("逐字正音不套用语流连读或强弱读例词替换", () => {
    expect(
      convertDictionaryToUnified("ˈfæmɪlɪ", "family", "uk", "citation")
    ).toMatchObject({
      ok: true,
      value: "ˈfæmɪlɪ",
      notices: [expect.stringContaining("文档未明确此词的该读法")]
    });
  });
  it("音节及重音标记不把后接元音的 r 变成卷舌韵尾", () => {
    for (const [input, expected] of [
      ["ˈvɛr.i", "ˈvɛr.ɪ"],
      ["vɛrˈi", "vɛrˈi"],
      ["ˈvɪr.əl", "ˈvɪr.əl"],
      ["ˈvɛrɚ", "ˈvɛrər"]
    ])
      expect(convertDictionaryToUnified(input!, "very", "uk")).toMatchObject({
        ok: true,
        value: expected
      });
  });
  it("e 与 ɛ 的等价字典记法经过相同的卷舌和读法转换", () => {
    for (const [word, first, second, expected] of [
      ["careful", "ˈkerfʊl", "ˈkɛrfʊl", "ˈkɛərfəl"],
      ["hair", "her", "hɛr", "hɛər"],
      ["very", "ˈver.i", "ˈvɛr.i", "ˈvɛr.ɪ"]
    ]) {
      const result = convertDictionaryToUnified(first!, word!, "us");
      expect(result).toMatchObject({ ok: true, value: expected });
      expect(result).toEqual(convertDictionaryToUnified(second!, word!, "us"));
    }
  });
  it("与对象原型同名的词形按普通词处理，不命中例词规则", () => {
    expect(
      convertDictionaryToUnified("kənˈstrʌktər", "constructor", "us")
    ).toMatchObject({ ok: true });
    expect(convertDictionaryToUnified("kæt", "__proto__", "us")).toMatchObject({
      ok: true,
      value: "kæt"
    });
  });
  it.each([
    ["bed", "bed", "bɛd"],
    ["hot", "hɑt", "hɒt"],
    ["car", "kɑr", "kɑr"],
    ["father", "ˈfɑːðə", "ˈfɑːðə"],
    ["happy", "ˈhæpi", "ˈhæpɪ"],
    ["machine", "məˈʃin", "məˈʃin"],
    ["go", "goʊ", "gəʊ"],
    ["day", "deɪ", "deɪ"],
    ["near", "nɪr", "nɪʲər"],
    ["near", "nɪə", "nɪʲə"],
    ["cure", "kjʊr", "kjʊʷər"],
    ["hair", "hɛr", "hɛər"],
    ["fire", "faɪr", "faɪʲər"],
    ["hour", "aʊə", "aʊʷə"],
    ["hour", "aʊʸr", "aʊʷər"],
    ["very", "ˈvɛri", "ˈvɛrɪ"],
    ["bird", "bɝd", "bərd"],
    ["teacher", "ˈtiːtʃɚ", "ˈtiːtʃər"],
    ["tune", "tjuːn", "tjuːn"],
    ["you", "ju", "jʊ"],
    ["tune", "tuːn", "tuːn"],
    ["school", "skuːl", "sguːl"],
    ["stand", "stænd", "sdænd"],
    ["speak", "spiːk", "sbiːk"],
    ["last", "lɑːst", "lɑːst"],
    ["butter", "ˈbʌɾər", "ˈbʌdər"],
    ["bottle", "ˈbɒtl", "ˈbɒtəl"],
    ["travel", "ˈtrævl", "ˈtrævəl"],
    ["seven", "ˈsevn", "ˈsɛvən"],
    ["vision", "ˈvɪʒn", "ˈvɪʒən"],
    ["button", "ˈbʌtn̩", "ˈbʌtən"],
    ["rhythm", "ˈrɪðəm", "ˈrɪðəm"],
    ["Hudson", "ˈhʌdsn", "ˈhʌtsən"]
  ])("%s: %s → %s", (word, input, expected) => {
    expect(convertDictionaryToUnified(input, word, "uk")).toMatchObject({
      ok: true,
      value: expected
    });
  });

  it("音变采用口音与文档示例，不把所有 t/d/b 都替换", () => {
    expect(convertDictionaryToUnified("ˈbʌtər", "butter", "us")).toMatchObject({
      value: "ˈbʌdər"
    });
    expect(convertDictionaryToUnified("ˈsɪtɪ", "city", "us")).toMatchObject({
      value: "ˈsɪdɪ"
    });
    expect(convertDictionaryToUnified("bɪb", "bib", "uk")).toMatchObject({
      value: "bɪp"
    });
    expect(convertDictionaryToUnified("bɪb", "bib", "us")).toMatchObject({
      value: "bɪb"
    });
    expect(convertDictionaryToUnified("ˈlædər", "ladder", "us")).toMatchObject({
      value: "ˈlædər"
    });
    expect(
      convertDictionaryToUnified("/əv kɔːrs/", "of course", "us")
    ).toMatchObject({ value: "əf kɔːrs" });
    expect(convertDictionaryToUnified("əv", "of", "us")).toMatchObject({
      value: "əv"
    });
    expect(convertDictionaryToUnified("ˈsɪtɪ", "city", "common")).toMatchObject(
      { value: "ˈsɪtɪ", notices: [expect.stringContaining("英美差异")] }
    );
  });

  it("按所选读法转换文档示例，未知弱读提示核对且不伪造变体", () => {
    for (const [style, value] of [
      ["strong", "ˈfæmɪlɪ"],
      ["normal", "ˈfæməlɪ"],
      ["weak", "ˈfæmlɪ"]
    ] as const)
      expect(
        convertDictionaryToUnified("ˈfæmɪli", "family", "us", style)
      ).toMatchObject({ value, notices: [] });
    expect(
      convertDictionaryToUnified("ˈdɛfɪnɪt", "definite", "us", "weak")
    ).toMatchObject({ value: "ˈdɛfənət" });
    expect(
      convertDictionaryToUnified("ˈjuːsfʊl", "useful", "uk")
    ).toMatchObject({ value: "ˈjuːsfəl" });
    expect(
      convertDictionaryToUnified("ˈkɛrfʊl", "careful", "us")
    ).toMatchObject({ value: "ˈkɛərfəl" });
    expect(
      convertDictionaryToUnified("ˈlɪtɛrətʃə", "literature", "uk")
    ).toMatchObject({ value: "ˈlɪtrətʃə" });
    expect(
      convertDictionaryToUnified("ˈdɪfɛrent", "different", "uk")
    ).toMatchObject({ value: "ˈdɪfrənt" });
    expect(
      convertDictionaryToUnified("ˈbʌtn", "button", "us", "weak")
    ).toMatchObject({ value: "ˈbʌʔən", notices: [] });
    expect(
      convertDictionaryToUnified("ˈɪtəli", "Italy", "us", "weak")
    ).toMatchObject({ value: "ˈɪʔəlɪ" });
    expect(
      convertDictionaryToUnified("ˈwɪntər", "winter", "us", "weak")
    ).toMatchObject({
      value: "ˈwɪntər",
      notices: [expect.stringContaining("鼻音闪音")]
    });
    expect(convertDictionaryToUnified("kæt", "family", "us")).toMatchObject({
      value: "kæt"
    });
  });

  it("空值、控制符、混合读音和词界错误不返回部分转换", () => {
    for (const [input, word] of [
      ["", "cat"],
      ["kæt\n", "cat"],
      ["kæt😀", "cat"],
      ["kæt; kɛt", "cat"],
      ["kæt dɒg", "cat"],
      ["[kæt", "cat"],
      [".", "cat"],
      ["kætˈ", "cat"],
      ["kːæt", "cat"]
    ])
      expect(convertDictionaryToUnified(input!, word!, "uk")).toMatchObject({
        ok: false
      });
    expect(
      convertDictionaryToUnified(" [ /skuːl/ /deɪ/ ] ", "school day", "uk")
    ).toMatchObject({ value: "sguːl deɪ" });
  });
});

describe("统一音标 → Azure IPA / UPS", () => {
  it("重音边界只补一次，重复转换不累积音节分隔或卷舌标记", () => {
    for (const [word, input, dialect] of [
      ["hello", "həˈloʊ", "us"],
      ["near", "nɪr", "us"],
      ["school", "skuːl", "uk"],
      ["family", "ˈfæmɪli", "us"]
    ] as const) {
      const first = convertDictionaryToUnified(input, word, dialect);
      expect(first.ok).toBe(true);
      if (!first.ok) throw Error(first.message);
      expect(convertDictionaryToUnified(first.value, word, dialect)).toEqual(
        first
      );
      const locale = dialect === "us" ? "en-US" : "en-GB";
      const ipa = convertActualPronunciation(first.value, word, "ipa", locale);
      if (!ipa.ok) throw Error(ipa.message);
      expect(
        convertActualPronunciation(ipa.value, word, "ipa", locale)
      ).toEqual(ipa);
      expect(
        convertActualPronunciation(ipa.value, word, "ups", locale)
      ).toEqual(convertActualPronunciation(first.value, word, "ups", locale));
    }
  });
  it.each([
    ["en-GB", "wɜːld", "wɜːld", "W ER lng L D"],
    ["en-US", "wərld", "wəɹld", "W AX R L D"],
    ["en-GB", "həˈləʊ", "hə.ˈləʊ", "H AX . S1 L AX + UH"],
    ["en-US", "həˈləʊ", "hə.ˈloʊ", "H AX . S1 L O"],
    ["en-GB", "nɪʲə", "nɪə", "N IH + AX"],
    ["en-US", "nɪʲər", "nɪɹ", "N IH R"],
    ["en-US", "kjʊʷər", "kjʊɹ", "K J UH R"],
    ["en-US", "hɛər", "hɛɹ", "H EH R"],
    ["en-US", "faɪʲər", "faɪɹ", "F AI R"],
    ["en-US", "aʊʷər", "aʊɹ", "AU R"],
    ["en-GB", "aʊʷə", "aʊə", "AU AX"],
    ["en-US", "kɑr", "kɑɹ", "K AA R"],
    ["en-US", "hɒt", "hɑt", "H AA T"],
    ["en-GB", "sguːl", "sguːl", "S G U lng L"],
    ["en-US", "sguːl", "sgul", "S G U L"],
    ["en-US", "ˈbʌdər", "ˈbʌdəɹ", "S1 B AH D AX R"],
    ["en-US", "bɝd", "bɝd", "B ER R D"]
  ])("%s %s 同时生成一致的 IPA 与 UPS", (locale, source, ipa, ups) => {
    expect(
      convertActualPronunciation(source, "word", "ipa", locale)
    ).toMatchObject({ ok: true, value: ipa });
    expect(
      convertActualPronunciation(source, "word", "ups", locale)
    ).toMatchObject({ ok: true, value: ups });
  });

  it("短语保持逐词元数据，失败时不给部分结果", () => {
    const result = convertActualPronunciation(
      "[nɪʲər skuːl]",
      "near school",
      "ups",
      "en-US"
    );
    expect(result).toMatchObject({
      ok: true,
      value: "N IH R S K U L",
      ups_words: [
        { text: "near", phoneme: "N IH R" },
        { text: "school", phoneme: "S K U L" }
      ]
    });
    if (!result.ok) throw Error("conversion failed");
    expect(
      pronunciationSynthesisContent("near school", {
        alphabet: "ups",
        ipa: "",
        ups: result.value,
        ups_words: result.ups_words,
        use_spelling: false
      })?.annotations
    ).toHaveLength(2);
    for (const alphabet of ["ipa", "ups"] as const) {
      expect(
        convertActualPronunciation(
          "nɪʲər ˈbʌʔən",
          "near button",
          alphabet,
          "en-US"
        )
      ).toEqual({ ok: false, message: expect.stringContaining("喉塞音") });
      expect(
        convertActualPronunciation("wɜːld", "world", alphabet, "en-US")
      ).toMatchObject({ ok: false });
      expect(
        convertActualPronunciation("kætʲ", "cat", alphabet, "en-GB")
      ).toMatchObject({ ok: false });
    }
  });
});
