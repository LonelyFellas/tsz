import { describe, expect, it } from "vitest";
import { harmonicProbabilities } from "./playback";
describe("harmonic_v1", () => {
  it("normalizes effective ranks with the same five-item denominator as the server", () => {
    const probabilities = harmonicProbabilities(5);
    expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(
      1,
      12
    );
    expect(probabilities[0]).toBeCloseTo(60 / 137, 12);
    expect(probabilities[4]).toBeCloseTo(12 / 137, 12);
  });
  it("renormalizes a filtered accent independently and leaves an empty side empty", () => {
    expect(harmonicProbabilities(0)).toEqual([]);
    expect(harmonicProbabilities(1)).toEqual([1]);
    expect(harmonicProbabilities(2)).toEqual([2 / 3, 1 / 3]);
  });
});
