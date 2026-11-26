import { describe, expect, it } from "vitest";
import type {
  NextAgentGrammar,
  NextAgentResult,
  NextDraft,
  NextSentence
} from "@tsz/types";
import { partOfSpeechCatalogFixture } from "@/features/dictionary/word-creation/partOfSpeech.test.helper";
import { newSentenceVariant, sentenceChanges } from "./sentenceDrafts";
import { fillGeneratedDraft } from "./generatedDraft";
import { newGrammarStructure } from "./model";

describe("智能补全回填", () => {
  it("保留已有定义和明确无译词的决定，按具体词义保存新增例句与译文", () => {
    const original: NextDraft = {
      schema_version: 1,
      headword: "tomorrow",
      forms: [],
      senses: [
        {
          id: "noun-id",
          part_of_speech: "noun",
          definitions: [
            {
              id: "manual",
              locale: "en",
              style: "definition",
              text: "My own definition"
            }
          ],
          no_equivalents: ["zh-Hans"],
          equivalents: []
        }
      ]
    };
    const result: NextAgentResult = {
      run_id: crypto.randomUUID(),
      snapshot_id: "digest",
      base_revision: 1,
      done: true,
      requires_human_review: true,
      steps: [],
      sources: [],
      proposals: {
        forms: [],
        groups: [],
        grammar: [],
        dialect: [
          {
            sense: 1,
            usage: "en-GB",
            source_locator: "fixture",
            evidence: "British"
          }
        ],
        relations: [],
        senses: [{ pos: "adverb", gloss: "在明天", level: "A2" }],
        definitions: [
          { sense: 0, english: "Replacement", explanation: "明天这一天" }
        ],
        equivalents: [{ sense: 0, word: "明天" }],
        examples: [{ sense: 1, text: "I will visit tomorrow.", level: "A2" }],
        translations: [{ example: 0, text: "我明天来。" }]
      }
    };
    const { draft, resources, dialect } = fillGeneratedDraft(
      original,
      result,
      partOfSpeechCatalogFixture,
      "en-GB",
      "zh-Hans",
      "editor"
    );
    expect(dialect[draft.senses[1]!.id]).toMatchObject({
      usage: "en-GB",
      target: null
    });
    expect(original.senses).toHaveLength(1);
    expect(draft.senses[0]?.definitions.map((d) => d.text)).toEqual([
      "My own definition",
      "明天这一天"
    ]);
    expect(draft.senses[0]?.equivalents).toEqual([]);
    expect(draft.senses[1]?.sentence_ids).toEqual([resources[0]!.id]);
    const senseOnly = fillGeneratedDraft(
      original,
      result,
      partOfSpeechCatalogFixture,
      "en-GB",
      "zh-Hans",
      "editor",
      [],
      {},
      [],
      { section: "senses" }
    );
    expect(senseOnly.dialect[senseOnly.draft.senses[1]!.id]?.usage).toBe(
      "en-GB"
    );
    expect(senseOnly.resources).toEqual([]);
    const changes = sentenceChanges(
      [],
      Object.fromEntries(resources.map((s) => [s.id, s])),
      draft.senses[1]!.sentence_ids!,
      "zh-Hans"
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]?.variant.translations[0]?.content.text).toBe(
      "我明天来。"
    );
    expect(changes[0]).not.toHaveProperty("expected_revision");
    const blankTranslation = {
      id: "first-translation",
      locale: "zh-Hans",
      style: "word_for_word" as const,
      content: { version: 2 as const, text: "", annotations: [] },
      metadata: {
        freedom: 20,
        sources: [
          {
            id: "source",
            source_type: "dictionary" as const,
            title: "词典",
            url: "",
            locator: "1"
          }
        ]
      }
    };
    const otherBlank = { ...blankTranslation, id: "second-translation" };
    const saved: NextSentence = {
      ...resources[0]!,
      revision: 2,
      draft: {
        schema_version: 1,
        variants: [
          {
            ...newSentenceVariant("en-GB"),
            translations: [blankTranslation, otherBlank],
            content: {
              version: 2,
              text: "An existing example.",
              annotations: []
            }
          }
        ]
      }
    };
    result.proposals = {
      forms: [],
      groups: [],
      dialect: [],
      grammar: [],
      relations: [],
      senses: [],
      definitions: [],
      equivalents: [],
      examples: [],
      translations: [{ example: 0, text: "已有例句的译文" }]
    };
    const revised = fillGeneratedDraft(
      draft,
      result,
      partOfSpeechCatalogFixture,
      "en-GB",
      "zh-Hans",
      "editor",
      [saved]
    );
    expect(revised.resources[0]?.id).toBe(saved.id);
    expect(revised.resources[0]?.draft.variants[0]?.content.text).toBe(
      "An existing example."
    );
    expect(revised.resources[0]?.draft.variants[0]?.translations).toEqual([
      {
        ...blankTranslation,
        content: { ...blankTranslation.content, text: "已有例句的译文" }
      },
      otherBlank
    ]);
  });
});

it("按本次送出的词义顺序回填，并只修改点选语言的解释", () => {
  const original: NextDraft = {
    schema_version: 1,
    headword: "bank",
    forms: [],
    senses: [
      {
        id: "first",
        part_of_speech: "noun",
        definitions: [
          {
            id: "owned",
            locale: "zh-Hans",
            style: "definition",
            text: "银行的人工解释"
          },
          {
            id: "draft-blank",
            locale: "en-GB",
            style: "definition",
            text: ""
          }
        ],
        equivalents: []
      },
      { id: "second", part_of_speech: "noun", definitions: [], equivalents: [] }
    ]
  };
  const result: NextAgentResult = {
    run_id: "run",
    base_revision: 1,
    snapshot_id: "snapshot",
    done: true,
    requires_human_review: true,
    sources: [],
    steps: [],
    proposals: {
      forms: [],
      senses: [],
      grammar: [],
      groups: [],
      relations: [],
      examples: [],
      translations: [],
      dialect: [],
      definitions: [
        { sense: 0, english: "Side of a river.", explanation: "河岸" }
      ],
      equivalents: [{ sense: 0, word: "其他板块的候选" }]
    }
  };
  const { draft } = fillGeneratedDraft(
    original,
    result,
    partOfSpeechCatalogFixture,
    "en-GB",
    "zh-Hans",
    "editor",
    [],
    {},
    [],
    { section: "definitions", senseId: "second", locale: "zh-Hans" }
  );
  expect(draft.senses[0]).toEqual(original.senses[0]);
  expect(draft.senses[1]?.definitions).toEqual([
    {
      id: expect.any(String),
      locale: "zh-Hans",
      text: "河岸",
      style: "definition"
    }
  ]);
  expect(draft.senses[1]?.equivalents).toEqual([]);
});

describe("语法结构候选回填", () => {
  const original: NextDraft = {
    schema_version: 1,
    headword: "rely",
    forms: [],
    senses: []
  };
  const apply = (draft: NextDraft, grammar: NextAgentGrammar[]) =>
    fillGeneratedDraft(
      draft,
      {
        run_id: "run",
        base_revision: 1,
        snapshot_id: "snapshot",
        done: true,
        requires_human_review: true,
        sources: [],
        steps: [],
        proposals: {
          forms: [],
          senses: [],
          grammar,
          groups: [],
          relations: [],
          examples: [],
          translations: [],
          dialect: [],
          definitions: [],
          equivalents: []
        }
      },
      partOfSpeechCatalogFixture,
      "en-GB",
      "zh-Hans",
      "editor",
      [],
      {},
      [],
      { section: "grammar", pos: "verb" }
    ).draft;

  it("按顺序回填同一词性的全部候选，保留初始占位 ID", () => {
    const blank = newGrammarStructure("verb");
    blank.variants[0]!.content = {
      version: 1,
      text: "",
      spans: [],
      liaisons: []
    };
    const patterns = [
      "rely on somebody",
      "rely on somebody to help",
      "rely on somebody for advice"
    ];
    const proposals = patterns.map((pattern, index) => ({
      pos: "verb",
      pattern,
      sub_pos: index === 2 ? "N-COUNT" : "V-I"
    }));
    const filled = apply(
      { ...original, grammar_structures: [blank] },
      proposals
    );

    expect(
      filled.grammar_structures?.map((row) => row.variants[0]?.content.text)
    ).toEqual(patterns);
    expect(filled.grammar_structures?.[0]?.id).toBe(blank.id);
    expect(filled.grammar_structures?.[0]?.variants[0]?.id).toBe(
      blank.variants[0]?.id
    );
    expect(filled.grammar_structures?.map((row) => row.sub_pos)).toEqual([
      "V-I",
      "V-I",
      undefined
    ]);
    expect(apply(filled, proposals)).toEqual(filled);
  });

  it("保留人工和另一方言内容，按同一结构对齐方言并去重", () => {
    const manual = newGrammarStructure("verb");
    manual.sub_pos = "V-T";
    manual.variants[0]!.content.text = "rely on evidence";
    const unrelated = newGrammarStructure("verb");
    unrelated.variants[1]!.content.text = "rely on the system";
    const matching = newGrammarStructure("verb");
    matching.variants[1]!.content.text = "rely on somebody";
    const legacy = newGrammarStructure("verb");
    legacy.variants = [
      {
        ...legacy.variants[0]!,
        locale: "en",
        content: { version: 2, text: "rely on the weather", annotations: [] }
      }
    ];
    const filled = apply(
      {
        ...original,
        grammar_structures: [manual, unrelated, matching, legacy]
      },
      [
        { pos: "verb", pattern: "rely on somebody", sub_pos: "V-I" },
        { pos: "verb", pattern: "rely on somebody for advice" },
        { pos: "verb", pattern: " rely on evidence ", sub_pos: "V-I" },
        { pos: "verb", pattern: "rely on somebody for advice" },
        { pos: "verb", pattern: "rely on the weather" },
        { pos: "noun", pattern: "out of scope" }
      ]
    );
    expect(filled.grammar_structures?.slice(0, 2)).toEqual([manual, unrelated]);
    const rows = filled.grammar_structures!;
    expect(rows[2]?.id).toBe(matching.id);
    expect(rows[2]?.sub_pos).toBe("V-I");
    expect(rows[2]?.variants.map((variant) => variant.content.text)).toEqual([
      "rely on somebody",
      "rely on somebody"
    ]);
    expect(rows[3]).toEqual(legacy);
    expect(
      rows
        .slice(4)
        .map((row) => row.variants.map((variant) => variant.content.text))
    ).toEqual([["rely on somebody for advice", ""]]);
  });
});

describe("共享空白语义区间回填", () => {
  const movement = { name_en: "movement", name_zh: "运动" };
  const business = { name_en: "business", name_zh: "经营" };
  const blank = { id: "original", name_en: "", name_zh: "" };
  const manual = { ...blank, id: "manual" };

  function apply(
    groups: NextAgentResult["proposals"]["groups"],
    existing = [blank, manual]
  ) {
    return fillGeneratedDraft(
      {
        schema_version: 1,
        headword: "run",
        forms: [],
        sense_groups: existing,
        senses: ["one", "two"].map((id) => ({
          id,
          part_of_speech: "verb",
          sense_group_id: blank.id,
          equivalents: [],
          definitions: []
        }))
      },
      {
        run_id: "run",
        snapshot_id: "snapshot",
        base_revision: 1,
        done: true,
        requires_human_review: true,
        sources: [],
        steps: [],
        proposals: {
          groups,
          grammar: [],
          forms: [],
          senses: [],
          relations: [],
          examples: [],
          translations: [],
          dialect: [],
          definitions: [],
          equivalents: []
        }
      },
      partOfSpeechCatalogFixture,
      "en-GB",
      "zh-Hans",
      "editor",
      [],
      {},
      [],
      { section: "groups" }
    ).draft;
  }

  it("两个词义同名时保留共享区间 ID，草稿没有多余的待命名区间", () => {
    const draft = apply(
      [
        { sense: 0, ...movement },
        { sense: 1, ...movement }
      ],
      [blank]
    );
    expect(draft.sense_groups).toEqual([{ id: blank.id, ...movement }]);
    expect(draft.senses.map((s) => s.sense_group_id)).toEqual([
      blank.id,
      blank.id
    ]);
  });

  it("部分推荐保留另一词义的空区间及未参与回填的手工占位", () => {
    const draft = apply([
      { sense: 0, ...movement },
      { sense: 1, ...movement, name_en: "" }
    ]);
    expect(draft.sense_groups).toEqual([
      blank,
      manual,
      { id: draft.senses[0]!.sense_group_id, ...movement }
    ]);
    expect(draft.senses[1]!.sense_group_id).toBe(blank.id);
  });

  it("分到不同组时按草稿词义顺序复用原 ID", () => {
    const draft = apply([
      { sense: 1, ...business },
      { sense: 0, ...movement }
    ]);
    expect(draft.senses[0]!.sense_group_id).toBe(blank.id);
    expect(draft.sense_groups).toEqual([
      { id: blank.id, ...movement },
      manual,
      { id: draft.senses[1]!.sense_group_id, ...business }
    ]);
  });

  it("并入已有同名区间时仅移除本次腾空的占位", () => {
    const named = { id: "named", ...movement };
    const draft = apply(
      [
        { sense: 0, ...movement },
        { sense: 1, ...movement }
      ],
      [blank, manual, named]
    );
    expect(draft.sense_groups).toEqual([manual, named]);
    expect(draft.senses.map((s) => s.sense_group_id)).toEqual([
      named.id,
      named.id
    ]);
  });
});
