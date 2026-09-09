import type {
  DraftMeaningsStepContentWritableV3,
  V3DraftValidationIssue,
  WordSentenceWritableV3
} from "@tsz/types";
import { partOfSpeechCatalogFixture } from "../word-creation/partOfSpeech.test.helper";
import { describe, expect, it } from "vitest";
import {
  commonFormFixture,
  formsFixture,
  ukUsFormFixture,
  UUIDS,
  uuidFromInt
} from "./fixtures";
import { buildV3ProductProgress, buildV3Readiness } from "./readiness";

function issue(
  node_id: string,
  field: string,
  location: V3DraftValidationIssue["node_location"]
): V3DraftValidationIssue {
  return {
    schema_version: 3,
    step: "forms",
    node_id,
    field,
    code: "node_binding_unknown",
    message: `${field} is invalid`,
    node_location: location
  };
}

function sentence(id: string): WordSentenceWritableV3 {
  return {
    id,
    level: "A1",
    en_text: {
      mode: "unified",
      common: {
        id: uuidFromInt(Number.parseInt(id.slice(-4), 16) + 10_000),
        value: { version: 2, text: "A centre.", annotations: [] },
        origin: "manual"
      }
    },
    zh_text_id: uuidFromInt(Number.parseInt(id.slice(-4), 16) + 20_000),
    zh_text: { version: 2, text: "一个中心。", annotations: [] },
    zh_translations: [
      {
        id: uuidFromInt(Number.parseInt(id.slice(-4), 16) + 20_000),
        band: "a1_a2",
        content: { version: 2, text: "一个中心。", annotations: [] }
      }
    ],
    links: []
  };
}

function meaningsFixture(): DraftMeaningsStepContentWritableV3 {
  return {
    sense_groups: [
      { id: uuidFromInt(500), name_zh: "位置", name_en: "position" }
    ],
    pos: [
      {
        pos_id: UUIDS.pos,
        grammar_structures: [
          { id: uuidFromInt(501), variants: [] },
          { id: uuidFromInt(502), variants: [] }
        ],
        senses: [
          {
            id: uuidFromInt(503),
            sub_pos: "countable",
            level: "A1",
            depends_on_context: false,
            definitions: [],
            sentences: [sentence(uuidFromInt(504)), sentence(uuidFromInt(505))],
            relations: []
          },
          {
            id: uuidFromInt(506),
            sub_pos: "uncountable",
            level: "B1",
            depends_on_context: false,
            definitions: [],
            sentences: [],
            relations: []
          }
        ]
      },
      {
        pos_id: UUIDS.pos_2,
        grammar_structures: [{ id: uuidFromInt(507), variants: [] }],
        senses: [
          {
            id: uuidFromInt(508),
            sub_pos: "transitive",
            level: "A2",
            depends_on_context: false,
            definitions: [],
            sentences: [sentence(uuidFromInt(509))],
            relations: []
          }
        ]
      }
    ]
  };
}

describe("buildV3Readiness", () => {
  it("returns an empty summary when both issues and optional content are absent", () => {
    expect(buildV3Readiness([], undefined)).toEqual({
      issue_count: 0,
      positions: []
    });
  });

  it("deduplicates blockers and keeps one canonical form node with all group contexts", () => {
    const pronunciation = issue("pron-2", "actual_pron", {
      node_role: "pronunciation",
      ancestor_node_ids: ["pos-2", "group-1", "form-1", "variant-1"],
      pos_id: "pos-2",
      form_group_id: "group-1",
      form_id: "form-1",
      variant_id: "variant-1",
      pronunciation_id: "pron-2"
    });
    const sameFormOtherGroup = issue("form-1", "spelling", {
      node_role: "common_variant",
      ancestor_node_ids: ["pos-2", "group-2", "form-1"],
      pos_id: "pos-2",
      form_group_id: "group-2",
      form_id: "form-1",
      variant_id: "variant-1"
    });
    const posIssue = issue("pos-1", "pos", {
      node_role: "pos",
      ancestor_node_ids: [],
      pos_id: "pos-1"
    });

    const content = formsFixture({
      pos_id: "pos-2",
      forms: [
        {
          id: "form-1",
          form_type: "base",
          regional_variants: {
            mode: "common",
            common: {
              id: "variant-1",
              dialect: "common",
              spelling: "centre",
              origin: "dictionary",
              pronunciations: []
            }
          }
        }
      ],
      groups: [
        {
          id: "group-1",
          is_regular: true,
          members: [{ id: UUIDS.membership, form_id: "form-1" }]
        },
        {
          id: "group-2",
          is_regular: false,
          members: [{ id: UUIDS.membership_2, form_id: "form-1" }]
        }
      ]
    });
    const result = buildV3Readiness(
      [pronunciation, pronunciation, sameFormOtherGroup, posIssue],
      content
    );

    expect(result.issue_count).toBe(3);
    expect(result.first_target?.node_id).toBe("pron-2");
    expect(result.positions.map((pos) => pos.node_id)).toEqual([
      "pos-2",
      "pos-1"
    ]);
    const forms = result.positions[0]!.children.filter(
      (node) => node.role === "concrete_form"
    );
    expect(forms).toHaveLength(1);
    expect(forms[0]).toMatchObject({
      node_id: "form-1",
      issue_count: 2,
      context_group_ids: ["group-1", "group-2"]
    });
    expect(forms[0]!.children[0]!.children[0]).toMatchObject({
      role: "pronunciation",
      node_id: "pron-2"
    });
  });

  it("falls back to the issue node and keeps missing form context optional", () => {
    const formIssue = issue("orphan-form", "spelling", {
      node_role: "concrete_form",
      ancestor_node_ids: [],
      form_id: "orphan-form"
    });

    const result = buildV3Readiness([formIssue]);

    expect(result.positions).toEqual([
      expect.objectContaining({
        role: "pos",
        node_id: "orphan-form",
        context_group_ids: [],
        children: [
          expect.objectContaining({
            role: "concrete_form",
            node_id: "orphan-form",
            context_group_ids: [],
            children: []
          })
        ]
      })
    ]);
  });

  it("does not duplicate one group context for repeated memberships", () => {
    const content = formsFixture({
      pos_id: "pos-2",
      forms: [
        {
          id: "form-1",
          form_type: "base",
          regional_variants: {
            mode: "common",
            common: {
              id: "variant-1",
              dialect: "common",
              spelling: "centre",
              origin: "dictionary",
              pronunciations: []
            }
          }
        }
      ],
      groups: [
        {
          id: "group-1",
          is_regular: true,
          members: [
            { id: UUIDS.membership, form_id: "form-1" },
            { id: UUIDS.membership_2, form_id: "form-1" }
          ]
        }
      ]
    });

    const result = buildV3Readiness(
      [
        issue("form-1", "spelling", {
          node_role: "concrete_form",
          ancestor_node_ids: ["pos-2", "form-1"],
          pos_id: "pos-2",
          form_id: "form-1"
        })
      ],
      content
    );

    expect(result.positions[0]!.children[0]!.context_group_ids).toEqual([
      "group-1"
    ]);
  });
});

describe("buildV3ProductProgress", () => {
  it("截图规则：原形计入，跨词性同拼写同音标合并，不同音标分别计数", () => {
    const noun = commonFormFixture({ spelling: "job" });
    const plural = commonFormFixture({
      id: uuidFromInt(980),
      form_type: "plural",
      spelling: "jobs"
    });
    const verb = commonFormFixture({ id: uuidFromInt(981), spelling: "job" });
    const input = {
      language: "en",
      wordId: "test",
      completedSteps: [] as const,
      forms: {
        pos: [
          ...formsFixture({ forms: [noun, plural] }).pos,
          ...formsFixture({
            pos_id: uuidFromInt(982),
            pos: "verb",
            forms: [verb]
          }).pos
        ]
      },
      meanings: { sense_groups: [], pos: [] }
    };
    expect(buildV3ProductProgress(input)[2]).toMatchObject({
      count: 2,
      details: [{ count: 2 }, { count: 1 }]
    });
    verb.regional_variants.common.pronunciations = [
      {
        ...verb.regional_variants.common.pronunciations[0]!,
        dict_phonetic: "different"
      }
    ];
    expect(buildV3ProductProgress(input)[2]).toMatchObject({ count: 3 });
  });

  it("英美各侧和多条音标全部匹配才合并，音标顺序不影响判断", () => {
    const first = ukUsFormFixture({ id: uuidFromInt(950) });
    const second = structuredClone(first);
    second.id = uuidFromInt(951);
    const input = {
      language: "en",
      wordId: "test",
      completedSteps: [] as const,
      forms: formsFixture({ forms: [first, second] }),
      meanings: { sense_groups: [], pos: [] }
    };
    first.regional_variants.uk.pronunciations.push({
      ...first.regional_variants.uk.pronunciations[0]!,
      id: uuidFromInt(952),
      dict_phonetic: "another"
    });
    second.regional_variants.uk.pronunciations = [
      ...first.regional_variants.uk.pronunciations
    ].reverse();
    expect(buildV3ProductProgress(input)[2]!.count).toBe(1);
    second.regional_variants.us.spelling = "different";
    expect(buildV3ProductProgress(input)[2]!.count).toBe(2);
    second.regional_variants.us.spelling = first.regional_variants.us.spelling;
    second.regional_variants.us.pronunciations[0]!.dict_phonetic = "different";
    expect(buildV3ProductProgress(input)[2]!.count).toBe(2);
  });

  it("同一变化类型的全部行完整才计为完成，重复行和共享组不重复计数", () => {
    const first = commonFormFixture({ form_type: "plural" });
    const second = commonFormFixture({
      id: uuidFromInt(990),
      form_type: "plural",
      pronunciations: [
        {
          id: uuidFromInt(991),
          dict_phonetic: "",
          actual_pron: "",
          style: "normal"
        }
      ]
    });
    const input = {
      language: "en",
      wordId: "test",
      completedSteps: [] as const,
      forms: formsFixture({ forms: [first, second] }),
      meanings: { sense_groups: [], pos: [] }
    };
    expect(buildV3ProductProgress(input)[2]).toMatchObject({
      count: 2,
      completed: false,
      details: [{ count: 2 }]
    });
    second.regional_variants.common.pronunciations =
      first.regional_variants.common.pronunciations;
    expect(buildV3ProductProgress(input)[2]).toMatchObject({
      count: 1,
      completed: true
    });
    second.regional_variants.common.spelling = " ";
    expect(buildV3ProductProgress(input)[2]).toMatchObject({
      count: 2,
      completed: false
    });
  });

  it("默认空白类型只计入总数，手动移除后总数减少", () => {
    const forms = formsFixture();
    const input = {
      language: "en",
      wordId: "word-1",
      completedSteps: ["forms"] as const,
      forms,
      meanings: { sense_groups: [], pos: [] },
      partOfSpeechCatalog: partOfSpeechCatalogFixture.items
    };
    expect(buildV3ProductProgress(input)[2]).toMatchObject({
      count: 2,
      completed: false,
      details: [{ count: 2 }]
    });
    const removed = {
      ...input,
      removedFormTypes: { [forms.pos[0]!.form_groups[0]!.id]: ["plural"] }
    };
    expect(buildV3ProductProgress(removed)[2]).toMatchObject({
      count: 1,
      details: [{ count: 1 }]
    });
  });

  it("returns the fixed seven product rows for an empty native draft", () => {
    const rows = buildV3ProductProgress({
      language: "en",
      wordId: "word-1",
      completedSteps: ["basics"],
      forms: { pos: [] },
      meanings: { sense_groups: [], pos: [] }
    });

    expect(rows.map(({ key, label }) => [key, label])).toEqual([
      ["dialect", "语言识别"],
      ["parts_of_speech", "基本词性"],
      ["forms", "词形变化"],
      ["sense_groups", "语义区间"],
      ["grammar_structures", "语法结构"],
      ["senses", "多维词义"],
      ["sentences", "多维例句"]
    ]);
    expect(rows.map((row) => row.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(rows.slice(1).map((row) => row.count)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(rows[0]).toMatchObject({ completed: true, value: "完成" });
  });

  it("各词性包含原形明细，总数跨词性合并相同词形", () => {
    const base = commonFormFixture();
    const plural = commonFormFixture({
      id: UUIDS.form_2,
      form_type: "plural",
      spelling: "centres"
    });
    const comparative = commonFormFixture({
      id: uuidFromInt(601),
      form_type: "comparative",
      spelling: "more central"
    });
    const first = formsFixture({
      forms: [base, plural],
      groups: [
        {
          id: UUIDS.group,
          is_regular: true,
          members: [
            { id: UUIDS.membership, form_id: base.id },
            { id: UUIDS.membership_2, form_id: plural.id }
          ]
        },
        {
          id: UUIDS.group_2,
          is_regular: false,
          members: [{ id: UUIDS.membership_3, form_id: plural.id }]
        }
      ]
    });
    const second = formsFixture({
      pos_id: UUIDS.pos_2,
      pos: "adjective",
      forms: [commonFormFixture({ id: uuidFromInt(602) }), comparative]
    }).pos[0]!;
    const rows = buildV3ProductProgress({
      language: "en",
      wordId: "word-1",
      completedSteps: ["basics", "forms"],
      forms: { pos: [...first.pos, second] },
      meanings: { sense_groups: [], pos: [] }
    });

    expect(rows[1]).toMatchObject({ count: 2, completed: true });
    expect(rows[2]).toMatchObject({ count: 3, completed: true });
    expect(rows[1]!.details.map((item) => item.label)).toEqual([
      "名词",
      "形容词"
    ]);
    expect(rows[2]!.details.map((item) => item.count)).toEqual([2, 2]);
  });

  it("counts sense groups, grammar, sense, and nested sentence nodes across POS", () => {
    const rows = buildV3ProductProgress({
      language: "en",
      wordId: "word-1",
      completedSteps: ["basics", "forms"],
      forms: formsFixture(),
      meanings: meaningsFixture()
    });

    expect(rows.slice(3).map((row) => row.count)).toEqual([1, 3, 3, 3]);
  });

  it("keeps ungrouped regional derived forms countable", () => {
    const derived = ukUsFormFixture({
      id: uuidFromInt(701),
      form_type: "plural"
    });
    const meanings = meaningsFixture();
    meanings.pos[0]!.senses[0]!.definitions = [
      {
        id: uuidFromInt(702),
        level: "A1",
        definition_mode: "en_definition",
        content: {
          mode: "unified",
          common: {
            id: uuidFromInt(703),
            origin: "manual",
            value: { version: 2, text: "centre", annotations: [] }
          }
        }
      }
    ];
    meanings.pos[0]!.senses[0]!.sentences[0]!.en_text = {
      mode: "distinguish",
      source_dialect: "uk",
      uk: {
        state: "ready",
        variant: {
          id: uuidFromInt(704),
          origin: "manual",
          value: { version: 2, text: "A centre.", annotations: [] }
        }
      },
      us: {
        state: "ready",
        variant: {
          id: uuidFromInt(705),
          origin: "manual",
          value: { version: 2, text: "A center.", annotations: [] }
        }
      }
    };
    const rows = buildV3ProductProgress({
      language: "en",
      wordId: "word-1",
      completedSteps: ["basics"],
      forms: formsFixture({
        forms: [commonFormFixture(), derived],
        groups: []
      }),
      meanings
    });

    expect(rows[2]).toMatchObject({ count: 2 });
  });
});

describe("实时摘要明细", () => {
  it("分组真实文本和数量，英美变体与多档译文不重复计数", () => {
    const forms = {
      pos: [
        ...formsFixture().pos,
        ...formsFixture({ pos_id: UUIDS.pos_2, pos: "verb" }).pos
      ]
    };
    const meanings = meaningsFixture();
    meanings.sense_groups.push({
      id: "empty-group",
      name_zh: " ",
      name_en: " "
    });
    meanings.pos[0]!.grammar_structures[0]!.variants = [
      {
        id: "uk",
        dialect: "uk",
        content: { version: 2, text: "a centre", annotations: [] }
      },
      {
        id: "us",
        dialect: "us",
        content: { version: 2, text: "a center", annotations: [] }
      }
    ];
    const sense = meanings.pos[0]!.senses[0]!;
    sense.definitions = [
      {
        id: "definition",
        level: "A1",
        definition_mode: "zh_definition",
        content_id: "zh-definition",
        content: { version: 2, text: "  真实释义  ", annotations: [] }
      }
    ];
    sense.sentences[0]!.level = "C2";
    sense.sentences[1]!.level = "";
    sense.sentences[0]!.zh_translations.push({
      id: "advanced",
      band: "c1_c2",
      content: { version: 2, text: "另一译文", annotations: [] }
    });
    const before = structuredClone({ forms, meanings });
    const rows = buildV3ProductProgress({
      wordId: "word",
      language: "en",
      completedSteps: ["basics", "forms", "meanings"],
      forms,
      meanings
    });
    expect(rows[3]!.details.map((item) => item.label)).toEqual([
      "1. 位置",
      "2. 待填写语义区间"
    ]);
    expect(rows[4]!.count).toBe(3);
    expect(rows[4]!.details.map((item) => [item.label, item.count])).toEqual([
      ["名词", 2],
      ["动词", 1]
    ]);
    expect(rows[5]!.details[0]!.items?.map((item) => item.label)).toEqual([
      "1. 真实释义",
      "2. 待填写释义"
    ]);
    expect(rows[6]!.count).toBe(3);
    expect(rows[6]!.details.map((item) => [item.label, item.count])).toEqual([
      ["A1", 1],
      ["C2", 1],
      ["未分级", 1]
    ]);
    expect(
      rows[6]!.details.reduce((sum, item) => sum + (item.count ?? 0), 0)
    ).toBe(rows[6]!.count);
    expect({ forms, meanings }).toEqual(before);
    meanings.sense_groups.reverse();
    sense.definitions[0]!.content = {
      version: 2,
      text: "修改后的释义",
      annotations: []
    };
    const updated = buildV3ProductProgress({
      wordId: "word",
      language: "en",
      completedSteps: ["basics", "forms", "meanings"],
      forms,
      meanings,
      dirtySteps: { forms: false, meanings: true }
    });
    expect(updated[3]!.details.map((item) => item.label)).toEqual([
      "1. 待填写语义区间",
      "2. 位置"
    ]);
    expect(updated[5]!.details[0]!.items?.[0]!.label).toBe("1. 修改后的释义");
    expect(updated.slice(3).every((row) => !row.completed)).toBe(true);
    expect(updated[3]!.statusDescription).toBe("编辑中，完成状态待确认");
    expect(updated[1]!.completed).toBe(true);
  });

  it("通用显示子行，实时类型与目录名称来自输入，未知语言不完成", () => {
    const forms = formsFixture();
    const input = {
      wordId: "word",
      language: "en",
      completedSteps: ["basics", "forms"] as const,
      forms,
      meanings: { sense_groups: [], pos: [] },
      issues: []
    };
    expect(buildV3ProductProgress(input)[0]!.details).toEqual([
      { key: "language", label: "英语 English" },
      { key: "common", label: "通用", dialect: "common" }
    ]);
    forms.pos[0]!.dialect_rules.phonetic_mode = "distinguish";
    const rows = buildV3ProductProgress({
      ...input,
      dirtySteps: { forms: true, meanings: false },
      partOfSpeechCatalog: [
        {
          id: "catalog",
          code: "noun",
          name_zh: "配置名词",
          name_en: "Noun",
          abbreviation: "n.",
          short_name_zh: "配置名词",
          full_name_en: "noun",
          sort_order: 1,
          sub_parts_extensible: true,
          sub_parts: []
        }
      ]
    });
    expect(rows[0]!.details.map((item) => item.label)).toEqual([
      "英语 English",
      "BrE",
      "AmE"
    ]);
    expect(rows[1]!.details[0]!.label).toBe("配置名词");
    expect(rows[1]!.completed).toBe(false);
    expect(
      buildV3ProductProgress({ ...input, language: "xx" })[0]
    ).toMatchObject({ completed: false, value: "未完成" });
    const orphan = buildV3ProductProgress({
      ...input,
      forms: { pos: [] },
      meanings: meaningsFixture(),
      completedSteps: ["basics", "meanings"]
    });
    expect(orphan[5]!.details.map((item) => item.label)).toEqual([
      "未识别词性",
      "未识别词性"
    ]);
    expect(orphan[5]!.count).toBe(3);
    expect(orphan[5]!.completed).toBe(false);
  });
});
