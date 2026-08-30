import { describe, expect, it } from "vitest";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  ukUsFormFixture,
  uuidFromInt
} from "./fixtures";
import {
  countV3PosFormIncomplete,
  countV3PosMeaningIncomplete
} from "./posCompletion";
import { ensureV3MeaningsForForms } from "./meaningsModel";

describe("V3 basic POS completion counts", () => {
  it("counts an incomplete form once even when several fields are blank", () => {
    const forms = formsFixture({
      forms: [
        commonFormFixture({
          spelling: "",
          pronunciations: [
            pronunciationFixture({
              dict_phonetic: "",
              actual_pron: "",
              style: undefined
            })
          ]
        })
      ],
      groups: []
    });

    expect(countV3PosFormIncomplete(forms.pos[0]!)).toBe(1);
  });

  it("counts a regional form once when only one side is incomplete", () => {
    const form = ukUsFormFixture({
      us: {
        pronunciations: [
          pronunciationFixture({ actual_pron: "", style: undefined })
        ]
      }
    });
    const forms = formsFixture({ forms: [form], groups: [] });

    expect(countV3PosFormIncomplete(forms.pos[0]!)).toBe(1);
    form.regional_variants.us.pronunciations[0]!.actual_pron = "center";
    form.regional_variants.us.pronunciations[0]!.style = "normal";
    expect(countV3PosFormIncomplete(forms.pos[0]!)).toBe(0);
  });

  it("adds empty groups and incomplete forms as separate progress units", () => {
    const first = commonFormFixture({
      pronunciations: []
    });
    const second = commonFormFixture({
      id: uuidFromInt(800),
      spelling: "",
      pronunciations: []
    });
    const forms = formsFixture({
      forms: [first, second],
      groups: [{ id: uuidFromInt(801), is_regular: true, members: [] }]
    });

    expect(countV3PosFormIncomplete(forms.pos[0]!)).toBe(3);
  });

  it("counts local meaning blanks and ignores non-empty server-rule values", () => {
    const forms = formsFixture();
    let nextId = 0;
    const meanings = ensureV3MeaningsForForms(
      "entry-1",
      forms,
      { sense_groups: [], pos: [] },
      () => uuidFromInt(900 + ++nextId)
    );
    const pos = meanings.pos[0]!;

    expect(countV3PosMeaningIncomplete(pos, meanings)).toBe(5);

    pos.grammar_structures[0]!.variants[0]!.content.text = "a noun";
    pos.senses[0]!.sub_pos = "countable";
    pos.senses[0]!.frequency = "not-a-server-valid-frequency";
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
