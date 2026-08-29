import { headwordIssue } from "./headwordValidation";

export type ClassifiedEntryInput = {
  normalized: string;
  kind: "word" | "phrase";
};

export type ValidatedEntryInput = ClassifiedEntryInput & { issue?: string };

/** Product-only routing decision; backend detection remains authoritative. */
export function classifyEntryInput(raw: string): ClassifiedEntryInput {
  const normalized = raw.trim().replace(/\s+/gu, " ");
  return {
    normalized,
    kind: normalized.includes(" ") ? "phrase" : "word"
  };
}

/** Step 1 与关联词共用的英文词条输入准备规则。 */
export function validateEntryInput(raw: string): ValidatedEntryInput {
  const classified = classifyEntryInput(raw);
  const issue = !classified.normalized
    ? "请输入词条"
    : (headwordIssue(classified.normalized) ??
      (classified.normalized.length > 200
        ? "词条不能超过 200 个字符"
        : undefined));
  return {
    ...classified,
    ...(issue ? { issue } : {})
  };
}
