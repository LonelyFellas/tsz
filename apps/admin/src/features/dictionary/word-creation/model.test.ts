import type {
  AdminWordV2,
  WordHeadwordsV2,
  WordPosFormsV2,
  WordPosMeaningsV2
} from "@tsz/types";
import { describe, expect, it } from "vitest";
import {
  cefrRank,
  createDefinition,
  createDerivedSlot,
  createEnglishText,
  createFormGroup,
  createGrammar,
  createPosForms,
  createPosMeanings,
  createPronunciation,
  createRelation,
  createSense,
  createSentence,
  dialectHeadword,
  ensureMeaningsForForms,
  formDialects,
  grammarDialects,
  updateRichText,
  wordDisplayHeadword
} from "./model";

const unifiedHeadwords = {
  mode: "unified",
  common: "far"
} satisfies WordHeadwordsV2;

const distinguishedHeadwords = {
  mode: "distinguish",
  uk: "centre",
  us: "center",
  source_dialect: "us"
} satisfies WordHeadwordsV2;

function makeWord(
  forms: WordPosFormsV2[],
  meanings: WordPosMeaningsV2[],
  headwords: WordHeadwordsV2 = unifiedHeadwords
): AdminWordV2 {
  return {
    schema_version: 2,
    id: "word-1",
    language: "en",
    kind: "word",
    status: "draft",
    revision: 1,
    headwords,
    detection_snapshot: {
      detection_id: "detection-1",
      request: { language: "en", headword: "far" },
      normalized_headword: "far",
      entry_kind: "word",
      matched_dialect: "common",
      builtin_dictionary_status: "matched",
      smart_dictionary_status: "clear",
      headwords,
      suggested_pos: forms.map((entry) => entry.pos),
      detected_at: "2026-08-02T00:00:00Z"
    },
    forms: { pos: forms },
    meanings: {
      sense_groups: [{ id: "sense-group-1", name: "空间" }],
      pos: meanings
    },
    completed_steps: ["basics"],
    max_reachable_step: "forms",
    created_by: "admin-1",
    created_at: "2026-08-02T00:00:00Z",
    updated_at: "2026-08-02T00:00:00Z"
  };
}

describe("T05 共享 base、方言规则与多词形组", () => {
  it("统一 headword 只生成词性级 common base，词形组不复制 base", () => {
    const pos = createPosForms("adjective", unifiedHeadwords);

    expect(pos.dialect_rules).toEqual({
      spelling_mode: "unified",
      phonetic_mode: "unified"
    });
    expect(pos.base_form.form_type).toBe("base");
    expect(pos.base_form.variants).toHaveLength(1);
    expect(pos.base_form.variants[0]).toMatchObject({
      dialect: "common",
      spelling: "far",
      origin: "manual"
    });
    expect(formDialects(pos)).toEqual(["common"]);
    expect(pos.form_groups).toHaveLength(1);
    expect(pos.form_groups[0]).not.toHaveProperty("base_form");
    expect(pos.form_groups[0]!.slots).toEqual([]);
  });

  it("区分 headword 锁定 UK/US base 拼写，并同步启用双方言规则", () => {
    const pos = createPosForms("noun", distinguishedHeadwords);

    expect(pos.dialect_rules).toEqual({
      spelling_mode: "distinguish",
      phonetic_mode: "distinguish"
    });
    expect(
      pos.base_form.variants.map(({ dialect, spelling }) => ({
        dialect,
        spelling
      }))
    ).toEqual([
      { dialect: "uk", spelling: "centre" },
      { dialect: "us", spelling: "center" }
    ]);
    expect(formDialects(pos)).toEqual(["uk", "us"]);
  });

  it("仅音标区分时仍派生 UK/US variant", () => {
    const pos = createPosForms("adverb", unifiedHeadwords);
    pos.dialect_rules.phonetic_mode = "distinguish";

    expect(formDialects(pos)).toEqual(["uk", "us"]);
  });

  it("farther/further 可作为两个稳定组，共享 base 且不改写既有 ID/顺序", () => {
    const pos = createPosForms("adjective", unifiedHeadwords);
    const baseId = pos.base_form.id;
    const baseVariantId = pos.base_form.variants[0]!.id;
    const fartherGroup = pos.form_groups[0]!;
    const fartherSlot = createDerivedSlot("comparative", pos);
    fartherSlot.variants[0]!.spelling = "farther";
    fartherGroup.slots = [fartherSlot];

    const existingIds = {
      group: fartherGroup.id,
      slot: fartherSlot.id,
      variant: fartherSlot.variants[0]!.id
    };
    const furtherGroup = createFormGroup();
    const furtherSlot = createDerivedSlot("comparative", pos);
    furtherSlot.variants[0]!.spelling = "further";
    furtherGroup.slots = [furtherSlot];

    const next = { ...pos, form_groups: [...pos.form_groups, furtherGroup] };

    expect(next.base_form.id).toBe(baseId);
    expect(next.base_form.variants[0]).toMatchObject({
      id: baseVariantId,
      dialect: "common",
      spelling: "far"
    });
    expect(next.form_groups.map((group) => group.id)).toEqual([
      existingIds.group,
      furtherGroup.id
    ]);
    expect(next.form_groups[0]!.slots[0]).toMatchObject({
      id: existingIds.slot,
      form_type: "comparative",
      variants: [
        {
          id: existingIds.variant,
          dialect: "common",
          spelling: "farther"
        }
      ]
    });
    expect(next.form_groups[1]!.slots[0]).toMatchObject({
      id: furtherSlot.id,
      form_type: "comparative",
      variants: [{ dialect: "common", spelling: "further" }]
    });
    expect(next.form_groups.every((group) => !("base_form" in group))).toBe(
      true
    );
  });
});

describe("T09 EnglishText 与 grammar 方言派生", () => {
  it("统一文本直接生成 common/manual variant", () => {
    expect(createEnglishText(unifiedHeadwords, "the far side")).toEqual({
      mode: "unified",
      common: {
        origin: "manual",
        value: {
          version: 1,
          text: "the far side",
          spans: [],
          liaisons: []
        }
      }
    });
  });

  it("区分文本只让源侧 ready/manual，目标侧保持显式 missing", () => {
    const fromUs = createEnglishText(distinguishedHeadwords, "the center");
    const fromUk = createEnglishText(
      { ...distinguishedHeadwords, source_dialect: "uk" },
      "the centre"
    );

    expect(fromUs).toMatchObject({
      mode: "distinguish",
      source_dialect: "us",
      uk: { state: "missing" },
      us: {
        state: "ready",
        variant: { origin: "manual", value: { text: "the center" } }
      }
    });
    expect(fromUk).toMatchObject({
      mode: "distinguish",
      source_dialect: "uk",
      uk: {
        state: "ready",
        variant: { origin: "manual", value: { text: "the centre" } }
      },
      us: { state: "missing" }
    });
  });

  it("grammar 仅按 headwords 派生 common 或 UK/US，不复用文本 missing 状态", () => {
    const unified = createGrammar(unifiedHeadwords);
    const distinguished = createGrammar(distinguishedHeadwords);

    expect(grammarDialects(unifiedHeadwords)).toEqual(["common"]);
    expect(unified.variants.map((variant) => variant.dialect)).toEqual([
      "common"
    ]);
    expect(grammarDialects(distinguishedHeadwords)).toEqual(["uk", "us"]);
    expect(distinguished.variants.map((variant) => variant.dialect)).toEqual([
      "uk",
      "us"
    ]);
    expect(
      distinguished.variants.every(
        (variant) => variant.content.text === "" && "dialect" in variant
      )
    ).toBe(true);
    expect(
      distinguished.variants.every((variant) => !("state" in variant))
    ).toBe(true);
  });
});

describe("T10 meanings 与 focus link", () => {
  it("默认 sense 的例句恰好有一个指向当前 word/sense 的 focus link", () => {
    const sense = createSense(distinguishedHeadwords, "word-1");
    const sentence = sense.sentences[0]!;
    const focusLinks = sentence.links.filter((link) => link.role === "focus");

    expect(sense.definitions).toHaveLength(1);
    expect(sense.definitions[0]).toMatchObject({
      definition_mode: "zh_definition",
      level: "A1"
    });
    expect(focusLinks).toEqual([
      { word_id: "word-1", sense_id: sense.id, role: "focus" }
    ]);
    expect(sentence.links.filter((link) => link.role === "context")).toEqual(
      []
    );
  });

  it("ensureMeaningsForForms 按 forms 顺序保留同 pos_id 节点并补齐新增 POS", () => {
    const nounForms = createPosForms("noun", unifiedHeadwords);
    const verbForms = createPosForms("verb", unifiedHeadwords);
    const existingNoun = createPosMeanings(
      nounForms.pos_id,
      unifiedHeadwords,
      "word-1"
    );
    existingNoun.senses[0]!.sub_pos = "N-COUNT";
    const removedPos = createPosMeanings(
      "removed-pos",
      unifiedHeadwords,
      "word-1"
    );
    const word = makeWord([nounForms, verbForms], [removedPos, existingNoun]);
    const existingIds = {
      grammar: existingNoun.grammar_structures[0]!.id,
      sense: existingNoun.senses[0]!.id,
      sentence: existingNoun.senses[0]!.sentences[0]!.id
    };

    const result = ensureMeaningsForForms(word);

    expect(result.sense_groups).toBe(word.meanings.sense_groups);
    expect(result.pos.map((entry) => entry.pos_id)).toEqual([
      nounForms.pos_id,
      verbForms.pos_id
    ]);
    expect(result.pos[0]).toBe(existingNoun);
    expect(result.pos[0]!.grammar_structures[0]!.id).toBe(existingIds.grammar);
    expect(result.pos[0]!.senses[0]).toMatchObject({
      id: existingIds.sense,
      sub_pos: "N-COUNT",
      sentences: [{ id: existingIds.sentence }]
    });

    const createdVerb = result.pos[1]!;
    expect(createdVerb.pos_id).toBe(verbForms.pos_id);
    expect(createdVerb.grammar_structures).toHaveLength(1);
    expect(createdVerb.senses).toHaveLength(1);
    expect(
      createdVerb.senses[0]!.sentences[0]!.links.filter(
        (link) => link.role === "focus"
      )
    ).toEqual([
      {
        word_id: "word-1",
        sense_id: createdVerb.senses[0]!.id,
        role: "focus"
      }
    ]);
    expect(result.pos.some((entry) => entry.pos_id === "removed-pos")).toBe(
      false
    );
    expect(word.meanings.pos).toEqual([removedPos, existingNoun]);
  });
});

describe("展示、factory 默认值与边界输入", () => {
  it("word/dialect headword 覆盖 unified、UK、US 与 common source fallback", () => {
    const unifiedForms = createPosForms("adjective", unifiedHeadwords);
    const distinguishedForms = createPosForms("noun", distinguishedHeadwords);
    const unifiedWord = makeWord([unifiedForms], [], unifiedHeadwords);
    const distinguishedWord = makeWord(
      [distinguishedForms],
      [],
      distinguishedHeadwords
    );

    expect(wordDisplayHeadword(unifiedWord)).toBe("far");
    expect(wordDisplayHeadword(distinguishedWord)).toBe("centre");
    expect(dialectHeadword(unifiedHeadwords, "uk")).toBe("far");
    expect(dialectHeadword(distinguishedHeadwords, "uk")).toBe("centre");
    expect(dialectHeadword(distinguishedHeadwords, "us")).toBe("center");
    expect(dialectHeadword(distinguishedHeadwords, "common")).toBe("center");
    expect(
      dialectHeadword(
        { ...distinguishedHeadwords, source_dialect: "uk" },
        "common"
      )
    ).toBe("centre");
  });

  it("叶子 factory 生成独立稳定节点、空默认值与唯一 focus link", () => {
    const pronunciation = createPronunciation();
    const definition = createDefinition();
    const sentence = createSentence(
      distinguishedHeadwords,
      "word-1",
      "sense-1"
    );
    const relation = createRelation("antonym");

    expect(pronunciation).toMatchObject({
      id: expect.any(String),
      dict_phonetic: "",
      actual_pron: "",
      style: "normal"
    });
    expect(definition).toMatchObject({
      id: expect.any(String),
      level: "A1",
      definition_mode: "zh_definition",
      content: { version: 1, text: "", spans: [], liaisons: [] }
    });
    expect(sentence).toMatchObject({
      id: expect.any(String),
      level: "A1",
      zh_text: { text: "" },
      links: [{ word_id: "word-1", sense_id: "sense-1", role: "focus" }]
    });
    expect(relation).toEqual({
      id: expect.any(String),
      relation: "antonym",
      target_word_id: "",
      target_sense_id: "",
      score: "0"
    });
    expect(
      new Set([pronunciation.id, definition.id, sentence.id, relation.id]).size
    ).toBe(4);
  });

  it("updateRichText 保留同文标记，改文后清空 offset；CEFR 含非法值安全返回", () => {
    const original = {
      version: 1 as const,
      text: "same",
      spans: [{ start: 0, end: 4, type: "bold" as const }],
      liaisons: [1]
    };

    expect(updateRichText(original, "same")).toBe(original);
    expect(updateRichText(original, "changed")).toEqual({
      version: 1,
      text: "changed",
      spans: [],
      liaisons: []
    });
    expect(
      (["A1", "A2", "B1", "B2", "C1", "C2"] as const).map(cefrRank)
    ).toEqual([0, 1, 2, 3, 4, 5]);
    expect(cefrRank("invalid" as never)).toBe(-1);
  });
});
