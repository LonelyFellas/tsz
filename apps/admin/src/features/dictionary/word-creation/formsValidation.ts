import type {
  WordFormSlotV2,
  WordFormVariantV2,
  WordHeadwordsV2,
  WordPosFormsV2
} from "@tsz/types";

function expectedDialects(rules: WordPosFormsV2["dialect_rules"]) {
  return rules.spelling_mode === "distinguish" ||
    rules.phonetic_mode === "distinguish"
    ? (["uk", "us"] as const)
    : (["common"] as const);
}

export interface FormIssueTarget {
  node_id: string;
  field: string;
}

function invalidSpelling(value: string): boolean {
  return (
    value.trim() !== value || value.length === 0 || [...value].length > 200
  );
}

function invalidPronunciation(value: string): boolean {
  return value.trim().length === 0 || [...value].length > 200;
}

/** 单个方言变体的读音缺失,与拼写校验无关,可独立统计。 */
function variantPronunciationIssues(
  variant: WordFormVariantV2
): FormIssueTarget[] {
  if (variant.pronunciations.length === 0) {
    return [{ node_id: variant.id, field: "pronunciations" }];
  }
  const issues: FormIssueTarget[] = [];
  for (const pronunciation of variant.pronunciations) {
    if (invalidPronunciation(pronunciation.dict_phonetic)) {
      issues.push({ node_id: pronunciation.id, field: "dict_phonetic" });
    }
    if (invalidPronunciation(pronunciation.actual_pron)) {
      issues.push({ node_id: pronunciation.id, field: "actual_pron" });
    }
  }
  return issues;
}

/** 按方言、拼写、读音顺序收集全部无效叶字段(首项即定位用的焦点目标)。 */
export function formSlotIssues(
  slot: WordFormSlotV2,
  rules: WordPosFormsV2["dialect_rules"]
): FormIssueTarget[] {
  const expected = expectedDialects(rules);
  const actual = new Set(slot.variants.map((variant) => variant.dialect));
  const missingDialect = expected.find((dialect) => !actual.has(dialect));
  if (missingDialect) {
    return [
      {
        node_id: slot.id,
        field: `variants.${missingDialect}`
      }
    ];
  }
  if (
    slot.variants.length !== expected.length ||
    actual.size !== expected.length
  ) {
    return [{ node_id: slot.id, field: "variants" }];
  }
  const issues: FormIssueTarget[] = [];
  for (const dialect of expected) {
    const variant = slot.variants.find((item) => item.dialect === dialect)!;
    if (invalidSpelling(variant.spelling)) {
      issues.push({
        node_id: slot.id,
        field: `variants.${dialect}.spelling`
      });
      continue;
    }
    issues.push(...variantPronunciationIssues(variant));
  }
  return issues;
}

export function formSlotIssueTarget(
  slot: WordFormSlotV2,
  rules: WordPosFormsV2["dialect_rules"]
): FormIssueTarget | undefined {
  return formSlotIssues(slot, rules)[0];
}

export function formSlotComplete(
  slot: WordFormSlotV2,
  rules: WordPosFormsV2["dialect_rules"]
): boolean {
  return !formSlotIssueTarget(slot, rules);
}

/** 基准原形拼写是否与第 1 步确认的主词一致。 */
function headwordConsistencyIssues(
  pos: WordPosFormsV2,
  headwords?: WordHeadwordsV2
): FormIssueTarget[] {
  if (!headwords) return [];
  for (const variant of pos.base_form.variants) {
    const expected =
      headwords.mode === "unified"
        ? headwords.common
        : variant.dialect === "uk"
          ? headwords.uk
          : variant.dialect === "us"
            ? headwords.us
            : undefined;
    if (variant.spelling !== expected) {
      return [
        {
          node_id: pos.base_form.id,
          field: `variants.${variant.dialect}.spelling`
        }
      ];
    }
  }
  return [];
}

export function baseFormIssues(
  pos: WordPosFormsV2,
  headwords?: WordHeadwordsV2
): FormIssueTarget[] {
  const issues = formSlotIssues(pos.base_form, pos.dialect_rules);
  if (issues.length > 0) return issues;
  return headwordConsistencyIssues(pos, headwords);
}

const PRONUNCIATION_ISSUE_FIELDS = new Set([
  "pronunciations",
  "dict_phonetic",
  "actual_pron"
]);

/**
 * 基准原形的方言与拼写问题(不含读音),供左栏「基本词性」独立计数。
 * 不能直接过滤 `baseFormIssues`:那里读音问题会挡住主词一致性检查。
 */
export function baseFormSpellingIssues(
  pos: WordPosFormsV2,
  headwords?: WordHeadwordsV2
): FormIssueTarget[] {
  const issues = formSlotIssues(pos.base_form, pos.dialect_rules).filter(
    (issue) => !PRONUNCIATION_ISSUE_FIELDS.has(issue.field)
  );
  if (issues.length > 0) return issues;
  return headwordConsistencyIssues(pos, headwords);
}

/**
 * 基准原形的读音问题,供左栏「原形发音」独立计数。直接遍历变体,
 * 不走 `formSlotIssues` 的拼写短路,避免拼写有问题时读音缺失被隐藏为完成。
 */
export function baseFormPronunciationIssues(
  pos: WordPosFormsV2
): FormIssueTarget[] {
  return pos.base_form.variants.flatMap(variantPronunciationIssues);
}

export function baseFormIssueTarget(
  pos: WordPosFormsV2,
  headwords?: WordHeadwordsV2
): FormIssueTarget | undefined {
  return baseFormIssues(pos, headwords)[0];
}

const PRONUNCIATION_FIELD_LABEL = {
  dict_phonetic: "字典音标",
  actual_pron: "实际发音"
} as const;

type PronunciationField = keyof typeof PRONUNCIATION_FIELD_LABEL;

const PRONUNCIATION_FIELDS = Object.keys(
  PRONUNCIATION_FIELD_LABEL
) as PronunciationField[];

/**
 * 基准原形的校验提示。判定是「字典音标与实际发音都要填」的 AND,
 * 所以文案必须按实际缺失项分别说明,不能笼统写成「缺少 A 或 B」。
 */
export function baseFormIssueMessage(
  pos: WordPosFormsV2,
  headwords?: WordHeadwordsV2
): string | undefined {
  const issues = baseFormIssues(pos, headwords);
  const first = issues[0];
  if (!first) return undefined;
  if (PRONUNCIATION_FIELDS.some((field) => field === first.field)) {
    const missing = PRONUNCIATION_FIELDS.filter((field) =>
      issues.some((issue) => issue.field === field)
    );
    return `基准原形缺少${missing
      .map((field) => PRONUNCIATION_FIELD_LABEL[field])
      .join("与")}`;
  }
  if (first.field === "pronunciations") {
    return "基准原形还没有添加读音";
  }
  return "基准原形拼写尚未按主词填写完整";
}

export function baseFormComplete(
  pos: WordPosFormsV2,
  headwords?: WordHeadwordsV2
): boolean {
  return !baseFormIssueTarget(pos, headwords);
}
