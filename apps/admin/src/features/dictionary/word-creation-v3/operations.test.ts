import type { WordConcreteFormV3 } from "@tsz/types";
import { describe, expect, it, vi } from "vitest";
import {
  addConcreteForm,
  addFormGroup,
  addMembership,
  addPartOfSpeech,
  convertCommonToUkUs,
  convertUkUsToCommon,
  deleteConcreteForm,
  deleteFormGroup,
  deleteGroupAndOrphanForms,
  deletePartOfSpeech,
  moveMembership,
  removeMembership,
  reorderFormGroups,
  reorderForms,
  reorderMemberships,
  reorderPronunciations,
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

  it("U06b 普通移除最后 membership 拒绝；deleteConcreteForm 原子删除 form 与全部引用", () => {
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

    const deleted = deleteConcreteForm(content, UUIDS.pos, shared.id);
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.value.pos[0]!.forms).toEqual([]);
    expect(
      deleted.value.pos[0]!.form_groups.flatMap((group) => group.members)
    ).toEqual([]);
  });

  it("U05/U08 移组只替换 membership 身份，重排只改变 wire 数组顺序", () => {
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
    const moved = moveMembership(
      content,
      UUIDS.membership,
      UUIDS.group_2,
      0,
      uuidSequence(UUIDS.membership_3)
    );
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.value.pos[0]!.forms.map((form) => form.id)).toEqual([
      first.id,
      second.id
    ]);
    expect(moved.value.pos[0]!.form_groups[1]!.members).toEqual([
      { id: UUIDS.membership_3, form_id: first.id }
    ]);

    const reorderedForms = reorderForms(moved.value, UUIDS.pos, [
      second.id,
      first.id
    ]);
    const reorderedMembers = reorderMemberships(reorderedForms, UUIDS.group, [
      UUIDS.membership_2
    ]);
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
    const withNoun = addPartOfSpeech(empty, noun, uuidSequence(UUIDS.pos));
    expect(withNoun).toEqual({
      ok: true,
      value: {
        pos: [
          {
            pos_id: UUIDS.pos,
            pos: "noun",
            forms: [],
            form_groups: []
          }
        ]
      }
    });
    if (!withNoun.ok) return;
    expect(
      addPartOfSpeech(withNoun.value, noun, uuidSequence(UUIDS.pos_2))
    ).toEqual({ ok: false, reason: "duplicate_pos_code" });

    const withVerb = addPartOfSpeech(
      withNoun.value,
      verb,
      uuidSequence(UUIDS.pos_2)
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
            forms: [],
            form_groups: []
          }
        ]
      }
    });
    expect(deletePartOfSpeech(withVerb.value, "missing-pos")).toEqual({
      ok: false,
      reason: "pos_not_found"
    });
  });

  it("P1-3 普通删除组若会产生 orphan form 则结构化拒绝且不修改输入", () => {
    const firstGroup = addFormGroup(
      formsFixture({ forms: [], groups: [] }),
      UUIDS.pos,
      uuidSequence(UUIDS.group)
    );
    expect(firstGroup.ok).toBe(true);
    if (!firstGroup.ok) return;
    const secondGroup = addFormGroup(
      firstGroup.value,
      UUIDS.pos,
      uuidSequence(UUIDS.group_2)
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
      { id: UUIDS.group, is_regular: false, members: [] },
      { id: UUIDS.group_2, is_regular: false, members: [] }
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
    const content = formsFixture({ forms: [], groups: [] });
    const withGroup = addFormGroup(
      content,
      UUIDS.pos,
      uuidSequence(UUIDS.group)
    );
    expect(withGroup.ok).toBe(true);
    if (!withGroup.ok) return;
    const first = addConcreteForm(
      withGroup.value,
      UUIDS.pos,
      UUIDS.group,
      "base",
      uuidSequence(UUIDS.form, UUIDS.common_variant, UUIDS.membership)
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
          pronunciations: []
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
      uuidSequence(UUIDS.form_2, UUIDS.common_variant_2, UUIDS.membership_2)
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
    expect(
      moveMembership(content, "missing-membership", UUIDS.group, 0)
    ).toEqual({ ok: false, reason: "membership_not_found" });
    expect(
      moveMembership(content, UUIDS.membership, "missing-group", 0)
    ).toEqual({ ok: false, reason: "group_not_found" });
    expect(content).toEqual(original);
  });
});
