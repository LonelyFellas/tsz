import { describe, expect, it } from "vitest";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture
} from "./fixtures";
import {
  countV3PosFormIncomplete,
  countV3PosMeaningIncomplete
} from "./posCompletion";
import { ensureV3MeaningsForForms } from "./meaningsModel";

describe("V3 basic POS completion counts", () => {
  it("counts each incomplete form once and drops the number as it is filled", () => {
    const form = commonFormFixture({
      pronunciations: [
        pronunciationFixture({ actual_pron: "", style: undefined })
      ]
    });
    const forms = formsFixture({
      forms: [form],
      groups: []
    });
    const pos = forms.pos[0]!;
    expect(countV3PosFormIncomplete(pos)).toBe(1);

    form.regional_variants.common.pronunciations[0]!.actual_pron = "centre";
    form.regional_variants.common.pronunciations[0]!.style = "normal";
    expect(countV3PosFormIncomplete(pos)).toBe(0);
  });

  it("counts Step 3 local blanks without consulting publish issues", () => {
    const forms = formsFixture();
    let nextId = 0;
    const meanings = ensureV3MeaningsForForms(
      "entry-1",
      forms,
      { sense_groups: [], pos: [] },
      () => `id-${++nextId}`
    );
    const pos = meanings.pos[0]!;
    expect(countV3PosMeaningIncomplete(pos, meanings)).toBe(4);

    pos.grammar_structures[0]!.variants[0]!.content.text = "a noun";
    pos.senses[0]!.sub_pos = "countable";
    const definition = pos.senses[0]!.definitions[0]!;
    if ("content_id" in definition) definition.content.text = "中心";
    const sentence = pos.senses[0]!.sentences[0]!;
    if (sentence.en_text.mode === "unified") {
      sentence.en_text.common.value.text = "The center.";
    }
    sentence.zh_text.text = "中心。";
    expect(countV3PosMeaningIncomplete(pos, meanings)).toBe(0);
  });
});
