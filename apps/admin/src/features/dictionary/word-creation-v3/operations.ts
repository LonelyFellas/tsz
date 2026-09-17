import type {
  PronunciationStyle,
  DialectRulesV3,
  DraftFormsStepContentV3,
  FormGroupScopeV3,
  PartOfSpeechCatalogItem,
  PhraseComponentUsageV3,
  RetiredStableNodeV3,
  TextOriginV3,
  WordCommonFormVariantV3,
  WordConcreteFormV3,
  WordFormTypeV3,
  WordPronunciationV3,
  WordUkFormVariantV3,
  WordUsFormVariantV3
} from "@tsz/types";
import { variantRegularity } from "./model";
import { newWordNodeId } from "../word-model/primitives";

export type V3IdFactory = () => string;
export type V3StableVariantRole =
  "common_variant" | "uk_variant" | "us_variant";
export type V3StableVariantIdFactory = ((
  formId: string,
  role: V3StableVariantRole
) => string) & {
  seed: (
    content: DraftFormsStepContentV3,
    retiredNodes: readonly RetiredStableNodeV3[]
  ) => void;
};

type OperationFailureReason =
  | "pos_not_found"
  | "duplicate_pos_code"
  | "group_not_found"
  | "form_not_found"
  | "membership_not_found"
  | "explicit_mapping_required"
  | "invalid_dialect_rules"
  | "regularity_merge_required"
  | "component_merge_required"
  | "pronunciation_merge_required"
  | "last_form_required"
  | "last_pos_required"
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
    };

export type PronunciationMapping = Omit<WordPronunciationV3, "id">;

export interface VariantMapping {
  is_regular?: boolean;
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

function clone<T>(content: T): T {
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
      ...variant.pronunciations.map((pronunciation) => pronunciation.id),
      ...(variant.component_usages ?? []).map((component) => component.id)
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

export function createStableVariantIdFactory(
  content: DraftFormsStepContentV3,
  retiredNodes: readonly RetiredStableNodeV3[],
  fallback: V3IdFactory = defaultIdFactory
): V3StableVariantIdFactory {
  const ids = new Map<string, string>();
  const key = (formId: string, role: V3StableVariantRole) =>
    `${formId}:${role}`;
  const seed = (
    seedContent: DraftFormsStepContentV3,
    seedRetiredNodes: readonly RetiredStableNodeV3[]
  ) => {
    for (const pos of seedContent.pos) {
      for (const form of pos.forms) {
        if (form.regional_variants.mode === "common") {
          ids.set(
            key(form.id, "common_variant"),
            form.regional_variants.common.id
          );
        } else {
          ids.set(key(form.id, "uk_variant"), form.regional_variants.uk.id);
          ids.set(key(form.id, "us_variant"), form.regional_variants.us.id);
        }
      }
    }
    for (const node of seedRetiredNodes) {
      if (
        !node.parent_node_id ||
        (node.node_role !== "common_variant" &&
          node.node_role !== "uk_variant" &&
          node.node_role !== "us_variant")
      ) {
        continue;
      }
      const slot = key(node.parent_node_id, node.node_role);
      if (!ids.has(slot)) ids.set(slot, node.id);
    }
  };
  seed(content, retiredNodes);
  const factory = ((formId: string, role: V3StableVariantRole) => {
    const slot = key(formId, role);
    const existing = ids.get(slot);
    if (existing) return existing;
    const id = fallback();
    ids.set(slot, id);
    return id;
  }) as V3StableVariantIdFactory;
  factory.seed = seed;
  return factory;
}

function mappedPronunciations(
  mapping: VariantMapping,
  factory: V3IdFactory,
  allocated: Set<string>
): WordPronunciationV3[] {
  return mapping.pronunciations.map((pronunciation) => ({
    ...structuredClone(pronunciation),
    id: nextUuid(factory, allocated),
    dict_phonetic: pronunciation.dict_phonetic,
    actual_pron: pronunciation.actual_pron,
    ...(pronunciation.style === undefined ? {} : { style: pronunciation.style })
  }));
}

function clonedComponentUsages(
  values: readonly PhraseComponentUsageV3[],
  factory: V3IdFactory,
  allocated: Set<string>
): PhraseComponentUsageV3[] {
  return values.map((component) => ({
    ...structuredClone(component),
    id: nextUuid(factory, allocated)
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
  const sourceComponents = form.regional_variants.common.component_usages ?? [];
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
          is_regular:
            mapping.uk.is_regular ??
            form.regional_variants.common.is_regular ??
            true,
          origin: mapping.uk.origin,
          pronunciations: ukPronunciations,
          component_usages: clonedComponentUsages(
            sourceComponents,
            idFactory,
            allocated
          )
        },
        us: {
          id: usId,
          dialect: "us",
          spelling: mapping.us.spelling,
          is_regular:
            mapping.us.is_regular ??
            form.regional_variants.common.is_regular ??
            true,
          origin: mapping.us.origin,
          pronunciations: usPronunciations,
          component_usages: clonedComponentUsages(
            sourceComponents,
            idFactory,
            allocated
          )
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
  if (
    (form.regional_variants.uk.is_regular ?? true) !==
    (form.regional_variants.us.is_regular ?? true)
  ) {
    return { ok: false, reason: "regularity_merge_required" };
  }
  const ukComponents = form.regional_variants.uk.component_usages ?? [];
  const usComponents = form.regional_variants.us.component_usages ?? [];
  // 拆分会分配独立节点 ID；只有实际配置不同才需要管理员取舍。
  const componentValues = (values: readonly PhraseComponentUsageV3[]) =>
    JSON.stringify(
      values.map((value) =>
        Object.entries(value)
          .filter(([key]) => key !== "id")
          .sort(([left], [right]) => left.localeCompare(right))
      )
    );
  if (componentValues(ukComponents) !== componentValues(usComponents)) {
    return { ok: false, reason: "component_merge_required" };
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
          is_regular:
            mapping.common.is_regular ??
            form.regional_variants.uk.is_regular ??
            true,
          origin: mapping.common.origin,
          pronunciations: mappedPronunciations(
            mapping.common,
            idFactory,
            allocated
          ),
          component_usages: clonedComponentUsages(
            ukComponents,
            idFactory,
            allocated
          )
        }
      }
    }
  };
}

function validDialectRules(rules: DialectRulesV3) {
  return !(
    rules.spelling_mode === "distinguish" &&
    rules.phonetic_mode !== "distinguish"
  );
}

export function updateGroupDialectRules(
  content: DraftFormsStepContentV3,
  posId: string,
  groupId: string,
  rules: DialectRulesV3
): OperationResult<DraftFormsStepContentV3> {
  if (!validDialectRules(rules)) {
    return { ok: false, reason: "invalid_dialect_rules" };
  }
  const next = clone(content);
  const pos = next.pos.find((item) => item.pos_id === posId);
  if (!pos) return { ok: false, reason: "pos_not_found" };
  const group = pos.form_groups.find((item) => item.id === groupId);
  if (!group) return { ok: false, reason: "group_not_found" };
  group.dialect_rules = { ...rules };
  return { ok: true, value: next };
}

/** 只改标记；专用组改回通用时已绑定的词义不在本地清除，交给保存时的影响预览确认。 */
export function updateFormGroupScope(
  content: DraftFormsStepContentV3,
  posId: string,
  groupId: string,
  scope: FormGroupScopeV3
): OperationResult<DraftFormsStepContentV3> {
  const next = clone(content);
  const pos = next.pos.find((item) => item.pos_id === posId);
  if (!pos) return { ok: false, reason: "pos_not_found" };
  const group = pos.form_groups.find((item) => item.id === groupId);
  if (!group) return { ok: false, reason: "group_not_found" };
  group.scope = scope;
  return { ok: true, value: next };
}

function variantMappingFrom(
  variant:
    | Extract<
        WordConcreteFormV3["regional_variants"],
        { mode: "common" }
      >["common"]
    | Extract<WordConcreteFormV3["regional_variants"], { mode: "uk_us" }>["uk"]
    | Extract<WordConcreteFormV3["regional_variants"], { mode: "uk_us" }>["us"]
): VariantMapping {
  return {
    spelling: variant.spelling,
    is_regular: variant.is_regular,
    origin: variant.origin,
    pronunciations: variant.pronunciations.map((pronunciation) => ({
      ...(pronunciation.dict_phonetic_rich === undefined
        ? {}
        : {
            dict_phonetic_rich: structuredClone(
              pronunciation.dict_phonetic_rich
            )
          }),
      ...(pronunciation.synthesis === undefined
        ? {}
        : { synthesis: structuredClone(pronunciation.synthesis) }),
      ...(pronunciation.voice_profile === undefined
        ? {}
        : { voice_profile: structuredClone(pronunciation.voice_profile) }),
      ...(pronunciation.audio_assets === undefined
        ? {}
        : { audio_assets: structuredClone(pronunciation.audio_assets) }),
      ...(pronunciation.actual_pron_rich === undefined
        ? {}
        : {
            actual_pron_rich: structuredClone(pronunciation.actual_pron_rich)
          }),
      dict_phonetic: pronunciation.dict_phonetic,
      actual_pron: pronunciation.actual_pron,
      ...(pronunciation.style === undefined
        ? {}
        : { style: pronunciation.style })
    }))
  };
}

/** 英美规则按组生效：只转换本组成员词形，同词性其他组的词形与规则原样保留。 */
export function normalizeGroupDialectRules(
  content: DraftFormsStepContentV3,
  posId: string,
  groupId: string,
  rules: DialectRulesV3,
  preferredDialect: "uk" | "us" = "us",
  idFactory: V3IdFactory = defaultIdFactory,
  stableVariantIds?: V3StableVariantIdFactory
): OperationResult<DraftFormsStepContentV3> {
  if (!validDialectRules(rules)) {
    return { ok: false, reason: "invalid_dialect_rules" };
  }
  const next = clone(content);
  const pos = next.pos.find((item) => item.pos_id === posId);
  if (!pos) return { ok: false, reason: "pos_not_found" };
  const group = pos.form_groups.find((item) => item.id === groupId);
  if (!group) return { ok: false, reason: "group_not_found" };
  const memberFormIds = new Set(group.members.map((member) => member.form_id));
  const allocated = allNodeIds(next);
  const batchIdFactory = () => nextUuid(idFactory, allocated);
  const stableVariantId = (formId: string, role: V3StableVariantRole) => {
    if (!stableVariantIds) return batchIdFactory();
    const id = stableVariantIds(formId, role);
    if (!UUID_PATTERN.test(id)) {
      throw new Error("stable variant ID factory returned an invalid UUID");
    }
    if (allocated.has(id)) {
      throw new Error("stable variant ID factory returned a duplicate UUID");
    }
    allocated.add(id);
    return id;
  };

  for (let index = 0; index < pos.forms.length; index += 1) {
    const form = pos.forms[index]!;
    if (!memberFormIds.has(form.id)) continue;
    const variants =
      form.regional_variants.mode === "common"
        ? [form.regional_variants.common]
        : [form.regional_variants.uk, form.regional_variants.us];
    for (const variant of variants) {
      variant.is_regular = variantRegularity(content, form.id, variant);
    }
    if (
      rules.spelling_mode === "unified" &&
      form.regional_variants.mode === "uk_us" &&
      form.regional_variants.uk.is_regular !==
        form.regional_variants.us.is_regular
    ) {
      return { ok: false, reason: "regularity_merge_required" };
    }
    if (
      rules.spelling_mode === "unified" &&
      rules.phonetic_mode === "unified"
    ) {
      if (form.regional_variants.mode === "common") continue;
      if (
        JSON.stringify(
          variantMappingFrom(form.regional_variants.uk).pronunciations
        ) !==
        JSON.stringify(
          variantMappingFrom(form.regional_variants.us).pronunciations
        )
      ) {
        return { ok: false, reason: "pronunciation_merge_required" };
      }
      const source = form.regional_variants[preferredDialect];
      let mergeIdIndex = 0;
      const converted = convertUkUsToCommon(
        form,
        { confirmed: true, common: variantMappingFrom(source) },
        () =>
          mergeIdIndex++ === 0
            ? stableVariantId(form.id, "common_variant")
            : batchIdFactory()
      );
      if (!converted.ok) return converted;
      pos.forms[index] = converted.value;
      continue;
    }

    if (form.regional_variants.mode === "common") {
      const source = variantMappingFrom(form.regional_variants.common);
      const pronunciationCount = source.pronunciations.length;
      let splitIdIndex = 0;
      const converted = convertCommonToUkUs(
        form,
        { confirmed: true, uk: source, us: source },
        () => {
          const currentIndex = splitIdIndex++;
          if (currentIndex === 0) {
            return stableVariantId(form.id, "uk_variant");
          }
          if (currentIndex === pronunciationCount + 1) {
            return stableVariantId(form.id, "us_variant");
          }
          return batchIdFactory();
        }
      );
      if (!converted.ok) return converted;
      pos.forms[index] = converted.value;
      continue;
    }

    if (rules.spelling_mode === "unified") {
      const spelling = form.regional_variants[preferredDialect].spelling;
      const converted = unifyUkUsSpelling(form, spelling);
      if (!converted.ok) return converted;
      pos.forms[index] = converted.value;
    }
  }

  group.dialect_rules = { ...rules };
  return { ok: true, value: next };
}

export function unifyUkUsSpelling(
  form: WordConcreteFormV3,
  spelling: string
): OperationResult<WordConcreteFormV3> {
  if (form.regional_variants.mode !== "uk_us") {
    return { ok: false, reason: "wrong_regional_mode" };
  }
  const regionalVariants = clone(form.regional_variants);
  regionalVariants.uk.spelling = spelling;
  regionalVariants.uk.origin = "manual";
  regionalVariants.us.spelling = spelling;
  regionalVariants.us.origin = "manual";
  return {
    ok: true,
    value: { ...form, regional_variants: regionalVariants }
  };
}

/** 在草稿副本里定位变体并就地改写；找不到抛错，与其余写操作的约定一致。 */
function mutateVariant(
  content: DraftFormsStepContentV3,
  variantId: string,
  mutate: (
    variant: WordCommonFormVariantV3 | WordUkFormVariantV3 | WordUsFormVariantV3
  ) => void
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
        mutate(variant);
        return next;
      }
    }
  }
  throw new Error(`variant not found: ${variantId}`);
}

export function updateFormRegularity(
  content: DraftFormsStepContentV3,
  formId: string,
  dialect: "common" | "uk" | "us",
  isRegular: boolean,
  spellingMode: DialectRulesV3["spelling_mode"]
): DraftFormsStepContentV3 {
  const next = clone(content);
  for (const pos of next.pos) {
    const form = pos.forms.find((item) => item.id === formId);
    if (!form) continue;
    if (form.regional_variants.mode === "common") {
      form.regional_variants.common.is_regular = isRegular;
    } else {
      for (const variant of [
        form.regional_variants.uk,
        form.regional_variants.us
      ]) {
        if (spellingMode === "unified" || variant.dialect === dialect)
          variant.is_regular = isRegular;
      }
    }
    return next;
  }
  throw new Error(`form not found: ${formId}`);
}

export function updateVariantSpelling(
  content: DraftFormsStepContentV3,
  variantId: string,
  spelling: string
): DraftFormsStepContentV3 {
  return mutateVariant(content, variantId, (variant) => {
    variant.spelling = spelling;
  });
}

export function updateConcreteFormType(
  content: DraftFormsStepContentV3,
  formId: string,
  formType: WordFormTypeV3
): DraftFormsStepContentV3 {
  const next = clone(content);
  for (const pos of next.pos) {
    const form = pos.forms.find((item) => item.id === formId);
    if (form) {
      form.form_type = formType;
      return next;
    }
  }
  throw new Error(`form not found: ${formId}`);
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

/** 从模板原形取拼写：common 模板两侧同值，uk_us 模板按侧取；没有模板时留空。 */
function baseSpellings(form: WordConcreteFormV3 | undefined): {
  uk: string;
  us: string;
} {
  if (!form) return { uk: "", us: "" };
  return form.regional_variants.mode === "common"
    ? {
        uk: form.regional_variants.common.spelling,
        us: form.regional_variants.common.spelling
      }
    : {
        uk: form.regional_variants.uk.spelling,
        us: form.regional_variants.us.spelling
      };
}

export function addPartOfSpeech(
  content: DraftFormsStepContentV3,
  catalogItem: PartOfSpeechCatalogItem,
  idFactory: V3IdFactory = defaultIdFactory
): OperationResult<DraftFormsStepContentV3> {
  if (content.pos.some((item) => item.pos === catalogItem.code)) {
    return { ok: false, reason: "duplicate_pos_code" };
  }
  const templateOwner = content.pos.find((pos) =>
    pos.forms.some((form) => form.form_type === "base")
  );
  const template = templateOwner?.forms.find(
    (form) => form.form_type === "base"
  );
  // 模板原形所在组的英美规则落到新词性的初始组；之后各组各改各的。
  const templateGroup =
    templateOwner?.form_groups.find((group) =>
      group.members.some((member) => member.form_id === template?.id)
    ) ?? templateOwner?.form_groups[0];
  const dialectRules: DialectRulesV3 = templateGroup
    ? { ...templateGroup.dialect_rules }
    : { spelling_mode: "unified", phonetic_mode: "unified" };
  const commonDialect =
    dialectRules.spelling_mode === "unified" &&
    dialectRules.phonetic_mode === "unified";
  const templateSpelling = baseSpellings(template);
  const allocated = allNodeIds(content);
  const posId = nextUuid(idFactory, allocated);
  const groupId = nextUuid(idFactory, allocated);
  const formId = nextUuid(idFactory, allocated);
  const firstVariantId = nextUuid(idFactory, allocated);
  const secondVariantId = commonDialect
    ? undefined
    : nextUuid(idFactory, allocated);
  const membershipId = nextUuid(idFactory, allocated);
  const firstPronunciationId = nextUuid(idFactory, allocated);
  const secondPronunciationId = commonDialect
    ? undefined
    : nextUuid(idFactory, allocated);
  const pronunciation = (id: string): WordPronunciationV3 => ({
    id,
    dict_phonetic: "",
    actual_pron: "",
    style: "normal"
  });
  const regionalVariants = commonDialect
    ? {
        mode: "common" as const,
        common: {
          id: firstVariantId,
          dialect: "common" as const,
          spelling: templateSpelling.uk,
          is_regular: true,
          origin: "manual" as const,
          pronunciations: [pronunciation(firstPronunciationId)]
        }
      }
    : {
        mode: "uk_us" as const,
        uk: {
          id: firstVariantId,
          dialect: "uk" as const,
          spelling: templateSpelling.uk,
          is_regular: true,
          origin: "manual" as const,
          pronunciations: [pronunciation(firstPronunciationId)]
        },
        us: {
          id: secondVariantId!,
          dialect: "us" as const,
          spelling: templateSpelling.us,
          is_regular: true,
          origin: "manual" as const,
          pronunciations: [pronunciation(secondPronunciationId!)]
        }
      };
  const next = clone(content);
  next.pos.push({
    pos_id: posId,
    pos: catalogItem.code,
    forms: [
      {
        id: formId,
        form_type: "base",
        regional_variants: regionalVariants
      }
    ],
    form_groups: [
      {
        id: groupId,
        is_regular: true,
        scope: "general",
        dialect_rules: dialectRules,
        members: [{ id: membershipId, form_id: formId }]
      }
    ]
  });
  return { ok: true, value: next };
}

/**
 * 新建词条、手动添加词性时把该词性名下的词形类型铺成真实空行写进草稿，也就是产品说的
 * 「新建模板」：只摆这一次，之后录入者删掉哪行就是哪行，再进草稿不会补回来（禅道 TASK#7）。
 * 只铺配置里挂在这个词性下的类型，名词不摆三单、比较级。
 */
export function fillFormTypeTemplate(
  content: DraftFormsStepContentV3,
  catalogItems: readonly PartOfSpeechCatalogItem[] | undefined,
  idFactory: V3IdFactory = defaultIdFactory,
  onlyPosId?: string
): DraftFormsStepContentV3 {
  if (!catalogItems?.length) return content;
  let next = content;
  for (const pos of content.pos) {
    if (onlyPosId && pos.pos_id !== onlyPosId) continue;
    const catalogItem = catalogItems.find((item) => item.code === pos.pos);
    // 目录里没有这个词性就不铺，跟着目录 fail closed；短语没有词形变化，后端的
    // 词形类型也只挂在单词词性下。
    if (!catalogItem || catalogItem.kind === "phrase") continue;
    const template = catalogItem.allowed_form_types ?? [];
    if (template.length === 0) continue;
    // 每轮都从最新结果里取：上一条补齐已经换过这个词性的对象。
    const current = next.pos.find((item) => item.pos_id === pos.pos_id);
    // 只给刚建起来的唯一一组铺：后面手动加的组不是「新建模板」的场景。
    if (!current || current.form_groups.length !== 1) continue;
    const group = current.form_groups[0]!;
    // 按该词性已有的全部词形算，不只看组成员：游离词形（删组保留词形留下的）
    // 也算数，免得同类型再补一条。
    const present = new Set(current.forms.map((form) => form.form_type));
    for (const formType of template) {
      if (present.has(formType)) continue;
      present.add(formType);
      const added = addConcreteForm(
        next,
        pos.pos_id,
        group.id,
        formType,
        idFactory
      );
      if (added.ok) next = added.value;
    }
  }
  return next;
}

export function deletePartOfSpeech(
  content: DraftFormsStepContentV3,
  posId: string
): OperationResult<DraftFormsStepContentV3> {
  if (!content.pos.some((item) => item.pos_id === posId)) {
    return { ok: false, reason: "pos_not_found" };
  }
  if (content.pos.length <= 1) {
    return { ok: false, reason: "last_pos_required" };
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
  const pos = content.pos.find((item) => item.pos_id === posId);
  if (!pos) {
    return { ok: false, reason: "pos_not_found" };
  }
  const groupId = nextUuid(idFactory, allNodeIds(content));
  // 新组默认通用，英美规则沿用本词性最后一组；之后与其他组互不影响。
  const previousGroup = pos.form_groups.at(-1);
  const previousRules = previousGroup?.dialect_rules;
  const next = clone(content);
  next.pos
    .find((item) => item.pos_id === posId)!
    .form_groups.push({
      id: groupId,
      is_regular: true,
      scope: "general",
      dialect_rules: previousRules
        ? { ...previousRules }
        : { spelling_mode: "unified", phonetic_mode: "unified" },
      members: []
    });
  // 每组词形变化的初始形态一致：新组自带一个原形。拼写沿用规则来源那一组的原形，
  // 那组还没有原形时退回本词性首个原形。
  const added = addConcreteForm(next, posId, groupId, "base", idFactory);
  if (!added.ok) return added;
  const template =
    previousGroup?.members
      .map((member) => pos.forms.find((form) => form.id === member.form_id))
      .find((form) => form?.form_type === "base") ??
    pos.forms.find((form) => form.form_type === "base");
  if (template) {
    const spelling = baseSpellings(template);
    const createdPos = added.value.pos.find((item) => item.pos_id === posId)!;
    const createdFormId = createdPos.form_groups.find(
      (item) => item.id === groupId
    )!.members[0]!.form_id;
    const created = createdPos.forms.find((form) => form.id === createdFormId)!;
    if (created.regional_variants.mode === "common") {
      created.regional_variants.common.spelling = spelling.uk;
    } else {
      created.regional_variants.uk.spelling = spelling.uk;
      // 拼写统一的组两侧必须同拼写；退回的模板可能来自拼写区分英美的组。
      created.regional_variants.us.spelling =
        previousRules?.spelling_mode === "unified" ? spelling.uk : spelling.us;
    }
  }
  return added;
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
  if (pos.forms.length - orphanFormIds.length < 1) {
    return { ok: false, reason: "last_form_required" };
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
  const group = pos.form_groups.find((item) => item.id === groupId);
  if (!group) return { ok: false, reason: "group_not_found" };

  const allocated = allNodeIds(content);
  const formId = nextUuid(idFactory, allocated);
  const commonDialect =
    group.dialect_rules.spelling_mode === "unified" &&
    group.dialect_rules.phonetic_mode === "unified";
  const firstVariantId = nextUuid(idFactory, allocated);
  const secondVariantId = commonDialect
    ? undefined
    : nextUuid(idFactory, allocated);
  const membershipId = nextUuid(idFactory, allocated);
  const firstPronunciationId = nextUuid(idFactory, allocated);
  const secondPronunciationId = commonDialect
    ? undefined
    : nextUuid(idFactory, allocated);
  const pronunciation = (id: string): WordPronunciationV3 => ({
    id,
    dict_phonetic: "",
    actual_pron: "",
    style: "normal"
  });
  const regionalVariants = commonDialect
    ? {
        mode: "common" as const,
        common: {
          id: firstVariantId,
          dialect: "common" as const,
          spelling: "",
          is_regular: true,
          origin: "manual" as const,
          pronunciations: [pronunciation(firstPronunciationId)]
        }
      }
    : {
        mode: "uk_us" as const,
        uk: {
          id: firstVariantId,
          dialect: "uk" as const,
          spelling: "",
          is_regular: true,
          origin: "manual" as const,
          pronunciations: [pronunciation(firstPronunciationId)]
        },
        us: {
          id: secondVariantId!,
          dialect: "us" as const,
          spelling: "",
          is_regular: true,
          origin: "manual" as const,
          pronunciations: [pronunciation(secondPronunciationId!)]
        }
      };
  const next = clone(content);
  const target = next.pos.find((item) => item.pos_id === posId)!;
  target.forms.push({
    id: formId,
    form_type: formType,
    regional_variants: regionalVariants
  });
  target.form_groups
    .find((item) => item.id === groupId)!
    .members.push({ id: membershipId, form_id: formId });
  return { ok: true, value: next };
}

export function addConcreteFormAfterMembership(
  content: DraftFormsStepContentV3,
  posId: string,
  groupId: string,
  sourceMembershipId: string,
  idFactory: V3IdFactory = defaultIdFactory
): OperationResult<DraftFormsStepContentV3> {
  const pos = content.pos.find((item) => item.pos_id === posId);
  if (!pos) return { ok: false, reason: "pos_not_found" };
  const group = pos.form_groups.find((item) => item.id === groupId);
  if (!group) return { ok: false, reason: "group_not_found" };
  const sourceMembershipIndex = group.members.findIndex(
    (member) => member.id === sourceMembershipId
  );
  if (sourceMembershipIndex < 0) {
    return { ok: false, reason: "membership_not_found" };
  }
  const sourceFormId = group.members[sourceMembershipIndex]!.form_id;
  const sourceFormIndex = pos.forms.findIndex(
    (form) => form.id === sourceFormId
  );
  if (sourceFormIndex < 0) return { ok: false, reason: "form_not_found" };

  const added = addConcreteForm(
    content,
    posId,
    groupId,
    pos.forms[sourceFormIndex]!.form_type,
    idFactory
  );
  if (!added.ok) return added;

  const targetPos = added.value.pos.find((item) => item.pos_id === posId)!;
  const targetGroup = targetPos.form_groups.find(
    (item) => item.id === groupId
  )!;
  const newForm = targetPos.forms.pop()!;
  const newMembership = targetGroup.members.pop()!;
  targetPos.forms.splice(sourceFormIndex + 1, 0, newForm);
  targetGroup.members.splice(sourceMembershipIndex + 1, 0, newMembership);
  return added;
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
  if (pos.forms.length <= 1) {
    return { ok: false, reason: "last_form_required" };
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

/**
 * 基本词性重排。词性用 `pos_id` 而不是 `id`，套不进 `reorderByIds` 的 `{ id }` 约束，
 * 单独写一份；校验口径保持一致——必须给出全部词性且不重复。
 *
 * 顺序只落在 forms 这一份数据里：词义步的标签栏取 `forms.pos` 的顺序，后端
 * `lexicon.entry_pos.sort_order` 按数组下标写入，所以这一处改完全链路都跟着走。
 */
export function reorderPos(
  content: DraftFormsStepContentV3,
  orderedIds: readonly string[]
): DraftFormsStepContentV3 {
  if (
    content.pos.length !== orderedIds.length ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    throw new Error("pos order must contain every ID exactly once");
  }
  const next = clone(content);
  const byId = new Map(next.pos.map((pos) => [pos.pos_id, pos]));
  const ordered = orderedIds.map((posId) => byId.get(posId));
  if (ordered.some((pos) => pos === undefined)) {
    throw new Error("pos order contains an unknown ID");
  }
  next.pos = ordered as typeof next.pos;
  return next;
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
