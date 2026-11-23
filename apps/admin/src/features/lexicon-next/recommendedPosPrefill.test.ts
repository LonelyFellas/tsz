import { describe, expect, it } from "vitest";
import { partOfSpeechCatalogFixture } from "@/features/dictionary/word-creation/partOfSpeech.test.helper";
import type { NextDraft } from "@tsz/types";
import { expandFormContents } from "@tsz/shared";
import { seedRecommendedPartOfSpeech } from "./recommendedPosPrefill";

const emptyDraft: NextDraft = {
  schema_version: 1,
  headword: "centre",
  forms: [],
  senses: []
};

describe("seedRecommendedPartOfSpeech", () => {
  it.each([
    { defaults: ["plural"], expected: ["base", "plural"] },
    { defaults: [], expected: ["base"] }
  ])("按名词默认模板生成录入行（配置 $defaults）", ({ defaults, expected }) => {
    const catalog = {
      ...partOfSpeechCatalogFixture,
      items: partOfSpeechCatalogFixture.items.map((item) =>
        item.code === "noun" ? { ...item, default_form_types: defaults } : item
      )
    };
    const draft = seedRecommendedPartOfSpeech(
      emptyDraft,
      "word",
      ["noun"],
      catalog
    );

    const [noun] = expandFormContents(draft.form_editor!).pos;
    expect(noun?.forms.map((form) => form.form_type)).toEqual(expected);
    expect(noun?.form_groups).toHaveLength(1);
  });
});
