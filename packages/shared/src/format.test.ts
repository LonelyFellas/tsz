import { describe, expect, it } from "vitest";
import { formatCoins, toDateString } from "./format";

describe("toDateString", () => {
  it("输出 YYYY-MM-DD", () => {
    expect(toDateString(new Date("2026-06-22T08:30:00Z"))).toBe("2026-06-22");
  });
});

describe("formatCoins", () => {
  it("拼出天生币文案", () => {
    expect(formatCoins(10)).toBe("10 天生币");
  });
});
