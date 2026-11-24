import { describe, expect, it } from "vitest";
import type { NextAgentSource } from "@tsz/types";
import {
  dictionaryReferenceEntry,
  dictionaryReferenceLayout
} from "./referenceEntryModel";

function parse(
  source: string,
  excerpt: string,
  headword = "center",
  status = "found"
) {
  const row: NextAgentSource = { source, excerpt, status, locator: "" };
  return dictionaryReferenceEntry(row, headword);
}

describe("dictionaryReferenceEntry", () => {
  it("separates Youdao's labels from spellings and preserves pronunciation by dialect", () => {
    expect(
      parse(
        "有道",
        "center · 英 [ˈsentə(r)] / 美 [ˈsentər] · 词性 n.、v. · [ 复数 centers 第三人称单数 centers 现在分词 centering ]"
      )
    ).toEqual({
      partsOfSpeech: ["noun", "verb"],
      pronunciation: { uk: "[ˈsentə(r)]", us: "[ˈsentər]" },
      forms: [
        { type: "plural", text: "centers" },
        { type: "third_person_singular", text: "centers" },
        { type: "present_participle", text: "centering" }
      ]
    });
  });

  it("distinguishes Oxford index metadata from a definition", () => {
    expect(
      parse(
        "Oxford Learner’s Dictionaries",
        "Definition of center noun in Oxford Advanced Learner's Dictionary. Meaning, pronunciation, picture, example sentences, grammar, usage notes, synonyms and more."
      )
    ).toEqual({ partsOfSpeech: ["noun"], indexOnly: true });
  });

  it("shows the Webster and Cambridge definition data under the same field", () => {
    expect(
      parse(
        "Merriam-Webster",
        "The meaning of CENTER is a middle point. How to use center in a sentence."
      )
    ).toEqual({ definitions: ["a middle point."] });
    expect(
      parse(
        "Cambridge Dictionary",
        "CENTER definition: 1. US spelling of centre 2. the middle point or part. Learn more."
      )
    ).toEqual({
      definitions: ["US spelling of centre", "the middle point or part."]
    });
  });

  it("leaves unrecognized content as a summary and suppresses data from unavailable sources", () => {
    expect(parse("有道", "river · 词性 n.")).toEqual({
      summary: "river · 词性 n."
    });
    expect(
      parse(
        "Cambridge Dictionary",
        "CENTER definition: a term measured in 2.5 units"
      )
    ).toEqual({ summary: "a term measured in 2.5 units" });
    expect(
      parse("Merriam-Webster", "cached text", "center", "unavailable")
    ).toEqual({});
  });
});

it("combines structured facts with the original source summary", () => {
  expect(
    parse(
      "Merriam-Webster",
      "center · 词性 noun、verb · 读音标记 ˈsen-tər · [ centered、centering ] · 来源摘要 The meaning of CENTER is a middle point."
    )
  ).toEqual({
    definitions: ["a middle point."],
    partsOfSpeech: ["noun", "verb"],
    reading: "ˈsen-tər",
    forms: [{ text: "centered" }, { text: "centering" }]
  });
  expect(
    parse(
      "Cambridge Dictionary",
      "center · 英 [ˈsen.tər] · 词性 noun · 来源摘要 CENTER definition: 1. a middle point. Learn more."
    )
  ).toMatchObject({
    partsOfSpeech: ["noun"],
    pronunciation: { uk: "[ˈsen.tər]" },
    definitions: ["a middle point."]
  });
  expect(
    parse(
      "Oxford Learner’s Dictionaries",
      "center · 英 [ˈsentə(r)] · 词性 noun · 释义 the middle point"
    )
  ).toMatchObject({
    partsOfSpeech: ["noun"],
    definitions: ["the middle point"]
  });
});

it("keeps Webster's inflections attached to the part of speech that lists them", () => {
  expect(
    parse(
      "Merriam-Webster",
      "test · 词性 noun、verb · 读音标记 ˈtest · 词形 noun [] · 词形 verb [tested、testing、tests]",
      "test"
    )
  ).toEqual({
    partsOfSpeech: ["noun", "verb"],
    reading: "ˈtest",
    formsByPos: [
      { pos: "noun", forms: [] },
      {
        pos: "verb",
        forms: [
          { type: "past_tense", text: "tested" },
          { type: "past_participle", text: "tested" },
          { type: "present_participle", text: "testing" },
          { type: "third_person_singular", text: "tests" }
        ]
      }
    ]
  });
});

it("keeps the same Webster index spelling in each of its parts of speech", () => {
  expect(
    parse(
      "Merriam-Webster",
      "center · 词性 noun、verb · 词形 noun [] · 词形 verb [centered、centering] · 索引词形 noun [复数 centers] · 索引词形 verb [第三人称单数 centers]"
    ).formsByPos
  ).toEqual([
    {
      pos: "noun",
      forms: [{ type: "plural", text: "centers", indexed: true }]
    },
    {
      pos: "verb",
      forms: [
        { type: "past_tense", text: "centered" },
        { type: "past_participle", text: "centered" },
        { type: "present_participle", text: "centering" },
        { type: "third_person_singular", text: "centers", indexed: true }
      ]
    }
  ]);
});

it("keeps irregular Webster spellings and explicit source labels", () => {
  expect(
    parse(
      "Merriam-Webster",
      "run · 词形 verb [ran、running、runs] · 词形 verb [过去分词 run]",
      "run"
    ).formsByPos
  ).toEqual([
    {
      pos: "verb",
      forms: [
        { text: "ran" },
        { type: "present_participle", text: "running" },
        { type: "third_person_singular", text: "runs" },
        { type: "past_participle", text: "run" }
      ]
    }
  ]);
});

it("distinguishes a verified spelling variant from Oxford's labeled verb forms", () => {
  expect(
    parse(
      "Oxford Learner’s Dictionaries",
      "center · 词性 noun、verb · [ 原形 center、第三人称单数 centers、过去式 centered、现在分词 centering ]"
    )
  ).toEqual({
    partsOfSpeech: ["noun", "verb"],
    forms: [
      { type: "base", text: "center" },
      { type: "third_person_singular", text: "centers" },
      { type: "past_tense", text: "centered" },
      { type: "present_participle", text: "centering" }
    ]
  });
  expect(
    parse(
      "Cambridge Dictionary",
      "center · 英 [ˈsen.tə(r)] · 词性 noun、verb · [ 英式拼写 centre、美式拼写 center ]"
    )
  ).toMatchObject({
    partsOfSpeech: ["noun", "verb"],
    pronunciation: { uk: "[ˈsen.tə(r)]" },
    forms: [
      { type: "british_spelling", text: "centre" },
      { type: "american_spelling", text: "center" }
    ]
  });
});

it("uses the same ordered form groups for labeled and explicitly grouped evidence", () => {
  const explicit = parse(
    "Oxford Learner’s Dictionaries",
    "center · 词性 verb、noun · 词形 verb [现在分词 centering、过去分词 centered、过去式 centered、原形 center、第三人称单数 centers]"
  );
  const labeled = parse(
    "有道",
    "center · 词性 v.、n. · [ 复数 centers 第三人称单数 centers 现在分词 centering 过去分词 centered 过去式 centered ]"
  );
  const forms = [
    { type: "third_person_singular", text: "centers" },
    { type: "present_participle", text: "centering" },
    { type: "past_tense", text: "centered" },
    { type: "past_participle", text: "centered" }
  ];
  expect(dictionaryReferenceLayout(explicit)).toEqual({
    partsOfSpeech: ["noun", "verb"],
    groups: [
      { kind: "pos", pos: "noun", forms: [] },
      {
        kind: "pos",
        pos: "verb",
        forms: [{ type: "base", text: "center" }, ...forms]
      }
    ]
  });
  expect(dictionaryReferenceLayout(labeled)).toEqual({
    partsOfSpeech: ["noun", "verb"],
    groups: [
      {
        kind: "pos",
        pos: "noun",
        forms: [{ type: "plural", text: "centers" }]
      },
      { kind: "pos", pos: "verb", forms }
    ]
  });
});

it("keeps regional spellings and ambiguous forms out of part-of-speech counts", () => {
  expect(
    dictionaryReferenceLayout({
      partsOfSpeech: ["adjective", "adverb"],
      forms: [
        { type: "comparative", text: "faster" },
        { type: "american_spelling", text: "fast" },
        { type: "british_spelling", text: "fast" }
      ]
    }).groups
  ).toEqual([
    {
      kind: "spellings",
      forms: [
        { type: "british_spelling", text: "fast" },
        { type: "american_spelling", text: "fast" }
      ]
    },
    {
      kind: "unassigned",
      forms: [{ type: "comparative", text: "faster" }]
    }
  ]);
});
