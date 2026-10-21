import type {
  DraftFormsStepContentV3,
  FormContentBindingV3,
  FormContentV3,
  FormContentVariantV3,
  FormPronunciationSlotsV3,
  FormRegionalBindingsV3,
  FormVariantBindingV3,
  RetiredStableNodeV3,
  RetiredContentSlotV3,
  DialectRulesV3,
  FormsStepRepresentationV3,
  SharedFormsStepContentV3,
  WordConcreteFormV3,
  WordFormGroupV3
} from "@tsz/types";
import { expandFormContents, isSharedForms } from "@tsz/shared";
import { newWordNodeId } from "../word-model/primitives";
import {
  normalizeGroupDialectRules,
  type V3StableVariantIdFactory
} from "./operations";

function contentVariant(variant: FormContentVariantV3): FormContentVariantV3 {
  return {
    id: newWordNodeId(),
    spelling: variant.spelling,
    ...(variant.spelling_rich ? { spelling_rich: variant.spelling_rich } : {}),
    ...(variant.spelling_speech
      ? { spelling_speech: variant.spelling_speech }
      : {}),
    origin: variant.origin,
    pronunciations: variant.pronunciations.map((row) => ({
      ...row,
      id: newWordNodeId()
    }))
  };
}

function newContent(
  form: WordConcreteFormV3,
  group?: WordFormGroupV3
): FormContentV3 {
  const source = form.regional_variants;
  return {
    id: newWordNodeId(),
    dialect_rules: group?.dialect_rules ?? {
      spelling_mode: "unified",
      phonetic_mode: "unified"
    },
    regional_variants:
      source.mode === "common"
        ? { mode: "common", common: contentVariant(source.common) }
        : {
            mode: "uk_us",
            uk: contentVariant(source.uk),
            us: contentVariant(source.us)
          }
  };
}

function initialBinding(
  form: WordConcreteFormV3,
  content: FormContentV3,
  group?: WordFormGroupV3
): FormContentBindingV3 {
  const source = form.regional_variants;
  const target = content.regional_variants;
  const variant = (
    row: FormContentVariantV3 & {
      is_regular?: boolean;
      component_usages?: FormVariantBindingV3["component_usages"];
    },
    slot: FormContentVariantV3
  ): FormVariantBindingV3 => ({
    id: row.id,
    content_slot_id: slot.id,
    is_regular: row.is_regular ?? group?.is_regular ?? true,
    ...(row.component_usages === undefined
      ? {}
      : { component_usages: row.component_usages }),
    // These arrays are allocated together; later edits use explicit slot mappings.
    pronunciations: row.pronunciations.map((pronunciation, index) => ({
      id: pronunciation.id,
      content_slot_id: slot.pronunciations[index]!.id
    }))
  });
  let regional_bindings: FormRegionalBindingsV3;
  if (source.mode === "common" && target.mode === "common") {
    regional_bindings = {
      mode: "common",
      common: variant(source.common, target.common)
    };
  } else if (source.mode === "uk_us" && target.mode === "uk_us") {
    regional_bindings = {
      mode: "uk_us",
      uk: variant(source.uk, target.uk),
      us: variant(source.us, target.us)
    };
  } else throw new Error("Inconsistent new content shape");
  return {
    id: form.id,
    form_type: form.form_type,
    content_id: content.id,
    regional_bindings
  };
}

/** Existing content is immutable here; group/label operations only change bindings. */
export function applyFormsStructure(
  current: FormsStepRepresentationV3,
  next: DraftFormsStepContentV3
): FormsStepRepresentationV3 {
  if (!isSharedForms(current)) return next;
  const existing = new Map(
    current.pos.flatMap((pos) =>
      pos.forms.map((form) => [form.id, form] as const)
    )
  );
  const contents = new Map(
    current.contents.map((content) => [content.id, content])
  );
  const pos = next.pos.map((row) => ({
    pos_id: row.pos_id,
    pos: row.pos,
    form_groups: row.form_groups.map((group) => ({
      id: group.id,
      scope: group.scope,
      is_regular: group.is_regular,
      members: group.members
    })),
    forms: row.forms.map((form) => {
      const previous = existing.get(form.id);
      if (previous) {
        const bindings = structuredClone(previous.regional_bindings);
        const projected = form.regional_variants;
        const update = (
          binding: FormVariantBindingV3,
          value: {
            is_regular?: boolean;
            component_usages?: FormVariantBindingV3["component_usages"];
          }
        ) => {
          binding.is_regular = value.is_regular ?? binding.is_regular;
          if (value.component_usages !== undefined)
            binding.component_usages = value.component_usages;
        };
        if (bindings.mode === "common" && projected.mode === "common")
          update(bindings.common, projected.common);
        else if (bindings.mode === "uk_us" && projected.mode === "uk_us") {
          update(bindings.uk, projected.uk);
          update(bindings.us, projected.us);
        } else throw new Error("Regional changes must edit the shared content");
        return {
          ...previous,
          form_type: form.form_type,
          regional_bindings: bindings
        };
      }
      const group = row.form_groups.find((item) =>
        item.members.some((member) => member.form_id === form.id)
      );
      const content = newContent(form, group);
      contents.set(content.id, content);
      return initialBinding(form, content, group);
    })
  }));
  const used = new Set(
    pos.flatMap((row) => row.forms.map((form) => form.content_id))
  );
  return {
    forms_format: "shared_v1",
    pos,
    contents: [...contents.values()].filter((content) => used.has(content.id))
  };
}

type FormContentEditor = DraftFormsStepContentV3 &
  Pick<FormContentV3, "pronunciation_slots">;

export function contentEditorForms(content: FormContentV3): FormContentEditor {
  const regions = content.regional_variants;
  return {
    ...(content.pronunciation_slots
      ? { pronunciation_slots: structuredClone(content.pronunciation_slots) }
      : {}),
    pos: [
      {
        pos_id: content.id,
        pos: "noun",
        forms: [
          {
            id: content.id,
            form_type: "base",
            regional_variants:
              regions.mode === "common"
                ? {
                    mode: "common",
                    common: {
                      ...structuredClone(regions.common),
                      dialect: "common",
                      is_regular: true
                    }
                  }
                : {
                    mode: "uk_us",
                    uk: {
                      ...structuredClone(regions.uk),
                      dialect: "uk",
                      is_regular: true
                    },
                    us: {
                      ...structuredClone(regions.us),
                      dialect: "us",
                      is_regular: true
                    }
                  }
          }
        ],
        form_groups: [
          {
            id: content.id,
            is_regular: true,
            scope: "general",
            dialect_rules: content.dialect_rules,
            members: [{ id: content.id, form_id: content.id }]
          }
        ]
      }
    ]
  };
}

export function contentFromEditor(editor: FormContentEditor): FormContentV3 {
  const pos = editor.pos[0]!;
  const source = pos.forms[0]!.regional_variants;
  const value = (row: FormContentVariantV3): FormContentVariantV3 => ({
    id: row.id,
    spelling: row.spelling,
    origin: row.origin,
    ...(row.spelling_rich ? { spelling_rich: row.spelling_rich } : {}),
    ...(row.spelling_speech ? { spelling_speech: row.spelling_speech } : {}),
    pronunciations: row.pronunciations
  });
  return {
    id: pos.forms[0]!.id,
    ...(editor.pronunciation_slots?.length
      ? { pronunciation_slots: structuredClone(editor.pronunciation_slots) }
      : {}),
    dialect_rules: pos.form_groups[0]!.dialect_rules,
    regional_variants:
      source.mode === "common"
        ? { mode: "common", common: value(source.common) }
        : { mode: "uk_us", uk: value(source.uk), us: value(source.us) }
  };
}

/** Only copies made in this editor establish a cross-region identity mapping. */
export function createSharedContentDialectNormalizer(
  content: FormContentV3,
  retiredSlots: readonly RetiredContentSlotV3[]
) {
  const regions = new Map<string, string>();
  for (const slot of retiredSlots) {
    if (
      slot.content_id === content.id &&
      ["common", "uk", "us"].includes(slot.role)
    )
      regions.set(slot.role, slot.id);
  }
  const original = content.regional_variants;
  for (const [role, variant] of original.mode === "common"
    ? [["common", original.common] as const]
    : [["uk", original.uk] as const, ["us", original.us] as const])
    regions.set(role, variant.id);
  for (const mapping of content.pronunciation_slots ?? []) {
    for (const side of ["common", "uk", "us"] as const) {
      if (mapping[side]) regions.set(side, mapping[side].variant_slot_id);
    }
  }
  let mergeUndo:
    | {
        common: FormContentVariantV3;
        regional: Extract<
          FormContentV3["regional_variants"],
          { mode: "uk_us" }
        >;
      }
    | undefined;
  const regionIds = ((_formId: string, role: string) => {
    const side = role.replace("_variant", "");
    const id = regions.get(side) ?? newWordNodeId();
    regions.set(side, id);
    return id;
  }) as V3StableVariantIdFactory;
  regionIds.seed = () => {};
  return (
    editor: FormContentEditor,
    rules: DialectRulesV3,
    preference: "uk" | "us"
  ) => {
    const result = normalizeGroupDialectRules(
      editor,
      content.id,
      content.id,
      rules,
      preference,
      newWordNodeId,
      regionIds
    );
    if (!result.ok) return result;
    const before = editor.pos[0]!.forms[0]!.regional_variants;
    const after = result.value.pos[0]!.forms[0]!.regional_variants;
    if (before.mode === after.mode) return result;
    const mappings = structuredClone(editor.pronunciation_slots ?? []);
    const bySlot = new Map<string, FormPronunciationSlotsV3>();
    for (const mapping of mappings)
      for (const side of ["common", "uk", "us"] as const) {
        if (mapping[side]) bySlot.set(mapping[side].id, mapping);
      }
    const copy = (
      source: FormContentVariantV3,
      sourceSide: "common" | "uk" | "us",
      target: FormContentVariantV3,
      targetSide: "common" | "uk" | "us"
    ) => {
      target.pronunciations = source.pronunciations.map((row) => {
        let mapping = bySlot.get(row.id);
        if (!mapping) {
          mapping = {
            id: newWordNodeId(),
            [sourceSide]: { id: row.id, variant_slot_id: source.id }
          };
          mappings.push(mapping);
          bySlot.set(row.id, mapping);
        }
        const slot = mapping[targetSide] ?? {
          id: newWordNodeId(),
          variant_slot_id: target.id
        };
        mapping[targetSide] = slot;
        bySlot.set(slot.id, mapping);
        return { ...structuredClone(row), id: slot.id };
      });
    };
    if (before.mode === "common" && after.mode === "uk_us") {
      // Reversing an unchanged merge restores its exact graph, without matching readings.
      const current = contentFromEditor(editor).regional_variants;
      const unchangedMerge =
        mergeUndo &&
        current.mode === "common" &&
        JSON.stringify(current.common) === JSON.stringify(mergeUndo.common);
      if (unchangedMerge && mergeUndo) {
        after.uk = {
          ...structuredClone(mergeUndo.regional.uk),
          dialect: "uk",
          is_regular: true
        };
        after.us = {
          ...structuredClone(mergeUndo.regional.us),
          dialect: "us",
          is_regular: true
        };
      } else {
        copy(before.common, "common", after.uk, "uk");
        copy(before.common, "common", after.us, "us");
      }
      mergeUndo = undefined;
    } else if (before.mode === "uk_us" && after.mode === "common") {
      // The explicit merge joins the equal reading sequences accepted above.
      // Existing correspondence must agree; equal text alone cannot replace it.
      for (let index = 0; index < before.uk.pronunciations.length; index++) {
        const uk = before.uk.pronunciations[index]!;
        const us = before.us.pronunciations[index]!;
        const ukMapping = bySlot.get(uk.id);
        const usMapping = bySlot.get(us.id);
        if (ukMapping && usMapping && ukMapping !== usMapping)
          return {
            ok: false as const,
            reason: "pronunciation_merge_required" as const
          };
        const mapping: FormPronunciationSlotsV3 = ukMapping ??
          usMapping ?? { id: newWordNodeId() };
        if (
          (mapping.uk && mapping.uk.id !== uk.id) ||
          (mapping.us && mapping.us.id !== us.id)
        )
          return {
            ok: false as const,
            reason: "pronunciation_merge_required" as const
          };
        if (!ukMapping && !usMapping) mappings.push(mapping);
        mapping.uk = { id: uk.id, variant_slot_id: before.uk.id };
        mapping.us = { id: us.id, variant_slot_id: before.us.id };
        bySlot.set(uk.id, mapping);
        bySlot.set(us.id, mapping);
      }
      copy(before[preference], preference, after.common, "common");
      const regional = contentFromEditor(editor).regional_variants;
      const merged = contentFromEditor(result.value).regional_variants;
      if (regional.mode === "uk_us" && merged.mode === "common")
        mergeUndo = {
          common: structuredClone(merged.common),
          regional: structuredClone(regional)
        };
    }
    (result.value as FormContentEditor).pronunciation_slots = mappings;
    return result;
  };
}

export function createPronunciationReferenceIds(
  forms: SharedFormsStepContentV3,
  retiredNodes: readonly RetiredStableNodeV3[] = []
) {
  const ids = new Map<string, string>();
  for (const node of retiredNodes) {
    if (
      node.node_role === "pronunciation" &&
      node.parent_node_id &&
      node.content_slot_id
    )
      ids.set(`${node.parent_node_id}:${node.content_slot_id}`, node.id);
  }
  for (const pos of forms.pos)
    for (const form of pos.forms) {
      const refs = form.regional_bindings;
      for (const variant of refs.mode === "common"
        ? [refs.common]
        : [refs.uk, refs.us])
        for (const row of variant.pronunciations)
          ids.set(`${variant.id}:${row.content_slot_id}`, row.id);
    }
  return (variantId: string, slotId: string) => {
    const key = `${variantId}:${slotId}`;
    const id = ids.get(key) ?? newWordNodeId();
    ids.set(key, id);
    return id;
  };
}

export function replaceSharedContent(
  forms: SharedFormsStepContentV3,
  content: FormContentV3,
  stableIds: V3StableVariantIdFactory,
  pronunciationIds = createPronunciationReferenceIds(forms)
): SharedFormsStepContentV3 {
  const next = structuredClone(forms);
  const index = next.contents.findIndex((row) => row.id === content.id);
  if (index < 0) throw new Error("Shared content no longer exists");
  for (const pos of next.pos)
    for (const binding of pos.forms) {
      if (binding.content_id !== content.id) continue;
      const old = binding.regional_bindings;
      const variants = old.mode === "common" ? [old.common] : [old.uk, old.us];
      if (
        old.mode !== content.regional_variants.mode &&
        variants.some((row) => row.component_usages?.length)
      )
        throw new Error(
          "这个标签保留了旧版词形成分用词，暂不能切换英美地区。请先处理成分用词，避免改变已有引用身份。"
        );
      if (old.mode === "uk_us" && content.regional_variants.mode === "common") {
        if (old.uk.is_regular !== old.us.is_regular)
          throw new Error("请先统一每个标签的英美规则变化设置，再合并内容。");
        const values = (row: FormVariantBindingV3) =>
          JSON.stringify(
            (row.component_usages ?? []).map(({ id, ...value }) => {
              void id;
              return value;
            })
          );
        if (values(old.uk) !== values(old.us))
          throw new Error("请先统一标签的英美成分用词，再合并内容。");
      }
      const reference = (
        slot: FormContentVariantV3,
        dialect: "common" | "uk" | "us"
      ): FormVariantBindingV3 => {
        const previous =
          old.mode === "common"
            ? dialect === "common"
              ? old.common
              : undefined
            : dialect === "common"
              ? undefined
              : old[dialect];
        const source =
          previous ?? (old.mode === "common" ? old.common : old.uk);
        const mappings = new Map(
          previous?.pronunciations.map((row) => [row.content_slot_id, row.id])
        );
        const variantId =
          previous?.id ?? stableIds(binding.id, `${dialect}_variant`);
        return {
          id: variantId,
          content_slot_id: slot.id,
          is_regular: source.is_regular,
          ...(source.component_usages === undefined
            ? {}
            : { component_usages: source.component_usages }),
          pronunciations: slot.pronunciations.map((row) => ({
            id: mappings.get(row.id) ?? pronunciationIds(variantId, row.id),
            content_slot_id: row.id
          }))
        };
      };
      const regions = content.regional_variants;
      binding.regional_bindings =
        regions.mode === "common"
          ? { mode: "common", common: reference(regions.common, "common") }
          : {
              mode: "uk_us",
              uk: reference(regions.uk, "uk"),
              us: reference(regions.us, "us")
            };
    }
  next.contents[index] = content;
  return next;
}

export function addSharedLabel(
  forms: SharedFormsStepContentV3,
  contentId: string,
  posId: string,
  groupId: string,
  formType: string,
  stableIds: V3StableVariantIdFactory
): SharedFormsStepContentV3 {
  const next = structuredClone(forms);
  const pos = next.pos.find((row) => row.pos_id === posId);
  const group = pos?.form_groups.find((row) => row.id === groupId);
  const content = next.contents.find((row) => row.id === contentId);
  if (!pos || !group || !content) throw new Error("请选择词性和变化组");
  if (
    group.members.some((member) =>
      pos.forms.some(
        (form) =>
          form.id === member.form_id &&
          form.content_id === contentId &&
          form.form_type === formType
      )
    )
  )
    throw new Error("该内容已在这个变化组使用此标签");
  const id = newWordNodeId();
  pos.forms.push({
    id,
    content_id: contentId,
    form_type: formType,
    regional_bindings:
      content.regional_variants.mode === "common"
        ? {
            mode: "common",
            common: {
              id: stableIds(id, "common_variant"),
              content_slot_id: content.regional_variants.common.id,
              is_regular: true,
              pronunciations: []
            }
          }
        : {
            mode: "uk_us",
            uk: {
              id: stableIds(id, "uk_variant"),
              content_slot_id: content.regional_variants.uk.id,
              is_regular: true,
              pronunciations: []
            },
            us: {
              id: stableIds(id, "us_variant"),
              content_slot_id: content.regional_variants.us.id,
              is_regular: true,
              pronunciations: []
            }
          }
  });
  group.members.push({ id: newWordNodeId(), form_id: id });
  return replaceSharedContent(next, content, stableIds);
}

export function sharedContentForForm(
  forms: SharedFormsStepContentV3,
  formId: string
) {
  const binding = forms.pos
    .flatMap((pos) => pos.forms)
    .find((form) => form.id === formId);
  return binding
    ? forms.contents.find((content) => content.id === binding.content_id)
    : undefined;
}

export { expandFormContents, isSharedForms };
