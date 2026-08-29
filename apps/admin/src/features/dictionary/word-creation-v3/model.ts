import type {
  Dialect,
  DialectRulesV3,
  DraftFormsStepContentV3,
  TextOriginV3,
  V3DraftNodeLocation,
  V3DraftValidationIssue,
  V3ValidationIssueCode,
  WordConcreteFormV3,
  WordFormTypeV3,
  WordPronunciationV3,
  WordRegionalVariantsV3
} from "@tsz/types";

export const MAX_FORMS_NODES = 2_000;
export const MAX_FORM_TEXT_CODEPOINTS = 200;

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const FORM_TYPES = new Set<WordFormTypeV3>([
  "base",
  "third_person_singular",
  "present_participle",
  "past_tense",
  "past_participle",
  "plural",
  "comparative",
  "superlative"
]);

type ValidationIntent = "save" | "complete";

export interface FormsValidationOptions {
  /** Authoritative admin catalog lookup; undefined means capability unavailable. */
  allowedFormTypes?: (pos: string) => readonly WordFormTypeV3[] | undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ownKeysAre(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function codePointLength(value: string) {
  return Array.from(value).length;
}

function forbiddenShapeIssue(
  field: string,
  nodeId = NIL_UUID,
  nodeLocation: V3DraftNodeLocation = location("forms")
) {
  return issue(
    "forbidden_v3_field",
    field,
    nodeId,
    "V3 forms content 结构非法",
    nodeLocation
  );
}

function location(
  nodeRole: string,
  values: Omit<V3DraftNodeLocation, "node_role" | "ancestor_node_ids"> = {},
  ancestors: string[] = []
): V3DraftNodeLocation {
  return {
    node_role: nodeRole,
    ancestor_node_ids: ancestors,
    ...values
  };
}

function issue(
  code: V3ValidationIssueCode,
  field: string,
  nodeId: string,
  message: string,
  nodeLocation: V3DraftNodeLocation
): V3DraftValidationIssue {
  return {
    schema_version: 3,
    step: "forms",
    node_id: nodeId,
    field,
    code,
    message,
    node_location: nodeLocation
  };
}

function variantsOf(form: WordConcreteFormV3) {
  return form.regional_variants.mode === "common"
    ? [form.regional_variants.common]
    : [form.regional_variants.uk, form.regional_variants.us];
}

export function countFormsNodes(content: DraftFormsStepContentV3): number {
  return content.pos.reduce(
    (total, pos) =>
      total +
      1 +
      pos.forms.length +
      pos.forms.reduce((formTotal, form) => {
        const regional = form.regional_variants as unknown;
        if (!isObject(regional)) return formTotal;
        const candidates =
          regional.mode === "common"
            ? [regional.common]
            : regional.mode === "uk_us"
              ? [regional.uk, regional.us]
              : [];
        return (
          formTotal +
          candidates.reduce<number>((variantTotal, candidate) => {
            if (!isObject(candidate)) return variantTotal;
            return (
              variantTotal +
              1 +
              (Array.isArray(candidate.pronunciations)
                ? candidate.pronunciations.length
                : 0)
            );
          }, 0)
        );
      }, 0) +
      pos.form_groups.length +
      pos.form_groups.reduce(
        (groupTotal, group) => groupTotal + group.members.length,
        0
      ),
    0
  );
}

function isPronunciationShape(value: unknown): value is WordPronunciationV3 {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length >= 3 &&
    keys.length <= 4 &&
    keys.every((key) =>
      ["actual_pron", "dict_phonetic", "id", "style"].includes(key)
    ) &&
    typeof value.id === "string" &&
    typeof value.dict_phonetic === "string" &&
    typeof value.actual_pron === "string" &&
    (value.style === undefined ||
      value.style === "normal" ||
      value.style === "strong" ||
      value.style === "weak")
  );
}

function isVariantShape(
  value: unknown,
  dialect: Dialect
): value is {
  id: string;
  dialect: Dialect;
  spelling: string;
  origin: TextOriginV3;
  pronunciations: WordPronunciationV3[];
} {
  return (
    isObject(value) &&
    ownKeysAre(value, [
      "dialect",
      "id",
      "origin",
      "pronunciations",
      "spelling"
    ]) &&
    typeof value.id === "string" &&
    value.dialect === dialect &&
    typeof value.spelling === "string" &&
    (value.origin === "dictionary" ||
      value.origin === "converted" ||
      value.origin === "manual") &&
    Array.isArray(value.pronunciations) &&
    value.pronunciations.every(isPronunciationShape)
  );
}

function isRegionalShapeValid(value: unknown): value is WordRegionalVariantsV3 {
  if (!isObject(value)) return false;
  if (value.mode === "common") {
    return (
      ownKeysAre(value, ["common", "mode"]) &&
      isVariantShape(value.common, "common")
    );
  }
  if (value.mode === "uk_us") {
    return (
      ownKeysAre(value, ["mode", "uk", "us"]) &&
      isVariantShape(value.uk, "uk") &&
      isVariantShape(value.us, "us")
    );
  }
  return false;
}

function isDialectRulesValid(value: unknown): value is DialectRulesV3 {
  if (
    !isObject(value) ||
    !ownKeysAre(value, ["phonetic_mode", "spelling_mode"])
  ) {
    return false;
  }
  const spellingValid =
    value.spelling_mode === "unified" || value.spelling_mode === "distinguish";
  const phoneticValid =
    value.phonetic_mode === "unified" || value.phonetic_mode === "distinguish";
  return (
    spellingValid &&
    phoneticValid &&
    !(
      value.spelling_mode === "distinguish" &&
      value.phonetic_mode !== "distinguish"
    )
  );
}

function regionalVariantsMatchRules(
  variants: WordRegionalVariantsV3,
  rules: DialectRulesV3
) {
  if (rules.spelling_mode === "unified" && rules.phonetic_mode === "unified") {
    return variants.mode === "common";
  }
  if (variants.mode !== "uk_us") return false;
  return (
    rules.spelling_mode === "distinguish" ||
    variants.uk.spelling === variants.us.spelling
  );
}

function containerShapeIssue(
  input: unknown
): V3DraftValidationIssue | undefined {
  if (!isObject(input) || !Array.isArray(input.pos)) {
    return forbiddenShapeIssue("content");
  }
  for (const posValue of input.pos) {
    if (!isObject(posValue)) return forbiddenShapeIssue("pos");
    if (
      typeof posValue.pos_id !== "string" ||
      typeof posValue.pos !== "string" ||
      !Array.isArray(posValue.forms) ||
      !Array.isArray(posValue.form_groups)
    ) {
      return forbiddenShapeIssue(
        !Array.isArray(posValue.forms)
          ? "forms"
          : !Array.isArray(posValue.form_groups)
            ? "form_groups"
            : "pos",
        typeof posValue.pos_id === "string" ? posValue.pos_id : NIL_UUID,
        location(
          "forms.pos",
          typeof posValue.pos_id === "string" ? { pos_id: posValue.pos_id } : {}
        )
      );
    }
    for (const formValue of posValue.forms) {
      if (
        !isObject(formValue) ||
        typeof formValue.id !== "string" ||
        typeof formValue.form_type !== "string" ||
        !isObject(formValue.regional_variants)
      ) {
        return forbiddenShapeIssue(
          "forms",
          isObject(formValue) && typeof formValue.id === "string"
            ? formValue.id
            : NIL_UUID,
          location(
            "forms.concrete_form",
            {
              pos_id: posValue.pos_id,
              ...(isObject(formValue) && typeof formValue.id === "string"
                ? { form_id: formValue.id }
                : {})
            },
            [posValue.pos_id]
          )
        );
      }
    }
    for (const groupValue of posValue.form_groups) {
      if (
        !isObject(groupValue) ||
        typeof groupValue.id !== "string" ||
        typeof groupValue.is_regular !== "boolean" ||
        !Array.isArray(groupValue.members)
      ) {
        return forbiddenShapeIssue(
          "form_groups",
          isObject(groupValue) && typeof groupValue.id === "string"
            ? groupValue.id
            : NIL_UUID,
          location(
            "forms.form_group",
            {
              pos_id: posValue.pos_id,
              ...(isObject(groupValue) && typeof groupValue.id === "string"
                ? { form_group_id: groupValue.id }
                : {})
            },
            [posValue.pos_id]
          )
        );
      }
      for (const memberValue of groupValue.members) {
        if (
          !isObject(memberValue) ||
          typeof memberValue.id !== "string" ||
          typeof memberValue.form_id !== "string"
        ) {
          return forbiddenShapeIssue(
            "members",
            isObject(memberValue) && typeof memberValue.id === "string"
              ? memberValue.id
              : groupValue.id,
            location(
              "forms.group_membership",
              {
                pos_id: posValue.pos_id,
                form_group_id: groupValue.id,
                ...(isObject(memberValue) && typeof memberValue.id === "string"
                  ? { membership_id: memberValue.id }
                  : {}),
                ...(isObject(memberValue) &&
                typeof memberValue.form_id === "string"
                  ? { form_id: memberValue.form_id }
                  : {})
              },
              [posValue.pos_id, groupValue.id]
            )
          );
        }
      }
    }
  }
  return undefined;
}

function variantIssues(
  variant: {
    id: string;
    dialect: Dialect;
    spelling: string;
    pronunciations: WordPronunciationV3[];
  },
  posId: string,
  form: WordConcreteFormV3,
  intent: ValidationIntent,
  registerNode: (
    id: string,
    role: string,
    nodeLocation: V3DraftNodeLocation
  ) => void,
  issues: V3DraftValidationIssue[]
) {
  const variantLocation = location(
    "forms.form_variant",
    {
      pos_id: posId,
      form_id: form.id,
      form_type: form.form_type,
      variant_id: variant.id,
      dialect: variant.dialect
    },
    [posId, form.id]
  );
  registerNode(variant.id, "forms.form_variant", variantLocation);
  if (intent === "complete" && variant.spelling.trim() === "") {
    issues.push(
      issue(
        "variant_spelling_required",
        "spelling",
        variant.id,
        "完整词形需要拼写",
        variantLocation
      )
    );
  }
  if (codePointLength(variant.spelling) > MAX_FORM_TEXT_CODEPOINTS) {
    issues.push(
      issue(
        "content_limit_exceeded",
        "spelling",
        variant.id,
        "拼写超过 200 个 Unicode codepoint",
        variantLocation
      )
    );
  }
  if (intent === "complete" && variant.pronunciations.length === 0) {
    issues.push(
      issue(
        "pronunciation_required",
        "pronunciations",
        variant.id,
        "完整词形至少需要一条发音",
        variantLocation
      )
    );
  }
  for (const pronunciation of variant.pronunciations) {
    const pronunciationLocation = location(
      "forms.pronunciation",
      {
        pos_id: posId,
        form_id: form.id,
        form_type: form.form_type,
        variant_id: variant.id,
        dialect: variant.dialect,
        pronunciation_id: pronunciation.id
      },
      [posId, form.id, variant.id]
    );
    registerNode(
      pronunciation.id,
      "forms.pronunciation",
      pronunciationLocation
    );
    for (const [field, value] of [
      ["dict_phonetic", pronunciation.dict_phonetic],
      ["actual_pron", pronunciation.actual_pron]
    ] as const) {
      if (codePointLength(value) > MAX_FORM_TEXT_CODEPOINTS) {
        issues.push(
          issue(
            "content_limit_exceeded",
            field,
            pronunciation.id,
            "发音字段超过 200 个 Unicode codepoint",
            pronunciationLocation
          )
        );
      }
    }
    if (intent === "complete") {
      const missingField =
        pronunciation.dict_phonetic.trim() === ""
          ? "dict_phonetic"
          : pronunciation.actual_pron.trim() === ""
            ? "actual_pron"
            : pronunciation.style === undefined
              ? "style"
              : undefined;
      if (missingField) {
        issues.push(
          issue(
            "pronunciation_required",
            missingField,
            pronunciation.id,
            "完整发音需要填写全部字段",
            pronunciationLocation
          )
        );
      }
    }
    // duplicate_pronunciation 故意不在前端计算：规范化版本与算法由服务端权威。
  }
}

export function validateFormsContent(
  input: unknown,
  intent: ValidationIntent,
  options: FormsValidationOptions = {}
): V3DraftValidationIssue[] {
  const shapeIssue = containerShapeIssue(input);
  if (shapeIssue) return [shapeIssue];
  const content = input as unknown as DraftFormsStepContentV3;
  const issues: V3DraftValidationIssue[] = [];
  const nodeRoles = new Map<string, string>();
  const formOwners = new Map<string, string>();
  const membershipCounts = new Map<string, number>();
  const posCodes = new Set<string>();
  const registerNode = (
    id: string,
    role: string,
    nodeLocation: V3DraftNodeLocation
  ) => {
    const previous = nodeRoles.get(id);
    if (previous !== undefined) {
      issues.push(
        issue(
          "duplicate_node_id",
          "id",
          id,
          `节点 ID 已被 ${previous} 使用`,
          nodeLocation
        )
      );
      return;
    }
    nodeRoles.set(id, role);
  };

  if (intent === "complete" && content.pos.length === 0) {
    issues.push(
      issue(
        "pos_required",
        "pos",
        NIL_UUID,
        "完整词条至少需要一个词性",
        location("forms")
      )
    );
  }
  if (countFormsNodes(content) > MAX_FORMS_NODES) {
    const nodeId = content.pos[0]?.pos_id ?? NIL_UUID;
    issues.push(
      issue(
        "content_limit_exceeded",
        "content",
        nodeId,
        "词形内容节点超过 2000",
        location("forms", content.pos[0] ? { pos_id: nodeId } : {})
      )
    );
  }

  for (const pos of content.pos) {
    const posLocation = location("forms.pos", { pos_id: pos.pos_id });
    registerNode(pos.pos_id, "forms.pos", posLocation);
    const dialectRulesValid = isDialectRulesValid(pos.dialect_rules);
    if (!dialectRulesValid) {
      issues.push(
        issue(
          "dialect_rules_invalid",
          "dialect_rules",
          pos.pos_id,
          "英美拼写与音标规则组合无效",
          posLocation
        )
      );
    }
    if (posCodes.has(pos.pos)) {
      issues.push(
        issue(
          "duplicate_pos_code",
          "pos",
          pos.pos_id,
          "同一 entry 不能重复 POS code",
          posLocation
        )
      );
    }
    posCodes.add(pos.pos);
    const allowedFormTypes = options.allowedFormTypes?.(pos.pos);
    if (intent === "complete" && pos.form_groups.length === 0) {
      issues.push(
        issue(
          "form_group_required",
          "form_groups",
          pos.pos_id,
          "完整词性至少需要一个变化组",
          posLocation
        )
      );
    }
    for (const form of pos.forms) {
      const formLocation = location(
        "forms.concrete_form",
        { pos_id: pos.pos_id, form_id: form.id, form_type: form.form_type },
        [pos.pos_id]
      );
      registerNode(form.id, "forms.concrete_form", formLocation);
      if (!formOwners.has(form.id)) formOwners.set(form.id, pos.pos_id);
      membershipCounts.set(form.id, 0);
      if (!FORM_TYPES.has(form.form_type)) {
        issues.push(
          issue(
            "invalid_form_type_for_part_of_speech",
            "form_type",
            form.id,
            "未知 form_type",
            formLocation
          )
        );
      }
      if (
        form.form_type !== "base" &&
        allowedFormTypes !== undefined &&
        !allowedFormTypes.includes(form.form_type)
      ) {
        issues.push(
          issue(
            "invalid_form_type_for_part_of_speech",
            "form_type",
            form.id,
            "form_type 不在权威词性目录允许范围内",
            formLocation
          )
        );
      }
      if (!isRegionalShapeValid(form.regional_variants)) {
        issues.push(
          issue(
            "invalid_regional_variant_shape",
            "regional_variants",
            form.id,
            "地区形状必须是 common 或完整 uk_us",
            formLocation
          )
        );
        continue;
      }
      if (
        dialectRulesValid &&
        !regionalVariantsMatchRules(form.regional_variants, pos.dialect_rules)
      ) {
        issues.push(
          issue(
            "invalid_regional_variant_shape",
            "regional_variants",
            form.id,
            "词形地区结构与当前词性的英美规则不一致",
            formLocation
          )
        );
      }
      for (const variant of variantsOf(form)) {
        variantIssues(variant, pos.pos_id, form, intent, registerNode, issues);
      }
    }
  }

  for (const pos of content.pos) {
    for (const group of pos.form_groups) {
      const groupLocation = location(
        "forms.form_group",
        { pos_id: pos.pos_id, form_group_id: group.id },
        [pos.pos_id]
      );
      registerNode(group.id, "forms.form_group", groupLocation);
      if (intent === "complete" && group.members.length === 0) {
        issues.push(
          issue(
            "empty_form_group",
            "members",
            group.id,
            "完整词条不能保留空变化组",
            groupLocation
          )
        );
      }
      const groupFormIds = new Set<string>();
      for (const member of group.members) {
        const memberLocation = location(
          "forms.group_membership",
          {
            pos_id: pos.pos_id,
            form_group_id: group.id,
            membership_id: member.id,
            form_id: member.form_id
          },
          [pos.pos_id, group.id]
        );
        registerNode(member.id, "forms.group_membership", memberLocation);
        const owner = formOwners.get(member.form_id);
        if (groupFormIds.has(member.form_id)) {
          issues.push(
            issue(
              "form_group_membership_invalid",
              "form_id",
              member.id,
              "同组不能重复引用同一 form",
              memberLocation
            )
          );
          continue;
        }
        groupFormIds.add(member.form_id);
        if (owner !== pos.pos_id) {
          issues.push(
            issue(
              "form_group_membership_invalid",
              "form_id",
              member.id,
              owner === undefined
                ? "membership 引用的 form 不存在"
                : "membership 不能跨 POS",
              memberLocation
            )
          );
          continue;
        }
        membershipCounts.set(
          member.form_id,
          (membershipCounts.get(member.form_id) ?? 0) + 1
        );
      }
    }
  }

  for (const pos of content.pos) {
    for (const form of pos.forms) {
      if ((membershipCounts.get(form.id) ?? 0) === 0) {
        issues.push(
          issue(
            "orphan_form",
            "id",
            form.id,
            "每个已保存 form 至少需要一个 membership",
            location(
              "forms.concrete_form",
              {
                pos_id: pos.pos_id,
                form_id: form.id,
                form_type: form.form_type
              },
              [pos.pos_id]
            )
          )
        );
      }
    }
  }
  return issues;
}

function pronunciationWire(
  pronunciation: WordPronunciationV3
): WordPronunciationV3 {
  return {
    id: pronunciation.id,
    dict_phonetic: pronunciation.dict_phonetic,
    actual_pron: pronunciation.actual_pron,
    ...(pronunciation.style === undefined ? {} : { style: pronunciation.style })
  };
}

function variantWire<TDialect extends Dialect>(variant: {
  id: string;
  dialect: TDialect;
  spelling: string;
  origin: TextOriginV3;
  pronunciations: WordPronunciationV3[];
}) {
  return {
    id: variant.id,
    dialect: variant.dialect,
    spelling: variant.spelling,
    origin: variant.origin,
    pronunciations: variant.pronunciations.map(pronunciationWire)
  };
}

/** Explicit writable projection: unknown UI/read-only fields never reach the wire. */
export function toFormsWire(
  content: DraftFormsStepContentV3
): DraftFormsStepContentV3 {
  return {
    pos: content.pos.map((pos) => ({
      pos_id: pos.pos_id,
      pos: pos.pos,
      dialect_rules: { ...pos.dialect_rules },
      forms: pos.forms.map((form) => ({
        id: form.id,
        form_type: form.form_type,
        regional_variants:
          form.regional_variants.mode === "common"
            ? {
                mode: "common",
                common: variantWire(form.regional_variants.common)
              }
            : {
                mode: "uk_us",
                uk: variantWire(form.regional_variants.uk),
                us: variantWire(form.regional_variants.us)
              }
      })),
      form_groups: pos.form_groups.map((group) => ({
        id: group.id,
        is_regular: group.is_regular,
        members: group.members.map((member) => ({
          id: member.id,
          form_id: member.form_id
        }))
      }))
    }))
  };
}

/** Server issue consumer only; no client-side pronunciation normalization. */
export function issuesForPronunciation(
  issues: readonly V3DraftValidationIssue[],
  pronunciationId: string
): V3DraftValidationIssue[] {
  return issues.filter(
    (item) => item.node_location.pronunciation_id === pronunciationId
  );
}
