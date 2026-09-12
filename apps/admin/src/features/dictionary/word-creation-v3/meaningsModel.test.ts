import type {
  AudioAssetV3,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentV3,
  EnglishTextV3
} from "@tsz/types";
import { describe, expect, it, vi } from "vitest";
import { newWordNodeId } from "../word-model/primitives";
import { formsFixture } from "./fixtures";
import {
  dropEmptySentenceTranslations,
  editableEnglishText,
  newSentenceTranslations,
  prepareTextLinksForSave,
  ensureV3MeaningsForForms,
  relationDisplaySnapshots,
  replaceEnglishText,
  sentenceTranslationsV3,
  replaceRichText,
  stripBlankRelations,
  stripSenseComponentUsages,
  toWritableMeanings
} from "./meaningsModel";

const audioAsset = (
  id: string,
  locale: AudioAssetV3["locale"]
): AudioAssetV3 => ({
  id,
  locale,
  gender: "female",
  content_type: "audio/mpeg",
  size_bytes: 3,
  original_name: `${id}.mp3`,
  created_at: "2026-09-06T00:00:00Z"
});

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
                  association_schema_version: 3,
                  source_dialect: "common",
                  source_segments: [{ start: 4, end: 10, surface: "center" }],
                  target_word_id: "target-entry",
                  target_sense_id: "target-sense",
                  target_form_slot_id: "legacy-slot",
                  state: "linked",
                  target_component_usages: [],
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

it("语义区间英文富文本和发音配置在编辑转换中保留且不共享引用", () => {
  const canonical = structuredClone(meaningsCanonicalFixture);
  canonical.sense_groups[0]!.name_en_rich = {
    version: 2,
    text: "Core",
    annotations: [{ type: "emphasis", start: 0, end: 4, level: "core" }]
  };
  canonical.sense_groups[0]!.voice_profile = {
    voices: [{ voice_id: "sonia", enabled: true, rate_percent: 10 }]
  };
  const writable = toWritableMeanings(canonical);
  expect(writable.sense_groups[0]).toEqual(canonical.sense_groups[0]);
  expect(writable.sense_groups[0]!.name_en_rich).not.toBe(
    canonical.sense_groups[0]!.name_en_rich
  );
  expect(writable.sense_groups[0]!.voice_profile).not.toBe(
    canonical.sense_groups[0]!.voice_profile
  );
});

describe("V3 meanings writable model", () => {
  it("initializes native V3 POS templates sharing one word-level sense group", () => {
    let nextId = 0;
    const idFactory = vi.fn(() => `new-node-${++nextId}`);
    const first = formsFixture({ pos_id: "pos-1" }).pos[0]!;
    const second = formsFixture({ pos_id: "pos-2", pos: "verb" }).pos[0]!;
    const forms: DraftFormsStepContentV3 = { pos: [first, second] };

    const result = ensureV3MeaningsForForms(
      "word-1",
      forms,
      { sense_groups: [], pos: [] },
      idFactory
    );

    expect(result.sense_groups).toEqual([
      { id: "new-node-1", name_zh: "", name_en: "" }
    ]);
    expect(result.pos.map((pos) => pos.pos_id)).toEqual(["pos-1", "pos-2"]);
    for (const pos of result.pos) {
      expect(pos.grammar_structures).toEqual([
        {
          id: expect.any(String),
          variants: [
            {
              id: expect.any(String),
              dialect: "common",
              content: { version: 2, text: "", annotations: [] }
            }
          ]
        }
      ]);
      expect(pos.senses).toHaveLength(1);
      const sense = pos.senses[0]!;
      expect(sense).toMatchObject({
        id: expect.any(String),
        sub_pos: "",
        level: "A1",
        sense_group_id: result.sense_groups[0]!.id,
        depends_on_context: false,
        relations: []
      });
      expect(sense.definitions).toEqual([
        {
          id: expect.any(String),
          level: "A1",
          definition_mode: "zh_definition",
          content_id: expect.any(String),
          content: { version: 2, text: "", annotations: [] }
        }
      ]);
      expect(sense.sentences).toEqual([]);
    }
    expect(
      new Set(idFactory.mock.results.map((entry) => entry.value)).size
    ).toBe(idFactory.mock.calls.length);
  });

  it("preserves every existing meanings node and only appends missing POS templates", () => {
    let nextId = 0;
    const idFactory = vi.fn(() => `missing-node-${++nextId}`);
    const existing = toWritableMeanings(meaningsCanonicalFixture);
    const existingJson = JSON.stringify(existing);
    const existingPos = existing.pos[0]!;
    const forms: DraftFormsStepContentV3 = {
      pos: [
        formsFixture({ pos_id: "pos-1" }).pos[0]!,
        formsFixture({ pos_id: "pos-2", pos: "verb" }).pos[0]!
      ]
    };

    const result = ensureV3MeaningsForForms(
      "entry-1",
      forms,
      existing,
      idFactory
    );

    expect(result).not.toBe(existing);
    expect(result.sense_groups).toBe(existing.sense_groups);
    expect(result.sense_groups).toHaveLength(1);
    expect(result.pos[0]).toBe(existingPos);
    expect(JSON.stringify(existing)).toBe(existingJson);
    expect(result.pos.map((pos) => pos.pos_id)).toEqual(["pos-1", "pos-2"]);
    expect(result.pos[1]!.senses[0]!.sentences).toEqual([]);
    expect(result.pos[1]!.senses[0]!.sense_group_id).toBe(
      result.sense_groups[0]!.id
    );
    expect(result.pos[1]!.senses[0]!.sense_group_id).toBe(
      result.pos[0]!.senses[0]!.sense_group_id
    );
  });

  it("is idempotent and does not spend new UUIDs after the first initialization", () => {
    let nextId = 0;
    const idFactory = vi.fn(() => `stable-node-${++nextId}`);
    const forms = formsFixture({ pos_id: "pos-1" });
    const first = ensureV3MeaningsForForms(
      "word-1",
      forms,
      { sense_groups: [], pos: [] },
      idFactory
    );
    const callCount = idFactory.mock.calls.length;
    const firstJson = JSON.stringify(first);

    const second = ensureV3MeaningsForForms("word-1", forms, first, idFactory);

    expect(second).toBe(first);
    expect(JSON.stringify(second)).toBe(firstJson);
    expect(idFactory).toHaveBeenCalledTimes(callCount);
  });

  it("restores a missing referenced group with the same UUID when every forms POS already has meanings", () => {
    const existing = toWritableMeanings(meaningsCanonicalFixture);
    existing.sense_groups = [];
    const existingPos = existing.pos;
    const idFactory = vi.fn(() => "new-default-group");

    const result = ensureV3MeaningsForForms(
      "entry-1",
      formsFixture({ pos_id: "pos-1" }),
      existing,
      idFactory
    );

    expect(result.sense_groups).toEqual([
      { id: "sense-group-1", name_zh: "", name_en: "" }
    ]);
    expect(result.pos).toBe(existingPos);
    expect(idFactory).not.toHaveBeenCalled();
  });

  it("keeps a cross-POS shared group intact without cloning", () => {
    const existing = toWritableMeanings(meaningsCanonicalFixture);
    const secondPos = structuredClone(existing.pos[0]!);
    secondPos.pos_id = "pos-2";
    secondPos.senses[0]!.id = "sense-2";
    secondPos.senses[0]!.definitions[0]!.id = "definition-2";
    secondPos.senses[0]!.sentences[0]!.id = "sentence-2";
    existing.pos.push(secondPos);
    const before = structuredClone(existing);
    const idFactory = vi.fn(() => "never-used");
    const forms: DraftFormsStepContentV3 = {
      pos: [
        formsFixture({ pos_id: "pos-1" }).pos[0]!,
        formsFixture({ pos_id: "pos-2", pos: "verb" }).pos[0]!
      ]
    };

    const result = ensureV3MeaningsForForms(
      "entry-1",
      forms,
      existing,
      idFactory
    );

    expect(result).toBe(existing);
    expect(result.pos[0]!.senses[0]!.sense_group_id).toBe("sense-group-1");
    expect(result.pos[1]!.senses[0]!.sense_group_id).toBe("sense-group-1");
    expect(existing).toEqual(before);
    expect(idFactory).not.toHaveBeenCalled();
  });

  it("distinguish 词性把存量单条 common 语法结构拆成英美双条并保持幂等", () => {
    const existing = toWritableMeanings(meaningsCanonicalFixture);
    let nextId = 0;
    const idFactory = vi.fn(() => `split-variant-${++nextId}`);
    const forms = formsFixture({
      pos_id: "pos-1",
      dialect_rules: {
        spelling_mode: "distinguish",
        phonetic_mode: "distinguish"
      }
    });

    const result = ensureV3MeaningsForForms(
      "entry-1",
      forms,
      existing,
      idFactory
    );

    const structure = result.pos[0]!.grammar_structures[0]!;
    expect(structure.id).toBe("grammar-1");
    expect(structure.variants.map((variant) => variant.dialect)).toEqual([
      "uk",
      "us"
    ]);
    expect(structure.variants.map((variant) => variant.id)).toEqual([
      "split-variant-1",
      "split-variant-2"
    ]);
    for (const variant of structure.variants) {
      expect(variant.content).toEqual({
        version: 2,
        text: "used as a noun",
        annotations: []
      });
    }
    expect(structure.variants[0]!.content).not.toBe(
      structure.variants[1]!.content
    );

    const calls = idFactory.mock.calls.length;
    const repeated = ensureV3MeaningsForForms(
      "entry-1",
      forms,
      result,
      idFactory
    );
    expect(repeated).toBe(result);
    expect(idFactory).toHaveBeenCalledTimes(calls);
  });

  it("distinguish 词性的默认模板语法结构直接是英美双条", () => {
    let nextId = 0;
    const idFactory = vi.fn(() => `node-${++nextId}`);
    const forms = formsFixture({
      pos_id: "pos-1",
      dialect_rules: {
        spelling_mode: "distinguish",
        phonetic_mode: "distinguish"
      }
    });

    const result = ensureV3MeaningsForForms(
      "word-1",
      forms,
      { sense_groups: [], pos: [] },
      idFactory
    );

    const variants = result.pos[0]!.grammar_structures[0]!.variants;
    expect(variants.map((variant) => variant.dialect)).toEqual(["uk", "us"]);
    expect(new Set(variants.map((variant) => variant.id)).size).toBe(2);
    expect(variants.every((variant) => variant.content.text === "")).toBe(true);
  });

  it("unified 词性把 uk/us 双条语法结构合并回单条 common，英式为空则取美式", () => {
    const existing = toWritableMeanings(meaningsCanonicalFixture);
    existing.pos[0]!.grammar_structures[0]!.variants = [
      {
        id: "grammar-variant-uk",
        dialect: "uk",
        content: { version: 2, text: "a centre", annotations: [] }
      },
      {
        id: "grammar-variant-us",
        dialect: "us",
        content: { version: 2, text: "a center", annotations: [] }
      }
    ];
    let nextId = 0;
    const idFactory = vi.fn(() => `merged-variant-${++nextId}`);

    const result = ensureV3MeaningsForForms(
      "entry-1",
      formsFixture({ pos_id: "pos-1" }),
      existing,
      idFactory
    );

    expect(result.pos[0]!.grammar_structures[0]!.variants).toEqual([
      {
        id: "merged-variant-1",
        dialect: "common",
        content: { version: 2, text: "a centre", annotations: [] }
      }
    ]);

    const blankUk = toWritableMeanings(meaningsCanonicalFixture);
    blankUk.pos[0]!.grammar_structures[0]!.variants = [
      {
        id: "grammar-variant-uk",
        dialect: "uk",
        content: { version: 2, text: "  ", annotations: [] }
      },
      {
        id: "grammar-variant-us",
        dialect: "us",
        content: { version: 2, text: "a center", annotations: [] }
      }
    ];
    const fallback = ensureV3MeaningsForForms(
      "entry-1",
      formsFixture({ pos_id: "pos-1" }),
      blankUk,
      idFactory
    );
    expect(
      fallback.pos[0]!.grammar_structures[0]!.variants[0]!.content.text
    ).toBe("a center");
  });

  it("拆分复用 missingPosTemplates 里同 ID 结构的 variants，draft 与 clean 两次装配产出相同节点 ID", () => {
    const forms = formsFixture({
      pos_id: "pos-1",
      dialect_rules: {
        spelling_mode: "distinguish",
        phonetic_mode: "distinguish"
      }
    });
    const draft = ensureV3MeaningsForForms(
      "entry-1",
      forms,
      toWritableMeanings(meaningsCanonicalFixture),
      newWordNodeId
    );
    const clean = ensureV3MeaningsForForms(
      "entry-1",
      forms,
      toWritableMeanings(meaningsCanonicalFixture),
      newWordNodeId,
      draft
    );

    expect(JSON.stringify(clean)).toBe(JSON.stringify(draft));
    expect(
      clean.pos[0]!.grammar_structures[0]!.variants.map((variant) => variant.id)
    ).toEqual(
      draft.pos[0]!.grammar_structures[0]!.variants.map((variant) => variant.id)
    );
  });

  it("模板只对齐节点 ID，不把 draft 的未保存文本带进 clean 基线", () => {
    const forms = formsFixture({
      pos_id: "pos-1",
      dialect_rules: {
        spelling_mode: "distinguish",
        phonetic_mode: "distinguish"
      }
    });
    const edited = toWritableMeanings(meaningsCanonicalFixture);
    edited.pos[0]!.grammar_structures[0]!.variants[0]!.content = {
      version: 2,
      text: "edited by user",
      annotations: []
    };
    const draft = ensureV3MeaningsForForms(
      "entry-1",
      forms,
      edited,
      newWordNodeId
    );
    const clean = ensureV3MeaningsForForms(
      "entry-1",
      forms,
      toWritableMeanings(meaningsCanonicalFixture),
      newWordNodeId,
      draft
    );

    const cleanVariants = clean.pos[0]!.grammar_structures[0]!.variants;
    const draftVariants = draft.pos[0]!.grammar_structures[0]!.variants;
    expect(cleanVariants.map((variant) => variant.id)).toEqual(
      draftVariants.map((variant) => variant.id)
    );
    expect(
      cleanVariants.every(
        (variant) => variant.content.text === "used as a noun"
      )
    ).toBe(true);
    expect(
      draftVariants.every(
        (variant) => variant.content.text === "edited by user"
      )
    ).toBe(true);
    expect(JSON.stringify(clean)).not.toBe(JSON.stringify(draft));
  });

  it("与拼写模式不匹配的畸形 variants 形态原样保留，交给发布校验兜底", () => {
    const existing = toWritableMeanings(meaningsCanonicalFixture);
    existing.pos[0]!.grammar_structures[0]!.variants = [
      {
        id: "grammar-variant-1",
        dialect: "common",
        content: { version: 2, text: "a", annotations: [] }
      },
      {
        id: "grammar-variant-2",
        dialect: "common",
        content: { version: 2, text: "b", annotations: [] }
      }
    ];
    const before = structuredClone(existing);
    const idFactory = vi.fn();

    const result = ensureV3MeaningsForForms(
      "entry-1",
      formsFixture({
        pos_id: "pos-1",
        dialect_rules: {
          spelling_mode: "distinguish",
          phonetic_mode: "distinguish"
        }
      }),
      existing,
      idFactory
    );

    expect(result).toBe(existing);
    expect(existing).toEqual(before);
    expect(idFactory).not.toHaveBeenCalled();
  });

  it("prunes a removed forms POS but keeps word-level sense groups", () => {
    const existing = toWritableMeanings(meaningsCanonicalFixture);
    const secondPos = structuredClone(existing.pos[0]!);
    secondPos.pos_id = "pos-2";
    secondPos.senses[0]!.id = "sense-2";
    secondPos.senses[0]!.sense_group_id = "sense-group-2";
    existing.pos.push(secondPos);
    existing.sense_groups.push({
      id: "sense-group-2",
      name_zh: "第二词性",
      name_en: "Second"
    });
    existing.pos[0]!.senses[0]!.sentences[0]!.links.push({
      word_id: "entry-1",
      sense_id: "sense-2",
      role: "context"
    });
    existing.pos[0]!.senses[0]!.relations.push({
      id: "relation-to-removed-sense",
      relation: "synonym",
      target_word_id: "entry-1",
      target_sense_id: "sense-2",
      score: "80"
    });

    const result = ensureV3MeaningsForForms(
      "entry-1",
      formsFixture({ pos_id: "pos-1" }),
      existing,
      vi.fn()
    );

    expect(result.pos).toHaveLength(1);
    expect(result.pos[0]!.pos_id).toBe("pos-1");
    expect(result.sense_groups).toBe(existing.sense_groups);
    expect(result.sense_groups.map((group) => group.id)).toEqual([
      "sense-group-1",
      "sense-group-2"
    ]);
    expect(result.pos[0]!.senses[0]!.sentences[0]!.links).not.toContainEqual(
      expect.objectContaining({ sense_id: "sense-2" })
    );
    expect(result.pos[0]!.senses[0]!.relations).not.toContainEqual(
      expect.objectContaining({ target_sense_id: "sense-2" })
    );
  });

  it("深投影排除只读 association/target snapshots，保留全部 writable UUID 与顺序", () => {
    const writable = toWritableMeanings(meaningsCanonicalFixture);
    const snapshots = relationDisplaySnapshots(meaningsCanonicalFixture);
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
    expect(snapshots["relation-1"]).toEqual({
      headword: "middle",
      gloss: "中部"
    });
  });

  it("关联词 canonical 缺字段或混合目标时拒绝转换", () => {
    for (const malformed of [
      {},
      { target_word_id: "target-entry" },
      { target_sense_id: "target-sense" },
      {
        target_word_id: "target-entry",
        target_sense_id: "target-sense",
        pending_target_headword: "reliability"
      },
      {
        target_word_id: "target-entry",
        target_sense_id: "target-sense",
        pending_target_gloss: "可靠性"
      },
      {
        pending_target_headword: "reliability",
        target_status: "draft" as const
      }
    ]) {
      const canonical = structuredClone(meaningsCanonicalFixture);
      const relation = canonical.pos[0]!.senses[0]!.relations[0]!;
      delete relation.target_word_id;
      delete relation.target_sense_id;
      Object.assign(relation, malformed);
      expect(() => toWritableMeanings(canonical)).toThrow(
        `invalid relation target shape: ${relation.id}`
      );
    }
  });

  it("只读关系快照区分无展示值、仅词面与仅词义", () => {
    const canonical = structuredClone(meaningsCanonicalFixture);
    canonical.pos[0]!.senses[0]!.relations = [
      {
        id: "relation-without-display",
        relation: "synonym",
        target_word_id: "target-1",
        target_sense_id: "sense-1",
        score: "10"
      },
      {
        id: "relation-headword-only",
        relation: "antonym",
        target_word_id: "target-2",
        target_sense_id: "sense-2",
        target_headword: "outside",
        score: "20"
      },
      {
        id: "relation-gloss-only",
        relation: "derivative",
        target_word_id: "target-3",
        target_sense_id: "sense-3",
        target_gloss: "外部词义",
        score: "30"
      }
    ];

    expect(relationDisplaySnapshots(canonical)).toEqual({
      "relation-headword-only": { headword: "outside" },
      "relation-gloss-only": { gloss: "外部词义" }
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
        pending_target_gloss: "中心点",
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
      pending_target_gloss: "中心点",
      score: "0"
    });
    expect(projectedSense.sentences[0]!.zh_translations).toEqual([
      {
        id: projectedSense.sentences[0]!.zh_text_id,
        band: "balanced_fluency",
        language: "zh",
        content: projectedSense.sentences[0]!.zh_text
      }
    ]);
  });
});

describe("释义级成分用词在词义投影中的往返", () => {
  const usage = {
    state: "resolved" as const,
    id: "usage-1",
    literal: "give",
    target_word_id: "entry-give",
    target_publication_id: "pub-give",
    target_pos_id: "pos-give",
    target_base_form_id: "base-give",
    target_sense_id: "sense-give-1",
    target_form_id: "form-give",
    target_variant_id: "variant-give",
    target_dialect: "common" as const,
    target_form_type: "base" as const,
    target_headword: "give",
    target_gloss: "给；交给"
  };

  it("toWritableMeanings 保留服务端返回的 sense.component_usages（深拷贝）", () => {
    const canonical = structuredClone(meaningsCanonicalFixture);
    canonical.pos[0]!.senses[0]!.component_usages = [usage];
    const writable = toWritableMeanings(canonical);
    expect(writable.pos[0]!.senses[0]!.component_usages).toEqual([usage]);
    expect(writable.pos[0]!.senses[0]!.component_usages![0]).not.toBe(usage);
  });

  it("toWritableMeanings 在字段缺失时不凭空生成键（旧后端 deny_unknown_fields）", () => {
    const writable = toWritableMeanings(meaningsCanonicalFixture);
    expect("component_usages" in writable.pos[0]!.senses[0]!).toBe(false);
    const variant = writable.pos[0]!.grammar_structures[0]!.variants[0]!;
    expect("voice_profile" in variant).toBe(false);
    expect("audio_assets" in variant).toBe(false);
  });

  it("toWritableMeanings 保留语法结构变体的 voice_profile 与 audio_assets（深拷贝）", () => {
    const canonical = structuredClone(meaningsCanonicalFixture);
    const source = canonical.pos[0]!.grammar_structures[0]!.variants[0]!;
    source.voice_profile = {
      voices: [
        { voice_id: "en-GB-SoniaNeural", enabled: true, rate_percent: -10 }
      ]
    };
    source.audio_assets = [audioAsset("asset-1", "en-GB")];
    const writable = toWritableMeanings(canonical);
    const variant = writable.pos[0]!.grammar_structures[0]!.variants[0]!;
    expect(variant.voice_profile).toEqual(source.voice_profile);
    expect(variant.audio_assets).toEqual(source.audio_assets);
    expect(variant.voice_profile).not.toBe(source.voice_profile);
    expect(variant.audio_assets![0]).not.toBe(source.audio_assets[0]);
  });

  it("拼写模式切换重建变体时音频引用不丢：拆分按归属语种分侧，合并两侧拼接", () => {
    const existing = toWritableMeanings(meaningsCanonicalFixture);
    const common = existing.pos[0]!.grammar_structures[0]!.variants[0]!;
    common.voice_profile = {
      voices: [
        { voice_id: "en-GB-SoniaNeural", enabled: true, rate_percent: 0 }
      ]
    };
    common.audio_assets = [
      audioAsset("asset-uk", "en-GB"),
      audioAsset("asset-us", "en-US")
    ];
    let nextId = 0;
    const idFactory = () => `variant-${++nextId}`;

    const split = ensureV3MeaningsForForms(
      "entry-1",
      formsFixture({
        pos_id: "pos-1",
        dialect_rules: {
          spelling_mode: "distinguish",
          phonetic_mode: "distinguish"
        }
      }),
      existing,
      idFactory
    ).pos[0]!.grammar_structures[0]!.variants;
    expect(split.map((variant) => variant.dialect)).toEqual(["uk", "us"]);
    expect(split.map((variant) => variant.audio_assets)).toEqual([
      [audioAsset("asset-uk", "en-GB")],
      [audioAsset("asset-us", "en-US")]
    ]);
    expect(split.every((variant) => variant.voice_profile)).toBe(true);

    const merged = ensureV3MeaningsForForms(
      "entry-1",
      formsFixture({ pos_id: "pos-1" }),
      {
        ...existing,
        pos: [
          {
            ...existing.pos[0]!,
            grammar_structures: [{ id: "grammar-1", variants: split }]
          }
        ]
      },
      idFactory
    ).pos[0]!.grammar_structures[0]!.variants;
    expect(merged).toHaveLength(1);
    expect(merged[0]!.audio_assets!.map((asset) => asset.id)).toEqual([
      "asset-uk",
      "asset-us"
    ]);
    expect(merged[0]!.voice_profile).toEqual(common.voice_profile);
  });

  it("stripSenseComponentUsages 整键剥除，其余内容与引用不变", () => {
    const canonical = structuredClone(meaningsCanonicalFixture);
    canonical.pos[0]!.senses[0]!.component_usages = [usage];
    const writable = toWritableMeanings(canonical);
    const stripped = stripSenseComponentUsages(writable);
    expect("component_usages" in stripped.pos[0]!.senses[0]!).toBe(false);
    expect(stripped.pos[0]!.senses[0]!.definitions).toBe(
      writable.pos[0]!.senses[0]!.definitions
    );
    // 无字段时原样返回同一引用
    const plain = toWritableMeanings(meaningsCanonicalFixture);
    expect(stripSenseComponentUsages(plain)).toBe(plain);
  });

  it("stripBlankRelations 只丢全空行，填了任一字段的都留下", () => {
    const writable = toWritableMeanings(meaningsCanonicalFixture);
    writable.pos[0]!.senses[0]!.relations = [
      // 点了「添加派生词」就走的行：库里存不下，发出去会让整次保存 422
      { id: "blank", relation: "derivative", score: "0.00" },
      // 词面只有空白，等同于没填
      {
        id: "whitespace",
        relation: "derivative",
        score: "0.00",
        pending_target_headword: "   "
      },
      {
        id: "bound",
        relation: "synonym",
        score: "80.00",
        target_word_id: "word-1",
        target_sense_id: "sense-1"
      },
      {
        id: "text",
        relation: "antonym",
        score: "10.00",
        pending_target_headword: "job-huntird"
      },
      // 只填了词义：留给后端报「文本注释必须跟随关联词文本」，别在这吞掉输入
      {
        id: "gloss-only",
        relation: "derivative",
        score: "0.00",
        pending_target_gloss: "只填了词义"
      }
    ];
    expect(
      stripBlankRelations(writable).pos[0]!.senses[0]!.relations.map(
        (relation) => relation.id
      )
    ).toEqual(["bound", "text", "gloss-only"]);

    // 没有空行时原样返回同一引用
    const plain = toWritableMeanings(meaningsCanonicalFixture);
    expect(stripBlankRelations(plain)).toBe(plain);
  });
});

it("正文关联和语音克隆后独立保存；去除只读快照，旧后端不接收新字段", () => {
  const input = structuredClone(meaningsCanonicalFixture);
  const sentence = input.pos[0]!.senses[0]!.sentences[0]!;
  if (sentence.en_text.mode !== "unified") throw new Error("fixture");
  sentence.en_text.common.voice_profile = {
    voices: [{ voice_id: "en-GB-SoniaNeural", enabled: true, rate_percent: 25 }]
  };
  sentence.en_text.common.text_links = [
    {
      id: "link",
      source_segments: [{ start: 9, end: 15, surface: "center" }],
      target_word_id: "w",
      target_publication_id: "p",
      target_pos_id: "pos",
      target_base_form_id: "b",
      target_form_id: "f",
      target_variant_id: "v",
      target_sense_id: "s",
      target_headword: "center",
      target_gloss: "中心"
    }
  ];
  input.pos[0]!.senses[0]!.definitions.push({
    id: "d",
    level: "B1",
    definition_mode: "en_sentence",
    content: {
      mode: "distinguish",
      source_dialect: "uk",
      uk: {
        state: "ready",
        variant: { ...structuredClone(sentence.en_text.common), id: "uk" }
      },
      us: { state: "missing" }
    }
  });
  const cloned = toWritableMeanings(input);
  expect(cloned.pos[0]!.senses[0]!.sentences[0]!.en_text).toEqual(
    sentence.en_text
  );
  const saved = prepareTextLinksForSave(cloned, true);
  const en = saved.pos[0]!.senses[0]!.sentences[0]!.en_text;
  if (en.mode !== "unified") throw new Error("fixture");
  expect(en.common.voice_profile).toEqual(
    sentence.en_text.common.voice_profile
  );
  expect(en.common.text_links![0]).not.toHaveProperty("target_gloss");
  const definition = saved.pos[0]!.senses[0]!.definitions[1]!;
  expect(JSON.stringify(definition)).not.toContain("target_headword");
  expect(sentence.en_text.common.text_links[0]!.target_gloss).toBe("中心");
  expect(() => prepareTextLinksForSave(cloned, false)).toThrow(
    "当前后端不支持"
  );
  const empty = structuredClone(meaningsCanonicalFixture);
  const emptyText = empty.pos[0]!.senses[0]!.sentences[0]!.en_text;
  if (emptyText.mode !== "unified") throw new Error("fixture");
  emptyText.common.text_links = [];
  expect(
    JSON.stringify(prepareTextLinksForSave(toWritableMeanings(empty), false))
  ).not.toContain("text_links");
});

describe("例句译文的默认录入位与收尾清洗", () => {
  const withTranslations = (texts: readonly string[], aliasIndex: number) => {
    const writable = toWritableMeanings(meaningsCanonicalFixture);
    const sentence = writable.pos[0]!.senses[0]!.sentences[0]!;
    const rows = texts.map((text, index) => ({
      id: `translation-${index + 1}`,
      band: newSentenceTranslations(() => "x")[index]!.band,
      content: { version: 2 as const, text, annotations: [] }
    }));
    sentence.zh_translations = rows;
    sentence.zh_text_id = rows[aliasIndex]!.id;
    sentence.zh_text = rows[aliasIndex]!.content;
    return writable;
  };

  it("新建例句摆出初、中、高、高四个录入位且各自独立", () => {
    let seq = 0;
    const rows = newSentenceTranslations(() => `translation-${++seq}`);

    expect(rows.map((row) => row.band)).toEqual([
      "word_for_word",
      "balanced_fluency",
      "adapted_creation",
      "adapted_creation"
    ]);
    expect(rows.every((row) => row.content.text === "")).toBe(true);
    expect(new Set(rows.map((row) => row.id)).size).toBe(4);
  });

  it("收尾提交丢掉没填的行，主译文改指向留下来的那条", () => {
    const content = withTranslations(["", "", "深层重构译文", ""], 1);

    const cleaned = dropEmptySentenceTranslations(content);

    const sentence = cleaned.pos[0]!.senses[0]!.sentences[0]!;
    expect(sentence.zh_translations!.map((row) => row.content.text)).toEqual([
      "深层重构译文"
    ]);
    expect(sentence.zh_text_id).toBe("translation-3");
    expect(sentence.zh_text.text).toBe("深层重构译文");
  });

  it("主译文自己有内容时保持原来的指向", () => {
    const content = withTranslations(["逐字直译", "语句通顺", "", ""], 1);

    const sentence =
      dropEmptySentenceTranslations(content).pos[0]!.senses[0]!.sentences[0]!;

    expect(sentence.zh_translations).toHaveLength(2);
    expect(sentence.zh_text_id).toBe("translation-2");
    expect(sentence.zh_text.text).toBe("语句通顺");
  });

  it("一条都没填时留下第一行，交给后端报缺译文", () => {
    const content = withTranslations(["", "", "", ""], 1);

    const sentence =
      dropEmptySentenceTranslations(content).pos[0]!.senses[0]!.sentences[0]!;

    expect(sentence.zh_translations).toHaveLength(1);
    expect(sentence.zh_translations![0]!.band).toBe("word_for_word");
    expect(sentence.zh_text_id).toBe("translation-1");
  });
});

describe("译文语言", () => {
  const sentence = (
    translations?: { id: string; band: string; language?: string }[]
  ) => ({
    level: "A1",
    zh_text_id: "zh-alias",
    zh_text: { version: 2 as const, text: "旧译文", annotations: [] },
    ...(translations
      ? {
          zh_translations: translations.map((row) => ({
            ...row,
            band: row.band as "word_for_word",
            language: row.language as "zh" | undefined,
            content: { version: 2 as const, text: "旧译文", annotations: [] }
          }))
        }
      : {})
  });

  it("新建的四个录入位都带汉语", () => {
    let seq = 0;
    const rows = newSentenceTranslations(() => `t-${++seq}`);
    expect(rows.map((row) => row.language)).toEqual(["zh", "zh", "zh", "zh"]);
  });

  it("历史译文缺 language 时补成汉语", () => {
    // 后端 publication_from_record 原样返回历史快照，2026-09-12 之前发布的没有这个键。
    const rows = sentenceTranslationsV3(
      sentence([{ id: "t-1", band: "word_for_word" }])
    );
    expect(rows.map((row) => row.language)).toEqual(["zh"]);
  });

  it("译文为空时兜底出来的那条也带汉语", () => {
    const rows = sentenceTranslationsV3(sentence());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.language).toBe("zh");
    expect(rows[0]!.id).toBe("zh-alias");
  });

  it("已有 language 原样保留，不被默认值覆盖", () => {
    const rows = sentenceTranslationsV3(
      sentence([{ id: "t-1", band: "word_for_word", language: "zh" }])
    );
    expect(rows[0]!.language).toBe("zh");
  });
});
