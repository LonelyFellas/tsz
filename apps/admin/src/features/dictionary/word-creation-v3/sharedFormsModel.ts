import { LocalLexiconError } from "../i18n/local-error-messages";
import { regionalVariants, primaryRegionalVariant } from "@tsz/shared";
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
        : source.mode === "uk_us_many"
          ? {
              mode: "uk_us_many",
              uk: source.uk.map(contentVariant),
              us: source.us.map(contentVariant)
            }
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
  } else if (source.mode === "uk_us_many" && target.mode === "uk_us_many") {
    regional_bindings = {
      mode: "uk_us_many",
      uk: source.uk.map((row, index) => variant(row, target.uk[index]!)),
      us: source.us.map((row, index) => variant(row, target.us[index]!))
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
        } else if (
          bindings.mode === "uk_us_many" &&
          projected.mode === "uk_us_many"
        ) {
          for (const reference of regionalVariants(bindings)) {
            const row = regionalVariants(projected).find(
              (row) => row.id === reference.id
            );
            if (row) update(reference, row);
          }
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
              regions.mode === "uk_us_many"
                ? {
                    mode: "uk_us_many",
                    uk: regions.uk.map((row) => ({
                      ...structuredClone(row),
                      dialect: "uk" as const,
                      is_regular: true
                    })),
                    us: regions.us.map((row) => ({
                      ...structuredClone(row),
                      dialect: "us" as const,
                      is_regular: true
                    }))
                  }
                : regions.mode === "common"
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
        : source.mode === "uk_us_many"
          ? {
              mode: "uk_us_many",
              uk: source.uk.map(value),
              us: source.us.map(value)
            }
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
    : [
        ["uk", primaryRegionalVariant(original, "uk")] as const,
        ["us", primaryRegionalVariant(original, "us")] as const
      ])
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
    preference: "uk" | "us",
    spellingSource?: "uk" | "us"
  ) => {
    const source = editor.pos[0]!.forms[0]!.regional_variants;
    if (source.mode === "uk_us_many") {
      if (
        rules.spelling_mode === "distinguish" &&
        rules.phonetic_mode === "distinguish"
      )
        return { ok: true as const, value: editor };
      if (source.uk.length !== 1 || source.us.length !== 1)
        return {
          ok: false as const,
          reason: "spelling_merge_required" as const
        };
      editor = structuredClone(editor);
      editor.pos[0]!.forms[0]!.regional_variants = {
        mode: "uk_us",
        uk: source.uk[0]!,
        us: source.us[0]!
      };
    }
    if (rules.spelling_mode === "unified" && spellingSource) {
      editor = structuredClone(editor);
      const variants = editor.pos[0]!.forms[0]!.regional_variants;
      if (variants.mode === "uk_us") {
        const selected = variants[spellingSource];
        const target = variants[spellingSource === "uk" ? "us" : "uk"];
        target.spelling = selected.spelling;
        for (const field of ["spelling_rich", "spelling_speech"] as const) {
          delete target[field];
          if (selected[field] !== undefined)
            Object.assign(target, {
              [field]: structuredClone(selected[field])
            });
        }
      }
    }
    const result = normalizeGroupDialectRules(
      editor,
      content.id,
      content.id,
      rules,
      spellingSource ?? preference,
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
  forms: FormsStepRepresentationV3,
  retiredNodes: readonly RetiredStableNodeV3[] = []
) {
  const ids = new Map<string, string>();
  const seed = (
    current: FormsStepRepresentationV3,
    retired: readonly RetiredStableNodeV3[] = []
  ) => {
    for (const node of retired) {
      if (
        [
          "pronunciation",
          "uk_variant",
          "us_variant",
          "common_variant"
        ].includes(node.node_role) &&
        node.parent_node_id &&
        node.content_slot_id
      )
        ids.set(`${node.parent_node_id}:${node.content_slot_id}`, node.id);
    }
    if (!isSharedForms(current)) return;
    for (const pos of current.pos)
      for (const form of pos.forms) {
        const refs = form.regional_bindings;
        for (const variant of regionalVariants(refs)) {
          ids.set(`${form.id}:${variant.content_slot_id}`, variant.id);
          for (const row of variant.pronunciations)
            ids.set(`${variant.id}:${row.content_slot_id}`, row.id);
        }
      }
  };
  seed(forms, retiredNodes);
  const factory = (variantId: string, slotId: string) => {
    const key = `${variantId}:${slotId}`;
    const id = ids.get(key) ?? newWordNodeId();
    ids.set(key, id);
    return id;
  };
  factory.seed = seed;
  factory.existing = (parentId: string, slotId: string) =>
    ids.get(`${parentId}:${slotId}`);
  return factory;
}

export function replaceSharedContent(
  forms: SharedFormsStepContentV3,
  content: FormContentV3,
  stableIds: V3StableVariantIdFactory,
  pronunciationIds = createPronunciationReferenceIds(forms)
): SharedFormsStepContentV3 {
  return replaceSharedContentInPlace(
    structuredClone(forms),
    content,
    stableIds,
    pronunciationIds
  );
}

function replaceSharedContentInPlace(
  next: SharedFormsStepContentV3,
  content: FormContentV3,
  stableIds: V3StableVariantIdFactory,
  pronunciationIds: ReturnType<typeof createPronunciationReferenceIds>
): SharedFormsStepContentV3 {
  const index = next.contents.findIndex((row) => row.id === content.id);
  if (index < 0) throw new Error("Shared content no longer exists");
  for (const pos of next.pos)
    for (const binding of pos.forms) {
      if (binding.content_id !== content.id) continue;
      const old = binding.regional_bindings;
      const variants = regionalVariants(old);
      if (
        (old.mode === "common") !==
          (content.regional_variants.mode === "common") &&
        variants.some((row) => row.component_usages?.length)
      )
        throw new LocalLexiconError("local_legacy_components_region");
      if (old.mode === "uk_us" && content.regional_variants.mode === "common") {
        if (old.uk.is_regular !== old.us.is_regular)
          throw new LocalLexiconError("local_unify_regular");
        const values = (row: FormVariantBindingV3) =>
          JSON.stringify(
            (row.component_usages ?? []).map(({ id, ...value }) => {
              void id;
              return value;
            })
          );
        if (values(old.uk) !== values(old.us))
          throw new LocalLexiconError("local_unify_components");
      }
      if (content.regional_variants.mode === "uk_us_many") {
        const slots = new Set(
          regionalVariants(content.regional_variants).map((row) => row.id)
        );
        if (
          variants.some(
            (row) =>
              row.component_usages?.length && !slots.has(row.content_slot_id)
          )
        )
          throw new LocalLexiconError("local_legacy_components_remove");
      }
      const reference = (
        slot: FormContentVariantV3,
        dialect: "common" | "uk" | "us",
        multiple = false
      ): FormVariantBindingV3 => {
        const previous =
          variants.find((row) => row.content_slot_id === slot.id) ??
          (multiple
            ? undefined
            : old.mode === "common"
              ? dialect === "common"
                ? old.common
                : undefined
              : dialect === "common"
                ? undefined
                : old.mode === "uk_us"
                  ? old[dialect]
                  : undefined);
        const source =
          previous ??
          primaryRegionalVariant(old, dialect === "us" ? "us" : "uk");
        const mappings = new Map(
          previous?.pronunciations.map((row) => [row.content_slot_id, row.id])
        );
        const variantId =
          previous?.id ??
          pronunciationIds.existing(binding.id, slot.id) ??
          (multiple
            ? pronunciationIds(binding.id, slot.id)
            : stableIds(binding.id, `${dialect}_variant`));
        return {
          id: variantId,
          content_slot_id: slot.id,
          is_regular: source.is_regular,
          ...(source.component_usages === undefined || (multiple && !previous)
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
          : regions.mode === "uk_us_many"
            ? {
                mode: "uk_us_many",
                uk: regions.uk.map((row) => reference(row, "uk", true)),
                us: regions.us.map((row) => reference(row, "us", true))
              }
            : {
                mode: "uk_us",
                uk: reference(regions.uk, "uk"),
                us: reference(regions.us, "us")
              };
    }
  next.contents[index] = content;
  return next;
}

export function assignSharedFormContent(
  forms: SharedFormsStepContentV3,
  contentId: string,
  formId: string,
  stableIds: V3StableVariantIdFactory,
  pronunciationIds = createPronunciationReferenceIds(forms)
): SharedFormsStepContentV3 {
  const next = structuredClone(forms);
  const binding = next.pos
    .flatMap((pos) => pos.forms)
    .find((row) => row.id === formId);
  const content = next.contents.find((row) => row.id === contentId);
  if (!binding || !content) throw new LocalLexiconError("local_form_missing");
  const pos = next.pos.find((row) => row.forms.includes(binding))!;
  const group = pos.form_groups.find((row) =>
    row.members.some((member) => member.form_id === formId)
  )!;
  if (
    group.members.some((member) =>
      pos.forms.some(
        (row) =>
          row.id === member.form_id &&
          row.id !== formId &&
          row.form_type === binding.form_type &&
          row.content_id === contentId
      )
    )
  ) {
    throw new LocalLexiconError("local_duplicate_assignment");
  }
  binding.content_id = contentId;
  const updated = replaceSharedContentInPlace(
    next,
    content,
    stableIds,
    pronunciationIds
  );
  const used = new Set(
    updated.pos.flatMap((pos) => pos.forms.map((row) => row.content_id))
  );
  updated.contents = updated.contents.filter((row) => used.has(row.id));
  return updated;
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
