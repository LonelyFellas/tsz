import type { RichTextV2V3 } from "@tsz/types";
import { graphemes } from "../editor/next/tokens";
import { normalizeRichTextV2 } from "./normalize";
import { editRichText } from "./edit-text";

/** 与后端 normalize_headword 的 display 一致；不使用会小写的搜索 key。 */
export function normalizeSpellingRich(value: RichTextV2V3): RichTextV2V3 {
  // 后端拒绝控制字符，不先把非法输入折叠成合法拼写。
  if (/\p{Cc}/u.test(value.text)) return value;
  let next = value;
  // 分别迁移每个变化，避免首尾同时规范化时把中间未改的词误判为整段替换。
  for (const cluster of graphemes(value.text).reverse()) {
    const normalized = cluster.text.normalize("NFKC");
    if (normalized === cluster.text) continue;
    const points = Array.from(next.text);
    points.splice(cluster.offset, Array.from(cluster.text).length, normalized);
    next = editRichText(next, points.join(""));
  }
  const nfkc = value.text.normalize("NFKC");
  if (next.text !== nfkc) next = editRichText(next, nfkc);
  const spaces = [...next.text.matchAll(/\p{White_Space}+/gu)];
  for (const match of spaces.reverse()) {
    const start = match.index;
    const end = start + match[0].length;
    const replacement = start === 0 || end === next.text.length ? "" : " ";
    if (match[0] !== replacement) {
      next = editRichText(
        next,
        next.text.slice(0, start) + replacement + next.text.slice(end)
      );
    }
  }
  return next;
}

export function spellingAnnotationsEqual(
  left: RichTextV2V3,
  right: RichTextV2V3
): boolean {
  try {
    const annotations = (value: RichTextV2V3) =>
      normalizeRichTextV2({
        ...value,
        annotations: value.annotations.map((annotation) => {
          if (annotation.type === "liaison")
            return {
              type: annotation.type,
              start: annotation.start,
              end: annotation.end,
              start_len: annotation.start_len ?? 1,
              end_len: annotation.end_len ?? 1
            };
          if (annotation.type === "italic")
            return {
              type: annotation.type,
              start: annotation.start,
              end: annotation.end
            };
          return annotation;
        })
      }).annotations;
    return (
      JSON.stringify(annotations(left)) === JSON.stringify(annotations(right))
    );
  } catch {
    return false;
  }
}
