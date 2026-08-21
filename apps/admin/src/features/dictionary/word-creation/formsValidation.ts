import type {
  Dialect,
  WordFormSlotV2,
  WordFormVariantV2,
  WordHeadwordsV2,
  WordPosFormsV2
} from "@tsz/types";
import { DIALECT_SHORT_LABEL, FORM_TYPE_LABEL } from "../editorConstants";

function expectedDialects(rules: WordPosFormsV2["dialect_rules"]) {
  return rules.spelling_mode === "distinguish" ||
    rules.phonetic_mode === "distinguish"
    ? (["uk", "us"] as const)
    : (["common"] as const);
}

export interface FormIssueTarget {
  node_id: string;
  field: string;
  /** 该问题属于哪一侧方言；统一词形为 `common`，文案里不出现方言字样。 */
  dialect: Dialect;
}

/**
 * 「英式 · 」这样的前缀，供校验文案指名到侧（手测 C4：错误不指明方言侧，
 * 英美区分下无法判断缺的是 BrE 还是 AmE）。统一词形返回空串。
 */
function dialectPrefix(dialect: Dialect): string {
  return dialect === "common" ? "" : `${DIALECT_SHORT_LABEL[dialect]} · `;
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
    return [
      {
        node_id: variant.id,
        field: "pronunciations",
        dialect: variant.dialect
      }
    ];
  }
  const issues: FormIssueTarget[] = [];
  for (const pronunciation of variant.pronunciations) {
    if (invalidPronunciation(pronunciation.dict_phonetic)) {
      issues.push({
        node_id: pronunciation.id,
        field: "dict_phonetic",
        dialect: variant.dialect
      });
    }
    if (invalidPronunciation(pronunciation.actual_pron)) {
      issues.push({
        node_id: pronunciation.id,
        field: "actual_pron",
        dialect: variant.dialect
      });
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
        field: `variants.${missingDialect}`,
        dialect: missingDialect
      }
    ];
  }
  if (
    slot.variants.length !== expected.length ||
    actual.size !== expected.length
  ) {
    return [{ node_id: slot.id, field: "variants", dialect: "common" }];
  }
  const issues: FormIssueTarget[] = [];
  for (const dialect of expected) {
    const variant = slot.variants.find((item) => item.dialect === dialect)!;
    if (invalidSpelling(variant.spelling)) {
      issues.push({
        node_id: slot.id,
        field: `variants.${dialect}.spelling`,
        dialect
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
          field: `variants.${variant.dialect}.spelling`,
          dialect: variant.dialect
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
 * 基准原形的校验提示。两条口径缺一不可：
 * ① 判定是「字典音标与实际发音都要填」的 AND，文案按实际缺失项分别说明，
 *    不能笼统写成「缺少 A 或 B」（手测 B2）；
 * ② 英美区分时必须指名是哪一侧，否则管理员没法判断缺的是 BrE 还是 AmE（手测 C4）。
 */
export function baseFormIssueMessage(
  pos: WordPosFormsV2,
  headwords?: WordHeadwordsV2
): string | undefined {
  const issues = baseFormIssues(pos, headwords);
  const first = issues[0];
  if (!first) return undefined;
  const at = `基准原形 · ${dialectPrefix(first.dialect)}`.replace(/ · $/, "");
  if (PRONUNCIATION_FIELDS.some((field) => field === first.field)) {
    // 只统计与首个问题同侧的缺失项，避免把英式缺的和美式缺的混成一句。
    const missing = PRONUNCIATION_FIELDS.filter((field) =>
      issues.some(
        (issue) => issue.field === field && issue.dialect === first.dialect
      )
    );
    return `${at}缺少${missing
      .map((field) => PRONUNCIATION_FIELD_LABEL[field])
      .join("与")}`;
  }
  if (first.field === "pronunciations") {
    return `${at}还没有添加读音`;
  }
  return `${at}拼写尚未按主词填写完整`;
}

/** 派生词形的校验提示：指名词形类型、方言侧与缺失字段，而不是只报一个计数。 */
export function derivedFormIssueMessage(
  pos: WordPosFormsV2
): string | undefined {
  for (const group of pos.form_groups) {
    for (const slot of group.slots) {
      const issues = formSlotIssues(slot, pos.dialect_rules);
      const first = issues[0];
      if (!first) continue;
      const at = `${FORM_TYPE_LABEL[slot.form_type]} · ${dialectPrefix(
        first.dialect
      )}`.replace(/ · $/, "");
      if (PRONUNCIATION_FIELDS.some((field) => field === first.field)) {
        const missing = PRONUNCIATION_FIELDS.filter((field) =>
          issues.some(
            (issue) => issue.field === field && issue.dialect === first.dialect
          )
        );
        return `${at}缺少${missing
          .map((field) => PRONUNCIATION_FIELD_LABEL[field])
          .join("与")}`;
      }
      if (first.field === "pronunciations") return `${at}还没有添加读音`;
      return `${at}拼写尚未填写`;
    }
  }
  return undefined;
}

export function baseFormComplete(
  pos: WordPosFormsV2,
  headwords?: WordHeadwordsV2
): boolean {
  return !baseFormIssueTarget(pos, headwords);
}

/**
 * 某一侧方言在该词形组内的填写进度，供第 2 步折叠摘要显示
 * （"美式：3 项已填 / 1 项待填"）。基准原形与该组派生词形各算一项。
 */
export function dialectFormProgress(
  pos: WordPosFormsV2,
  groupIndex: number,
  dialect: Dialect
): { filled: number; pending: number } {
  const group = pos.form_groups[groupIndex];
  const slots = [pos.base_form, ...(group?.slots ?? [])];
  let filled = 0;
  let pending = 0;
  for (const slot of slots) {
    const blocked = formSlotIssues(slot, pos.dialect_rules).some(
      (issue) => issue.dialect === dialect
    );
    if (blocked) pending += 1;
    else filled += 1;
  }
  return { filled, pending };
}
