import type { RichTextAnnotation, RichTextV2 } from "@tsz/types";

type LiaisonRange = Pick<
  Extract<RichTextAnnotation, { type: "liaison" }>,
  "start" | "end" | "start_len" | "end_len"
>;

export function liaisonAnchorKey(liaison: LiaisonRange): string {
  return `${liaison.start}:${liaison.end}:${liaison.start_len ?? 1}:${liaison.end_len ?? 1}`;
}

export interface LiaisonAnchorSpans {
  start: { start: number; end: number };
  end: { start: number; end: number };
}

export type LiaisonAdjustment = Pick<
  Extract<RichTextAnnotation, { type: "liaison" }>,
  "left_offset_pct" | "right_offset_pct"
>;

export const LIAISON_ADJUSTMENT_LIMITS = {
  left_offset_pct: 100,
  right_offset_pct: 100
} as const;

export function liaisonAdjustment({
  left_offset_pct,
  right_offset_pct
}: LiaisonAdjustment): LiaisonAdjustment {
  return {
    ...(left_offset_pct ? { left_offset_pct } : {}),
    ...(right_offset_pct ? { right_offset_pct } : {})
  };
}

/** 试听及正式配音只取连读锚点，缺省宽度与显式 1 等价。 */
export function normalizeSpeechLiaisons(content: RichTextV2): RichTextV2 {
  let changed = false;
  const annotations = content.annotations.map((annotation) => {
    if (
      annotation.type !== "liaison" ||
      (annotation.left_offset_pct === undefined &&
        annotation.right_offset_pct === undefined &&
        annotation.start_len !== 1 &&
        annotation.end_len !== 1)
    )
      return annotation;
    changed = true;
    const {
      left_offset_pct: _left,
      right_offset_pct: _right,
      start_len,
      end_len,
      ...anchors
    } = annotation;
    return {
      ...anchors,
      ...(start_len !== undefined && start_len !== 1 ? { start_len } : {}),
      ...(end_len !== undefined && end_len !== 1 ? { end_len } : {})
    };
  });
  return changed ? { ...content, annotations } : content;
}

/**
 * 连读两端锚点各占的码点区间（右开）。宽度缺省 1、最少 1；两端不能交叉，
 * 交叉时各退回 1 个码点——宁可画短，也不要让只读视图与编辑器各算各的。
 * 编辑器、只读切段、只读量弧三处都从这里取，避免三份算法各自钳位。
 */
export function liaisonAnchorSpans(liaison: LiaisonRange): LiaisonAnchorSpans {
  const length = Math.max(1, liaison.end - liaison.start);
  let startLen = Math.min(length, Math.max(1, liaison.start_len ?? 1));
  let endLen = Math.min(length, Math.max(1, liaison.end_len ?? 1));
  if (startLen + endLen > length) {
    startLen = 1;
    endLen = 1;
  }
  return {
    start: { start: liaison.start, end: liaison.start + startLen },
    end: { start: liaison.end - endLen, end: liaison.end }
  };
}
