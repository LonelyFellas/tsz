import type { DraftMeaningsStepContentV3, EnglishTextV3 } from "@tsz/types";
import { describe, expect, it } from "vitest";
import {
  editableEnglishText,
  replaceEnglishText,
  replaceRichText,
  toWritableMeanings
} from "./meaningsModel";

const meaningsCanonicalFixture: DraftMeaningsStepContentV3 = {
  sense_groups: [{ id: "sense-group-1", name_zh: "核心", name_en: "Core" }],
  pos: [
    {
      pos_id: "pos-1",
      grammar_structures: [
        {
          id: "grammar-1",
          variants: [
            {
              id: "grammar-variant-1",
              dialect: "common",
              content: { version: 2, text: "used as a noun", annotations: [] }
            }
          ]
        }
      ],
      senses: [
        {
          id: "sense-1",
          sub_pos: "countable",
          level: "A1",
          sense_group_id: "sense-group-1",
          frequency: "high",
          depends_on_context: false,
          definitions: [
            {
              id: "definition-1",
              level: "A1",
              grammar_structure_id: "grammar-1",
              definition_mode: "zh_definition",
              content_id: "definition-content-1",
              content: { version: 2, text: "中心", annotations: [] }
            }
          ],
          sentences: [
            {
              id: "sentence-1",
              level: "A1",
              en_text: {
                mode: "unified",
                common: {
                  id: "sentence-en-1",
                  origin: "manual",
                  value: {
                    version: 2,
                    text: "The city center is busy.",
                    annotations: []
                  }
                }
              },
              zh_text_id: "sentence-zh-1",
              zh_text: { version: 2, text: "市中心很繁忙。", annotations: [] },
              links: [
                { word_id: "entry-1", sense_id: "sense-1", role: "head" }
              ],
              associations: [
                {
                  id: "association-read-only",
                  source_dialect: "common",
                  source_range: { start: 4, end: 10, surface: "center" },
                  target_word_id: "target-entry",
                  target_sense_id: "target-sense",
                  target_form_slot_id: "legacy-slot",
                  origin: "auto",
                  target_headword: "center",
                  target_gloss: "中心",
                  resolved_pos: "noun",
                  resolved_form_type: "base"
                }
              ],
              associations_state: "resolved"
            }
          ],
          relations: [
            {
              id: "relation-1",
              relation: "synonym",
              target_word_id: "target-entry",
              target_sense_id: "target-sense",
              target_headword: "middle",
              target_gloss: "中部",
              score: "0.8"
            }
          ]
        }
      ]
    }
  ]
};

describe("V3 meanings writable model", () => {
  it("深投影排除只读 association/target snapshots，保留全部 writable UUID 与顺序", () => {
    const writable = toWritableMeanings(meaningsCanonicalFixture);
    const sense = writable.pos[0]!.senses[0]!;

    expect(writable.sense_groups[0]!.id).toBe("sense-group-1");
    expect(writable.pos[0]!.pos_id).toBe("pos-1");
    expect(sense.id).toBe("sense-1");
    expect(sense.sentences[0]!.id).toBe("sentence-1");
    expect(sense.sentences[0]).not.toHaveProperty("associations");
    expect(sense.sentences[0]).not.toHaveProperty("associations_state");
    expect(sense.relations[0]).not.toHaveProperty("target_headword");
    expect(sense.relations[0]).not.toHaveProperty("target_gloss");
    expect(sense.relations[0]).toMatchObject({
      id: "relation-1",
      target_word_id: "target-entry",
      target_sense_id: "target-sense"
    });
  });

  it("sense 仅归属 POS，不产生 group/form/variant ownership 字段", () => {
    const writable = toWritableMeanings(meaningsCanonicalFixture);
    expect(Object.keys(writable.pos[0]!.senses[0]!).sort()).toEqual([
      "definitions",
      "depends_on_context",
      "frequency",
      "id",
      "level",
      "relations",
      "sense_group_id",
      "sentences",
      "sub_pos"
    ]);
    expect(JSON.stringify(writable)).not.toMatch(
      /"(?:group_id|form_id|variant_id|membership_id)":/
    );
  });

  it("RichText/EnglishText 文本编辑保留版本、annotation 与 text variant UUID", () => {
    const rich = {
      version: 2 as const,
      text: "before",
      annotations: [
        {
          type: "emphasis" as const,
          start: 0,
          end: 3,
          level: "strong" as const
        }
      ]
    };
    expect(replaceRichText(rich, "after")).toEqual({
      ...rich,
      text: "after"
    });

    const english =
      meaningsCanonicalFixture.pos[0]!.senses[0]!.sentences[0]!.en_text;
    expect(editableEnglishText(english)).toEqual([
      expect.objectContaining({
        dialect: "common",
        variant_id: "sentence-en-1",
        text: "The city center is busy."
      })
    ]);
    expect(
      replaceEnglishText(english, "common", "Canonical sentence")
    ).toMatchObject({
      mode: "unified",
      common: {
        id: "sentence-en-1",
        value: { text: "Canonical sentence" }
      }
    });
  });

  it("文本缩短时清除越界 V1 spans/liaisons，并按 Unicode 码点判断边界", () => {
    expect(
      replaceRichText(
        {
          version: 1,
          text: "A😀BC",
          spans: [
            { start: 0, end: 2, type: "bold" },
            { start: 1, end: 4, type: "blue" }
          ],
          liaisons: [0, 2]
        },
        "😀A"
      )
    ).toEqual({
      version: 1,
      text: "😀A",
      spans: [{ start: 0, end: 2, type: "bold" }],
      liaisons: [0]
    });
  });

  it("文本缩短时仅保留范围与 pause 仍在 Unicode 码点边界内的 V2 annotations", () => {
    expect(
      replaceRichText(
        {
          version: 2,
          text: "A😀BC",
          annotations: [
            { type: "emphasis", start: 0, end: 2, level: "strong" },
            { type: "liaison", start: 2, end: 4 },
            { type: "pause", at: 2, duration_ms: 200 },
            { type: "pause", at: 4, duration_ms: 200 }
          ]
        },
        "😀A"
      )
    ).toEqual({
      version: 2,
      text: "😀A",
      annotations: [
        { type: "emphasis", start: 0, end: 2, level: "strong" },
        { type: "pause", at: 2, duration_ms: 200 }
      ]
    });
  });

  it("V1/V2 offset 边界会过滤负值、零长和越界项并保留终点边界", () => {
    expect(
      replaceRichText(
        {
          version: 1,
          text: "before",
          spans: [
            { start: 0, end: 3, type: "bold" },
            { start: 1, end: 1, type: "blue" },
            { start: -1, end: -1, type: "bold" },
            { start: 0, end: 4, type: "blue" }
          ],
          liaisons: [-1, 0, 1, 2]
        },
        "abc"
      )
    ).toEqual({
      version: 1,
      text: "abc",
      spans: [{ start: 0, end: 3, type: "bold" }],
      liaisons: [0, 1]
    });

    expect(
      replaceRichText(
        {
          version: 2,
          text: "before",
          annotations: [
            { type: "pause", at: -1, duration_ms: 100 },
            { type: "pause", at: 3, duration_ms: 200 },
            { type: "pause", at: 4, duration_ms: 300 },
            { type: "liaison", start: 0, end: 3 },
            { type: "emphasis", start: 2, end: 2, level: "strong" },
            { type: "highlight", start: 0, end: 4, color: "yellow" }
          ]
        },
        "abc"
      )
    ).toEqual({
      version: 2,
      text: "abc",
      annotations: [
        { type: "pause", at: 3, duration_ms: 200 },
        { type: "liaison", start: 0, end: 3 }
      ]
    });
  });

  it("distinguish EnglishText 只暴露 ready 方言并拒绝缺失或错误 dialect", () => {
    const ukReady: EnglishTextV3 = {
      mode: "distinguish",
      source_dialect: "uk",
      uk: {
        state: "ready",
        variant: {
          id: "uk-variant",
          origin: "manual",
          value: {
            version: 1,
            text: "centre",
            spans: [{ start: 0, end: 6, type: "blue" }],
            liaisons: [0]
          }
        }
      },
      us: { state: "missing" }
    };
    expect(editableEnglishText(ukReady)).toEqual([
      { dialect: "uk", variant_id: "uk-variant", text: "centre" }
    ]);
    const changedUk = replaceEnglishText(ukReady, "uk", "center");
    expect(changedUk).toMatchObject({
      mode: "distinguish",
      uk: {
        state: "ready",
        variant: {
          id: "uk-variant",
          value: { version: 1, text: "center" }
        }
      },
      us: { state: "missing" }
    });
    expect(ukReady.uk).toMatchObject({
      state: "ready",
      variant: { value: { text: "centre" } }
    });
    expect(() => replaceEnglishText(ukReady, "common", "invalid")).toThrow(
      "Common dialect is not editable in distinguish mode"
    );
    expect(() => replaceEnglishText(ukReady, "us", "invalid")).toThrow(
      "Dialect us is not ready"
    );

    const usReady: EnglishTextV3 = {
      mode: "distinguish",
      source_dialect: "us",
      uk: { state: "missing" },
      us: {
        state: "ready",
        variant: {
          id: "us-variant",
          origin: "manual",
          value: { version: 2, text: "center", annotations: [] }
        }
      }
    };
    expect(editableEnglishText(usReady)).toEqual([
      { dialect: "us", variant_id: "us-variant", text: "center" }
    ]);
    expect(replaceEnglishText(usReady, "us", "centered")).toMatchObject({
      us: { state: "ready", variant: { value: { text: "centered" } } }
    });
    expect(() =>
      replaceEnglishText(
        meaningsCanonicalFixture.pos[0]!.senses[0]!.sentences[0]!.en_text,
        "uk",
        "invalid"
      )
    ).toThrow("Dialect uk is not editable in unified mode");
  });

  it("canonical 深投影覆盖 V1、definition modes 与可选字段存在/缺失", () => {
    const canonical = structuredClone(meaningsCanonicalFixture);
    const pos = canonical.pos[0]!;
    pos.grammar_structures[0]!.variants[0]!.content = {
      version: 1,
      text: "grammar",
      spans: [{ start: 0, end: 7, type: "bold" }],
      liaisons: [0]
    };
    const sense = pos.senses[0]!;
    delete sense.sense_group_id;
    delete sense.frequency;
    sense.definitions.push(
      {
        id: "definition-zh-sentence",
        level: "A2",
        definition_mode: "zh_sentence",
        content_id: "zh-sentence-content",
        content: { version: 1, text: "例句", spans: [], liaisons: [] }
      },
      {
        id: "definition-en",
        level: "B1",
        definition_mode: "en_definition",
        content: {
          mode: "distinguish",
          source_dialect: "uk",
          uk: {
            state: "ready",
            variant: {
              id: "definition-uk",
              origin: "manual",
              value: { version: 2, text: "centre", annotations: [] }
            }
          },
          us: { state: "missing" }
        }
      }
    );
    sense.sentences[0]!.en_text = {
      mode: "distinguish",
      source_dialect: "us",
      uk: { state: "missing" },
      us: {
        state: "ready",
        variant: {
          id: "sentence-us",
          origin: "manual",
          value: { version: 2, text: "center", annotations: [] }
        }
      }
    };
    sense.relations = [
      {
        id: "relation-pending",
        relation: "synonym",
        pending_target_headword: "centre",
        target_headword: "read-only",
        target_gloss: "只读",
        score: "0"
      }
    ];

    const writable = toWritableMeanings(canonical);
    const projectedSense = writable.pos[0]!.senses[0]!;
    expect(
      writable.pos[0]!.grammar_structures[0]!.variants[0]!.content
    ).toEqual({
      version: 1,
      text: "grammar",
      spans: [{ start: 0, end: 7, type: "bold" }],
      liaisons: [0]
    });
    expect(projectedSense).not.toHaveProperty("sense_group_id");
    expect(projectedSense).not.toHaveProperty("frequency");
    expect(projectedSense.definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "definition-zh-sentence",
          definition_mode: "zh_sentence",
          content_id: "zh-sentence-content"
        }),
        expect.objectContaining({
          id: "definition-en",
          definition_mode: "en_definition",
          content: {
            mode: "distinguish",
            source_dialect: "uk",
            uk: expect.objectContaining({ state: "ready" }),
            us: { state: "missing" }
          }
        })
      ])
    );
    expect(projectedSense.relations[0]).toEqual({
      id: "relation-pending",
      relation: "synonym",
      pending_target_headword: "centre",
      score: "0"
    });
  });
});
