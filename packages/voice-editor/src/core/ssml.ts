import type { RichText, RichTextAnnotation } from "@tsz/types";
import type { VoiceSettings } from "../types";
import { codePointLength, codePointSlice } from "./codepoints";
import { toRichTextV2 } from "./normalize";

export interface SsmlPreviewOptions extends VoiceSettings {
  locale: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function activeAt<T extends RichTextAnnotation["type"]>(
  annotations: RichTextAnnotation[],
  type: T,
  offset: number
): Extract<RichTextAnnotation, { type: T }> | undefined {
  return annotations.find(
    (annotation): annotation is Extract<RichTextAnnotation, { type: T }> =>
      annotation.type === type &&
      "start" in annotation &&
      annotation.start <= offset &&
      offset < annotation.end
  );
}

function speechKey(annotations: RichTextAnnotation[], offset: number): string {
  const emphasis = activeAt(annotations, "emphasis", offset);
  const phoneme = activeAt(annotations, "phoneme", offset);
  return `${emphasis?.level ?? ""}|${phoneme?.start ?? ""}|${phoneme?.end ?? ""}|${phoneme?.phoneme ?? ""}`;
}

export function buildSsmlPreview(
  value: RichText,
  options: SsmlPreviewOptions
): string {
  const content = toRichTextV2(value);
  const length = codePointLength(content.text);
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
  let body = "";
  let offset = 0;
  while (offset < length) {
    const pause = pauses.get(offset);
    if (pause !== undefined) body += `<break time="${pause}ms"/>`;
    const point = codePointSlice(content.text, offset, offset + 1);
    if (point === "\n") {
      body += '<break time="500ms"/>';
      offset += 1;
      continue;
    }

    const key = speechKey(content.annotations, offset);
    let end = offset + 1;
    while (
      end < length &&
      !pauses.has(end) &&
      codePointSlice(content.text, end, end + 1) !== "\n" &&
      speechKey(content.annotations, end) === key
    ) {
      end += 1;
    }
    let segment = escapeXml(codePointSlice(content.text, offset, end));
    const phoneme = activeAt(content.annotations, "phoneme", offset);
    const emphasis = activeAt(content.annotations, "emphasis", offset);
    if (phoneme) {
      segment = `<phoneme alphabet="ipa" ph="${escapeXml(phoneme.phoneme)}">${segment}</phoneme>`;
    }
    if (emphasis) {
      segment = `<emphasis level="${escapeXml(emphasis.level)}">${segment}</emphasis>`;
    }
    body += segment;
    offset = end;
  }
  const trailingPause = pauses.get(length);
  if (trailingPause !== undefined) {
    body += `<break time="${trailingPause}ms"/>`;
  }

  const prosody = [
    options.ratePercent
      ? `rate="${options.ratePercent > 0 ? "+" : ""}${options.ratePercent}%"`
      : "",
    options.pitchSemitones
      ? `pitch="${options.pitchSemitones > 0 ? "+" : ""}${options.pitchSemitones}st"`
      : ""
  ]
    .filter(Boolean)
    .join(" ");
  if (prosody) body = `<prosody ${prosody}>${body}</prosody>`;
  if (options.style) {
    body = `<mstts:express-as style="${escapeXml(options.style)}" styledegree="1">${body}</mstts:express-as>`;
  }
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
    `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${escapeXml(options.locale)}">\n` +
    `  <voice name="${escapeXml(options.voiceId)}">${body}</voice>\n` +
    `</speak>`
  );
}
