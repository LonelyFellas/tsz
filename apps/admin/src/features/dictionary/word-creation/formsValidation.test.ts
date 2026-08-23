import { describe, expect, it } from "vitest";
import { wordFixture } from "./wordCreation.test.helper";
import {
  baseFormComplete,
  baseFormIssueMessage,
  baseFormIssueTarget,
  baseFormPronunciationIssues,
  baseFormSpellingIssues,
  derivedFormIssueMessage,
  dialectSlotsProgress,
  formSlotComplete,
  formSlotIssueTarget
} from "./formsValidation";

describe("forms validation issue targets", () => {
  it("按方言、拼写、读音顺序返回首个无效叶字段", () => {
    const word = wordFixture({ ready: true });
    const pos = word.forms.pos[0]!;
    const slot = structuredClone(pos.base_form);
    const dialectRules = pos.dialect_rules;
    const uk = slot.variants.find((variant) => variant.dialect === "uk")!;
    const us = slot.variants.find((variant) => variant.dialect === "us")!;

    slot.variants = [uk];
    expect(formSlotIssueTarget(slot, dialectRules)).toMatchObject({
      node_id: slot.id,
      field: "variants.us"
    });

    slot.variants = [uk, us, { ...uk, id: "duplicate-uk" }];
    expect(formSlotIssueTarget(slot, dialectRules)).toMatchObject({
      node_id: slot.id,
      field: "variants"
    });

    slot.variants = [uk, us];
    uk.spelling = " center";
    expect(formSlotIssueTarget(slot, dialectRules)).toMatchObject({
      node_id: slot.id,
      field: "variants.uk.spelling"
    });

    uk.spelling =
      word.headwords.mode === "distinguish" ? word.headwords.uk : "";
    uk.pronunciations = [];
    expect(formSlotIssueTarget(slot, dialectRules)).toMatchObject({
      node_id: uk.id,
      field: "pronunciations"
    });

    uk.pronunciations = structuredClone(
      pos.base_form.variants.find((variant) => variant.dialect === "uk")!
        .pronunciations
    );
    const pronunciation = uk.pronunciations[0]!;
    pronunciation.dict_phonetic = " ";
    expect(formSlotIssueTarget(slot, dialectRules)).toMatchObject({
      node_id: pronunciation.id,
      field: "dict_phonetic"
    });

    pronunciation.dict_phonetic = "/test/";
    pronunciation.actual_pron = "";
    expect(formSlotIssueTarget(slot, dialectRules)).toMatchObject({
      node_id: pronunciation.id,
      field: "actual_pron"
    });
  });

  it("完整词形返回完成，基准拼写与词头不一致时定位对应方言", () => {
    const word = wordFixture({ ready: true });
    const pos = word.forms.pos[0]!;

    expect(formSlotComplete(pos.base_form, pos.dialect_rules)).toBe(true);
    expect(baseFormIssueTarget(pos)).toBeUndefined();
    expect(baseFormComplete(pos, word.headwords)).toBe(true);

    pos.base_form.variants[0]!.spelling = "mismatch";
    expect(baseFormIssueTarget(pos, word.headwords)).toMatchObject({
      node_id: pos.base_form.id,
      field: `variants.${pos.base_form.variants[0]!.dialect}.spelling`
    });
    expect(baseFormComplete(pos, word.headwords)).toBe(false);
  });

  it("基准原形提示按实际缺失的音标字段收窄，而不是笼统的「或」", () => {
    const word = wordFixture({ ready: true });
    const pos = structuredClone(word.forms.pos[0]!);
    const pronunciation = pos.base_form.variants[0]!.pronunciations[0]!;

    expect(baseFormIssueMessage(pos, word.headwords)).toBeUndefined();

    pronunciation.dict_phonetic = "";
    expect(baseFormIssueMessage(pos, word.headwords)).toBe(
      "基准原形 · 英式缺少字典音标"
    );

    pronunciation.dict_phonetic = "/ˈsentə/";
    pronunciation.actual_pron = " ";
    expect(baseFormIssueMessage(pos, word.headwords)).toBe(
      "基准原形 · 英式缺少实际发音"
    );

    pronunciation.dict_phonetic = "";
    expect(baseFormIssueMessage(pos, word.headwords)).toBe(
      "基准原形 · 英式缺少字典音标与实际发音"
    );

    pos.base_form.variants[0]!.pronunciations = [];
    expect(baseFormIssueMessage(pos, word.headwords)).toBe(
      "基准原形 · 英式还没有添加读音"
    );

    pos.base_form.variants[0]!.spelling = "";
    expect(baseFormIssueMessage(pos, word.headwords)).toBe(
      "基准原形 · 英式拼写尚未按主词填写完整"
    );
  });

  it("基准拼写与主词不一致时也提示拼写问题", () => {
    const word = wordFixture({ ready: true });
    const pos = structuredClone(word.forms.pos[0]!);
    pos.base_form.variants[0]!.spelling = "mismatch";

    expect(baseFormIssueMessage(pos, word.headwords)).toBe(
      "基准原形 · 英式拼写尚未按主词填写完整"
    );
  });

  it("拼写与读音问题分开归类，互不掩盖", () => {
    const word = wordFixture({ ready: true });
    const pos = structuredClone(word.forms.pos[0]!);
    const variant = pos.base_form.variants[0]!;

    expect(baseFormSpellingIssues(pos, word.headwords)).toEqual([]);
    expect(baseFormPronunciationIssues(pos)).toEqual([]);

    variant.pronunciations[0]!.actual_pron = "";
    expect(baseFormSpellingIssues(pos, word.headwords)).toEqual([]);
    expect(baseFormPronunciationIssues(pos)).toMatchObject([
      { node_id: variant.pronunciations[0]!.id, field: "actual_pron" }
    ]);

    // 拼写非法时 formSlotIssues 会跳过该变体的读音，读音统计必须自己遍历。
    variant.spelling = "";
    expect(baseFormSpellingIssues(pos, word.headwords)).toMatchObject([
      {
        node_id: pos.base_form.id,
        field: `variants.${variant.dialect}.spelling`
      }
    ]);
    expect(baseFormPronunciationIssues(pos)).toMatchObject([
      { node_id: variant.pronunciations[0]!.id, field: "actual_pron" }
    ]);

    // 读音缺失也不能挡住「拼写与主词不一致」的判定。
    variant.spelling = "mismatch";
    expect(baseFormSpellingIssues(pos, word.headwords)).toMatchObject([
      {
        node_id: pos.base_form.id,
        field: `variants.${variant.dialect}.spelling`
      }
    ]);
  });

  it("拼写统一但音标区分时接受拼写相同的 UK/US 方言行", () => {
    const word = wordFixture({ headword: "far", ready: true });

    for (const pos of word.forms.pos) {
      expect(pos.dialect_rules).toEqual({
        spelling_mode: "unified",
        phonetic_mode: "distinguish"
      });
      expect(formSlotComplete(pos.base_form, pos.dialect_rules)).toBe(true);
      expect(baseFormComplete(pos, word.headwords)).toBe(true);
      for (const slot of pos.form_groups.flatMap((group) => group.slots)) {
        expect(formSlotComplete(slot, pos.dialect_rules)).toBe(true);
      }
    }
  });
});

describe("方言指名与折叠摘要（A1 阶段 5）", () => {
  // 真正的统一词形：拼写与音标都不分方言，变体只有一条 common。
  // （far fixture 本身是 spelling unified + phonetic distinguish，仍会分两侧。）
  const unifiedPos = () => {
    const pos = structuredClone(
      wordFixture({ headword: "far", ready: true }).forms.pos[0]!
    );
    pos.dialect_rules = { spelling_mode: "unified", phonetic_mode: "unified" };
    pos.base_form.variants = [
      { ...pos.base_form.variants[0]!, dialect: "common" }
    ];
    pos.form_groups.forEach((group) => {
      group.slots = [];
    });
    return pos;
  };
  const distinguishPos = () =>
    structuredClone(wordFixture({ ready: true }).forms.pos[0]!);
  const pronunciation = (id: string) => ({
    id,
    dict_phonetic: "x",
    actual_pron: "y",
    style: "normal" as const
  });

  it("统一词形的提示不出现任何方言字样", () => {
    const pos = unifiedPos();
    pos.base_form.variants[0]!.pronunciations[0]!.dict_phonetic = "";

    const message = baseFormIssueMessage(pos);
    expect(message).toBe("基准原形缺少字典音标");
    expect(message).not.toContain("英式");
    expect(message).not.toContain("美式");
  });

  it("区分词形按缺失所在的那一侧指名，不把两侧混成一句", () => {
    const pos = distinguishPos();
    pos.base_form.variants.find(
      (variant) => variant.dialect === "us"
    )!.pronunciations[0]!.actual_pron = "";

    // 英式完整，问题只在美式侧。
    expect(baseFormIssueMessage(pos)).toBe("基准原形 · 美式缺少实际发音");
  });

  it("派生词形提示指名词形类型、方言侧与缺失字段", () => {
    const pos = distinguishPos();
    pos.form_groups[0]!.slots = [
      {
        id: "plural-slot",
        form_type: "plural",
        variants: (["uk", "us"] as const).map((dialect) => ({
          id: `plural-${dialect}`,
          dialect,
          spelling: "centres",
          origin: "manual" as const,
          pronunciations: [
            dialect === "uk"
              ? { ...pronunciation("plural-uk-p"), dict_phonetic: "" }
              : pronunciation("plural-us-p")
          ]
        }))
      }
    ];

    expect(derivedFormIssueMessage(pos)).toBe("复数 · 英式缺少字典音标");
  });

  it("派生词形没有读音或拼写为空时也各自指名", () => {
    const noPronunciation = distinguishPos();
    noPronunciation.form_groups[0]!.slots = [
      {
        id: "plural-slot",
        form_type: "plural",
        variants: (["uk", "us"] as const).map((dialect) => ({
          id: `plural-${dialect}`,
          dialect,
          spelling: "centres",
          origin: "manual" as const,
          pronunciations: []
        }))
      }
    ];
    expect(derivedFormIssueMessage(noPronunciation)).toBe(
      "复数 · 英式还没有添加读音"
    );

    const noSpelling = distinguishPos();
    noSpelling.form_groups[0]!.slots = [
      {
        id: "plural-slot",
        form_type: "plural",
        variants: (["uk", "us"] as const).map((dialect) => ({
          id: `plural-${dialect}`,
          dialect,
          spelling: dialect === "uk" ? "" : "centers",
          origin: "manual" as const,
          pronunciations: [pronunciation(`plural-${dialect}-p`)]
        }))
      }
    ];
    expect(derivedFormIssueMessage(noSpelling)).toBe("复数 · 英式拼写尚未填写");

    // 全部完整时不产生提示。
    const complete = distinguishPos();
    complete.form_groups[0]!.slots = [];
    expect(derivedFormIssueMessage(complete)).toBeUndefined();
  });

  it("折叠摘要按侧统计已填 / 待填，传入的每个词形各算一项", () => {
    const pos = distinguishPos();
    pos.form_groups[0]!.slots = [
      {
        id: "plural-slot",
        form_type: "plural",
        variants: (["uk", "us"] as const).map((dialect) => ({
          id: `plural-${dialect}`,
          dialect,
          spelling: dialect === "uk" ? "centres" : "",
          origin: "manual" as const,
          pronunciations: [pronunciation(`plural-${dialect}-p`)]
        }))
      }
    ];

    const slots = [pos.base_form, ...pos.form_groups[0]!.slots];
    expect(dialectSlotsProgress(slots, pos.dialect_rules, "uk")).toEqual({
      filled: 2,
      pending: 0
    });
    expect(dialectSlotsProgress(slots, pos.dialect_rules, "us")).toEqual({
      filled: 1,
      pending: 1
    });
    // 基准原形独立成区后，词形组那一区只统计自己的派生词形。
    expect(
      dialectSlotsProgress(pos.form_groups[0]!.slots, pos.dialect_rules, "us")
    ).toEqual({ filled: 0, pending: 1 });
  });
});
