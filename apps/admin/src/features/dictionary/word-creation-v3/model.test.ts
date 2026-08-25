import type {
  DraftFormsStepContentV3,
  V3DraftValidationIssue,
  WordConcreteFormV3
} from "@tsz/types";
import { describe, expect, it, vi } from "vitest";
import {
  MAX_FORM_TEXT_CODEPOINTS,
  MAX_FORMS_NODES,
  countFormsNodes,
  issuesForPronunciation,
  toFormsWire,
  validateFormsContent
} from "./model";
import {
  UUIDS,
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  ukUsFormFixture,
  uuidFromInt
} from "./fixtures";

function codes(content: unknown, intent: "save" | "complete" = "save") {
  return validateFormsContent(content, intent).map((issue) => issue.code);
}

function commonVariant(form: WordConcreteFormV3) {
  if (form.regional_variants.mode !== "common") {
    throw new Error("expected common fixture");
  }
  return form.regional_variants.common;
}

describe("V3 forms model", () => {
  it("U01/U02 common 与完整 uk_us 无损保留 form/variant/pronunciation 身份", () => {
    const common = commonFormFixture();
    const regional = ukUsFormFixture();
    const content = formsFixture({ forms: [common, regional] });

    expect(validateFormsContent(content, "complete")).toEqual([]);
    expect(toFormsWire(content)).toEqual(content);
    expect(toFormsWire(content).pos[0]!.forms.map((form) => form.id)).toEqual([
      common.id,
      regional.id
    ]);
    expect(regional.regional_variants).toMatchObject({
      mode: "uk_us",
      uk: { id: UUIDS.uk_variant },
      us: { id: UUIDS.us_variant }
    });
  });

  it.each([
    {
      name: "common 混入 uk",
      regional_variants: {
        mode: "common",
        common: commonFormFixture().regional_variants.common,
        uk: ukUsFormFixture().regional_variants.uk
      }
    },
    {
      name: "uk_us 缺少 us",
      regional_variants: {
        mode: "uk_us",
        uk: ukUsFormFixture().regional_variants.uk
      }
    },
    {
      name: "common variant dialect 错误",
      regional_variants: {
        mode: "common",
        common: {
          ...commonFormFixture().regional_variants.common,
          dialect: "us"
        }
      }
    }
  ])("U03 $name 在 draft 也精确拒绝", ({ regional_variants }) => {
    const malformed = {
      ...commonFormFixture(),
      regional_variants
    } as unknown as WordConcreteFormV3;
    const issues = validateFormsContent(
      formsFixture({ forms: [malformed] }),
      "save"
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: "invalid_regional_variant_shape",
        node_id: malformed.id,
        field: "regional_variants",
        node_location: expect.objectContaining({ form_id: malformed.id })
      })
    ]);
  });

  it("U04 同组多个 base 与 comparative 合法且不去重", () => {
    const forms = [
      commonFormFixture({ id: uuidFromInt(101), form_type: "base" }),
      commonFormFixture({ id: uuidFromInt(102), form_type: "base" }),
      commonFormFixture({ id: uuidFromInt(103), form_type: "comparative" }),
      commonFormFixture({ id: uuidFromInt(104), form_type: "comparative" })
    ];
    const content = formsFixture({ forms, pos: "adjective" });
    const allowedFormTypes = vi.fn((pos: string) =>
      pos === "adjective" ? (["comparative", "superlative"] as const) : []
    );

    expect(
      validateFormsContent(content, "complete", { allowedFormTypes })
    ).toEqual([]);
    expect(allowedFormTypes).toHaveBeenCalledWith("adjective");
    expect(
      toFormsWire(content).pos[0]!.forms.map((form) => form.form_type)
    ).toEqual(["base", "base", "comparative", "comparative"]);
  });

  it("即时 form_type 校验只消费注入的权威 catalog lookup", () => {
    const comparative = commonFormFixture({ form_type: "comparative" });
    const content = formsFixture({ forms: [comparative], pos: "noun" });
    const allowedFormTypes = vi.fn(() => ["plural"] as const);

    expect(
      validateFormsContent(content, "save", { allowedFormTypes })
    ).toContainEqual(
      expect.objectContaining({
        code: "invalid_form_type_for_part_of_speech",
        field: "form_type",
        node_id: comparative.id
      })
    );
    expect(allowedFormTypes).toHaveBeenCalledWith("noun");
    expect(validateFormsContent(content, "save")).toEqual([]);
  });

  it.each([
    {
      name: "POS primitive",
      input: { pos: [null] },
      code: "forbidden_v3_field"
    },
    {
      name: "forms 不是数组",
      input: {
        pos: [{ ...formsFixture().pos[0]!, forms: null }]
      },
      code: "forbidden_v3_field"
    },
    {
      name: "form primitive",
      input: {
        pos: [{ ...formsFixture().pos[0]!, forms: [null] }]
      },
      code: "forbidden_v3_field"
    },
    {
      name: "spelling primitive",
      input: {
        pos: [
          {
            ...formsFixture().pos[0]!,
            forms: [
              {
                ...commonFormFixture(),
                regional_variants: {
                  mode: "common",
                  common: {
                    ...commonFormFixture().regional_variants.common,
                    spelling: null
                  }
                }
              }
            ]
          }
        ]
      },
      code: "invalid_regional_variant_shape"
    },
    {
      name: "pronunciations 不是数组",
      input: {
        pos: [
          {
            ...formsFixture().pos[0]!,
            forms: [
              {
                ...commonFormFixture(),
                regional_variants: {
                  mode: "common",
                  common: {
                    ...commonFormFixture().regional_variants.common,
                    pronunciations: null
                  }
                }
              }
            ]
          }
        ]
      },
      code: "invalid_regional_variant_shape"
    },
    {
      name: "pronunciation primitive field",
      input: {
        pos: [
          {
            ...formsFixture().pos[0]!,
            forms: [
              {
                ...commonFormFixture(),
                regional_variants: {
                  mode: "common",
                  common: {
                    ...commonFormFixture().regional_variants.common,
                    pronunciations: [
                      {
                        ...pronunciationFixture(),
                        actual_pron: null
                      }
                    ]
                  }
                }
              }
            ]
          }
        ]
      },
      code: "invalid_regional_variant_shape"
    },
    {
      name: "members 不是数组",
      input: {
        pos: [
          {
            ...formsFixture().pos[0]!,
            form_groups: [
              { ...formsFixture().pos[0]!.form_groups[0]!, members: null }
            ]
          }
        ]
      },
      code: "forbidden_v3_field"
    },
    {
      name: "membership primitive",
      input: {
        pos: [
          {
            ...formsFixture().pos[0]!,
            form_groups: [
              { ...formsFixture().pos[0]!.form_groups[0]!, members: [null] }
            ]
          }
        ]
      },
      code: "forbidden_v3_field"
    }
  ])(
    "runtime guard 对 $name fail closed 而不抛 TypeError",
    ({ input, code }) => {
      expect(() => validateFormsContent(input, "save")).not.toThrow();
      expect(codes(input, "save")).toContain(code);
    }
  );

  it("U06/U06a 同 POS 跨组共享合法，跨 POS 与同组重复引用精确拒绝", () => {
    const shared = commonFormFixture();
    const valid = formsFixture({
      forms: [shared],
      groups: [
        {
          id: UUIDS.group,
          is_regular: true,
          members: [{ id: UUIDS.membership, form_id: shared.id }]
        },
        {
          id: UUIDS.group_2,
          is_regular: false,
          members: [{ id: UUIDS.membership_2, form_id: shared.id }]
        }
      ]
    });
    expect(validateFormsContent(valid, "complete")).toEqual([]);

    const duplicate = structuredClone(valid);
    duplicate.pos[0]!.form_groups[0]!.members.push({
      id: UUIDS.membership_3,
      form_id: shared.id
    });
    expect(validateFormsContent(duplicate, "save")).toContainEqual(
      expect.objectContaining({
        code: "form_group_membership_invalid",
        node_id: UUIDS.membership_3,
        field: "form_id"
      })
    );

    const secondPosForm = commonFormFixture({ id: UUIDS.form_2 });
    const crossPos = formsFixture({ forms: [shared] });
    crossPos.pos.push({
      pos_id: UUIDS.pos_2,
      pos: "verb",
      forms: [secondPosForm],
      form_groups: [
        {
          id: UUIDS.group_2,
          is_regular: true,
          members: [
            { id: UUIDS.membership_2, form_id: secondPosForm.id },
            { id: UUIDS.membership_3, form_id: shared.id }
          ]
        }
      ]
    });
    expect(validateFormsContent(crossPos, "save")).toContainEqual(
      expect.objectContaining({
        code: "form_group_membership_invalid",
        node_id: UUIDS.membership_3,
        node_location: expect.objectContaining({
          pos_id: UUIDS.pos_2,
          form_group_id: UUIDS.group_2,
          form_id: shared.id
        })
      })
    );
  });

  it("U06b orphan form 在 draft 也拒绝；U06c 零/空组仅 complete 阻断", () => {
    const orphan = formsFixture({ groups: [] });
    expect(codes(orphan, "save")).toContain("orphan_form");

    const zeroGroups: DraftFormsStepContentV3 = {
      pos: [{ pos_id: UUIDS.pos, pos: "noun", forms: [], form_groups: [] }]
    };
    expect(validateFormsContent(zeroGroups, "save")).toEqual([]);
    expect(codes(zeroGroups, "complete")).toContain("form_group_required");

    const emptyGroup: DraftFormsStepContentV3 = {
      pos: [
        {
          pos_id: UUIDS.pos,
          pos: "noun",
          forms: [],
          form_groups: [{ id: UUIDS.group, is_regular: false, members: [] }]
        }
      ]
    };
    expect(validateFormsContent(emptyGroup, "save")).toEqual([]);
    expect(codes(emptyGroup, "complete")).toContain("empty_form_group");
  });

  it("U07 draft 允许未完成 variant/pronunciation，complete 精确阻断", () => {
    const incomplete = commonFormFixture({
      spelling: "",
      pronunciations: [
        pronunciationFixture({
          dict_phonetic: "",
          actual_pron: "",
          style: undefined
        })
      ]
    });
    const content = formsFixture({ forms: [incomplete] });

    expect(validateFormsContent(content, "save")).toEqual([]);
    expect(validateFormsContent(content, "complete")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "variant_spelling_required",
          field: "spelling"
        }),
        expect.objectContaining({
          code: "pronunciation_required",
          field: "dict_phonetic"
        })
      ])
    );
  });

  it("U07b 前端不复制发音规范化，仅按 pronunciation_id 消费服务端 issue", () => {
    const form = commonFormFixture({
      pronunciations: [
        pronunciationFixture({ id: UUIDS.pronunciation }),
        pronunciationFixture({
          id: UUIDS.pronunciation_2,
          dict_phonetic: " SAME ",
          actual_pron: "SAME"
        })
      ]
    });
    const content = formsFixture({ forms: [form] });
    expect(codes(content, "complete")).not.toContain("duplicate_pronunciation");

    const serverIssue: V3DraftValidationIssue = {
      schema_version: 3,
      step: "forms",
      node_id: UUIDS.pronunciation_2,
      field: "pronunciations",
      code: "duplicate_pronunciation",
      message: "server normalized duplicate",
      node_location: {
        node_role: "forms.pronunciation",
        ancestor_node_ids: [UUIDS.pos, UUIDS.form, UUIDS.common_variant],
        pos_id: UUIDS.pos,
        form_id: UUIDS.form,
        variant_id: UUIDS.common_variant,
        pronunciation_id: UUIDS.pronunciation_2,
        dialect: "common"
      }
    };
    expect(
      issuesForPronunciation([serverIssue], UUIDS.pronunciation_2)
    ).toEqual([serverIssue]);
  });

  it("U08 wire 显式投影保持数组顺序且剔除 sort_order/临时音频/只读字段", () => {
    const unsafe = formsFixture() as DraftFormsStepContentV3 &
      Record<string, unknown>;
    Object.assign(unsafe, {
      sort_order: 1,
      presentation: { label: "readonly" }
    });
    const pos = unsafe.pos[0]! as (typeof unsafe.pos)[number] &
      Record<string, unknown>;
    pos.sort_order = 2;
    const form = pos.forms[0]! as (typeof pos.forms)[number] &
      Record<string, unknown>;
    form.sort_order = 3;
    const common = commonVariant(form) as ReturnType<typeof commonVariant> &
      Record<string, unknown>;
    common.audio_url = "https://temporary.invalid/audio";
    common.pronunciations[0] = {
      ...common.pronunciations[0]!,
      audio_url: "https://temporary.invalid/pronunciation",
      sort_order: 4
    } as never;

    const wire = toFormsWire(unsafe);
    expect(wire).toEqual(formsFixture());
    expect(JSON.stringify(wire)).not.toMatch(
      /sort_order|audio_url|presentation/
    );
  });

  it("U09 2000 节点和 200 codepoint 可保存，越界返回稳定 issue", () => {
    const pronunciations = Array.from({ length: 1995 }, (_, index) =>
      pronunciationFixture({ id: uuidFromInt(index + 1000) })
    );
    const boundary = formsFixture({
      forms: [
        commonFormFixture({
          spelling: "词".repeat(MAX_FORM_TEXT_CODEPOINTS),
          pronunciations
        })
      ]
    });
    expect(countFormsNodes(boundary)).toBe(MAX_FORMS_NODES);
    expect(codes(boundary, "save")).not.toContain("content_limit_exceeded");

    const oversized = structuredClone(boundary);
    commonVariant(oversized.pos[0]!.forms[0]!).pronunciations.push(
      pronunciationFixture({ id: uuidFromInt(9999) })
    );
    expect(countFormsNodes(oversized)).toBe(MAX_FORMS_NODES + 1);
    expect(codes(oversized, "save")).toContain("content_limit_exceeded");

    const longText = formsFixture({
      forms: [
        commonFormFixture({
          spelling: "词".repeat(MAX_FORM_TEXT_CODEPOINTS + 1),
          pronunciations: [
            pronunciationFixture({
              actual_pron: "a".repeat(MAX_FORM_TEXT_CODEPOINTS + 1)
            })
          ]
        })
      ]
    });
    expect(validateFormsContent(longText, "save")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "content_limit_exceeded",
          field: "spelling"
        }),
        expect.objectContaining({
          code: "content_limit_exceeded",
          field: "actual_pron"
        })
      ])
    );
  });
});
