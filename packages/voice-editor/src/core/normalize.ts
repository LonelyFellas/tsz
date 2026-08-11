import type {
  RichText,
  RichTextAnnotation,
  RichTextV1,
  RichTextV2
} from "@tsz/types";
import { isRichTextV2 } from "@tsz/types";
import {
  codePointLength,
  codePointRangeContainsNewline,
  codePointSlice
} from "./codepoints";

export const MAX_RICH_TEXT_CODE_POINTS = 5000;
export const MAX_RICH_TEXT_ANNOTATIONS = 500;
export const MAX_PAUSE_MS = 5000;

export interface RichTextValidationIssue {
  code:
    | "text_too_long"
    | "too_many_annotations"
    | "invalid_range"
    | "cross_paragraph"
    | "invalid_phoneme"
    | "overlapping_phoneme"
    | "crossing_speech_marks"
    | "pause_inside_phoneme"
    | "invalid_pause";
  path: string;
  message: string;
}

export class RichTextValidationError extends Error {
  constructor(public readonly issues: RichTextValidationIssue[]) {
    super(issues[0]?.message ?? "富文本标注不合法");
    this.name = "RichTextValidationError";
  }
}

type RangeAnnotation = Exclude<RichTextAnnotation, { type: "pause" }>;
type MergeableAnnotation = Exclude<RangeAnnotation, { type: "phoneme" }>;

function positionOf(annotation: RichTextAnnotation): number {
  return annotation.type === "pause" ? annotation.at : annotation.start;
}

function typeRank(annotation: RichTextAnnotation): number {
  return ["pause", "highlight", "liaison", "emphasis", "phoneme"].indexOf(
    annotation.type
  );
}

function sameMergeAttributes(
  left: MergeableAnnotation,
  right: MergeableAnnotation
): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "emphasis" && right.type === "emphasis") {
    return left.level === right.level;
  }
  if (left.type === "highlight" && right.type === "highlight") {
    return left.color === right.color;
  }
  return left.type === "liaison" && right.type === "liaison";
}

export function validateRichTextV2(
  value: RichTextV2
): RichTextValidationIssue[] {
  const issues: RichTextValidationIssue[] = [];
  const length = codePointLength(value.text);
  if (length > MAX_RICH_TEXT_CODE_POINTS) {
    issues.push({
      code: "text_too_long",
      path: "text",
      message: `正文不能超过 ${MAX_RICH_TEXT_CODE_POINTS} 个 Unicode 码点`
    });
  }
  if (value.annotations.length > MAX_RICH_TEXT_ANNOTATIONS) {
    issues.push({
      code: "too_many_annotations",
      path: "annotations",
      message: `标注不能超过 ${MAX_RICH_TEXT_ANNOTATIONS} 个`
    });
  }

  value.annotations.forEach((annotation, index) => {
    const path = `annotations[${index}]`;
    if (annotation.type === "pause") {
      if (
        !Number.isInteger(annotation.at) ||
        annotation.at < 0 ||
        annotation.at > length ||
        !Number.isInteger(annotation.duration_ms) ||
        annotation.duration_ms < 1 ||
        annotation.duration_ms > MAX_PAUSE_MS
      ) {
        issues.push({
          code: "invalid_pause",
          path,
          message: `停顿位置必须合法，时长必须是 1–${MAX_PAUSE_MS}ms 的整数`
        });
      }
      return;
    }

    if (
      !Number.isInteger(annotation.start) ||
      !Number.isInteger(annotation.end) ||
      annotation.start < 0 ||
      annotation.end > length ||
      annotation.start >= annotation.end
    ) {
      issues.push({
        code: "invalid_range",
        path,
        message: "标注区间必须是正文内非空的 [start, end)"
      });
      return;
    }
    if (
      codePointRangeContainsNewline(
        value.text,
        annotation.start,
        annotation.end
      )
    ) {
      issues.push({
        code: "cross_paragraph",
        path,
        message: "标注不能跨越段落换行"
      });
    }
    if (
      annotation.type === "phoneme" &&
      (!annotation.phoneme.trim() ||
        codePointLength(annotation.phoneme.trim()) > 200)
    ) {
      issues.push({
        code: "invalid_phoneme",
        path,
        message: "IPA 不能为空且不能超过 200 个码点"
      });
    }
  });

  const phonemes = value.annotations
    .filter(
      (
        annotation
      ): annotation is Extract<RichTextAnnotation, { type: "phoneme" }> =>
        annotation.type === "phoneme"
    )
    .sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 1; index < phonemes.length; index += 1) {
    if (phonemes[index]!.start < phonemes[index - 1]!.end) {
      issues.push({
        code: "overlapping_phoneme",
        path: "annotations",
        message: "IPA 标注之间不能重叠"
      });
      break;
    }
  }

  const emphases = value.annotations.filter(
    (
      annotation
    ): annotation is Extract<RichTextAnnotation, { type: "emphasis" }> =>
      annotation.type === "emphasis"
  );
  let crossingSpeechMarkFound = false;
  let pauseInsidePhonemeFound = false;
  for (const phoneme of phonemes) {
    if (
      !crossingSpeechMarkFound &&
      emphases.some(
        (emphasis) =>
          emphasis.start < phoneme.end &&
          emphasis.end > phoneme.start &&
          (emphasis.start > phoneme.start || emphasis.end < phoneme.end)
      )
    ) {
      issues.push({
        code: "crossing_speech_marks",
        path: "annotations",
        message: "重音若与 IPA 重叠，必须完整包含 IPA 区间"
      });
      crossingSpeechMarkFound = true;
    }
    if (
      !pauseInsidePhonemeFound &&
      value.annotations.some(
        (annotation) =>
          annotation.type === "pause" &&
          annotation.at > phoneme.start &&
          annotation.at < phoneme.end
      )
    ) {
      issues.push({
        code: "pause_inside_phoneme",
        path: "annotations",
        message: "停顿不能插在 IPA 标注内部"
      });
      pauseInsidePhonemeFound = true;
    }
  }

  return issues;
}

export function normalizeRichTextV2(value: RichTextV2): RichTextV2 {
  const issues = validateRichTextV2(value);
  if (issues.length > 0) throw new RichTextValidationError(issues);

  const pauses = new Map<
    number,
    Extract<RichTextAnnotation, { type: "pause" }>
  >();
  const ranges: RangeAnnotation[] = [];
  for (const annotation of value.annotations) {
    if (annotation.type === "pause")
      pauses.set(annotation.at, { ...annotation });
    else ranges.push({ ...annotation });
  }
  ranges.sort(
    (a, b) =>
      a.start - b.start ||
      a.end - b.end ||
      typeRank(a) - typeRank(b) ||
      JSON.stringify(a).localeCompare(JSON.stringify(b))
  );

  const merged: RangeAnnotation[] = [];
  for (const annotation of ranges) {
    if (annotation.type === "phoneme") {
      merged.push(annotation);
      continue;
    }
    const previous = [...merged]
      .reverse()
      .find(
        (candidate): candidate is MergeableAnnotation =>
          candidate.type !== "phoneme" &&
          sameMergeAttributes(candidate, annotation)
      );
    if (previous && annotation.start <= previous.end) {
      previous.end = Math.max(previous.end, annotation.end);
    } else {
      merged.push(annotation);
    }
  }

  const annotations: RichTextAnnotation[] = [
    ...merged,
    ...Array.from(pauses.values())
  ].sort(
    (a, b) =>
      positionOf(a) - positionOf(b) ||
      typeRank(a) - typeRank(b) ||
      JSON.stringify(a).localeCompare(JSON.stringify(b))
  );
  return { version: 2, text: value.text, annotations };
}

export function migrateRichTextV1(value: RichTextV1): RichTextV2 {
  const annotations: RichTextAnnotation[] = value.spans.map((span) =>
    span.type === "bold"
      ? {
          type: "emphasis" as const,
          start: span.start,
          end: span.end,
          level: "strong" as const
        }
      : {
          type: "highlight" as const,
          start: span.start,
          end: span.end,
          color: "blue" as const
        }
  );
  for (const liaison of value.liaisons) {
    annotations.push({
      type: "liaison",
      start: liaison,
      end: liaison + 2
    });
  }
  return normalizeRichTextV2({
    version: 2,
    text: value.text,
    annotations
  });
}

export function toRichTextV2(value: RichText): RichTextV2 {
  return isRichTextV2(value)
    ? normalizeRichTextV2({
        version: 2,
        text: value.text,
        annotations: value.annotations.map((annotation) => ({ ...annotation }))
      })
    : migrateRichTextV1(value);
}

export function selectedText(
  value: RichText,
  start: number,
  end: number
): string {
  return codePointSlice(value.text, start, end);
}
