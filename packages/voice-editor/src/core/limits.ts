// 富文本的内容上限，1:1 镜像后端 tsz-rust `docs/frontend-integration.md` §13.1。
//
// 为什么必须在前端拦：正文长度 / 标注数 / IPA / 停顿超限时，后端不给专门的错误码，
// 失败会并入所在字段的既有码（语法结构 grammar_variants_invalid、释义
// definition_invalid、例句 sentence_incomplete）。管理员只会看到「这个字段不合法」，
// 不知道是「因为太长」，只能反复试错。这是后端刻意保持的现状（RichText 子码不外泄）。
import type { RichText, RichTextAnnotation } from "@tsz/types";
import { isRichTextV2 } from "@tsz/types";
import { codePointLength } from "./codepoints";

/** 单段富文本正文长度上限，单位是 Unicode 码点而非 UTF-16 length。 */
export const MAX_RICH_TEXT_CODE_POINTS = 5000;
/** 单段富文本标注数上限；V1 的 spans 与 liaisons 各自独立计。 */
export const MAX_RICH_TEXT_ANNOTATIONS = 500;
/** 单个 IPA 音素长度上限（码点）；音素同时不能为空。 */
export const MAX_PHONEME_CODE_POINTS = 200;
/** 单个停顿时长范围（毫秒），且必须是整数。 */
export const MIN_PAUSE_MS = 1;
export const MAX_PAUSE_MS = 5000;

export interface RichTextLimitIssue {
  code:
    | "text_too_long"
    | "too_many_annotations"
    | "invalid_phoneme"
    | "invalid_pause";
  /** 面向管理员的提示：说明超了什么、超了多少，而不是只说「内容过长」。 */
  message: string;
}

/** 「N 个，超出上限 M，请删减 K 个」——超限提示必须给出可执行的删减量。 */
function overBy(actual: number, limit: number, unit: string): string {
  return `${actual} ${unit}，超出上限 ${limit}，请删减 ${actual - limit} ${unit}`;
}

/** 同类标注里的第几个（1 起）；用 annotations 的全局下标对管理员没有意义。 */
function ordinalAmong(
  annotations: readonly RichTextAnnotation[],
  index: number
): number {
  const type = annotations[index]!.type;
  return annotations.slice(0, index + 1).filter((item) => item.type === type)
    .length;
}

function annotationIssues(
  annotations: readonly RichTextAnnotation[]
): RichTextLimitIssue[] {
  const issues: RichTextLimitIssue[] = [];
  annotations.forEach((annotation, index) => {
    const ordinal = ordinalAmong(annotations, index);
    if (annotation.type === "phoneme") {
      const phoneme = annotation.phoneme.trim();
      const length = codePointLength(phoneme);
      if (!phoneme) {
        issues.push({
          code: "invalid_phoneme",
          message: `第 ${ordinal} 个 IPA 标注为空，请填写音素或删除该标注`
        });
      } else if (length > MAX_PHONEME_CODE_POINTS) {
        issues.push({
          code: "invalid_phoneme",
          message: `第 ${ordinal} 个 IPA 标注 ${overBy(
            length,
            MAX_PHONEME_CODE_POINTS,
            "个字符"
          )}`
        });
      }
      return;
    }
    if (annotation.type !== "pause") return;
    const duration = annotation.duration_ms;
    if (
      !Number.isInteger(duration) ||
      duration < MIN_PAUSE_MS ||
      duration > MAX_PAUSE_MS
    ) {
      issues.push({
        code: "invalid_pause",
        message: `第 ${ordinal} 个停顿时长 ${duration}ms 不合法，必须是 ${MIN_PAUSE_MS}–${MAX_PAUSE_MS}ms 的整数`
      });
    }
  });
  return issues;
}

/**
 * 逐段富文本按 §13.1 做长度/数量预检。只管上限，不做区间重叠、跨段落这类结构校验
 * （那些归 `validateRichTextV2`）——保存路径要拦的是「超限」，不该顺带拒掉历史数据。
 */
export function richTextLimitIssues(value: RichText): RichTextLimitIssue[] {
  const issues: RichTextLimitIssue[] = [];
  // 码点而非 `.length`：emoji 与 BMP 外字符在 UTF-16 里占 2 个 code unit，会误判。
  const length = codePointLength(value.text);
  if (length > MAX_RICH_TEXT_CODE_POINTS) {
    issues.push({
      code: "text_too_long",
      message: `正文 ${overBy(length, MAX_RICH_TEXT_CODE_POINTS, "个字符")}`
    });
  }

  if (isRichTextV2(value)) {
    if (value.annotations.length > MAX_RICH_TEXT_ANNOTATIONS) {
      issues.push({
        code: "too_many_annotations",
        message: `标注 ${overBy(
          value.annotations.length,
          MAX_RICH_TEXT_ANNOTATIONS,
          "个"
        )}`
      });
    }
    issues.push(...annotationIssues(value.annotations));
    return issues;
  }

  // V1：spans 与 liaisons 各自独立计 500，不是合计。
  for (const [items, label] of [
    [value.spans, "文本样式标注"],
    [value.liaisons, "连读标注"]
  ] as const) {
    if (items.length > MAX_RICH_TEXT_ANNOTATIONS) {
      issues.push({
        code: "too_many_annotations",
        message: `${label} ${overBy(
          items.length,
          MAX_RICH_TEXT_ANNOTATIONS,
          "个"
        )}`
      });
    }
  }
  return issues;
}
