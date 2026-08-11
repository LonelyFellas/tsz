import type {
  AdminWordV2,
  DraftMeaningsStepContent,
  RichText,
  WordHeadwordsV2,
  WordDefinitionV2,
  WordPosFormsV2,
  WordPosMeaningsV2
} from "@tsz/types";
import { describe, expect, it } from "vitest";
import {
  cefrRank,
  applyMeaningDialectSuggestions,
  collectMissingMeaningDialectItems,
  countIncompleteMeaningDialectSlots,
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
  toFormsWireContent,
  toMeaningsWireContent,
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

function richText(text: string): RichText {
  return { version: 1, text, spans: [], liaisons: [] };
}

function englishDefinition(
  id: string,
  text: string,
  targetText?: string
): WordDefinitionV2 {
  const content = createEnglishText(distinguishedHeadwords, text);
  if (content.mode === "distinguish" && targetText !== undefined) {
    content.uk = {
      state: "ready",
      variant: {
        id: `${id}-uk-text`,
        value: richText(targetText),
        origin: "manual"
      }
    };
  }
  return {
    id,
    level: "A1",
    definition_mode: "en_definition",
    content
  };
}

function dialectMeaningContent(): DraftMeaningsStepContent {
  const noun = createPosMeanings(
    "noun-pos",
    distinguishedHeadwords,
    "word-1",
    "sense-group-1"
  );
  noun.grammar_structures[0]!.variants.forEach((variant) => {
    variant.content = richText(`grammar-${variant.dialect}`);
  });
  noun.senses[0]!.definitions.push(
    englishDefinition("definition-missing", "the center"),
    englishDefinition("definition-ready", "the color", "the colour")
  );
  noun.senses[0]!.sentences[0]!.id = "example-missing";
  noun.senses[0]!.sentences[0]!.en_text = createEnglishText(
    distinguishedHeadwords,
    "The center is closed."
  );

  const verb = createPosMeanings(
    "verb-pos",
    distinguishedHeadwords,
    "word-1",
    "sense-group-1"
  );
  verb.senses[0]!.definitions.push(
    englishDefinition("definition-second-pos", "to organize")
  );

  return {
    sense_groups: [{ id: "sense-group-1", name_zh: "测试", name_en: "Test" }],
    pos: [noun, verb]
  };
}

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
    lifecycle_revision: 1,
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
      sense_groups: [
        { id: "sense-group-1", name_zh: "空间", name_en: "Space" }
      ],
      pos: meanings
    },
    completed_steps: ["basics"],
    max_reachable_step: "forms",
    created_by: "admin-1",
    created_at: "2026-08-02T00:00:00Z",
    updated_at: "2026-08-02T00:00:00Z",
    has_unpublished_changes: false
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
    expect(createEnglishText(unifiedHeadwords, "the far side")).toMatchObject({
      mode: "unified",
      common: {
        id: expect.any(String),
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
        variant: {
          id: expect.any(String),
          origin: "manual",
          value: { text: "the center" }
        }
      }
    });
    expect(fromUk).toMatchObject({
      mode: "distinguish",
      source_dialect: "uk",
      uk: {
        state: "ready",
        variant: {
          id: expect.any(String),
          origin: "manual",
          value: { text: "the centre" }
        }
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
    const sense = createSense(
      distinguishedHeadwords,
      "word-1",
      "sense-group-1"
    );
    const sentence = sense.sentences[0]!;
    const focusLinks = sentence.links.filter((link) => link.role === "focus");

    expect(sense.definitions).toHaveLength(1);
    expect(sense.sense_group_id).toBe("sense-group-1");
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
      "word-1",
      "sense-group-1"
    );
    existingNoun.senses[0]!.sub_pos = "N-COUNT";
    const removedPos = createPosMeanings(
      "removed-pos",
      unifiedHeadwords,
      "word-1",
      "sense-group-1"
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

  it("meanings 为空时默认创建首个语义区间，并让新增 POS 的词义自动绑定", () => {
    const nounForms = createPosForms("noun", unifiedHeadwords);
    const word = makeWord([nounForms], []);
    word.meanings.sense_groups = [];

    const result = ensureMeaningsForForms(word);

    expect(result.sense_groups).toEqual([
      { id: expect.any(String), name_zh: "", name_en: "" }
    ]);
    expect(result.pos[0]!.senses[0]!.sense_group_id).toBe(
      result.sense_groups[0]!.id
    );
    expect(word.meanings.sense_groups).toEqual([]);
  });
});

describe("T58-T59 词义内容全局方言补全", () => {
  it("只收集目标方言缺失且源文本非空的英文释义和例句，并跨词性合并为一次请求", () => {
    const content = dialectMeaningContent();

    expect(collectMissingMeaningDialectItems(content, "uk")).toEqual({
      source_dialect: "us",
      target_dialect: "uk",
      items: [
        {
          client_id: "definition-missing",
          field_kind: "definition",
          value: richText("the center")
        },
        {
          client_id: "example-missing",
          field_kind: "example",
          value: richText("The center is closed.")
        },
        {
          client_id: "definition-second-pos",
          field_kind: "definition",
          value: richText("to organize")
        }
      ]
    });
    expect(collectMissingMeaningDialectItems(content, "us").items).toEqual([]);
    expect(countIncompleteMeaningDialectSlots(content, "uk")).toBe(4);
    expect(countIncompleteMeaningDialectSlots(content, "us")).toBe(1);
  });

  it("仅写入仍缺失的匹配项，保留手填内容并忽略表单、未知和重复响应", () => {
    const content = dialectMeaningContent();
    const original = structuredClone(content);
    const suggestions = [
      {
        client_id: "definition-missing",
        field_kind: "definition" as const,
        value: richText("the centre"),
        model_version: "test-v1"
      },
      {
        client_id: "example-missing",
        field_kind: "example" as const,
        value: richText("The centre is closed."),
        model_version: "test-v1"
      },
      {
        client_id: "definition-ready",
        field_kind: "definition" as const,
        value: richText("must not overwrite"),
        model_version: "test-v1"
      },
      {
        client_id: "unknown-definition",
        field_kind: "definition" as const,
        value: richText("unknown"),
        model_version: "test-v1"
      },
      {
        client_id: "form-1",
        field_kind: "form" as const,
        value: "centred",
        model_version: "test-v1"
      },
      {
        client_id: "definition-second-pos",
        field_kind: "definition" as const,
        value: richText("to organise"),
        model_version: "test-v1"
      },
      {
        client_id: "definition-second-pos",
        field_kind: "definition" as const,
        value: richText("duplicate response"),
        model_version: "test-v1"
      }
    ];

    const result = applyMeaningDialectSuggestions(content, "uk", suggestions);

    expect(content).toEqual(original);
    expect(result.applied_count).toBe(2);
    expect(result.skipped_count).toBe(5);
    expect(result.content).not.toBe(content);
    const [noun, verb] = result.content.pos;
    const nounDefinitions = noun!.senses[0]!.definitions;
    const convertedDefinition = nounDefinitions.find(
      (definition) => definition.id === "definition-missing"
    )!;
    const manualDefinition = nounDefinitions.find(
      (definition) => definition.id === "definition-ready"
    )!;
    expect(convertedDefinition.content).toMatchObject({
      mode: "distinguish",
      uk: {
        state: "ready",
        variant: {
          id: expect.any(String),
          origin: "converted",
          value: { text: "the centre" }
        }
      }
    });
    expect(noun!.senses[0]!.sentences[0]!.en_text).toMatchObject({
      uk: {
        state: "ready",
        variant: {
          id: expect.any(String),
          origin: "converted",
          value: { text: "The centre is closed." }
        }
      }
    });
    expect(manualDefinition.content).toMatchObject({
      uk: {
        state: "ready",
        variant: { origin: "manual", value: { text: "the colour" } }
      }
    });
    expect(
      verb!.senses[0]!.definitions.find(
        (definition) => definition.id === "definition-second-pos"
      )!.content
    ).toMatchObject({ uk: { state: "missing" } });
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
      content_id: expect.any(String),
      level: "A1",
      definition_mode: "zh_definition",
      content: { version: 1, text: "", spans: [], liaisons: [] }
    });
    expect(sentence).toMatchObject({
      id: expect.any(String),
      zh_text_id: expect.any(String),
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

describe("真实后端 wire mapper", () => {
  it("词形请求保留节点 ID，并移除旧缓存中的音频只读字段", () => {
    const pos = createPosForms("noun", unifiedHeadwords);
    const pronunciation = pos.base_form.variants[0]!.pronunciations[0]!;
    Object.assign(pronunciation, {
      audio_url: "https://cdn.example.test/audio.mp3",
      audio_source: "tts"
    });

    const wire = toFormsWireContent({ pos: [pos] });
    const wirePronunciation =
      wire.pos[0]!.base_form.variants[0]!.pronunciations[0]!;

    expect(wirePronunciation.id).toBe(pronunciation.id);
    expect(wirePronunciation).not.toHaveProperty("audio_url");
    expect(wirePronunciation).not.toHaveProperty("audio_source");
    expect(pronunciation).toHaveProperty("audio_url");
  });

  it("词义请求保留文本 ID，过滤空 context/relation 并剥离 relation 快照", () => {
    const pos = createPosMeanings(
      "pos-1",
      unifiedHeadwords,
      "word-1",
      "sense-group-1"
    );
    const sense = pos.senses[0]!;
    const definition = sense.definitions[0]!;
    const sentence = sense.sentences[0]!;
    sentence.links.push(
      { word_id: "", sense_id: "", role: "context" },
      { word_id: "word-2", sense_id: "sense-2", role: "context" }
    );
    sense.relations = [
      createRelation("antonym"),
      {
        id: "relation-2",
        relation: "synonym",
        target_word_id: "word-2",
        target_sense_id: "sense-2",
        target_headword: "other",
        target_gloss: "另一个",
        score: "75"
      }
    ];
    Object.assign(definition, { audio_url: "legacy-definition.mp3" });
    Object.assign(sentence, { audio_source: "legacy-tts" });

    const wire = toMeaningsWireContent({
      sense_groups: [{ id: "sense-group-1", name_zh: "测试", name_en: "Test" }],
      pos: [pos]
    });
    const wireSense = wire.pos[0]!.senses[0]!;
    const wireDefinition = wireSense.definitions[0]!;
    const wireSentence = wireSense.sentences[0]!;
    const sourceTextId =
      sentence.en_text.mode === "unified"
        ? sentence.en_text.common.id
        : undefined;

    expect(wireDefinition).toMatchObject({
      id: definition.id,
      content_id: "content_id" in definition ? definition.content_id : ""
    });
    expect(wireSentence).toMatchObject({
      id: sentence.id,
      zh_text_id: sentence.zh_text_id,
      en_text: {
        mode: "unified",
        common: { id: sourceTextId }
      }
    });
    expect(wireSentence.links).toEqual([
      { word_id: "word-1", sense_id: sense.id, role: "focus" },
      { word_id: "word-2", sense_id: "sense-2", role: "context" }
    ]);
    expect(wireSense.relations).toEqual([
      {
        id: "relation-2",
        relation: "synonym",
        target_word_id: "word-2",
        target_sense_id: "sense-2",
        score: "75"
      }
    ]);
    expect(wireDefinition).not.toHaveProperty("audio_url");
    expect(wireSentence).not.toHaveProperty("audio_source");
  });
});
