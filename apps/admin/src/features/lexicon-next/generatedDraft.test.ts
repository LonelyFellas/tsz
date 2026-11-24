import { describe, expect, it } from "vitest";
import type { NextAgentResult, NextDraft, NextSentence } from "@tsz/types";
import { partOfSpeechCatalogFixture } from "@/features/dictionary/word-creation/partOfSpeech.test.helper";
import { newSentenceVariant, sentenceChanges } from "./sentenceDrafts";
import { fillGeneratedDraft } from "./generatedDraft";

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
