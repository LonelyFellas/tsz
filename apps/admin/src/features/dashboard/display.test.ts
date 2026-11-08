import { describe, expect, it } from "vitest";
import { formatAmount } from "./display";

describe("dashboard display", () => {
  it("格式化硬币金额时保留字符串精度并按三位分组", () => {
    expect(formatAmount("2793")).toBe("2,793");
    expect(formatAmount("-1234")).toBe("-1,234");
    expect(formatAmount("0")).toBe("0");
    expect(formatAmount("abc")).toBe("abc");
    expect(formatAmount("9007199254740993")).toBe("9,007,199,254,740,993");
  });
});
