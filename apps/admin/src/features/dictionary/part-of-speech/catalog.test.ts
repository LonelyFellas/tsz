import { describe, expect, it } from "vitest";
import { partOfSpeechCatalogFixture } from "../word-creation/partOfSpeech.test.helper";
import {
  availablePartOfSpeechOptions,
  createPartOfSpeechLookup,
  partOfSpeechLabel,
  soleSubPartOfSpeechCode,
  subPartOfSpeechLabel,
  subPartOfSpeechOptions
} from "./catalog";

describe("part-of-speech catalog", () => {
  it("按排序值和稳定 id 构造基本/细分词性索引", () => {
    const catalog = structuredClone(partOfSpeechCatalogFixture);
    catalog.items = [catalog.items[2]!, catalog.items[0]!, catalog.items[1]!];
    catalog.items[0]!.sort_order = 10;
    catalog.items[1]!.sort_order = 10;
    catalog.items[0]!.sub_parts.reverse();

    const lookup = createPartOfSpeechLookup(catalog);

    expect(lookup.items.map((item) => item.id)).toEqual([
      "pos-config-noun",
      "pos-config-verb",
      "pos-config-pronoun"
    ]);
    expect(
      lookup.subPartsByPosCode.get("verb")?.map((item) => item.code)
    ).toEqual(["V-T", "V-I", "V-LINK", "AUX", "MODAL"]);
    expect(lookup.subPartByCode.get("V-T")?.name_zh).toBe("及物动词");
  });

  it("生成中文 options、排除已用词性并对未知编码安全回退", () => {
    const lookup = createPartOfSpeechLookup(partOfSpeechCatalogFixture);

    expect(partOfSpeechLabel(lookup, "noun")).toBe("名词");
    expect(partOfSpeechLabel(lookup, "unknown-pos")).toBe("unknown-pos");
    expect(subPartOfSpeechLabel(lookup, "N-COUNT")).toBe("可数名词");
    expect(subPartOfSpeechLabel(lookup, "UNKNOWN-SUB")).toBe("UNKNOWN-SUB");
    expect(
      availablePartOfSpeechOptions(lookup, ["noun", "verb"]).slice(0, 2)
    ).toEqual([
      { value: "pronoun", label: "代词" },
      { value: "adjective", label: "形容词" }
    ]);
    expect(subPartOfSpeechOptions(lookup, "noun")[0]).toEqual({
      value: "N-COUNT",
      label: "可数名词"
    });
    expect(subPartOfSpeechOptions(lookup, "unknown-pos")).toEqual([]);
    expect(soleSubPartOfSpeechCode(lookup, "adjective")).toBe("ADJ");
    expect(soleSubPartOfSpeechCode(lookup, "noun")).toBeUndefined();
    expect(soleSubPartOfSpeechCode(lookup, "unknown-pos")).toBeUndefined();
    expect(createPartOfSpeechLookup(undefined).items).toEqual([]);
  });
});

describe("part-of-speech catalog 细分词性选项", () => {
  it("任意基本词性配了细分词性就提供选项，不看是不是内置词性", () => {
    const catalog = structuredClone(partOfSpeechCatalogFixture);
    const noun = catalog.items.find((item) => item.code === "noun")!;
    const lookup = createPartOfSpeechLookup(catalog);

    expect(noun.sub_parts.length).toBeGreaterThan(0);
    expect(subPartOfSpeechOptions(lookup, "noun").length).toBe(
      noun.sub_parts.length
    );
    expect(subPartOfSpeechOptions(lookup, "verb")[0]).toEqual({
      value: "V-T",
      label: "及物动词"
    });
    expect(soleSubPartOfSpeechCode(lookup, "adverb")).toBe("ADV");
  });

  it("词性名下没有细分词性时返回空，不把「拿不到目录」当成有选项", () => {
    const catalog = structuredClone(partOfSpeechCatalogFixture);
    const adjective = catalog.items.find((item) => item.code === "adjective")!;
    adjective.sub_parts = [];
    const lookup = createPartOfSpeechLookup(catalog);

    expect(subPartOfSpeechOptions(lookup, "adjective")).toEqual([]);
    expect(soleSubPartOfSpeechCode(lookup, "adjective")).toBeUndefined();
    expect(subPartOfSpeechOptions(lookup, "unknown-code")).toEqual([]);
  });
});
