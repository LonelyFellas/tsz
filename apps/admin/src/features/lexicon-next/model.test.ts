import { describe, expect, it } from "vitest";
import type { NextDraft, NextLanguageCapability } from "@tsz/types";
import { previewDraft, draftProblem, initialTargetLocale } from "./model";
describe("本地草稿预览", () => {
  it("预览按所选语言寻找通用内容，不拿通用英语补齐其他语言", () => {
    const draft: NextDraft = {
      schema_version: 1,
      headword: "centre",
      forms: [{ id: "english", locale: "en", text: "center" }],
      senses: [
        { id: "sense", part_of_speech: null, definitions: [], equivalents: [] }
      ]
    };
    expect(previewDraft(draft, "fr-CA", "zh-Hans").missing_forms).toBe(true);
    draft.forms.push({ id: "french", locale: "fr", text: "centre" });
    expect(previewDraft(draft, "fr-CA", "zh-Hans").forms).toEqual([
      draft.forms[1]
    ]);
  });

  it("初始方言先取已有词形，再取释义，空稿使用当前语言能力提供的顺序", () => {
    const language: NextLanguageCapability = {
      target_language: "en",
      target_locales: ["en-GB", "en-US"],
      medium_locales: ["zh-Hans"],
      common_target_locale: "en",
      part_of_speech_codes: []
    };
    const draft: NextDraft = {
      schema_version: 1,
      headword: "center",
      forms: [{ id: "us", locale: "en-US", text: "center" }],
      senses: [
        {
          id: "sense",
          part_of_speech: null,
          definitions: [
            { id: "uk", locale: "en-GB", text: "middle", style: "definition" }
          ],
          equivalents: []
        }
      ]
    };
    expect(initialTargetLocale(draft, language)).toBe("en-US");
    expect(initialTargetLocale({ ...draft, forms: [] }, language)).toBe(
      "en-GB"
    );
    expect(
      initialTargetLocale(
        { ...draft, forms: [], senses: [] },
        {
          ...language,
          target_locales: ["en-US", "en-GB"]
        }
      )
    ).toBe("en-US");
  });

  it("只回退显式通用英语，绝不跨英美或简繁补齐，不改变原稿", () => {
    const draft: NextDraft = {
      schema_version: 1,
      headword: "centre",
      forms: [
        { id: "common", locale: "en", text: "shared" },
        { id: "us", locale: "en-US", text: "center" }
      ],
      senses: [
        {
          id: "sense",
          part_of_speech: null,
          definitions: [
            { id: "def", locale: "en-US", text: "middle", style: "definition" }
          ],
          equivalents: [{ id: "eq", locale: "zh-Hans", text: "中心" }]
        }
      ]
    };
    const original = structuredClone(draft);
    const gb = previewDraft(draft, "en-GB", "zh-Hant");
    expect(gb.forms).toEqual([draft.forms[0]]);
    expect(gb.senses[0]?.missing_target_definitions).toBe(true);
    expect(gb.senses[0]?.missing_equivalents).toBe(true);
    const us = previewDraft(draft, "en-US", "zh-Hans");
    expect(us.forms).toEqual([draft.forms[1]]);
    expect(us.senses[0]?.equivalents).toEqual(draft.senses[0]?.equivalents);
    expect(draft).toEqual(original);
  });
  it("Unicode 码点限长与空行校验覆盖隐藏语言", () => {
    const draft: NextDraft = {
      schema_version: 1,
      headword: "𠮷".repeat(200),
      forms: [{ id: "hidden", locale: "en-US", text: " " }],
      senses: []
    };
    expect(draftProblem(draft)).toContain("美式英语词形");
    draft.forms = [];
    expect(draftProblem(draft)).toBeNull();
    draft.headword += "a";
    expect(draftProblem(draft)).toContain("词头");
  });
  it("释义允许换行，其余字段保持单行且所有字段拒绝其他控制字符", () => {
    const draft: NextDraft = {
      schema_version: 1,
      headword: "centre",
      forms: [{ id: "form", locale: "en-US", text: "center" }],
      senses: [
        {
          id: "sense",
          part_of_speech: null,
          definitions: [
            {
              id: "definition",
              locale: "zh-Hant",
              text: "首行\r\n次行\n末行",
              style: "definition"
            }
          ],
          equivalents: [{ id: "equivalent", locale: "zh-Hant", text: "中心" }]
        }
      ]
    };
    expect(draftProblem(draft)).toBeNull();
    for (const control of ["\0", "\t", "\u007f", "\u0085"]) {
      const invalid = structuredClone(draft);
      invalid.senses[0]!.definitions[0]!.text = `首行${control}次行`;
      expect(draftProblem(invalid)).toContain("繁体中文释义");
    }
    for (const field of ["headword", "form", "equivalent"]) {
      const invalid = structuredClone(draft);
      if (field === "headword") invalid.headword = "cen\ntre";
      else if (field === "form") invalid.forms[0]!.text = "cen\nter";
      else invalid.senses[0]!.equivalents[0]!.text = "中\r\n心";
      expect(draftProblem(invalid)).not.toBeNull();
    }
  });
});

it("语义区间允许未填名称，限制 Unicode 名称长度，预览保留顺序与归属且不改草稿", () => {
  const draft: NextDraft = {
    schema_version: 1,
    headword: "centre",
    forms: [],
    sense_groups: [{ id: "group", name_zh: "", name_en: "" }],
    senses: [
      {
        id: "sense",
        sense_group_id: "group",
        part_of_speech: null,
        definitions: [],
        equivalents: []
      }
    ]
  };
  expect(draftProblem(draft)).toBeNull();
  const before = structuredClone(draft);
  const view = previewDraft(draft, "en-US", "zh-Hant");
  expect(view.sense_groups).toEqual(draft.sense_groups);
  expect(view.senses[0]!.sense_group_id).toBe("group");
  expect(draft).toEqual(before);
  draft.sense_groups![0]!.name_zh = "𠮷".repeat(200);
  expect(draftProblem(draft)).toBeNull();
  draft.sense_groups![0]!.name_zh += "字";
  expect(draftProblem(draft)).toContain("语义区间名称");
});

it("新语法预览只投影当前方言与有效引用，草稿中的失效引用和另一侧保留", () => {
  const draft: NextDraft = {
    schema_version: 1,
    headword: "job",
    forms: [],
    grammar_structures: [
      {
        id: "g",
        part_of_speech: "noun",
        sub_pos: "N-COUNT",
        variants: [
          {
            id: "gb",
            locale: "en-GB",
            content: { version: 2, text: "a job", annotations: [] }
          },
          {
            id: "us",
            locale: "en-US",
            content: { version: 2, text: "a role", annotations: [] }
          }
        ]
      }
    ],
    senses: [
      {
        id: "s",
        part_of_speech: "noun",
        sub_pos: "N-COUNT",
        definitions: [
          {
            id: "d",
            locale: "en-US",
            text: "role",
            style: "definition",
            grammar_structure_id: "g"
          }
        ],
        equivalents: []
      }
    ]
  };
  const good = previewDraft(draft, "en-US", "zh-Hans");
  expect(
    good.grammar_structures![0]!.variants.map((v) => v.content.text)
  ).toEqual(["a role"]);
  expect(good.senses[0]!.target_definitions[0]!.grammar_structure_id).toBe("g");
  draft.senses[0]!.sub_pos = "N-UNCOUNT";
  const before = structuredClone(draft);
  const invalid = previewDraft(draft, "en-US", "zh-Hans");
  expect(invalid.grammar_issues).toHaveLength(1);
  expect(
    invalid.senses[0]!.target_definitions[0]!.grammar_structure_id
  ).toBeUndefined();
  expect(draft).toEqual(before);
});
