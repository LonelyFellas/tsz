import { describe, expect, it } from "vitest";
import { partOfSpeechCatalogFixture } from "../word-creation/partOfSpeech.test.helper";
import {
  availablePartOfSpeechOptions,
  createPartOfSpeechLookup,
  partOfSpeechLabel,
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
    expect(createPartOfSpeechLookup(undefined).items).toEqual([]);
  });
});
