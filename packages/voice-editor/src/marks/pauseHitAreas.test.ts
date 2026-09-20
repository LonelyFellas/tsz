import { describe, expect, it } from "vitest";
import { pauseHitWidths } from "./pauseHitAreas";

describe("密集停顿的命中区", () => {
  it("密集处以相邻中线留出间隔，但不改变标记中心", () => {
    const positions = [
      { x: 0, rowTop: 10 },
      { x: 15, rowTop: 10 },
      { x: 30, rowTop: 10 }
    ];
    const widths = pauseHitWidths(positions, 10);
    expect(widths).toEqual([13, 13, 13]);
    for (let index = 1; index < positions.length; index++) {
      const gap =
        positions[index]!.x -
        widths[index]! / 2 -
        (positions[index - 1]!.x + widths[index - 1]! / 2);
      expect(gap).toBeGreaterThanOrEqual(2);
    }
  });

  it("同一位置的不同行标记互不收窄，宽松位置保留原尺寸", () => {
    expect(
      pauseHitWidths(
        [
          { x: 10, rowTop: 0 },
          { x: 10, rowTop: 60 },
          { x: 80, rowTop: 60 }
        ],
        13
      )
    ).toEqual([22, 22, 22]);
  });

  it("轻微字形高度差仍按同一行处理，并保留输入顺序", () => {
    expect(
      pauseHitWidths(
        [
          { x: 30, rowTop: 1 },
          { x: 0, rowTop: 0 },
          { x: 15, rowTop: 2 }
        ],
        13
      )
    ).toEqual([13, 13, 13]);
    expect(pauseHitWidths([], 13)).toEqual([]);
  });
});
