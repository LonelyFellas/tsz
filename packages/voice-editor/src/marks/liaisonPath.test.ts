import { describe, expect, it } from "vitest";
import { liaisonPath, liaisonRiseEm, liaisonStrokeWidth } from "./liaisonPath";

describe("liaisonRiseEm", () => {
  it("never drops below the floor, so touching letters still show an arc", () => {
    expect(liaisonRiseEm(0)).toBe(0.18);
    expect(liaisonRiseEm(0.1)).toBe(0.18);
  });

  it("rises with the span while the span stays short", () => {
    expect(liaisonRiseEm(1)).toBeCloseTo(0.3225, 4);
    expect(liaisonRiseEm(1.5)).toBeCloseTo(0.48375, 4);
  });

  it("switches to the flatter curve past the 1.5em hand-off", () => {
    // 0.484 + 0.16·√2.5
    expect(liaisonRiseEm(4)).toBeCloseTo(0.737, 3);
  });

  it("hands off with only a hairline step between the two branches", () => {
    // sqrt 在 0 附近陡，交接处两段并不严丝合缝：约 0.002em，
    // 20px 字号下不到 0.05px，肉眼看不出，但别误以为它是连续的。
    const step = Math.abs(liaisonRiseEm(1.5001) - liaisonRiseEm(1.5));
    expect(step).toBeLessThan(0.003);
  });

  it("caps the rise so a sentence-long link stays a shallow arc", () => {
    expect(liaisonRiseEm(50)).toBe(1);
    expect(liaisonRiseEm(500)).toBe(1);
  });
});

describe("liaisonPath", () => {
  it("draws a symmetric cubic whose apex sits the rise above the tips", () => {
    const path = liaisonPath({ x: 0, tipY: 100 }, { x: 96, tipY: 100 }, 96);
    // spanEm = 1 → rise 0.3225em = 30.96px → apex 69.04
    // controlY = (69.04 - 0.125 * 200) / 0.75 = 58.72
    expect(path).toBe("M 0 100 C 0 58.72, 96 58.72, 96 100");
  });

  it("keeps both control points on one line for uneven tip heights", () => {
    const path = liaisonPath({ x: 10, tipY: 100 }, { x: 106, tipY: 80 }, 96);
    const control = /C \S+ (\S+),/.exec(path)?.[1];
    expect(path.startsWith("M 10 100")).toBe(true);
    expect(path.endsWith("106 80")).toBe(true);
    expect(Number(control)).toBeLessThan(80);
  });

  it("produces a flatter arc per em as the span grows", () => {
    const shortSpan = liaisonRiseEm(1) * 96;
    const longSpan = liaisonRiseEm(10) * 96;
    expect(longSpan).toBeGreaterThan(shortSpan);
    // 抬升的增长远慢于跨度：10 倍跨度换不到 3 倍高度。
    expect(longSpan / shortSpan).toBeLessThan(3);
  });
});

describe("liaisonStrokeWidth", () => {
  it("scales with the font size", () => {
    expect(liaisonStrokeWidth(96)).toBeCloseTo(6.72, 2);
    expect(liaisonStrokeWidth(20)).toBeCloseTo(1.4, 2);
  });
});
