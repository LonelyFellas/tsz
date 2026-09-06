import type { RichTextAnnotation } from "@tsz/types";

type LiaisonRange = Pick<
  Extract<RichTextAnnotation, { type: "liaison" }>,
  "start" | "end" | "start_len" | "end_len"
>;

export interface LiaisonAnchorSpans {
  start: { start: number; end: number };
  end: { start: number; end: number };
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
