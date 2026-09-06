import { describe, expect, it } from "vitest";
import { liaisonAnchorSpans } from "./liaison";

describe("liaisonAnchorSpans", () => {
  it("defaults both anchors to one code point", () => {
    expect(liaisonAnchorSpans({ start: 2, end: 8 })).toEqual({
      start: { start: 2, end: 3 },
      end: { start: 7, end: 8 }
    });
  });

  it("honours widths and clamps non-positive or oversized ones", () => {
    expect(
      liaisonAnchorSpans({ start: 2, end: 8, start_len: 2, end_len: 3 })
    ).toEqual({ start: { start: 2, end: 4 }, end: { start: 5, end: 8 } });
    // 0 抬到 1；99 超过整段长度，两端一相加就交叉，各退回 1
    expect(
      liaisonAnchorSpans({ start: 2, end: 8, start_len: 0, end_len: 99 })
    ).toEqual({ start: { start: 2, end: 3 }, end: { start: 7, end: 8 } });
  });

  it("falls back to single letters when the two anchors would cross", () => {
    expect(
      liaisonAnchorSpans({ start: 2, end: 6, start_len: 3, end_len: 3 })
    ).toEqual({ start: { start: 2, end: 3 }, end: { start: 5, end: 6 } });
  });
});
