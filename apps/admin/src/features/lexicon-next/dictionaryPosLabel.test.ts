import { describe, expect, it, vi } from "vitest";
import type { PartOfSpeechCatalogItem } from "@tsz/types";
import { dictionaryMatchPosLabel } from "./dictionaryPosLabel";

describe("dictionaryMatchPosLabel", () => {
  const label = vi.fn((code: string) => `label:${code}`);

  it("uses the catalog label for basic and configured POS codes", () => {
    expect(dictionaryMatchPosLabel("noun", undefined, label)).toBe(
      "label:noun"
    );
    expect(
      dictionaryMatchPosLabel(
        "custom_pos",
        [
          {
            code: "custom_pos",
            name_zh: "自定义词性",
            name_en: "Custom part of speech"
          } as PartOfSpeechCatalogItem
        ],
        label
      )
    ).toBe("自定义词性");
  });

  it("keeps an unconfigured dictionary POS as English source text", () => {
    expect(dictionaryMatchPosLabel("preposition", [], label)).toBe(
      "preposition"
    );
    expect(dictionaryMatchPosLabel("adj", [], label)).toBe("adj");
  });

  it("shows the raw basic code when a loaded catalog no longer contains it", () => {
    expect(dictionaryMatchPosLabel("noun", [], label)).toBe("noun");
  });

  it("trims source values before deciding how to display them", () => {
    expect(dictionaryMatchPosLabel("  adjective  ", undefined, label)).toBe(
      "label:adjective"
    );
  });
});
