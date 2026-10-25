import { describe, expect, it } from "vitest";
import type { SharedFormsStepContentV3 } from "@tsz/types";
import { createStableVariantIdFactory } from "./operations";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  ukUsFormFixture,
  uuidFromInt
} from "./fixtures";
import {
  assignSharedFormContent,
  applyFormsStructure,
  contentEditorForms,
  contentFromEditor,
  createPronunciationReferenceIds,
  createSharedContentDialectNormalizer,
  expandFormContents,
  replaceSharedContent
} from "./sharedFormsModel";

export function sharedFormsFixture(): SharedFormsStepContentV3 {
  const expanded = formsFixture({ forms: [commonFormFixture()] });
  const empty: SharedFormsStepContentV3 = {
    forms_format: "shared_v1",
    contents: [],
    pos: []
  };
  return applyFormsStructure(empty, expanded) as SharedFormsStepContentV3;
}

function stableIds(forms: SharedFormsStepContentV3) {
  return createStableVariantIdFactory(expandFormContents(forms), []);
}

describe("共享词形内容", () => {
  it("改绑只替换指定词形的内容，保留变体身份、规则性和其他共享者", () => {
    const expanded = formsFixture({
      forms: [
        commonFormFixture(),
        commonFormFixture({
          id: uuidFromInt(901),
          spelling: "other",
          form_type: "past"
        }),
        commonFormFixture({
          id: uuidFromInt(902),
          spelling: "others",
          form_type: "plural"
        })
      ]
    });
    let initial = applyFormsStructure(
      { forms_format: "shared_v1", contents: [], pos: [] },
      expanded
    ) as SharedFormsStepContentV3;
    initial = assignSharedFormContent(
      initial,
      initial.contents[1]!.id,
      initial.pos[0]!.forms[2]!.id,
      stableIds(initial)
    );
    const before = structuredClone(initial);
    const target = initial.pos[0]!.forms[1]!;
    const old = target.regional_bindings;
    if (old.mode !== "common") throw new Error("fixture");
    old.common.is_regular = false;
    const ids = createPronunciationReferenceIds(initial);
    const variants = stableIds(initial);
    const next = assignSharedFormContent(
      initial,
      initial.contents[0]!.id,
      target.id,
      variants,
      ids
    );
    expect(initial.pos[0]!.forms.map((row) => row.id)).toEqual(
      next.pos[0]!.forms.map((row) => row.id)
    );
    expect(next.pos[0]!.form_groups).toEqual(initial.pos[0]!.form_groups);
    expect(next.contents).toHaveLength(2);
    expect(next.pos[0]!.forms[2]).toEqual(initial.pos[0]!.forms[2]);
    const updated = next.pos[0]!.forms[1]!.regional_bindings;
    expect(updated).toMatchObject({
      common: {
        id: old.common.id,
        is_regular: false,
        content_slot_id:
          initial.contents[0]!.regional_variants.mode === "common"
            ? initial.contents[0]!.regional_variants.common.id
            : ""
      }
    });
    if (updated.mode !== "common") throw new Error("fixture");
    expect(updated.common.pronunciations[0]!.id).not.toBe(
      old.common.pronunciations[0]!.id
    );
    expect(updated.common.pronunciations[0]!.id).not.toBe(
      (next.pos[0]!.forms[0]!.regional_bindings as typeof old).common
        .pronunciations[0]!.id
    );
    const restored = assignSharedFormContent(
      next,
      target.content_id,
      target.id,
      variants,
      ids
    );
    expect(restored).toEqual(initial);
    expect(initial.contents).toEqual(before.contents);
  });

  it("改绑至英美分开的正文保持词形数量并完整建立两侧读法", () => {
    const expanded = formsFixture({
      forms: [ukUsFormFixture(), commonFormFixture({ form_type: "plural" })]
    });
    const initial = applyFormsStructure(
      { forms_format: "shared_v1", contents: [], pos: [] },
      expanded
    ) as SharedFormsStepContentV3;
    const next = assignSharedFormContent(
      initial,
      initial.contents[0]!.id,
      initial.pos[0]!.forms[1]!.id,
      stableIds(initial)
    );
    expect(next.pos[0]!.forms).toHaveLength(2);
    expect(next.contents).toHaveLength(1);
    const projected =
      expandFormContents(next).pos[0]!.forms[1]!.regional_variants;
    expect(projected).toMatchObject({
      mode: "uk_us",
      uk: { spelling: "centre" },
      us: { spelling: "center" }
    });
    if (projected.mode !== "uk_us") throw new Error("fixture");
    expect(projected.uk.pronunciations).toHaveLength(1);
    expect(projected.us.pronunciations).toHaveLength(1);
    expect(next.pos[0]!.form_groups).toEqual(initial.pos[0]!.form_groups);
  });
  it("跨词性标签共用正文，编辑保留各绑定身份和规则性", () => {
    const expanded = formsFixture();
    expanded.pos.push(
      ...formsFixture({
        pos_id: uuidFromInt(501),
        pos: "verb",
        forms: [commonFormFixture({ id: uuidFromInt(502) })]
      }).pos
    );
    const initial = applyFormsStructure(
      { forms_format: "shared_v1", contents: [], pos: [] },
      expanded
    ) as SharedFormsStepContentV3;
    const forms = assignSharedFormContent(
      initial,
      initial.contents[0]!.id,
      initial.pos[1]!.forms[0]!.id,
      stableIds(initial)
    );
    const binding = forms.pos[1]!.forms[0]!;
    expect(binding.content_id).toBe(forms.pos[0]!.forms[0]!.content_id);
    if (binding.regional_bindings.mode !== "common") throw new Error("fixture");
    binding.regional_bindings.common.is_regular = false;
    const before = structuredClone(forms.pos);
    const content = structuredClone(forms.contents[0]!);
    if (content.regional_variants.mode !== "common") throw new Error("fixture");
    content.regional_variants.common.spelling = "changed";
    content.regional_variants.common.pronunciations[0]!.actual_pron =
      "new pronunciation";
    const next = replaceSharedContent(forms, content, stableIds(forms));
    expect(next.pos).toEqual(before);
    const variants = expandFormContents(next).pos.map(
      (pos) => pos.forms[0]!.regional_variants
    );
    for (const variant of variants) {
      if (variant.mode !== "common") throw new Error("fixture");
      expect(variant.common.spelling).toBe("changed");
      expect(variant.common.pronunciations[0]!.actual_pron).toBe(
        "new pronunciation"
      );
    }
    expect(variants[0]).not.toEqual(variants[1]);
    expect(forms.contents[0]).not.toEqual(content);
  });

  it("结构操作不从展开副本覆盖共享正文，相同拼写新词形不自动合并", () => {
    const forms = sharedFormsFixture();
    const expanded = structuredClone(expandFormContents(forms));
    const first = expanded.pos[0]!.forms[0]!.regional_variants;
    if (first.mode !== "common") throw new Error("fixture");
    first.common.spelling = "untrusted projection";
    const duplicate = commonFormFixture({ id: uuidFromInt(610) });
    expanded.pos[0]!.forms.push(duplicate);
    expanded.pos[0]!.form_groups[0]!.members.push({
      id: uuidFromInt(611),
      form_id: duplicate.id
    });
    const next = applyFormsStructure(
      forms,
      expanded
    ) as SharedFormsStepContentV3;
    expect(next.contents).toHaveLength(2);
    expect(next.contents[0]).toEqual(forms.contents[0]);
    expect(next.pos[0]!.forms[0]!.content_id).not.toBe(
      next.pos[0]!.forms[1]!.content_id
    );
  });

  it("既有词形共用内容后保持各自引用节点 ID", () => {
    const expanded = formsFixture({
      forms: [
        commonFormFixture(),
        commonFormFixture({ id: uuidFromInt(610), form_type: "plural" })
      ]
    });
    const forms = applyFormsStructure(
      { forms_format: "shared_v1", contents: [], pos: [] },
      expanded
    ) as SharedFormsStepContentV3;
    const next = assignSharedFormContent(
      forms,
      forms.contents[0]!.id,
      forms.pos[0]!.forms[1]!.id,
      stableIds(forms)
    );
    const variants = next.pos[0]!.forms.map((form) => form.regional_bindings);
    if (variants[0]!.mode !== "common" || variants[1]!.mode !== "common")
      throw new Error("fixture");
    expect(variants[0]!.common.id).not.toBe(variants[1]!.common.id);
    expect(variants[0]!.common.pronunciations[0]!.id).not.toBe(
      variants[1]!.common.pronunciations[0]!.id
    );
    expect(variants[0]!.common.pronunciations[0]!.content_slot_id).toBe(
      variants[1]!.common.pronunciations[0]!.content_slot_id
    );
  });

  it("读法删后恢复使用显式槽位账本，不按文本或数组位置猜测", () => {
    const forms = sharedFormsFixture();
    const ids = stableIds(forms);
    const original = forms.pos[0]!.forms[0]!.regional_bindings;
    if (original.mode !== "common") throw new Error("fixture");
    const reference = original.common.pronunciations[0]!;
    const content = structuredClone(forms.contents[0]!);
    if (content.regional_variants.mode !== "common") throw new Error("fixture");
    content.regional_variants.common.pronunciations = [];
    const removed = replaceSharedContent(forms, content, ids);
    const restoredIds = createPronunciationReferenceIds(removed, [
      {
        id: reference.id,
        node_role: "pronunciation",
        parent_node_id: original.common.id,
        content_id: content.id,
        content_slot_id: reference.content_slot_id,
        retired_at: "2026-10-20T00:00:00Z"
      }
    ]);
    const restored = replaceSharedContent(
      removed,
      forms.contents[0]!,
      ids,
      restoredIds
    );
    expect(restored.pos).toEqual(forms.pos);
    const added = structuredClone(forms.contents[0]!);
    if (added.regional_variants.mode !== "common") throw new Error("fixture");
    added.regional_variants.common.pronunciations.unshift(
      pronunciationFixture({ id: uuidFromInt(800) })
    );
    const result = replaceSharedContent(restored, added, ids, restoredIds);
    const refs = result.pos[0]!.forms[0]!.regional_bindings;
    if (refs.mode !== "common") throw new Error("fixture");
    expect(refs.common.pronunciations[1]).toEqual(reference);
    expect(refs.common.pronunciations[0]!.id).not.toBe(reference.id);
  });

  it("同次弹窗内地区往返恢复原槽位和引用，前插读法不抢旧身份", () => {
    const forms = sharedFormsFixture();
    const original = forms.contents[0]!;
    const normalize = createSharedContentDialectNormalizer(original, []);
    const ids = stableIds(forms);
    const references = createPronunciationReferenceIds(forms);
    const split = normalize(
      contentEditorForms(original),
      { spelling_mode: "unified", phonetic_mode: "distinguish" },
      "uk"
    );
    if (!split.ok) throw new Error(split.reason);
    const splitContent = contentFromEditor(split.value);
    const splitForms = replaceSharedContent(
      forms,
      splitContent,
      ids,
      references
    );
    const merged = normalize(split.value, original.dialect_rules, "uk");
    if (!merged.ok) throw new Error(merged.reason);
    expect(contentFromEditor(merged.value).regional_variants).toEqual(
      original.regional_variants
    );
    expect(
      replaceSharedContent(
        splitForms,
        contentFromEditor(merged.value),
        ids,
        references
      ).pos
    ).toEqual(forms.pos);
    const regions = split.value.pos[0]!.forms[0]!.regional_variants;
    if (regions.mode !== "uk_us") throw new Error("fixture");
    for (const [index, side] of [regions.uk, regions.us].entries()) {
      side.pronunciations.unshift(
        pronunciationFixture({ id: uuidFromInt(810 + index) })
      );
    }
    const changed = normalize(split.value, original.dialect_rules, "uk");
    if (!changed.ok) throw new Error(changed.reason);
    const changedRegions = contentFromEditor(changed.value).regional_variants;
    if (
      original.regional_variants.mode !== "common" ||
      changedRegions.mode !== "common"
    )
      throw new Error("fixture");
    expect(changedRegions.common.pronunciations[1]!.id).toBe(
      original.regional_variants.common.pronunciations[0]!.id
    );
    expect(changedRegions.common.pronunciations[0]!.id).not.toBe(
      changedRegions.common.pronunciations[1]!.id
    );
  });

  it.each(["uk", "us"] as const)(
    "原有英美内容合并再拆分时恢复两侧槽位（偏好 %s）",
    (preference) => {
      const expanded = formsFixture({
        forms: [ukUsFormFixture({ us: { spelling: "centre" } })],
        dialect_rules: {
          spelling_mode: "unified",
          phonetic_mode: "distinguish"
        }
      });
      const forms = applyFormsStructure(
        { forms_format: "shared_v1", contents: [], pos: [] },
        expanded
      ) as SharedFormsStepContentV3;
      const original = forms.contents[0]!;
      const normalize = createSharedContentDialectNormalizer(original, []);
      const merged = normalize(
        contentEditorForms(original),
        { spelling_mode: "unified", phonetic_mode: "unified" },
        preference
      );
      if (!merged.ok) throw new Error(merged.reason);
      const split = normalize(merged.value, original.dialect_rules, preference);
      if (!split.ok) throw new Error(split.reason);
      expect(contentFromEditor(split.value).regional_variants).toEqual(
        original.regional_variants
      );
    }
  );

  it("地区切换保存并重开后，恢复原读法槽位与绑定引用", () => {
    const forms = sharedFormsFixture();
    const original = forms.contents[0]!;
    const first = createSharedContentDialectNormalizer(original, []);
    const split = first(
      contentEditorForms(original),
      { spelling_mode: "unified", phonetic_mode: "distinguish" },
      "uk"
    );
    if (!split.ok) throw new Error(split.reason);
    const splitContent = contentFromEditor(split.value);
    const saved = replaceSharedContent(forms, splitContent, stableIds(forms));
    const regions = original.regional_variants;
    if (regions.mode !== "common") throw new Error("fixture");
    const retired = [
      {
        id: regions.common.id,
        content_id: original.id,
        role: "common" as const,
        parent_slot_id: original.id,
        retired_at: "2026-10-20T00:00:00Z"
      },
      ...regions.common.pronunciations.map((row) => ({
        id: row.id,
        content_id: original.id,
        role: "pronunciation" as const,
        parent_slot_id: regions.common.id,
        retired_at: "2026-10-20T00:00:00Z"
      }))
    ];
    const reopened = createSharedContentDialectNormalizer(
      structuredClone(splitContent),
      retired
    );
    const merged = reopened(
      contentEditorForms(splitContent),
      original.dialect_rules,
      "uk"
    );
    if (!merged.ok) throw new Error(merged.reason);
    const restored = contentFromEditor(merged.value);
    expect(restored.regional_variants).toEqual(original.regional_variants);
    const references = createPronunciationReferenceIds(
      saved,
      forms.pos.flatMap((pos) =>
        pos.forms.flatMap((form) => {
          const refs = form.regional_bindings;
          return refs.mode === "common"
            ? refs.common.pronunciations.map((row) => ({
                id: row.id,
                parent_node_id: refs.common.id,
                node_role: "pronunciation",
                content_id: form.content_id,
                content_slot_id: row.content_slot_id,
                retired_at: "2026-10-20T00:00:00Z"
              }))
            : [];
        })
      )
    );
    expect(
      replaceSharedContent(saved, restored, stableIds(forms), references).pos
    ).toEqual(forms.pos);
  });

  it.each(["uk", "us"] as const)(
    "原有英美内容合并保存并重开后恢复两侧身份（偏好 %s）",
    (preference) => {
      const expanded = formsFixture({
        forms: [ukUsFormFixture({ us: { spelling: "centre" } })],
        dialect_rules: {
          spelling_mode: "unified",
          phonetic_mode: "distinguish"
        }
      });
      const forms = applyFormsStructure(
        { forms_format: "shared_v1", contents: [], pos: [] },
        expanded
      ) as SharedFormsStepContentV3;
      const original = forms.contents[0]!;
      const normalize = createSharedContentDialectNormalizer(original, []);
      const merged = normalize(
        contentEditorForms(original),
        { spelling_mode: "unified", phonetic_mode: "unified" },
        preference
      );
      if (!merged.ok) throw new Error(merged.reason);
      const mergedContent = contentFromEditor(merged.value);
      const saved = replaceSharedContent(
        forms,
        mergedContent,
        stableIds(forms)
      );
      const retired = forms.pos.flatMap((pos) =>
        pos.forms.flatMap((form) => {
          const refs = form.regional_bindings;
          if (refs.mode !== "uk_us") throw new Error("fixture");
          return (["uk", "us"] as const).flatMap((side) => [
            {
              id: refs[side].id,
              parent_node_id: form.id,
              node_role: `${side}_variant` as const,
              retired_at: "2026-10-20T00:00:00Z"
            },
            ...refs[side].pronunciations.map((row) => ({
              id: row.id,
              parent_node_id: refs[side].id,
              node_role: "pronunciation" as const,
              content_id: form.content_id,
              content_slot_id: row.content_slot_id,
              retired_at: "2026-10-20T00:00:00Z"
            }))
          ]);
        })
      );
      const reopened = createSharedContentDialectNormalizer(
        structuredClone(mergedContent),
        []
      );
      const split = reopened(
        contentEditorForms(mergedContent),
        original.dialect_rules,
        preference
      );
      if (!split.ok) throw new Error(split.reason);
      const restored = replaceSharedContent(
        saved,
        contentFromEditor(split.value),
        createStableVariantIdFactory(expandFormContents(saved), retired),
        createPronunciationReferenceIds(saved, retired)
      );
      expect(restored.contents[0]!.regional_variants).toEqual(
        original.regional_variants
      );
      expect(restored.pos).toEqual(forms.pos);
    }
  );

  it("读法重排与删除后重开仍按槽位恢复，不替换幸存读法身份", () => {
    const forms = sharedFormsFixture();
    const original = structuredClone(forms.contents[0]!);
    if (original.regional_variants.mode !== "common")
      throw new Error("fixture");
    original.regional_variants.common.pronunciations.push(
      pronunciationFixture({ id: uuidFromInt(820) }),
      pronunciationFixture({ id: uuidFromInt(821) })
    );
    const initial = replaceSharedContent(forms, original, stableIds(forms));
    const initialRefs = initial.pos[0]!.forms[0]!.regional_bindings;
    if (initialRefs.mode !== "common") throw new Error("fixture");
    const edited = structuredClone(original);
    if (edited.regional_variants.mode !== "common") throw new Error("fixture");
    edited.regional_variants.common.pronunciations = [
      edited.regional_variants.common.pronunciations[2]!,
      edited.regional_variants.common.pronunciations[0]!
    ];
    const saved = replaceSharedContent(initial, edited, stableIds(initial));
    const removed = initialRefs.common.pronunciations[1]!;
    const references = createPronunciationReferenceIds(saved, [
      {
        id: removed.id,
        parent_node_id: initialRefs.common.id,
        node_role: "pronunciation",
        content_id: original.id,
        content_slot_id: removed.content_slot_id,
        retired_at: "2026-10-20T00:00:00Z"
      }
    ]);
    const restored = replaceSharedContent(
      saved,
      original,
      stableIds(saved),
      references
    );
    expect(restored.pos).toEqual(initial.pos);
  });

  it.each(["common", "uk_us"] as const)(
    "带旧版成分的 %s 标签保留原节点，地区切换明确拒绝",
    (mode) => {
      const expanded =
        mode === "common"
          ? formsFixture({ forms: [commonFormFixture()] })
          : formsFixture({
              forms: [ukUsFormFixture({ us: { spelling: "centre" } })],
              dialect_rules: {
                spelling_mode: "unified",
                phonetic_mode: "distinguish"
              }
            });
      const forms = applyFormsStructure(
        { forms_format: "shared_v1", contents: [], pos: [] },
        expanded
      ) as SharedFormsStepContentV3;
      const bindings = forms.pos[0]!.forms[0]!.regional_bindings;
      const variants =
        bindings.mode === "common"
          ? [bindings.common]
          : [bindings.uk, bindings.us];
      for (const [index, variant] of variants.entries())
        variant.component_usages = [
          {
            id: uuidFromInt(830 + index),
            state: "unresolved",
            literal: "centre"
          }
        ];
      const before = structuredClone(forms);
      const original = forms.contents[0]!;
      expect(
        replaceSharedContent(forms, structuredClone(original), stableIds(forms))
      ).toEqual(before);
      const normalize = createSharedContentDialectNormalizer(original, []);
      const changed = normalize(
        contentEditorForms(original),
        {
          spelling_mode: "unified",
          phonetic_mode: mode === "common" ? "distinguish" : "unified"
        },
        "uk"
      );
      if (!changed.ok) throw new Error(changed.reason);
      expect(() =>
        replaceSharedContent(
          forms,
          contentFromEditor(changed.value),
          stableIds(forms)
        )
      ).toThrow("旧版词形成分用词");
      expect(forms).toEqual(before);
    }
  );

  it.each([commonFormFixture(), ukUsFormFixture()])(
    "$regional_variants.mode 内容编辑器只提取正文，不保存临时词性、绑定规则性和用途",
    (form) => {
      const forms = applyFormsStructure(
        { forms_format: "shared_v1", contents: [], pos: [] },
        formsFixture({ forms: [form] })
      ) as SharedFormsStepContentV3;
      const original = forms.contents[0]!;
      const source = original.regional_variants;
      for (const variant of source.mode === "common"
        ? [source.common]
        : [source.uk, source.us]) {
        variant.spelling_rich = {
          version: 2,
          text: variant.spelling,
          annotations: [{ type: "italic", start: 0, end: 2 }]
        };
        variant.spelling_speech = {
          content: {
            version: 2,
            text: variant.spelling,
            annotations: [{ type: "pause", at: 2, duration_ms: 500 }]
          },
          voice_profile: {
            voices: [{ voice_id: "sonia", enabled: true, rate_percent: -10 }]
          }
        };
        const row = variant.pronunciations[0]!;
        row.style = "citation";
        row.dict_phonetic_rich = {
          version: 2,
          text: row.dict_phonetic,
          annotations: []
        };
        row.actual_pron_rich = {
          version: 2,
          text: row.actual_pron,
          annotations: []
        };
        row.voice_profile = variant.spelling_speech.voice_profile;
        row.synthesis = {
          alphabet: "ipa",
          ipa: "",
          ups: "",
          uk: { ipa: "sɛn.tə", ups: "S EH N T AH" },
          us: { ipa: "sɛn.tɚ", ups: "S EH N T ER" }
        };
        row.audio_assets = [
          {
            id: uuidFromInt(841),
            locale: "en-GB",
            gender: "female",
            content_type: "audio/wav",
            size_bytes: 1024,
            original_name: "recording.wav",
            created_at: "2026-10-25T00:00:00Z"
          }
        ];
      }
      const editor = contentEditorForms(original);
      Object.assign(editor, { presentation: "readonly" });
      Object.assign(editor.pos[0]!, { sort_order: 1 });
      Object.assign(editor.pos[0]!.forms[0]!, { sort_order: 2 });
      const regions = editor.pos[0]!.forms[0]!.regional_variants;
      for (const variant of regions.mode === "common"
        ? [regions.common]
        : [regions.uk, regions.us]) {
        variant.is_regular = false;
        variant.component_usages = [
          { id: uuidFromInt(840), state: "unresolved", literal: "centre" }
        ];
        Object.assign(variant, {
          audio_url: "https://temporary.invalid/audio"
        });
      }
      const writable = contentFromEditor(editor);
      expect(writable).toEqual(original);
      expect(JSON.stringify(writable)).not.toMatch(
        /presentation|sort_order|audio_url|is_regular|component_usages|pos_id|form_type|dialect"/
      );
    }
  );
});
