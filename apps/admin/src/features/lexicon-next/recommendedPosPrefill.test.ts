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
  it("只创建建议词性的原形，不预先写入空的派生词形", () => {
    const draft = seedRecommendedPartOfSpeech(
      emptyDraft,
      "word",
      ["noun", "verb"],
      partOfSpeechCatalogFixture
    );

    const forms = expandFormContents(draft.form_editor!);
    expect(forms.pos.map((pos) => pos.pos)).toEqual(["noun", "verb"]);
    expect(
      forms.pos.flatMap((pos) => pos.forms.map((form) => form.form_type))
    ).toEqual(["base", "base"]);
    expect(forms.pos.every((pos) => pos.form_groups.length === 1)).toBe(true);
  });
});
