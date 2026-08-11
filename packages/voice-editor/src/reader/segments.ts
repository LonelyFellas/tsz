import type { RichText, RichTextAnnotation } from "@tsz/types";
import { codePointLength, codePointSlice, toRichTextV2 } from "../core";

export type RichTextRenderSegment =
  | {
      kind: "text";
      start: number;
      end: number;
      text: string;
      annotations: Exclude<RichTextAnnotation, { type: "pause" }>[];
    }
  | {
      kind: "pause";
      at: number;
      durationMs: number;
    };

export function segmentRichText(value: RichText): RichTextRenderSegment[] {
  const content = toRichTextV2(value);
  const length = codePointLength(content.text);
  const boundaries = new Set<number>([0, length]);
  for (const annotation of content.annotations) {
    if (annotation.type === "pause") boundaries.add(annotation.at);
    else {
      boundaries.add(annotation.start);
      boundaries.add(annotation.end);
    }
  }
  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  const pauses = new Map(
    content.annotations
      .filter(
        (
          annotation
        ): annotation is Extract<RichTextAnnotation, { type: "pause" }> =>
          annotation.type === "pause"
      )
      .map((annotation) => [annotation.at, annotation.duration_ms])
  );
  const segments: RichTextRenderSegment[] = [];
  sorted.forEach((start, index) => {
    const pause = pauses.get(start);
    if (pause !== undefined) {
      segments.push({ kind: "pause", at: start, durationMs: pause });
    }
    const end = sorted[index + 1];
    if (end === undefined || end <= start) return;
    const text = codePointSlice(content.text, start, end);
    segments.push({
      kind: "text",
      start,
      end,
      text,
      annotations: content.annotations.filter(
        (
          annotation
        ): annotation is Exclude<RichTextAnnotation, { type: "pause" }> =>
          annotation.type !== "pause" &&
          annotation.start <= start &&
          annotation.end >= end
      )
    });
  });
  return segments;
}
