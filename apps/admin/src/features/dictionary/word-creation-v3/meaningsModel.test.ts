import type {
  DraftFormsStepContentV3,
  DraftMeaningsStepContentV3,
  EnglishTextV3
} from "@tsz/types";
import { describe, expect, it, vi } from "vitest";
import { newWordNodeId } from "../word-model/primitives";
import { formsFixture } from "./fixtures";
import {
  editableEnglishText,
  ensureV3MeaningsForForms,
  relationDisplaySnapshots,
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
      expect(sense.sentences).toEqual([
        {
          id: expect.any(String),
          level: "A1",
          en_text: {
            mode: "unified",
            common: {
              id: expect.any(String),
              origin: "manual",
              value: { version: 2, text: "", annotations: [] }
            }
          },
          zh_text_id: expect.any(String),
          zh_text: { version: 2, text: "", annotations: [] },
          zh_translations: [
            {
              id: expect.any(String),
              band: "a1_a2",
              content: { version: 2, text: "", annotations: [] }
            }
          ],
          links: [{ word_id: "word-1", sense_id: sense.id, role: "focus" }]
        }
      ]);
      expect(sense.sentences[0]!.zh_translations[0]!.id).toBe(
        sense.sentences[0]!.zh_text_id
      );
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
    expect(result.pos[1]!.senses[0]!.sentences[0]!.links).toEqual([
      {
        word_id: "entry-1",
        sense_id: result.pos[1]!.senses[0]!.id,
        role: "focus"
      }
    ]);
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

  it("预绑定保留隐藏稳定目标 ID，并只把服务端状态留在展示快照", () => {
    const canonical = structuredClone(meaningsCanonicalFixture);
    const relation = canonical.pos[0]!.senses[0]!.relations[0]!;
    delete relation.target_word_id;
    delete relation.target_sense_id;
    Object.assign(relation, {
      prebound_target_word_id: "draft-target-entry",
      pending_target_gloss: "可靠性",
      prebinding_state: "target_sense_deleted",
      target_status: "archived"
    });

    const writable = toWritableMeanings(canonical);
    expect(writable.pos[0]!.senses[0]!.relations[0]).toEqual({
      id: "relation-1",
      relation: "synonym",
      prebound_target_word_id: "draft-target-entry",
      pending_target_gloss: "可靠性",
      score: "0.8"
    });
    expect(relationDisplaySnapshots(canonical)["relation-1"]).toEqual({
      headword: "middle",
      gloss: "中部",
      prebinding_state: "target_sense_deleted",
      target_status: "archived"
    });
  });

  it("关联词 canonical 缺字段或混合目标时 fail closed，不静默选一支", () => {
    for (const malformed of [
      { prebound_target_word_id: "draft-target-entry" },
      {
        target_word_id: "target-entry",
        target_sense_id: "target-sense",
        prebound_target_word_id: "draft-target-entry",
        pending_target_headword: "reliability",
        prebinding_state: "waiting_first_sense" as const
      },
      { prebinding_state: "target_sense_deleted" as const },
      // 预绑定不得携带待建词面（旧宽形态，已收窄）。
      {
        prebound_target_word_id: "draft-target-entry",
        pending_target_headword: "reliability",
        prebinding_state: "waiting_first_sense" as const
      }
    ]) {
      const canonical = structuredClone(meaningsCanonicalFixture);
      const relation = canonical.pos[0]!.senses[0]!.relations[0]!;
      for (const field of [
        "target_word_id",
        "target_sense_id",
        "pending_target_headword",
        "pending_target_gloss",
        "prebound_target_word_id",
        "prebinding_state",
        "target_status"
      ] as const) {
        delete relation[field];
      }
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
        band: "a1_a2",
        content: projectedSense.sentences[0]!.zh_text
      }
    ]);
  });
});
