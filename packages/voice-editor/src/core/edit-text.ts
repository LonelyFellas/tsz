import type { RichText, RichTextV2 } from "@tsz/types";
import {
  annotationsToMarks,
  marksToAnnotations,
  remapMarks
} from "../editor/next/tokens";
import { toRichTextV2 } from "./normalize";

/** 文本框降级时沿用编辑器的区间迁移，避免输入后把旧标注留在错误的词上。 */
export function editRichText(value: RichText, text: string): RichTextV2 {
  const previous = toRichTextV2(value);
  return {
    version: 2,
    text,
    annotations: marksToAnnotations(
      text,
      remapMarks(previous.text, text, annotationsToMarks(previous))
    )
  };
}
