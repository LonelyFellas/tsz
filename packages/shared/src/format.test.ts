import { describe, expect, it } from "vitest";
import { formatCoins, toDateString } from "./format";

describe("toDateString", () => {
  it("输出 YYYY-MM-DD(UTC)", () => {
    expect(toDateString(new Date("2026-06-22T08:30:00Z"))).toBe("2026-06-22");
  });

  it("UTC 跨日边界按 UTC 计算", () => {
    // 23:30Z 仍是当天(UTC)。
    expect(toDateString(new Date("2026-01-01T23:30:00Z"))).toBe("2026-01-01");
  });

  it("补零到两位", () => {
    expect(toDateString(new Date("2026-03-05T00:00:00Z"))).toBe("2026-03-05");
  });
});

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
});
