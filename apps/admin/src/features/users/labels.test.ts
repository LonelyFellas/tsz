import { describe, expect, it } from "vitest";
import { ROLE_LABEL, ROLE_TAG_COLOR, levelColor } from "./labels";

describe("users labels", () => {
  it("ROLE_LABEL / ROLE_TAG_COLOR", () => {
    expect(ROLE_LABEL.student).toBe("学生");
    expect(ROLE_LABEL.teacher).toBe("老师");
    expect(ROLE_LABEL.admin).toBe("管理员");
    expect(ROLE_TAG_COLOR.teacher).toBe("gold");
    expect(ROLE_TAG_COLOR.student).toBe("blue");
  });

  it("levelColor 已知等级映射到具体色", () => {
    expect(levelColor("A1")).toBe("green");
    expect(levelColor("B2")).toBe("geekblue");
    expect(levelColor("C2")).toBe("magenta");
  });

  it("levelColor 未知等级回退 default", () => {
    expect(levelColor("Z9")).toBe("default");
    expect(levelColor("")).toBe("default");
  });
});
