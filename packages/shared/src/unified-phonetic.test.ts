import { describe, expect, it } from "vitest";
import { convertDictionaryToUnified } from "./unified-phonetic";
import {
  convertActualPronunciation,
  convertDictionaryToAzureIpa,
  pronunciationSynthesisContent
} from "./pronunciation-synthesis";

describe("语雀统一音标规则", () => {
  it("逐字正音不套用语流连读或强弱读例词替换", () => {
    expect(
      convertDictionaryToUnified("ˈfæmɪlɪ", "family", "uk", "citation")
    ).toMatchObject({
      ok: true,
      value: "ˈfæmɪlɪ",
      notices: [expect.any(String)]
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
    ["to", "tu", "tu"],
    ["to", "tuː", "tuː"],
    ["tune", "tuːn", "tuːn"],
    ["school", "skuːl", "sguːl"],
    ["stand", "stænd", "sdænd"],
    ["speak", "spiːk", "sbiːk"],
    ["last", "lɑːst", "lɑːst"],
    ["ask", "ɑːsk", "ɑːsk"],
    ["butter", "ˈbʌɾər", "ˈbʌdər"],
    ["bottle", "ˈbɒtl", "ˈbɒtəl"],
    ["council", "ˈkaʊnsl", "ˈkaʊnsəl"],
    ["conclusion", "kənˈkluːʒn", "kənˈkluːʒən"],
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

  it.each([
    ["workspace", "ˈwɜːkspeɪs", "uk", "en-GB", "ˈwɜːksbeɪs", "ˈwɜːkspeɪs"],
    ["workspace", "ˈwɜːrkspeɪs", "us", "en-US", "ˈwərksbeɪs", "ˈwɝkspeɪs"],
    ["chairing", "ˈtʃerɪŋ", "us", "en-US", "ˈtʃɛərɪŋ", "ˈtʃɛɹɪŋ"]
  ] as const)(
    "%s %s 将教学记法与 Azure 音标分开转换",
    (word, input, dialect, locale, actual, ipa) => {
      expect(
        convertDictionaryToAzureIpa(input, word, locale, "citation")
      ).toMatchObject({ ok: true, value: ipa });
      expect(
        convertDictionaryToUnified(input, word, dialect, "citation")
      ).toMatchObject({ ok: true, value: actual });
    }
  );

  it("通用读法不套用 chairing 的美式教学记法", () => {
    expect(
      convertDictionaryToUnified("ˈtʃerɪŋ", "chairing", "common")
    ).toMatchObject({ ok: true, value: "ˈtʃɛrɪŋ" });
  });

  it.each([
    ["explosions", "ɪkˈspləʊʒnz", "ɪkˈsbləʊʒənz"],
    ["panels", "ˈpænlz", "ˈpænəlz"],
    ["rhythms", "ˈrɪðmz", "ˈrɪðəmz"],
    ["patterns", "ˈpætnz", "ˈpætənz"],
    ["medicines", "ˈmedsnz", "ˈmɛdsənz"],
    ["atoms", "ˈætmz", "ˈætəmz"],
    ["bottles", "ˈbɒtlz", "ˈbɒtəlz"],
    ["prisms", "ˈprɪzmz", "ˈprɪzəmz"],
    ["bottled", "ˈbɒtld", "ˈbɒtəld"],
    ["buttoned", "ˈbʌtnd", "ˈbʌtənd"],
    ["fathomed", "ˈfæðmd", "ˈfæðəmd"]
  ])("词形 %s 沿用原形的成音节写法", (word, input, expected) => {
    expect(
      convertDictionaryToUnified(input, word, "uk", "citation")
    ).toMatchObject({
      ok: true,
      value: expected
    });
    expect(
      convertDictionaryToUnified(expected, word, "uk", "citation")
    ).toMatchObject({
      ok: true,
      value: expected
    });
  });

  it.each([
    ["rhythmic", "ˈrɪðmɪk"],
    ["films", "fɪlmz"],
    ["called", "kɔːld"],
    ["filmed", "fɪlmd"],
    ["finely", "ˈfaɪnlɪ"],
    ["play", "pleɪ"]
  ])("%s 的普通辅音组合保持原读音", (word, input) => {
    expect(convertDictionaryToUnified(input, word, "uk")).toMatchObject({
      ok: true,
      value: input
    });
  });

  it("同一短语逐词匹配，显式成音节标记只展开一次", () => {
    expect(
      convertDictionaryToUnified(
        "ˈrɪðmɪk ˈpænl̩z ɪkˈsploʊʒnz",
        "rhythmic panels explosions",
        "us"
      )
    ).toMatchObject({ ok: true, value: "ˈrɪðmɪk ˈpænəlz ɪkˈsbləʊʒənz" });
  });

  it("词中辅音丛没有成音节边界时不擅自补 ə", () => {
    expect(
      convertDictionaryToUnified("ˈbɒtlɪŋ", "bottling", "uk")
    ).toMatchObject({ ok: true, value: "ˈbɒtlɪŋ" });
  });

  it("不把美式实际发音中的裸 u 全局降为 ʊ", () => {
    expect(convertDictionaryToUnified("tu", "to", "us")).toMatchObject({
      ok: true,
      value: "tu"
    });
    expect(convertDictionaryToUnified("tuː", "to", "us")).toMatchObject({
      ok: true,
      value: "tuː"
    });
  });

  it("实际发音转换处理词尾 i 和美式 ɔːr", () => {
    expect(
      convertDictionaryToUnified("ɪnˈteɡrəti", "integrity", "us")
    ).toMatchObject({
      ok: true,
      value: "ɪnˈtɛgrətɪ"
    });
    expect(
      convertDictionaryToUnified("ˈmɔːr laɪk", "more like", "us")
    ).toMatchObject({ ok: true, value: "ˈmɔr laɪk" });
    expect(
      convertDictionaryToUnified("ˈmɔːr laɪk", "more like", "uk")
    ).toMatchObject({ ok: true, value: "ˈmɔːr laɪk" });
    expect(convertDictionaryToUnified("ˈɑːr", "are", "us")).toMatchObject({
      ok: true,
      value: "ˈɑr"
    });
    expect(convertDictionaryToUnified("ˈɑːr", "are", "uk")).toMatchObject({
      ok: true,
      value: "ˈɑːr"
    });
  });

  it("美式卷舌 r 后接元音时保留为音节起始", () => {
    expect(convertDictionaryToUnified("ˈɔːri", "sorry", "us")).toMatchObject({
      ok: true,
      value: "ˈɔːrɪ"
    });
    expect(convertDictionaryToUnified("ˈɑːr.i", "starry", "us")).toMatchObject({
      ok: true,
      value: "ˈɑːr.ɪ"
    });
  });

  it("Azure IPA 不套用实际发音的清浊化、补 ə 和卷舌元音降级", () => {
    expect(convertDictionaryToUnified("stænd", "stand", "us")).toMatchObject({
      value: "sdænd"
    });
    expect(
      convertDictionaryToAzureIpa("stænd", "stand", "en-US")
    ).toMatchObject({ ok: true, value: "stænd" });
    expect(convertDictionaryToUnified("ˈbɒtl", "bottle", "uk")).toMatchObject({
      value: "ˈbɒtəl"
    });
    expect(
      convertDictionaryToAzureIpa("ˈbɒtl", "bottle", "en-GB")
    ).toMatchObject({ ok: true, value: "ˈbɒtl" });
    expect(convertDictionaryToAzureIpa("bɝd", "bird", "en-US")).toMatchObject({
      ok: true,
      value: "bɝd"
    });
    expect(
      convertDictionaryToAzureIpa("sɚpɚ", "supper", "en-US")
    ).toMatchObject({ ok: true, value: "sɚpɚ" });
    expect(convertDictionaryToUnified("bɪb", "bib", "uk")).toMatchObject({
      value: "bɪp"
    });
    expect(convertDictionaryToAzureIpa("bɪb", "bib", "en-GB")).toMatchObject({
      ok: true,
      value: "bɪb"
    });
    expect(
      convertDictionaryToUnified("əv kɔːrs", "of course", "us")
    ).toMatchObject({ value: "əf kɔrs" });
    expect(
      convertDictionaryToAzureIpa("əv kɔːrs", "of course", "en-US")
    ).toMatchObject({ ok: true, value: "əv kɔɹs" });
    expect(
      convertDictionaryToAzureIpa("ˈbʌtn̩", "button", "en-US", "weak")
    ).toMatchObject({ ok: true, value: "ˈbʌtən" });
    expect(convertDictionaryToAzureIpa("ju", "you", "en-US")).toMatchObject({
      ok: true,
      value: "ju"
    });
    expect(convertDictionaryToAzureIpa("tu", "to", "en-US")).toMatchObject({
      ok: true,
      value: "tu"
    });
    expect(convertDictionaryToAzureIpa("tuː", "to", "en-US")).toMatchObject({
      ok: true,
      value: "tu"
    });
  });

  it("Azure IPA 按 locale 生成美式卷舌音，不把英式长音压缩为美式读法", () => {
    expect(convertDictionaryToAzureIpa("ˈɑːr", "are", "en-US")).toMatchObject({
      ok: true,
      value: "ˈɑɹ"
    });
    expect(convertDictionaryToAzureIpa("ˈɔːr", "or", "en-US")).toMatchObject({
      ok: true,
      value: "ˈɔɹ"
    });
    expect(convertDictionaryToAzureIpa("ˈɔːr", "or", "en-GB")).toMatchObject({
      ok: true,
      value: "ˈɔːɹ"
    });
  });

  it("美式字典卷舌元音按重读和非重读位置转换", () => {
    expect(convertDictionaryToUnified("ˈbɜːrd", "bird", "us")).toMatchObject({
      ok: true,
      value: "ˈbərd"
    });
    expect(
      convertDictionaryToAzureIpa("ˈbɜːrd", "bird", "en-US")
    ).toMatchObject({ ok: true, value: "ˈbɝd" });
    expect(
      convertDictionaryToUnified("ˈtiːtʃər", "teacher", "us")
    ).toMatchObject({ ok: true, value: "ˈtiːtʃər" });
    expect(
      convertDictionaryToAzureIpa("ˈtiːtʃər", "teacher", "en-US")
    ).toMatchObject({ ok: true, value: "ˈtitʃɚ" });
    expect(
      convertDictionaryToAzureIpa("ˈsɛpərət", "separate", "en-US")
    ).toMatchObject({ ok: true, value: "ˈsɛpəɹət" });
  });

  it("英式或通用口音不套用美式卷舌映射", () => {
    expect(convertDictionaryToUnified("ˈwɜːd", "word", "uk")).toMatchObject({
      ok: true,
      value: "ˈwɜːd"
    });
    expect(convertDictionaryToAzureIpa("ˈwɜːd", "word", "en-GB")).toMatchObject(
      { ok: true, value: "ˈwɜːd" }
    );
    expect(
      convertDictionaryToUnified("ˈbɜːrd", "bird", "common")
    ).toMatchObject({ ok: true, value: "ˈbɜːrd" });
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
    ).toMatchObject({ value: "əf kɔrs" });
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
      notices: [expect.any(String)]
    });
    expect(convertDictionaryToUnified("kæt", "family", "us")).toMatchObject({
      value: "kæt"
    });
    expect(
      convertDictionaryToAzureIpa("ˈlɪtərətʃər", "literature", "en-US")
    ).toMatchObject({ ok: true, value: "ˈlɪtɹətʃɚ" });
  });

  it("段数不一致时只规范音标，跳过依赖拼写对应关系的读法规则", () => {
    expect(
      convertDictionaryToUnified("/bɪb dɒg wel/", "bib dog", "uk")
    ).toMatchObject({
      ok: true,
      value: "bɪb dɒg wɛl",
      notices: [expect.stringContaining("请核对读法")]
    });
  });

  it.each([
    "/ˈiːðə/ /ˈaɪðə/",
    "[ˈiːðə] [ˈaɪðə]",
    "[ˈiː ðə] [ˈaɪ ðə]",
    "(ˈiːðə) (ˈaɪðə)",
    "{ˈiːðə} {ˈaɪðə}",
    "([ˈiːðə]) ([ˈaɪðə])",
    "((ˈiːðə)) ((ˈaɪðə))"
  ])("单个词形拒绝将各自括起的备选读法合并：%s", (transcription) => {
    expect(convertDictionaryToUnified(transcription, "either", "uk").ok).toBe(
      false
    );
    expect(
      convertDictionaryToAzureIpa(transcription, "either", "en-GB").ok
    ).toBe(false);
    expect(
      convertActualPronunciation(transcription, "either", "ipa", "en-GB").ok
    ).toBe(false);
  });

  it("空值、控制符和非法音标不返回部分转换", () => {
    for (const [input, word] of [
      ["", "cat"],
      ["kæt\n", "cat"],
      ["kæt😀", "cat"],
      ["kæt; kɛt", "cat"],
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
    expect(
      convertDictionaryToAzureIpa("[skuːl] [deɪ]", "school day", "en-GB")
    ).toMatchObject({ value: "skuːl deɪ" });
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
