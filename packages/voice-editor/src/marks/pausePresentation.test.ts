import { expect, it } from "vitest";
import { pauseMarkerLabel, pauseMarkerWidth } from "./pausePresentation";

it("停顿标签宽度随时长先快后慢增长，长停顿仍紧凑，保留精确秒数", () => {
  const widths = [100, 150, 200, 250, 500, 1000, 5000].map(pauseMarkerWidth);
  expect(widths[0]).toBeCloseTo(42.67, 2);
  expect(pauseMarkerWidth(500)).toBe(48);
  expect(pauseMarkerWidth(1000)).toBeCloseTo(50.67, 2);
  expect(pauseMarkerWidth(5000)).toBeCloseTo(54.55, 2);
  expect(pauseMarkerWidth(1)).toBeGreaterThanOrEqual(40);
  expect(widths.at(-1)).toBeLessThanOrEqual(56);
  for (let index = 1; index < widths.length; index++)
    expect(widths[index]).toBeGreaterThan(widths[index - 1]!);
  expect(widths[1]! - widths[0]!).toBeGreaterThan(widths[2]! - widths[1]!);
  expect(widths[2]! - widths[1]!).toBeGreaterThan(widths[3]! - widths[2]!);
  expect(pauseMarkerWidth(5000) - pauseMarkerWidth(1000)).toBeGreaterThan(3);
  expect(pauseMarkerLabel(100)).toBe("0.1 s");
  expect(pauseMarkerLabel(150)).toBe("0.15 s");
  expect(pauseMarkerLabel(1001)).toBe("1.001 s");
  expect(pauseMarkerLabel(1)).toBe("0.001 s");
});
