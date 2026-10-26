import { describe, expect, it } from "vitest";
import { formatCoins } from "./format";

describe("formatCoins", () => {
  it("正数", () => {
    expect(formatCoins(10)).toBe("10 天生币");
  });
  it("零", () => {
    expect(formatCoins(0)).toBe("0 天生币");
  });
  it("负数", () => {
    expect(formatCoins(-5)).toBe("-5 天生币");
  });
  it("千位加分组符", () => {
    expect(formatCoins(12345)).toBe("12,345 天生币");
  });
  it("百万级多组分组", () => {
    expect(formatCoins(1000000)).toBe("1,000,000 天生币");
  });
  it("负的大额也分组", () => {
    expect(formatCoins(-12345)).toBe("-12,345 天生币");
  });
  it("四位边界即开始分组", () => {
    expect(formatCoins(1000)).toBe("1,000 天生币");
  });
});
