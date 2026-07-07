import { describe, expect, it } from "vitest";
import { HttpError } from "@tsz/api-client";
import {
  ROLE_LABEL,
  ROLE_TAG_COLOR,
  levelColor,
  userActionError
} from "./labels";

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

describe("userActionError", () => {
  it("403 → 需超级管理员权限的中文提示（不透传后端英文）", () => {
    expect(
      userActionError(new HttpError(403, "super admin required"), "操作失败")
    ).toBe("需超级管理员权限");
  });

  it("其它 HttpError 回退到后端原文", () => {
    expect(userActionError(new HttpError(500, "boom"), "操作失败")).toBe(
      "boom"
    );
  });

  it("普通 Error 用 message", () => {
    expect(userActionError(new Error("网络断了"), "操作失败")).toBe("网络断了");
  });

  it("非 Error / 空 message 用 fallback", () => {
    expect(userActionError("weird", "操作失败")).toBe("操作失败");
    expect(userActionError(new Error(""), "操作失败")).toBe("操作失败");
  });
});
