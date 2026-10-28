import { expect, it } from "vitest";
import { formatEstimatedCost } from "./cost";

it("未知、零和微额预估费用不混淆，十进制金额不损失整数精度", () => {
  expect(formatEstimatedCost(null)).toBe("未知");
  expect(formatEstimatedCost("0.000000000000")).toBe("¥0.00");
  expect(formatEstimatedCost("0.00000002")).toBe("<¥0.000001");
  expect(formatEstimatedCost("0.001392000000")).toBe("¥0.001392");
  expect(formatEstimatedCost("999.9999999")).toBe("¥1,000.00");
  expect(formatEstimatedCost("9007199254740993.120001")).toBe(
    "¥9,007,199,254,740,993.120001"
  );
  expect(formatEstimatedCost("-1")).toBe("未知");
});
