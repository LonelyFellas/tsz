import { describe, expect, it } from "vitest";
import { tagTextColor } from "./tagColors";

describe("自定义标签颜色", () => {
  it("antd 浅色填充上的自定义颜色始终使用深色文字", () => {
    expect(tagTextColor("#FFFFFF")).toBe("#000");
    expect(tagTextColor("#000000")).toBe("#000");
    expect(tagTextColor("#FF0000")).toBe("#000");
    expect(tagTextColor("blue")).toBeUndefined();
  });
});
