import { describe, expect, it } from "vitest";
import { wordFixture } from "./wordCreation.test.helper";
import {
  baseFormComplete,
  baseFormIssueTarget,
  formSlotComplete,
  formSlotIssueTarget
} from "./formsValidation";

describe("forms validation issue targets", () => {
  it("按方言、拼写、读音顺序返回首个无效叶字段", () => {
    const word = wordFixture({ ready: true });
    const pos = word.forms.pos[0]!;
    const slot = structuredClone(pos.base_form);
    const spellingMode = pos.dialect_rules.spelling_mode;
    const uk = slot.variants.find((variant) => variant.dialect === "uk")!;
    const us = slot.variants.find((variant) => variant.dialect === "us")!;

    slot.variants = [uk];
    expect(formSlotIssueTarget(slot, spellingMode)).toEqual({
      node_id: slot.id,
      field: "variants.us"
    });

    slot.variants = [uk, us, { ...uk, id: "duplicate-uk" }];
    expect(formSlotIssueTarget(slot, spellingMode)).toEqual({
      node_id: slot.id,
      field: "variants"
    });

    slot.variants = [uk, us];
    uk.spelling = " center";
    expect(formSlotIssueTarget(slot, spellingMode)).toEqual({
      node_id: slot.id,
      field: "variants.uk.spelling"
    });

    uk.spelling =
      word.headwords.mode === "distinguish" ? word.headwords.uk : "";
    uk.pronunciations = [];
    expect(formSlotIssueTarget(slot, spellingMode)).toEqual({
      node_id: uk.id,
      field: "pronunciations"
    });

    uk.pronunciations = structuredClone(
      pos.base_form.variants.find((variant) => variant.dialect === "uk")!
        .pronunciations
    );
    const pronunciation = uk.pronunciations[0]!;
    pronunciation.dict_phonetic = " ";
    expect(formSlotIssueTarget(slot, spellingMode)).toEqual({
      node_id: pronunciation.id,
      field: "dict_phonetic"
    });

    pronunciation.dict_phonetic = "/test/";
    pronunciation.actual_pron = "";
    expect(formSlotIssueTarget(slot, spellingMode)).toEqual({
      node_id: pronunciation.id,
      field: "actual_pron"
    });
  });

  it("完整词形返回完成，基准拼写与词头不一致时定位对应方言", () => {
    const word = wordFixture({ ready: true });
    const pos = word.forms.pos[0]!;

    expect(
      formSlotComplete(pos.base_form, pos.dialect_rules.spelling_mode)
    ).toBe(true);
    expect(baseFormIssueTarget(pos)).toBeUndefined();
    expect(baseFormComplete(pos, word.headwords)).toBe(true);

    pos.base_form.variants[0]!.spelling = "mismatch";
    expect(baseFormIssueTarget(pos, word.headwords)).toEqual({
      node_id: pos.base_form.id,
      field: `variants.${pos.base_form.variants[0]!.dialect}.spelling`
    });
    expect(baseFormComplete(pos, word.headwords)).toBe(false);
  });
});
