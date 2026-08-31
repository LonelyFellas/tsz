import type { WordConcreteFormV3 } from "@tsz/types";
import { describe, expect, it, vi } from "vitest";
import {
  addConcreteForm,
  addConcreteFormAfterMembership,
  addFormGroup,
  addMembership,
  addPartOfSpeech,
  convertCommonToUkUs,
  convertUkUsToCommon,
  createStableVariantIdFactory,
  deleteConcreteForm,
  deleteFormGroup,
  deleteGroupAndOrphanForms,
  deletePartOfSpeech,
  normalizePosDialectRules,
  removeMembership,
  reorderFormGroups,
  reorderForms,
  reorderMemberships,
  reorderPronunciations,
  unifyUkUsSpelling,
  updateConcreteFormType,
  updatePosDialectRules,
  updatePronunciation,
  updateVariantSpelling
} from "./operations";
import {
  UUIDS,
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  ukUsFormFixture,
  uuidFromInt,
  uuidSequence
} from "./fixtures";
import { partOfSpeechCatalogFixture } from "../word-creation/partOfSpeech.test.helper";

function commonVariant(form: WordConcreteFormV3) {
  if (form.regional_variants.mode !== "common") {
    throw new Error("expected common fixture");
  }
  return form.regional_variants.common;
}

describe("V3 forms operations", () => {
  it("U05 内容编辑保留 form/variant/pronunciation UUID", () => {
    const original = formsFixture();
    const spelling = updateVariantSpelling(
      original,
      UUIDS.common_variant,
      "centres"
    );
    const pronunciation = updatePronunciation(spelling, UUIDS.pronunciation, {
      actual_pron: "changed"
    });

    const form = pronunciation.pos[0]!.forms[0]!;
    const updatedVariant = commonVariant(form);
    expect(form.id).toBe(UUIDS.form);
    expect(updatedVariant.id).toBe(UUIDS.common_variant);
    expect(updatedVariant.spelling).toBe("centres");
    expect(updatedVariant.pronunciations[0]).toMatchObject({
      id: UUIDS.pronunciation,
      actual_pron: "changed"
    });
    expect(commonVariant(original.pos[0]!.forms[0]!).spelling).toBe("centre");
  });

  it("#110 就地修改 concrete form 类型且不改任何 V3 节点身份或引用", () => {
    const original = formsFixture();
    const updated = updateConcreteFormType(original, UUIDS.form, "plural");

    expect(updated.pos[0]!.forms[0]).toEqual({
      ...original.pos[0]!.forms[0],
      form_type: "plural"
    });
    expect(updated.pos[0]!.form_groups).toEqual(original.pos[0]!.form_groups);
    expect(original.pos[0]!.forms[0]!.form_type).toBe("base");
    expect(() =>
      updateConcreteFormType(original, "missing-form", "plural")
    ).toThrow("form not found: missing-form");
  });

  it("模式转换必须显式确认和完整 mapping；保留 form.id 并生成全新节点 UUID", () => {
    const common = commonFormFixture();
    const idSource = uuidSequence(
      UUIDS.uk_variant,
      UUIDS.pronunciation_2,
      UUIDS.us_variant,
      UUIDS.pronunciation_3
    );
    const ids = vi.fn(() => idSource());
    const rejected = convertCommonToUkUs(
      common,
      {
        confirmed: false,
        uk: {
          spelling: "centre",
          origin: "manual",
          pronunciations: []
        },
        us: {
          spelling: "center",
          origin: "manual",
          pronunciations: []
        }
      },
      ids
    );
    expect(rejected).toEqual({
      ok: false,
      reason: "explicit_mapping_required"
    });
    expect(ids).not.toHaveBeenCalled();
    expect(() =>
      convertCommonToUkUs(
        common,
        {
          confirmed: true,
          uk: { spelling: "centre", origin: "manual", pronunciations: [] },
          us: { spelling: "center", origin: "manual", pronunciations: [] }
        },
        uuidSequence(UUIDS.common_variant)
      )
    ).toThrow("UUID factory returned a duplicate UUID");

    const converted = convertCommonToUkUs(
      common,
      {
        confirmed: true,
        uk: {
          spelling: "centre",
          origin: "manual",
          pronunciations: [
            { dict_phonetic: "UK", actual_pron: "uk", style: "normal" }
          ]
        },
        us: {
          spelling: "center",
          origin: "dictionary",
          pronunciations: [
            { dict_phonetic: "US", actual_pron: "us", style: "strong" }
          ]
        }
      },
      ids
    );
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    expect(converted.value.id).toBe(common.id);
    expect(converted.value.regional_variants).toEqual({
      mode: "uk_us",
      uk: {
        id: UUIDS.uk_variant,
        dialect: "uk",
        spelling: "centre",
        origin: "manual",
        component_usages: [],
        pronunciations: [
          {
            id: UUIDS.pronunciation_2,
            dict_phonetic: "UK",
            actual_pron: "uk",
            style: "normal"
          }
        ]
      },
      us: {
        id: UUIDS.us_variant,
        dialect: "us",
        spelling: "center",
        origin: "dictionary",
        component_usages: [],
        pronunciations: [
          {
            id: UUIDS.pronunciation_3,
            dict_phonetic: "US",
            actual_pron: "us",
            style: "strong"
          }
        ]
      }
    });

    const back = convertUkUsToCommon(
      converted.value,
      {
        confirmed: true,
        common: {
          spelling: "centre / center",
          origin: "manual",
          pronunciations: []
        }
      },
      uuidSequence(UUIDS.common_variant_2)
    );
    expect(back).toMatchObject({
      ok: true,
      value: {
        id: common.id,
        regional_variants: {
          mode: "common",
          common: { id: UUIDS.common_variant_2, dialect: "common" }
        }
      }
    });
  });

  it("common 成分拆分后生成独立 ID，已有 UK/US 成分时拒绝静默合并", () => {
    const common = commonFormFixture();
    common.regional_variants.common.component_usages = [
      { state: "unresolved", id: uuidFromInt(710), literal: "centre" }
    ];
    const converted = convertCommonToUkUs(
      common,
      {
        confirmed: true,
        uk: {
          spelling: "centre",
          origin: "manual",
          pronunciations: []
        },
        us: {
          spelling: "center",
          origin: "manual",
          pronunciations: []
        }
      },
      uuidSequence(
        uuidFromInt(711),
        uuidFromInt(712),
        uuidFromInt(713),
        uuidFromInt(714)
      )
    );
    expect(converted.ok).toBe(true);
    if (!converted.ok || converted.value.regional_variants.mode !== "uk_us")
      return;
    const { uk, us } = converted.value.regional_variants;
    expect(uk.component_usages?.[0]?.id).not.toBe(us.component_usages?.[0]?.id);
    expect(
      convertUkUsToCommon(
        converted.value,
        {
          confirmed: true,
          common: {
            spelling: "center",
            origin: "manual",
            pronunciations: []
          }
        },
        () => uuidFromInt(715)
      )
    ).toEqual({ ok: false, reason: "component_merge_required" });
  });

  it("词性级规则只接受 UU、UD、DD，并保留全部节点", () => {
    const original = formsFixture();
    const updated = updatePosDialectRules(original, UUIDS.pos, {
      spelling_mode: "unified",
      phonetic_mode: "distinguish"
    });
    expect(updated).toMatchObject({
      ok: true,
      value: {
        pos: [
          {
            pos_id: UUIDS.pos,
            dialect_rules: {
              spelling_mode: "unified",
              phonetic_mode: "distinguish"
            }
          }
        ]
      }
    });
    if (!updated.ok) return;
    expect(updated.value.pos[0]!.forms).toEqual(original.pos[0]!.forms);
    expect(updated.value.pos[0]!.form_groups).toEqual(
      original.pos[0]!.form_groups
    );
    expect(
      updatePosDialectRules(original, UUIDS.pos, {
        spelling_mode: "distinguish",
        phonetic_mode: "unified"
      })
    ).toEqual({ ok: false, reason: "invalid_dialect_rules" });
  });

  it("DD 收敛为 UD 只统一拼写，不重建地区或发音节点", () => {
    const form = ukUsFormFixture({
      uk: { spelling: "centre" },
      us: { spelling: "center" }
    });
    const unified = unifyUkUsSpelling(form, "center");

    expect(unified).toMatchObject({
      ok: true,
      value: {
        id: form.id,
        regional_variants: {
          mode: "uk_us",
          uk: { id: form.regional_variants.uk.id, spelling: "center" },
          us: { id: form.regional_variants.us.id, spelling: "center" }
        }
      }
    });
    if (!unified.ok || unified.value.regional_variants.mode !== "uk_us") return;
    expect(unified.value.regional_variants.uk.pronunciations).toEqual(
      form.regional_variants.uk.pronunciations
    );
    expect(unified.value.regional_variants.us.pronunciations).toEqual(
      form.regional_variants.us.pronunciations
    );
  });

  it("V2 parity：规则切换自动转换且不要求逐词形 mapping", () => {
    const common = commonFormFixture({ spelling: "center" });
    const content = formsFixture({ forms: [common] });
    expect(
      normalizePosDialectRules(content, UUIDS.pos, {
        spelling_mode: "distinguish",
        phonetic_mode: "unified"
      })
    ).toEqual({ ok: false, reason: "invalid_dialect_rules" });
    expect(
      normalizePosDialectRules(content, UUIDS.pos_2, {
        spelling_mode: "unified",
        phonetic_mode: "unified"
      })
    ).toEqual({ ok: false, reason: "pos_not_found" });
    const split = normalizePosDialectRules(
      content,
      UUIDS.pos,
      { spelling_mode: "distinguish", phonetic_mode: "distinguish" },
      "us",
      uuidSequence(
        UUIDS.uk_variant,
        UUIDS.pronunciation_2,
        UUIDS.us_variant,
        UUIDS.pronunciation_3
      )
    );
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    const splitForm = split.value.pos[0]!.forms[0]!;
    expect(split.value.pos[0]!.dialect_rules).toEqual({
      spelling_mode: "distinguish",
      phonetic_mode: "distinguish"
    });
    expect(splitForm).toMatchObject({
      id: common.id,
      regional_variants: {
        mode: "uk_us",
        uk: { spelling: "center" },
        us: { spelling: "center" }
      }
    });

    const unified = normalizePosDialectRules(
      split.value,
      UUIDS.pos,
      { spelling_mode: "unified", phonetic_mode: "unified" },
      "us",
      uuidSequence(UUIDS.common_variant_2, uuidFromInt(991))
    );
    expect(unified).toMatchObject({
      ok: true,
      value: {
        pos: [
          {
            dialect_rules: {
              spelling_mode: "unified",
              phonetic_mode: "unified"
            },
            forms: [
              {
                id: common.id,
                regional_variants: {
                  mode: "common",
                  common: {
                    id: UUIDS.common_variant_2,
                    spelling: "center"
                  }
                }
              }
            ]
          }
        ]
      }
    });

    const regional = ukUsFormFixture({
      uk: { spelling: "centre" },
      us: { spelling: "center" }
    });
    const generated = vi.fn(() => uuidFromInt(999));
    const ud = normalizePosDialectRules(
      formsFixture({ forms: [regional] }),
      UUIDS.pos,
      { spelling_mode: "unified", phonetic_mode: "distinguish" },
      "us",
      generated
    );
    expect(ud).toMatchObject({
      ok: true,
      value: {
        pos: [
          {
            forms: [
              {
                id: regional.id,
                regional_variants: {
                  mode: "uk_us",
                  uk: {
                    id: regional.regional_variants.uk.id,
                    spelling: "center"
                  },
                  us: {
                    id: regional.regional_variants.us.id,
                    spelling: "center"
                  }
                }
              }
            ]
          }
        ]
      }
    });
    expect(generated).not.toHaveBeenCalled();
  });

  it("模式往返复用 GET 返回的退役稳定 variant ID", () => {
    const regional = ukUsFormFixture();
    const content = formsFixture({ forms: [regional] });
    const retiredCommonId = uuidFromInt(990);
    const stableIds = createStableVariantIdFactory(
      content,
      [
        {
          id: retiredCommonId,
          node_role: "common_variant",
          parent_node_id: regional.id,
          retired_at: "2026-08-27T00:00:00Z"
        }
      ],
      () => uuidFromInt(999)
    );
    const unified = normalizePosDialectRules(
      content,
      UUIDS.pos,
      { spelling_mode: "unified", phonetic_mode: "unified" },
      "us",
      uuidSequence(uuidFromInt(991)),
      stableIds
    );
    expect(unified.ok).toBe(true);
    if (!unified.ok) return;
    const common = unified.value.pos[0]!.forms[0]!;
    expect(common).toMatchObject({
      id: regional.id,
      regional_variants: {
        mode: "common",
        common: { id: retiredCommonId }
      }
    });

    const splitAgain = normalizePosDialectRules(
      unified.value,
      UUIDS.pos,
      { spelling_mode: "distinguish", phonetic_mode: "distinguish" },
      "us",
      uuidSequence(uuidFromInt(992), uuidFromInt(993)),
      stableIds
    );
    expect(splitAgain).toMatchObject({
      ok: true,
      value: {
        pos: [
          {
            forms: [
              {
                id: regional.id,
                regional_variants: {
                  mode: "uk_us",
                  uk: { id: regional.regional_variants.uk.id },
                  us: { id: regional.regional_variants.us.id }
                }
              }
            ]
          }
        ]
      }
    });
  });

  it("身份账本忽略非稳定记录并缓存新槽位 ID", () => {
    const content = formsFixture();
    const fallbackId = uuidFromInt(995);
    const fallback = vi.fn(() => fallbackId);
    const stableIds = createStableVariantIdFactory(
      content,
      [
        {
          id: uuidFromInt(996),
          node_role: "pronunciation",
          parent_node_id: UUIDS.common_variant,
          retired_at: "2026-08-27T00:00:00Z"
        },
        {
          id: uuidFromInt(997),
          node_role: "uk_variant",
          retired_at: "2026-08-27T00:00:01Z"
        },
        {
          id: uuidFromInt(998),
          node_role: "common_variant",
          parent_node_id: UUIDS.form,
          retired_at: "2026-08-27T00:00:02Z"
        }
      ],
      fallback
    );

    expect(stableIds(UUIDS.form, "common_variant")).toBe(UUIDS.common_variant);
    const newFormId = uuidFromInt(999);
    expect(stableIds(newFormId, "uk_variant")).toBe(fallbackId);
    expect(stableIds(newFormId, "uk_variant")).toBe(fallbackId);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("模式转换拒绝非法或与当前节点重复的稳定 variant ID", () => {
    const content = formsFixture();
    const invalidFactory = Object.assign(() => "invalid", {
      seed: () => undefined
    });
    expect(() =>
      normalizePosDialectRules(
        content,
        UUIDS.pos,
        { spelling_mode: "distinguish", phonetic_mode: "distinguish" },
        "us",
        () => uuidFromInt(994),
        invalidFactory
      )
    ).toThrow("stable variant ID factory returned an invalid UUID");

    const duplicateFactory = Object.assign(() => UUIDS.common_variant, {
      seed: () => undefined
    });
    expect(() =>
      normalizePosDialectRules(
        content,
        UUIDS.pos,
        { spelling_mode: "distinguish", phonetic_mode: "distinguish" },
        "us",
        () => uuidFromInt(994),
        duplicateFactory
      )
    ).toThrow("stable variant ID factory returned a duplicate UUID");
  });

  it("U06 同 POS 跨组新增 membership 合法；同组重复与跨 POS 受控拒绝", () => {
    const shared = commonFormFixture();
    const second = commonFormFixture({ id: UUIDS.form_2 });
    const content = formsFixture({
      forms: [shared],
      groups: [
        {
          id: UUIDS.group,
          is_regular: true,
          members: [{ id: UUIDS.membership, form_id: shared.id }]
        },
        { id: UUIDS.group_2, is_regular: false, members: [] }
      ]
    });
    content.pos.push({
      pos_id: UUIDS.pos_2,
      pos: "verb",
      dialect_rules: {
        spelling_mode: "unified",
        phonetic_mode: "unified"
      },
      forms: [second],
      form_groups: [
        {
          id: UUIDS.group_3,
          is_regular: true,
          members: [{ id: UUIDS.membership_3, form_id: second.id }]
        }
      ]
    });

    const added = addMembership(
      content,
      UUIDS.pos,
      UUIDS.group_2,
      shared.id,
      uuidSequence(UUIDS.membership_2)
    );
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value.pos[0]!.form_groups[1]!.members).toEqual([
      { id: UUIDS.membership_2, form_id: shared.id }
    ]);
    expect(
      addMembership(
        content,
        UUIDS.pos,
        UUIDS.group,
        shared.id,
        uuidSequence(UUIDS.membership_2)
      )
    ).toEqual({ ok: false, reason: "duplicate_group_membership" });
    expect(
      addMembership(
        content,
        UUIDS.pos_2,
        UUIDS.group_3,
        shared.id,
        uuidSequence(UUIDS.membership_2)
      )
    ).toEqual({ ok: false, reason: "cross_pos_membership" });
  });

  it("U06b 普通移除最后 membership 拒绝；最后 form 不可删除，多个 form 时可原子删除", () => {
    const shared = commonFormFixture();
    const content = formsFixture({
      forms: [shared],
      groups: [
        {
          id: UUIDS.group,
          is_regular: true,
          members: [{ id: UUIDS.membership, form_id: shared.id }]
        },
        {
          id: UUIDS.group_2,
          is_regular: true,
          members: [{ id: UUIDS.membership_2, form_id: shared.id }]
        }
      ]
    });

    const once = removeMembership(content, UUIDS.membership);
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    expect(removeMembership(once.value, UUIDS.membership_2)).toEqual({
      ok: false,
      reason: "last_membership_requires_form_deletion",
      form_id: shared.id
    });

    expect(deleteConcreteForm(content, UUIDS.pos, shared.id)).toEqual({
      ok: false,
      reason: "last_form_required"
    });

    const keeper = commonFormFixture({ id: UUIDS.form_2 });
    const multiple = formsFixture({
      forms: [shared, keeper],
      groups: [
        {
          id: UUIDS.group,
          is_regular: true,
          members: [
            { id: UUIDS.membership, form_id: shared.id },
            { id: UUIDS.membership_3, form_id: keeper.id }
          ]
        },
        {
          id: UUIDS.group_2,
          is_regular: true,
          members: [{ id: UUIDS.membership_2, form_id: shared.id }]
        }
      ]
    });
    const deleted = deleteConcreteForm(multiple, UUIDS.pos, shared.id);
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.value.pos[0]!.forms).toEqual([keeper]);
    expect(
      deleted.value.pos[0]!.form_groups.flatMap((group) => group.members)
    ).toEqual([{ id: UUIDS.membership_3, form_id: keeper.id }]);
    expect(JSON.stringify(deleted.value)).not.toContain(shared.id);
    expect(JSON.stringify(deleted.value)).not.toContain(
      shared.regional_variants.common.id
    );
    expect(JSON.stringify(deleted.value)).not.toContain(
      shared.regional_variants.common.pronunciations[0]!.id
    );
  });

  it("U08 重排只改变 wire 数组顺序", () => {
    const first = commonFormFixture();
    const second = commonFormFixture({
      id: UUIDS.form_2,
      pronunciations: [
        pronunciationFixture({ id: UUIDS.pronunciation_2 }),
        pronunciationFixture({ id: UUIDS.pronunciation_3 })
      ]
    });
    const content = formsFixture({
      forms: [first, second],
      groups: [
        {
          id: UUIDS.group,
          is_regular: true,
          members: [
            { id: UUIDS.membership, form_id: first.id },
            { id: UUIDS.membership_2, form_id: second.id }
          ]
        },
        { id: UUIDS.group_2, is_regular: false, members: [] }
      ]
    });
    const reorderedForms = reorderForms(content, UUIDS.pos, [
      second.id,
      first.id
    ]);
    const reorderedMembers = reorderMemberships(reorderedForms, UUIDS.group, [
      UUIDS.membership_2,
      UUIDS.membership
    ]);
    expect(
      reorderedMembers.pos[0]!.form_groups[0]!.members.map((item) => item.id)
    ).toEqual([UUIDS.membership_2, UUIDS.membership]);
    const reorderedPronunciations = reorderPronunciations(
      reorderedMembers,
      second.regional_variants.common.id,
      [UUIDS.pronunciation_3, UUIDS.pronunciation_2]
    );
    expect(
      reorderedPronunciations.pos[0]!.forms.map((form) => form.id)
    ).toEqual([second.id, first.id]);
    expect(
      commonVariant(
        reorderedPronunciations.pos[0]!.forms[0]!
      ).pronunciations.map((item) => item.id)
    ).toEqual([UUIDS.pronunciation_3, UUIDS.pronunciation_2]);
  });

  it("P1-1 从空 skeleton 新增/删除 POS，重复 POS fail closed", () => {
    const noun = partOfSpeechCatalogFixture.items.find(
      (item) => item.code === "noun"
    )!;
    const verb = partOfSpeechCatalogFixture.items.find(
      (item) => item.code === "verb"
    )!;
    const empty = { pos: [] };
    const withNoun = addPartOfSpeech(
      empty,
      noun,
      uuidSequence(
        UUIDS.pos,
        UUIDS.group,
        UUIDS.form,
        UUIDS.common_variant,
        UUIDS.membership,
        UUIDS.pronunciation
      )
    );
    expect(withNoun).toEqual({
      ok: true,
      value: {
        pos: [
          {
            pos_id: UUIDS.pos,
            pos: "noun",
            dialect_rules: {
              spelling_mode: "unified",
              phonetic_mode: "unified"
            },
            forms: [
              {
                id: UUIDS.form,
                form_type: "base",
                regional_variants: {
                  mode: "common",
                  common: {
                    id: UUIDS.common_variant,
                    dialect: "common",
                    spelling: "",
                    origin: "manual",
                    pronunciations: [
                      {
                        id: UUIDS.pronunciation,
                        dict_phonetic: "",
                        actual_pron: "",
                        style: "normal"
                      }
                    ]
                  }
                }
              }
            ],
            form_groups: [
              {
                id: UUIDS.group,
                is_regular: true,
                members: [{ id: UUIDS.membership, form_id: UUIDS.form }]
              }
            ]
          }
        ]
      }
    });
    if (!withNoun.ok) return;
    expect(deletePartOfSpeech(withNoun.value, UUIDS.pos)).toEqual({
      ok: false,
      reason: "last_pos_required"
    });
    expect(
      addPartOfSpeech(withNoun.value, noun, uuidSequence(UUIDS.pos_2))
    ).toEqual({ ok: false, reason: "duplicate_pos_code" });

    const withVerb = addPartOfSpeech(
      withNoun.value,
      verb,
      uuidSequence(
        UUIDS.pos_2,
        UUIDS.group_2,
        UUIDS.form_2,
        UUIDS.common_variant_2,
        UUIDS.membership_2,
        UUIDS.pronunciation_2
      )
    );
    expect(withVerb.ok).toBe(true);
    if (!withVerb.ok) return;
    expect(deletePartOfSpeech(withVerb.value, UUIDS.pos)).toEqual({
      ok: true,
      value: {
        pos: [
          {
            pos_id: UUIDS.pos_2,
            pos: "verb",
            dialect_rules: {
              spelling_mode: "unified",
              phonetic_mode: "unified"
            },
            forms: [
              {
                id: UUIDS.form_2,
                form_type: "base",
                regional_variants: {
                  mode: "common",
                  common: {
                    id: UUIDS.common_variant_2,
                    dialect: "common",
                    spelling: "",
                    origin: "manual",
                    pronunciations: [
                      {
                        id: UUIDS.pronunciation_2,
                        dict_phonetic: "",
                        actual_pron: "",
                        style: "normal"
                      }
                    ]
                  }
                }
              }
            ],
            form_groups: [
              {
                id: UUIDS.group_2,
                is_regular: true,
                members: [{ id: UUIDS.membership_2, form_id: UUIDS.form_2 }]
              }
            ]
          }
        ]
      }
    });
    expect(deletePartOfSpeech(withVerb.value, "missing-pos")).toEqual({
      ok: false,
      reason: "pos_not_found"
    });
  });

  it("#120 新增词性复制首个 V3 原形的 DD 拼写但不复制发音", () => {
    const source = ukUsFormFixture({
      uk: { spelling: "centre" },
      us: { spelling: "center" }
    });
    const content = formsFixture({ forms: [source] });
    const verb = partOfSpeechCatalogFixture.items.find(
      (item) => item.code === "verb"
    )!;
    const ids = Array.from({ length: 8 }, (_, index) =>
      uuidFromInt(1_300 + index)
    );
    const added = addPartOfSpeech(content, verb, uuidSequence(...ids));

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value.pos[1]).toEqual({
      pos_id: ids[0],
      pos: "verb",
      dialect_rules: {
        spelling_mode: "distinguish",
        phonetic_mode: "distinguish"
      },
      forms: [
        {
          id: ids[2],
          form_type: "base",
          regional_variants: {
            mode: "uk_us",
            uk: {
              id: ids[3],
              dialect: "uk",
              spelling: "centre",
              origin: "manual",
              pronunciations: [
                {
                  id: ids[6],
                  dict_phonetic: "",
                  actual_pron: "",
                  style: "normal"
                }
              ]
            },
            us: {
              id: ids[4],
              dialect: "us",
              spelling: "center",
              origin: "manual",
              pronunciations: [
                {
                  id: ids[7],
                  dict_phonetic: "",
                  actual_pron: "",
                  style: "normal"
                }
              ]
            }
          }
        }
      ],
      form_groups: [
        {
          id: ids[1],
          is_regular: true,
          members: [{ id: ids[5], form_id: ids[2] }]
        }
      ]
    });
  });

  it("#120 新增词性保留 UD 的共用拼写与双方言发音结构", () => {
    const source = ukUsFormFixture({
      uk: { spelling: "center" },
      us: { spelling: "center" }
    });
    const content = formsFixture({
      forms: [source],
      dialect_rules: {
        spelling_mode: "unified",
        phonetic_mode: "distinguish"
      }
    });
    const verb = partOfSpeechCatalogFixture.items.find(
      (item) => item.code === "verb"
    )!;
    const ids = Array.from({ length: 8 }, (_, index) =>
      uuidFromInt(1_320 + index)
    );
    const added = addPartOfSpeech(content, verb, uuidSequence(...ids));

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value.pos[1]).toMatchObject({
      dialect_rules: {
        spelling_mode: "unified",
        phonetic_mode: "distinguish"
      },
      forms: [
        {
          form_type: "base",
          regional_variants: {
            mode: "uk_us",
            uk: { spelling: "center", pronunciations: [{ id: ids[6] }] },
            us: { spelling: "center", pronunciations: [{ id: ids[7] }] }
          }
        }
      ]
    });
  });

  it("新增变化组自带原形并沿用本词性已有原形的拼写", () => {
    const content = formsFixture({ forms: [ukUsFormFixture()] });
    const added = addFormGroup(
      content,
      UUIDS.pos,
      uuidSequence(
        uuidFromInt(9_201),
        uuidFromInt(9_202),
        uuidFromInt(9_203),
        uuidFromInt(9_204),
        uuidFromInt(9_205),
        uuidFromInt(9_206),
        uuidFromInt(9_207)
      )
    );
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const [, created] = added.value.pos[0]!.forms;
    expect(created).toEqual({
      id: uuidFromInt(9_202),
      form_type: "base",
      regional_variants: {
        mode: "uk_us",
        uk: {
          id: uuidFromInt(9_203),
          dialect: "uk",
          spelling: "centre",
          origin: "manual",
          pronunciations: [
            {
              id: uuidFromInt(9_206),
              dict_phonetic: "",
              actual_pron: "",
              style: "normal"
            }
          ]
        },
        us: {
          id: uuidFromInt(9_204),
          dialect: "us",
          spelling: "center",
          origin: "manual",
          pronunciations: [
            {
              id: uuidFromInt(9_207),
              dict_phonetic: "",
              actual_pron: "",
              style: "normal"
            }
          ]
        }
      }
    });
    expect(added.value.pos[0]!.form_groups[1]).toEqual({
      id: uuidFromInt(9_201),
      is_regular: false,
      members: [{ id: uuidFromInt(9_205), form_id: uuidFromInt(9_202) }]
    });
    expect(content.pos[0]!.form_groups).toHaveLength(1);
  });

  it("P1-3 普通删除组若会产生 orphan form 则结构化拒绝且不修改输入", () => {
    const only = formsFixture();
    expect(
      deleteGroupAndOrphanForms(only, UUIDS.pos, UUIDS.group, [UUIDS.form])
    ).toEqual({ ok: false, reason: "last_form_required" });

    const firstGroup = addFormGroup(
      formsFixture({ forms: [], groups: [] }),
      UUIDS.pos,
      uuidSequence(
        UUIDS.group,
        uuidFromInt(9_101),
        uuidFromInt(9_102),
        uuidFromInt(9_103),
        uuidFromInt(9_104)
      )
    );
    expect(firstGroup.ok).toBe(true);
    if (!firstGroup.ok) return;
    const secondGroup = addFormGroup(
      firstGroup.value,
      UUIDS.pos,
      uuidSequence(
        UUIDS.group_2,
        uuidFromInt(9_111),
        uuidFromInt(9_112),
        uuidFromInt(9_113),
        uuidFromInt(9_114)
      )
    );
    expect(secondGroup.ok).toBe(true);
    if (!secondGroup.ok) return;
    expect(
      secondGroup.value.pos[0]!.form_groups.map((item) => ({
        id: item.id,
        is_regular: item.is_regular,
        members: item.members
      }))
    ).toEqual([
      {
        id: UUIDS.group,
        is_regular: false,
        members: [{ id: uuidFromInt(9_103), form_id: uuidFromInt(9_101) }]
      },
      {
        id: UUIDS.group_2,
        is_regular: false,
        members: [{ id: uuidFromInt(9_113), form_id: uuidFromInt(9_111) }]
      }
    ]);
    const reordered = reorderFormGroups(secondGroup.value, UUIDS.pos, [
      UUIDS.group_2,
      UUIDS.group
    ]);
    expect(reordered.pos[0]!.form_groups.map((item) => item.id)).toEqual([
      UUIDS.group_2,
      UUIDS.group
    ]);

    const orphanCandidate = commonFormFixture();
    const shared = commonFormFixture({ id: UUIDS.form_2 });
    const content = formsFixture({
      forms: [orphanCandidate, shared],
      groups: [
        {
          id: UUIDS.group,
          is_regular: false,
          members: [
            { id: UUIDS.membership, form_id: orphanCandidate.id },
            { id: UUIDS.membership_2, form_id: shared.id }
          ]
        },
        {
          id: UUIDS.group_2,
          is_regular: false,
          members: [{ id: UUIDS.membership_3, form_id: shared.id }]
        }
      ]
    });
    const deleted = deleteFormGroup(content, UUIDS.pos, UUIDS.group);
    expect(deleted).toEqual({
      ok: false,
      reason: "orphan_forms_require_explicit_group_deletion",
      form_ids: [orphanCandidate.id]
    });
    expect(content.pos[0]!.forms.map((item) => item.id)).toEqual([
      orphanCandidate.id,
      shared.id
    ]);
    expect(content.pos[0]!.form_groups).toHaveLength(2);

    const atomic = deleteGroupAndOrphanForms(content, UUIDS.pos, UUIDS.group, [
      orphanCandidate.id
    ]);
    expect(atomic.ok).toBe(true);
    if (!atomic.ok) return;
    expect(atomic.value.pos[0]!.forms.map((item) => item.id)).toEqual([
      shared.id
    ]);
    expect(atomic.value.pos[0]!.form_groups).toEqual([
      content.pos[0]!.form_groups[1]
    ]);

    const changedCandidate = commonFormFixture({ id: uuidFromInt(9_001) });
    const changedContent = formsFixture({
      forms: [orphanCandidate, changedCandidate],
      groups: [
        {
          id: UUIDS.group,
          is_regular: false,
          members: [
            { id: UUIDS.membership, form_id: orphanCandidate.id },
            { id: UUIDS.membership_2, form_id: changedCandidate.id }
          ]
        }
      ]
    });
    expect(
      deleteGroupAndOrphanForms(changedContent, UUIDS.pos, UUIDS.group, [
        orphanCandidate.id
      ])
    ).toEqual({
      ok: false,
      reason: "orphan_forms_changed_since_confirmation",
      form_ids: [orphanCandidate.id, changedCandidate.id].sort()
    });
    expect(changedContent.pos[0]!.forms).toHaveLength(2);
    expect(changedContent.pos[0]!.form_groups).toHaveLength(1);

    const sharedOnly = formsFixture({
      forms: [shared],
      groups: [
        {
          id: UUIDS.group,
          is_regular: false,
          members: [{ id: UUIDS.membership_2, form_id: shared.id }]
        },
        {
          id: UUIDS.group_2,
          is_regular: false,
          members: [{ id: UUIDS.membership_3, form_id: shared.id }]
        }
      ]
    });
    const ordinary = deleteFormGroup(sharedOnly, UUIDS.pos, UUIDS.group);
    expect(ordinary.ok).toBe(true);
    if (!ordinary.ok) return;
    expect(ordinary.value.pos[0]!.forms).toEqual([shared]);
    expect(ordinary.value.pos[0]!.form_groups).toEqual([
      sharedOnly.pos[0]!.form_groups[1]
    ]);

    expect(
      deleteGroupAndOrphanForms(content, "missing-pos", UUIDS.group, [])
    ).toEqual({ ok: false, reason: "pos_not_found" });
    expect(
      deleteGroupAndOrphanForms(content, UUIDS.pos, "missing-group", [])
    ).toEqual({ ok: false, reason: "group_not_found" });
  });

  it("P1-1 新增 concrete form 同事务创建 common variant/membership，重复 type 合法", () => {
    const content = formsFixture({
      forms: [],
      groups: [{ id: UUIDS.group, is_regular: false, members: [] }]
    });
    const first = addConcreteForm(
      content,
      UUIDS.pos,
      UUIDS.group,
      "base",
      uuidSequence(
        UUIDS.form,
        UUIDS.common_variant,
        UUIDS.membership,
        UUIDS.pronunciation
      )
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.pos[0]!.forms[0]).toEqual({
      id: UUIDS.form,
      form_type: "base",
      regional_variants: {
        mode: "common",
        common: {
          id: UUIDS.common_variant,
          dialect: "common",
          spelling: "",
          origin: "manual",
          pronunciations: [
            {
              id: UUIDS.pronunciation,
              dict_phonetic: "",
              actual_pron: "",
              style: "normal"
            }
          ]
        }
      }
    });
    expect(first.value.pos[0]!.form_groups[0]!.members).toEqual([
      { id: UUIDS.membership, form_id: UUIDS.form }
    ]);

    const second = addConcreteForm(
      first.value,
      UUIDS.pos,
      UUIDS.group,
      "base",
      uuidSequence(
        UUIDS.form_2,
        UUIDS.common_variant_2,
        UUIDS.membership_2,
        UUIDS.pronunciation_2
      )
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.pos[0]!.forms.map((item) => item.form_type)).toEqual([
      "base",
      "base"
    ]);
    expect(
      second.value.pos[0]!.form_groups[0]!.members.map((item) => item.form_id)
    ).toEqual([UUIDS.form, UUIDS.form_2]);
    const secondForm = second.value.pos[0]!.forms[1]!;
    if (secondForm.regional_variants.mode !== "common") return;
    expect(secondForm.regional_variants.common.pronunciations).toEqual([
      {
        id: UUIDS.pronunciation_2,
        dict_phonetic: "",
        actual_pron: "",
        style: "normal"
      }
    ]);
  });

  it.each([
    {
      name: "UU",
      rules: {
        spelling_mode: "unified" as const,
        phonetic_mode: "unified" as const
      },
      source: commonFormFixture({
        id: uuidFromInt(3001),
        form_type: "base",
        variant_id: uuidFromInt(3011)
      }),
      generated: [3021, 3022, 3023, 3024].map(uuidFromInt),
      mode: "common"
    },
    {
      name: "UD",
      rules: {
        spelling_mode: "unified" as const,
        phonetic_mode: "distinguish" as const
      },
      source: ukUsFormFixture({
        id: uuidFromInt(3002),
        form_type: "comparative",
        uk: { id: uuidFromInt(3012), spelling: "same" },
        us: { id: uuidFromInt(3013), spelling: "same" }
      }),
      generated: [3031, 3032, 3033, 3034, 3035, 3036].map(uuidFromInt),
      mode: "uk_us"
    },
    {
      name: "DD",
      rules: {
        spelling_mode: "distinguish" as const,
        phonetic_mode: "distinguish" as const
      },
      source: ukUsFormFixture({
        id: uuidFromInt(3003),
        form_type: "plural",
        uk: { id: uuidFromInt(3014), spelling: "colours" },
        us: { id: uuidFromInt(3015), spelling: "colors" }
      }),
      generated: [3041, 3042, 3043, 3044, 3045, 3046].map(uuidFromInt),
      mode: "uk_us"
    }
  ])(
    "#174-$name 在当前 membership 下方创建同类型 form 并继承规则/默认发音",
    ({ rules, source, generated, mode }) => {
      const tail = commonFormFixture({
        id: uuidFromInt(3051),
        variant_id: uuidFromInt(3052),
        form_type: source.form_type
      });
      const sourceMembershipId = uuidFromInt(3061);
      const tailMembershipId = uuidFromInt(3062);
      const groupId = uuidFromInt(3063);
      const original = formsFixture({
        dialect_rules: rules,
        forms: [source, tail],
        groups: [
          {
            id: groupId,
            is_regular: true,
            members: [
              { id: sourceMembershipId, form_id: source.id },
              { id: tailMembershipId, form_id: tail.id }
            ]
          }
        ]
      });

      const added = addConcreteFormAfterMembership(
        original,
        original.pos[0]!.pos_id,
        groupId,
        sourceMembershipId,
        uuidSequence(...generated)
      );

      expect(added.ok).toBe(true);
      if (!added.ok) return;
      const nextPos = added.value.pos[0]!;
      const newForm = nextPos.forms[1]!;
      expect(nextPos.forms.map((form) => form.id)).toEqual([
        source.id,
        generated[0],
        tail.id
      ]);
      expect(newForm.form_type).toBe(source.form_type);
      expect(newForm.regional_variants.mode).toBe(mode);
      expect(nextPos.form_groups[0]!.members).toEqual([
        { id: sourceMembershipId, form_id: source.id },
        { id: generated[mode === "common" ? 2 : 3], form_id: generated[0] },
        { id: tailMembershipId, form_id: tail.id }
      ]);
      const variants =
        newForm.regional_variants.mode === "common"
          ? [newForm.regional_variants.common]
          : [newForm.regional_variants.uk, newForm.regional_variants.us];
      expect(variants).toHaveLength(mode === "common" ? 1 : 2);
      for (const variant of variants) {
        expect(variant.spelling).toBe("");
        expect(variant.pronunciations).toHaveLength(1);
        expect(variant.pronunciations[0]).toMatchObject({
          dict_phonetic: "",
          actual_pron: "",
          style: "normal"
        });
      }
      expect(new Set(generated).size).toBe(generated.length);
      expect(original.pos[0]!.forms).toEqual([source, tail]);
      expect(original.pos[0]!.form_groups[0]!.members).toEqual([
        { id: sourceMembershipId, form_id: source.id },
        { id: tailMembershipId, form_id: tail.id }
      ]);
    }
  );

  it("#176 共享 form 的行内加号只在触发组创建新 canonical form 与 membership", () => {
    const source = commonFormFixture({
      id: uuidFromInt(3101),
      variant_id: uuidFromInt(3102),
      form_type: "base"
    });
    const firstGroupId = uuidFromInt(3111);
    const secondGroupId = uuidFromInt(3112);
    const firstMembershipId = uuidFromInt(3121);
    const secondMembershipId = uuidFromInt(3122);
    const original = formsFixture({
      forms: [source],
      groups: [
        {
          id: firstGroupId,
          is_regular: true,
          members: [{ id: firstMembershipId, form_id: source.id }]
        },
        {
          id: secondGroupId,
          is_regular: true,
          members: [{ id: secondMembershipId, form_id: source.id }]
        }
      ]
    });
    const generated = [3131, 3132, 3133, 3134].map(uuidFromInt);

    const added = addConcreteFormAfterMembership(
      original,
      original.pos[0]!.pos_id,
      secondGroupId,
      secondMembershipId,
      uuidSequence(...generated)
    );

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value.pos[0]!.forms.map((form) => form.id)).toEqual([
      source.id,
      generated[0]
    ]);
    expect(added.value.pos[0]!.form_groups[0]!.members).toEqual([
      { id: firstMembershipId, form_id: source.id }
    ]);
    expect(added.value.pos[0]!.form_groups[1]!.members).toEqual([
      { id: secondMembershipId, form_id: source.id },
      { id: generated[2], form_id: generated[0] }
    ]);
    expect(generated[0]).not.toBe(source.id);
  });

  it.each([
    {
      name: "UD",
      rules: {
        spelling_mode: "unified" as const,
        phonetic_mode: "distinguish" as const
      }
    },
    {
      name: "DD",
      rules: {
        spelling_mode: "distinguish" as const,
        phonetic_mode: "distinguish" as const
      }
    }
  ])("#113 $name 下新增词形直接创建完整 uk/us 节点", ({ rules }) => {
    const content = formsFixture({
      forms: [],
      groups: [{ id: UUIDS.group, is_regular: false, members: [] }],
      dialect_rules: rules
    });
    const added = addConcreteForm(
      content,
      UUIDS.pos,
      UUIDS.group,
      "plural",
      uuidSequence(
        UUIDS.form,
        UUIDS.uk_variant,
        UUIDS.us_variant,
        UUIDS.membership,
        UUIDS.pronunciation,
        UUIDS.pronunciation_2
      )
    );

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value.pos[0]!.forms[0]).toEqual({
      id: UUIDS.form,
      form_type: "plural",
      regional_variants: {
        mode: "uk_us",
        uk: {
          id: UUIDS.uk_variant,
          dialect: "uk",
          spelling: "",
          origin: "manual",
          pronunciations: [
            {
              id: UUIDS.pronunciation,
              dict_phonetic: "",
              actual_pron: "",
              style: "normal"
            }
          ]
        },
        us: {
          id: UUIDS.us_variant,
          dialect: "us",
          spelling: "",
          origin: "manual",
          pronunciations: [
            {
              id: UUIDS.pronunciation_2,
              dict_phonetic: "",
              actual_pron: "",
              style: "normal"
            }
          ]
        }
      }
    });
    expect(added.value.pos[0]!.form_groups[0]!.members).toEqual([
      { id: UUIDS.membership, form_id: UUIDS.form }
    ]);
  });

  it("UUID factory 返回非法身份时操作 fail closed", () => {
    const second = commonFormFixture({ id: UUIDS.form_2 });
    const content = formsFixture({
      forms: [commonFormFixture(), second],
      groups: [
        {
          id: UUIDS.group,
          is_regular: true,
          members: [{ id: UUIDS.membership, form_id: UUIDS.form }]
        }
      ]
    });
    expect(() =>
      addMembership(
        content,
        UUIDS.pos,
        UUIDS.group,
        second.id,
        vi.fn(() => "not-a-uuid")
      )
    ).toThrow("UUID factory returned an invalid UUID");

    const uuidV7 = "018f4c2a-7b3d-7abc-8def-1234567890ab";
    const accepted = addMembership(
      content,
      UUIDS.pos,
      UUIDS.group,
      second.id,
      vi.fn(() => uuidV7)
    );
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.value.pos[0]!.form_groups[0]!.members[1]!.id).toBe(uuidV7);
  });

  it("缺失目标与错误 regional mode 均 fail closed 且不修改原内容", () => {
    const content = formsFixture();
    const original = structuredClone(content);
    const commonMapping = {
      confirmed: true,
      common: {
        spelling: "center",
        origin: "manual" as const,
        pronunciations: []
      }
    };
    const ukUsMapping = {
      confirmed: true,
      uk: { spelling: "centre", origin: "manual" as const, pronunciations: [] },
      us: { spelling: "center", origin: "manual" as const, pronunciations: [] }
    };

    expect(convertCommonToUkUs(ukUsFormFixture(), ukUsMapping)).toEqual({
      ok: false,
      reason: "wrong_regional_mode"
    });
    expect(convertUkUsToCommon(commonFormFixture(), commonMapping)).toEqual({
      ok: false,
      reason: "wrong_regional_mode"
    });
    expect(
      addMembership(content, "missing-pos", UUIDS.group, UUIDS.form)
    ).toEqual({ ok: false, reason: "pos_not_found" });
    expect(
      addMembership(content, UUIDS.pos, "missing-group", UUIDS.form)
    ).toEqual({ ok: false, reason: "group_not_found" });
    expect(
      addMembership(content, UUIDS.pos, UUIDS.group, "missing-form")
    ).toEqual({ ok: false, reason: "form_not_found" });
    expect(removeMembership(content, "missing-membership")).toEqual({
      ok: false,
      reason: "membership_not_found"
    });
    expect(deleteConcreteForm(content, "missing-pos", UUIDS.form)).toEqual({
      ok: false,
      reason: "pos_not_found"
    });
    expect(deleteConcreteForm(content, UUIDS.pos, "missing-form")).toEqual({
      ok: false,
      reason: "form_not_found"
    });
    expect(content).toEqual(original);
  });
});
