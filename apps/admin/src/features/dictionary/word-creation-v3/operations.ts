import type {
  DraftFormsStepContentV3,
  PartOfSpeechCatalogItem,
  PronunciationStyle,
  TextOriginV3,
  WordConcreteFormV3,
  WordFormTypeV3,
  WordPronunciationV3
} from "@tsz/types";
import { newWordNodeId } from "../word-model/primitives";

export type V3IdFactory = () => string;

type OperationFailureReason =
  | "pos_not_found"
  | "duplicate_pos_code"
  | "group_not_found"
  | "form_not_found"
  | "membership_not_found"
  | "cross_pos_membership"
  | "duplicate_group_membership"
  | "explicit_mapping_required"
  | "wrong_regional_mode";

export type OperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: OperationFailureReason }
  | {
      ok: false;
      reason: "orphan_forms_require_explicit_group_deletion";
      form_ids: string[];
    }
  | {
      ok: false;
      reason: "orphan_forms_changed_since_confirmation";
      form_ids: string[];
    }
  | {
      ok: false;
      reason: "last_membership_requires_form_deletion";
      form_id: string;
    };

export interface PronunciationMapping {
  dict_phonetic: string;
  actual_pron: string;
  style?: PronunciationStyle;
}

export interface VariantMapping {
  spelling: string;
  origin: TextOriginV3;
  pronunciations: PronunciationMapping[];
}

export interface CommonToUkUsMapping {
  confirmed: boolean;
  uk: VariantMapping;
  us: VariantMapping;
}

export interface UkUsToCommonMapping {
  confirmed: boolean;
  common: VariantMapping;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEXT_ORIGINS = new Set<TextOriginV3>([
  "dictionary",
  "converted",
  "manual"
]);
const PRONUNCIATION_STYLES = new Set<PronunciationStyle>([
  "normal",
  "strong",
  "weak"
]);

function defaultIdFactory() {
  return newWordNodeId();
}

function nextUuid(factory: V3IdFactory, allocated: Set<string>): string {
  const id = factory();
  if (!UUID_PATTERN.test(id)) {
    throw new Error("UUID factory returned an invalid UUID");
  }
  if (allocated.has(id)) {
    throw new Error("UUID factory returned a duplicate UUID");
  }
  allocated.add(id);
  return id;
}

function clone(content: DraftFormsStepContentV3): DraftFormsStepContentV3 {
  return structuredClone(content);
}

function explicitMapping(value: unknown): value is VariantMapping {
  if (typeof value !== "object" || value === null) return false;
  const mapping = value as Partial<VariantMapping>;
  return (
    typeof mapping.spelling === "string" &&
    typeof mapping.origin === "string" &&
    TEXT_ORIGINS.has(mapping.origin as TextOriginV3) &&
    Array.isArray(mapping.pronunciations) &&
    mapping.pronunciations.every(
      (pronunciation) =>
        typeof pronunciation === "object" &&
        pronunciation !== null &&
        typeof pronunciation.dict_phonetic === "string" &&
        typeof pronunciation.actual_pron === "string" &&
        (pronunciation.style === undefined ||
          PRONUNCIATION_STYLES.has(pronunciation.style as PronunciationStyle))
    )
  );
}

function formNodeIds(form: WordConcreteFormV3): string[] {
  const variants =
    form.regional_variants.mode === "common"
      ? [form.regional_variants.common]
      : [form.regional_variants.uk, form.regional_variants.us];
  return [
    form.id,
    ...variants.flatMap((variant) => [
      variant.id,
      ...variant.pronunciations.map((pronunciation) => pronunciation.id)
    ])
  ];
}

function allNodeIds(content: DraftFormsStepContentV3): Set<string> {
  return new Set(
    content.pos.flatMap((pos) => [
      pos.pos_id,
      ...pos.forms.flatMap(formNodeIds),
      ...pos.form_groups.flatMap((group) => [
        group.id,
        ...group.members.map((member) => member.id)
      ])
    ])
  );
}

function mappedPronunciations(
  mapping: VariantMapping,
  factory: V3IdFactory,
  allocated: Set<string>
): WordPronunciationV3[] {
  return mapping.pronunciations.map((pronunciation) => ({
    id: nextUuid(factory, allocated),
    dict_phonetic: pronunciation.dict_phonetic,
    actual_pron: pronunciation.actual_pron,
    ...(pronunciation.style === undefined ? {} : { style: pronunciation.style })
  }));
}

/** Mode changes are destructive mappings, never implicit copy/side selection. */
export function convertCommonToUkUs(
  form: WordConcreteFormV3,
  mapping: CommonToUkUsMapping,
  idFactory: V3IdFactory = defaultIdFactory
): OperationResult<WordConcreteFormV3> {
  if (form.regional_variants.mode !== "common") {
    return { ok: false, reason: "wrong_regional_mode" };
  }
  if (
    mapping.confirmed !== true ||
    !explicitMapping(mapping.uk) ||
    !explicitMapping(mapping.us)
  ) {
    return { ok: false, reason: "explicit_mapping_required" };
  }
  const allocated = new Set<string>(formNodeIds(form));
  const ukId = nextUuid(idFactory, allocated);
  const ukPronunciations = mappedPronunciations(
    mapping.uk,
    idFactory,
    allocated
  );
  const usId = nextUuid(idFactory, allocated);
  const usPronunciations = mappedPronunciations(
    mapping.us,
    idFactory,
    allocated
  );
  return {
    ok: true,
    value: {
      id: form.id,
      form_type: form.form_type,
      regional_variants: {
        mode: "uk_us",
        uk: {
          id: ukId,
          dialect: "uk",
          spelling: mapping.uk.spelling,
          origin: mapping.uk.origin,
          pronunciations: ukPronunciations
        },
        us: {
          id: usId,
          dialect: "us",
          spelling: mapping.us.spelling,
          origin: mapping.us.origin,
          pronunciations: usPronunciations
        }
      }
    }
  };
}

export function convertUkUsToCommon(
  form: WordConcreteFormV3,
  mapping: UkUsToCommonMapping,
  idFactory: V3IdFactory = defaultIdFactory
): OperationResult<WordConcreteFormV3> {
  if (form.regional_variants.mode !== "uk_us") {
    return { ok: false, reason: "wrong_regional_mode" };
  }
  if (mapping.confirmed !== true || !explicitMapping(mapping.common)) {
    return { ok: false, reason: "explicit_mapping_required" };
  }
  const allocated = new Set<string>(formNodeIds(form));
  const commonId = nextUuid(idFactory, allocated);
  return {
    ok: true,
    value: {
      id: form.id,
      form_type: form.form_type,
      regional_variants: {
        mode: "common",
        common: {
          id: commonId,
          dialect: "common",
          spelling: mapping.common.spelling,
          origin: mapping.common.origin,
          pronunciations: mappedPronunciations(
            mapping.common,
            idFactory,
            allocated
          )
        }
      }
    }
  };
}

export function updateVariantSpelling(
  content: DraftFormsStepContentV3,
  variantId: string,
  spelling: string
): DraftFormsStepContentV3 {
  const next = clone(content);
  for (const pos of next.pos) {
    for (const form of pos.forms) {
      const variants =
        form.regional_variants.mode === "common"
          ? [form.regional_variants.common]
          : [form.regional_variants.uk, form.regional_variants.us];
      const variant = variants.find((item) => item.id === variantId);
      if (variant) {
        variant.spelling = spelling;
        return next;
      }
    }
  }
  throw new Error(`variant not found: ${variantId}`);
}

export function updatePronunciation(
  content: DraftFormsStepContentV3,
  pronunciationId: string,
  patch: Partial<Omit<WordPronunciationV3, "id">>
): DraftFormsStepContentV3 {
  const next = clone(content);
  for (const pos of next.pos) {
    for (const form of pos.forms) {
      const variants =
        form.regional_variants.mode === "common"
          ? [form.regional_variants.common]
          : [form.regional_variants.uk, form.regional_variants.us];
      for (const variant of variants) {
        const pronunciation = variant.pronunciations.find(
          (item) => item.id === pronunciationId
        );
        if (pronunciation) {
          Object.assign(pronunciation, patch, { id: pronunciation.id });
          return next;
        }
      }
    }
  }
  throw new Error(`pronunciation not found: ${pronunciationId}`);
}

export function addPartOfSpeech(
  content: DraftFormsStepContentV3,
  catalogItem: PartOfSpeechCatalogItem,
  idFactory: V3IdFactory = defaultIdFactory
): OperationResult<DraftFormsStepContentV3> {
  if (content.pos.some((item) => item.pos === catalogItem.code)) {
    return { ok: false, reason: "duplicate_pos_code" };
  }
  const posId = nextUuid(idFactory, allNodeIds(content));
  const next = clone(content);
  next.pos.push({
    pos_id: posId,
    pos: catalogItem.code,
    forms: [],
    form_groups: []
  });
  return { ok: true, value: next };
}

export function deletePartOfSpeech(
  content: DraftFormsStepContentV3,
  posId: string
): OperationResult<DraftFormsStepContentV3> {
  if (!content.pos.some((item) => item.pos_id === posId)) {
    return { ok: false, reason: "pos_not_found" };
  }
  const next = clone(content);
  next.pos = next.pos.filter((item) => item.pos_id !== posId);
  return { ok: true, value: next };
}

export function addFormGroup(
  content: DraftFormsStepContentV3,
  posId: string,
  idFactory: V3IdFactory = defaultIdFactory
): OperationResult<DraftFormsStepContentV3> {
  if (!content.pos.some((item) => item.pos_id === posId)) {
    return { ok: false, reason: "pos_not_found" };
  }
  const groupId = nextUuid(idFactory, allNodeIds(content));
  const next = clone(content);
  next.pos
    .find((item) => item.pos_id === posId)!
    .form_groups.push({
      id: groupId,
      is_regular: false,
      members: []
    });
  return { ok: true, value: next };
}

export function deleteFormGroup(
  content: DraftFormsStepContentV3,
  posId: string,
  groupId: string
): OperationResult<DraftFormsStepContentV3> {
  const pos = content.pos.find((item) => item.pos_id === posId);
  if (!pos) return { ok: false, reason: "pos_not_found" };
  const group = pos.form_groups.find((item) => item.id === groupId);
  if (!group) return { ok: false, reason: "group_not_found" };

  const removedFormIds = new Set(group.members.map((member) => member.form_id));
  const stillReferenced = new Set(
    pos.form_groups
      .filter((item) => item.id !== groupId)
      .flatMap((item) => item.members.map((member) => member.form_id))
  );
  const orphanFormIds = pos.forms
    .filter(
      (form) => removedFormIds.has(form.id) && !stillReferenced.has(form.id)
    )
    .map((form) => form.id)
    .sort();
  if (orphanFormIds.length > 0) {
    return {
      ok: false,
      reason: "orphan_forms_require_explicit_group_deletion",
      form_ids: orphanFormIds
    };
  }

  const next = clone(content);
  const target = next.pos.find((item) => item.pos_id === posId)!;
  target.form_groups = target.form_groups.filter((item) => item.id !== groupId);
  return { ok: true, value: next };
}

export function deleteGroupAndOrphanForms(
  content: DraftFormsStepContentV3,
  posId: string,
  groupId: string,
  expectedOrphanFormIds: readonly string[]
): OperationResult<DraftFormsStepContentV3> {
  const pos = content.pos.find((item) => item.pos_id === posId);
  if (!pos) return { ok: false, reason: "pos_not_found" };
  const group = pos.form_groups.find((item) => item.id === groupId);
  if (!group) return { ok: false, reason: "group_not_found" };

  const removedFormIds = new Set(group.members.map((member) => member.form_id));
  const stillReferenced = new Set(
    pos.form_groups
      .filter((item) => item.id !== groupId)
      .flatMap((item) => item.members.map((member) => member.form_id))
  );
  const orphanFormIds = pos.forms
    .filter(
      (form) => removedFormIds.has(form.id) && !stillReferenced.has(form.id)
    )
    .map((form) => form.id)
    .sort();
  const expected = [...expectedOrphanFormIds].sort();
  if (
    orphanFormIds.length !== expected.length ||
    orphanFormIds.some((formId, index) => formId !== expected[index])
  ) {
    return {
      ok: false,
      reason: "orphan_forms_changed_since_confirmation",
      form_ids: orphanFormIds
    };
  }
  const orphanFormIdSet = new Set(orphanFormIds);
  const next = clone(content);
  const target = next.pos.find((item) => item.pos_id === posId)!;
  target.form_groups = target.form_groups.filter((item) => item.id !== groupId);
  target.forms = target.forms.filter((form) => !orphanFormIdSet.has(form.id));
  return { ok: true, value: next };
}

export function addConcreteForm(
  content: DraftFormsStepContentV3,
  posId: string,
  groupId: string,
  formType: WordFormTypeV3,
  idFactory: V3IdFactory = defaultIdFactory
): OperationResult<DraftFormsStepContentV3> {
  const pos = content.pos.find((item) => item.pos_id === posId);
  if (!pos) return { ok: false, reason: "pos_not_found" };
  if (!pos.form_groups.some((item) => item.id === groupId)) {
    return { ok: false, reason: "group_not_found" };
  }

  const allocated = allNodeIds(content);
  const formId = nextUuid(idFactory, allocated);
  const variantId = nextUuid(idFactory, allocated);
  const membershipId = nextUuid(idFactory, allocated);
  const next = clone(content);
  const target = next.pos.find((item) => item.pos_id === posId)!;
  target.forms.push({
    id: formId,
    form_type: formType,
    regional_variants: {
      mode: "common",
      common: {
        id: variantId,
        dialect: "common",
        spelling: "",
        origin: "manual",
        pronunciations: []
      }
    }
  });
  target.form_groups
    .find((item) => item.id === groupId)!
    .members.push({ id: membershipId, form_id: formId });
  return { ok: true, value: next };
}

export function addMembership(
  content: DraftFormsStepContentV3,
  posId: string,
  groupId: string,
  formId: string,
  idFactory: V3IdFactory = defaultIdFactory
): OperationResult<DraftFormsStepContentV3> {
  const pos = content.pos.find((item) => item.pos_id === posId);
  if (!pos) return { ok: false, reason: "pos_not_found" };
  const group = pos.form_groups.find((item) => item.id === groupId);
  if (!group) return { ok: false, reason: "group_not_found" };
  const owner = content.pos.find((item) =>
    item.forms.some((form) => form.id === formId)
  );
  if (!owner) return { ok: false, reason: "form_not_found" };
  if (owner.pos_id !== posId) {
    return { ok: false, reason: "cross_pos_membership" };
  }
  if (group.members.some((member) => member.form_id === formId)) {
    return { ok: false, reason: "duplicate_group_membership" };
  }
  const allocated = allNodeIds(content);
  const membershipId = nextUuid(idFactory, allocated);
  const next = clone(content);
  next.pos
    .find((item) => item.pos_id === posId)!
    .form_groups.find((item) => item.id === groupId)!
    .members.push({ id: membershipId, form_id: formId });
  return { ok: true, value: next };
}

export function removeMembership(
  content: DraftFormsStepContentV3,
  membershipId: string
): OperationResult<DraftFormsStepContentV3> {
  let formId: string | undefined;
  for (const pos of content.pos) {
    for (const group of pos.form_groups) {
      const member = group.members.find((item) => item.id === membershipId);
      if (member) formId = member.form_id;
    }
  }
  if (!formId) return { ok: false, reason: "membership_not_found" };
  const referenceCount = content.pos.reduce(
    (total, pos) =>
      total +
      pos.form_groups.reduce(
        (subtotal, group) =>
          subtotal +
          group.members.filter((item) => item.form_id === formId).length,
        0
      ),
    0
  );
  if (referenceCount <= 1) {
    return {
      ok: false,
      reason: "last_membership_requires_form_deletion",
      form_id: formId
    };
  }
  const next = clone(content);
  for (const pos of next.pos) {
    for (const group of pos.form_groups) {
      group.members = group.members.filter((item) => item.id !== membershipId);
    }
  }
  return { ok: true, value: next };
}

export function deleteConcreteForm(
  content: DraftFormsStepContentV3,
  posId: string,
  formId: string
): OperationResult<DraftFormsStepContentV3> {
  const pos = content.pos.find((item) => item.pos_id === posId);
  if (!pos) return { ok: false, reason: "pos_not_found" };
  if (!pos.forms.some((form) => form.id === formId)) {
    return { ok: false, reason: "form_not_found" };
  }
  const next = clone(content);
  const target = next.pos.find((item) => item.pos_id === posId)!;
  target.forms = target.forms.filter((form) => form.id !== formId);
  for (const item of next.pos) {
    for (const group of item.form_groups) {
      group.members = group.members.filter(
        (member) => member.form_id !== formId
      );
    }
  }
  return { ok: true, value: next };
}

export function moveMembership(
  content: DraftFormsStepContentV3,
  membershipId: string,
  targetGroupId: string,
  targetIndex: number,
  idFactory: V3IdFactory = defaultIdFactory
): OperationResult<DraftFormsStepContentV3> {
  let sourcePosId: string | undefined;
  let formId: string | undefined;
  for (const pos of content.pos) {
    for (const group of pos.form_groups) {
      const member = group.members.find((item) => item.id === membershipId);
      if (member) {
        sourcePosId = pos.pos_id;
        formId = member.form_id;
      }
    }
  }
  if (!sourcePosId || !formId) {
    return { ok: false, reason: "membership_not_found" };
  }
  const targetPos = content.pos.find((pos) =>
    pos.form_groups.some((group) => group.id === targetGroupId)
  );
  if (!targetPos) return { ok: false, reason: "group_not_found" };
  if (targetPos.pos_id !== sourcePosId) {
    return { ok: false, reason: "cross_pos_membership" };
  }
  const targetGroup = targetPos.form_groups.find(
    (group) => group.id === targetGroupId
  )!;
  if (targetGroup.members.some((member) => member.form_id === formId)) {
    return { ok: false, reason: "duplicate_group_membership" };
  }
  const allocated = allNodeIds(content);
  const newMembershipId = nextUuid(idFactory, allocated);
  const next = clone(content);
  for (const pos of next.pos) {
    for (const group of pos.form_groups) {
      group.members = group.members.filter(
        (member) => member.id !== membershipId
      );
    }
  }
  const nextTarget = next.pos
    .find((pos) => pos.pos_id === sourcePosId)!
    .form_groups.find((group) => group.id === targetGroupId)!;
  const index = Math.max(0, Math.min(targetIndex, nextTarget.members.length));
  nextTarget.members.splice(index, 0, {
    id: newMembershipId,
    form_id: formId
  });
  return { ok: true, value: next };
}

function reorderByIds<T extends { id: string }>(
  values: T[],
  orderedIds: readonly string[],
  label: string
): T[] {
  if (
    values.length !== orderedIds.length ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    throw new Error(`${label} order must contain every ID exactly once`);
  }
  const byId = new Map(values.map((value) => [value.id, value]));
  const ordered = orderedIds.map((id) => byId.get(id));
  if (ordered.some((value) => value === undefined)) {
    throw new Error(`${label} order contains an unknown ID`);
  }
  return ordered as T[];
}

export function reorderForms(
  content: DraftFormsStepContentV3,
  posId: string,
  orderedIds: readonly string[]
): DraftFormsStepContentV3 {
  const next = clone(content);
  const pos = next.pos.find((item) => item.pos_id === posId);
  if (!pos) throw new Error(`pos not found: ${posId}`);
  pos.forms = reorderByIds(pos.forms, orderedIds, "form");
  return next;
}

export function reorderFormGroups(
  content: DraftFormsStepContentV3,
  posId: string,
  orderedIds: readonly string[]
): DraftFormsStepContentV3 {
  const next = clone(content);
  const pos = next.pos.find((item) => item.pos_id === posId);
  if (!pos) throw new Error(`pos not found: ${posId}`);
  pos.form_groups = reorderByIds(pos.form_groups, orderedIds, "form group");
  return next;
}

export function reorderMemberships(
  content: DraftFormsStepContentV3,
  groupId: string,
  orderedIds: readonly string[]
): DraftFormsStepContentV3 {
  const next = clone(content);
  const group = next.pos
    .flatMap((pos) => pos.form_groups)
    .find((item) => item.id === groupId);
  if (!group) throw new Error(`group not found: ${groupId}`);
  group.members = reorderByIds(group.members, orderedIds, "membership");
  return next;
}

export function reorderPronunciations(
  content: DraftFormsStepContentV3,
  variantId: string,
  orderedIds: readonly string[]
): DraftFormsStepContentV3 {
  const next = clone(content);
  for (const pos of next.pos) {
    for (const form of pos.forms) {
      const variants =
        form.regional_variants.mode === "common"
          ? [form.regional_variants.common]
          : [form.regional_variants.uk, form.regional_variants.us];
      const variant = variants.find((item) => item.id === variantId);
      if (variant) {
        variant.pronunciations = reorderByIds(
          variant.pronunciations,
          orderedIds,
          "pronunciation"
        );
        return next;
      }
    }
  }
  throw new Error(`variant not found: ${variantId}`);
}
