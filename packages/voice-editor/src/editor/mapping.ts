import type { JSONContent } from "@tiptap/core";
import type { RichText, RichTextAnnotation, RichTextV2 } from "@tsz/types";
import { codePointLength, normalizeRichTextV2, toRichTextV2 } from "../core";

type RangeAnnotation = Exclude<RichTextAnnotation, { type: "pause" }>;

function marksAt(
  annotations: RichTextAnnotation[],
  offset: number
): NonNullable<JSONContent["marks"]> {
  const marks: NonNullable<JSONContent["marks"]> = [];
  for (const annotation of annotations) {
    if (
      annotation.type === "pause" ||
      annotation.start > offset ||
      annotation.end <= offset
    ) {
      continue;
    }
    if (annotation.type === "emphasis") {
      marks.push({ type: "emphasis", attrs: { level: annotation.level } });
    } else if (annotation.type === "phoneme") {
      marks.push({
        type: "phoneme",
        attrs: { phoneme: annotation.phoneme }
      });
    } else if (annotation.type === "liaison") {
      marks.push({ type: "liaison" });
    } else {
      marks.push({
        type: "voiceHighlight",
        attrs: { color: annotation.color }
      });
    }
  }
  return marks;
}

function markKey(marks: NonNullable<JSONContent["marks"]>): string {
  return JSON.stringify(marks);
}

export function richTextToEditorJson(value: RichText): JSONContent {
  const content = toRichTextV2(value);
  const points = Array.from(content.text);
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
  const paragraphs: JSONContent[] = [];
  let paragraph: JSONContent[] = [];
  let offset = 0;

  const flushText = (start: number, end: number) => {
    const marks = marksAt(content.annotations, start);
    paragraph.push({
      type: "text",
      text: points.slice(start, end).join(""),
      marks: marks.length > 0 ? marks : undefined
    });
  };

  while (offset <= points.length) {
    const pause = pauses.get(offset);
    if (pause !== undefined) {
      paragraph.push({ type: "voicePause", attrs: { durationMs: pause } });
    }
    if (offset === points.length) break;
    if (points[offset] === "\n") {
      paragraphs.push({
        type: "paragraph",
        content: paragraph.length > 0 ? paragraph : undefined
      });
      paragraph = [];
      offset += 1;
      continue;
    }
    const key = markKey(marksAt(content.annotations, offset));
    let end = offset + 1;
    while (
      end < points.length &&
      points[end] !== "\n" &&
      !pauses.has(end) &&
      markKey(marksAt(content.annotations, end)) === key
    ) {
      end += 1;
    }
    flushText(offset, end);
    offset = end;
  }
  paragraphs.push({
    type: "paragraph",
    content: paragraph.length > 0 ? paragraph : undefined
  });
  return { type: "doc", content: paragraphs };
}

function annotationsFromMarks(
  marks: NonNullable<JSONContent["marks"]>,
  start: number,
  end: number
): RangeAnnotation[] {
  const annotations: RangeAnnotation[] = [];
  for (const mark of marks) {
    if (mark.type === "emphasis") {
      annotations.push({
        type: "emphasis",
        start,
        end,
        level: "strong"
      });
    } else if (mark.type === "phoneme") {
      annotations.push({
        type: "phoneme",
        start,
        end,
        alphabet: "ipa",
        phoneme: String(mark.attrs?.phoneme ?? "")
      });
    } else if (mark.type === "liaison") {
      annotations.push({ type: "liaison", start, end });
    } else if (mark.type === "voiceHighlight") {
      annotations.push({
        type: "highlight",
        start,
        end,
        color: (mark.attrs?.color ?? "yellow") as Extract<
          RichTextAnnotation,
          { type: "highlight" }
        >["color"]
      });
    }
  }
  return annotations;
}

export function editorJsonToRichTextV2(doc: JSONContent): RichTextV2 {
  const annotations: RichTextAnnotation[] = [];
  let text = "";
  const paragraphs = (doc.content ?? []).filter(
    (node) => node.type === "paragraph"
  );
  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (paragraphIndex > 0) text += "\n";
    for (const node of paragraph.content ?? []) {
      const offset = codePointLength(text);
      if (node.type === "voicePause") {
        annotations.push({
          type: "pause",
          at: offset,
          duration_ms: Number(node.attrs?.durationMs ?? 300)
        });
        continue;
      }
      if (node.type !== "text" || !node.text) continue;
      text += node.text;
      annotations.push(
        ...annotationsFromMarks(
          node.marks ?? [],
          offset,
          offset + codePointLength(node.text)
        )
      );
    }
  });
  return normalizeRichTextV2({ version: 2, text, annotations });
}
