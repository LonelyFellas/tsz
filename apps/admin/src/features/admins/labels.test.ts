import { describe, expect, it } from "vitest";
import { HttpError } from "@tsz/api-client";
import {
  ADMIN_LEVEL_LABEL,
  ADMIN_LEVEL_OPTIONS,
  adminActionError
} from "./labels";

describe("admins labels", () => {
  it("ADMIN_LEVEL_LABEL 映射两档", () => {
    expect(ADMIN_LEVEL_LABEL.admin).toBe("普通管理员");
    expect(ADMIN_LEVEL_LABEL.super_admin).toBe("超级管理员");
  });

  it("ADMIN_LEVEL_OPTIONS 与 label 一致、value 为 level", () => {
    expect(ADMIN_LEVEL_OPTIONS).toEqual([
      { label: "普通管理员", value: "admin" },
      { label: "超级管理员", value: "super_admin" }
    ]);
  });
});

describe("adminActionError", () => {
  it("409 → 禁用最后一个超管的中文提示", () => {
    expect(
      adminActionError(
        new HttpError(409, "cannot disable the last super admin"),
        "操作失败"
      )
    ).toBe("不能禁用最后一个超级管理员");
  });

  it("403 → 不能重置超管的中文提示", () => {
    expect(
      adminActionError(
        new HttpError(403, "cannot reset a super admin"),
        "重置失败"
      )
    ).toBe("不能重置超级管理员的密码");
  });

  it("其它 HttpError 回退到后端原文", () => {
    expect(adminActionError(new HttpError(500, "boom"), "操作失败")).toBe(
      "boom"
    );
  });

  it("普通 Error 用 message", () => {
    expect(adminActionError(new Error("网络断了"), "操作失败")).toBe(
      "网络断了"
    );
  });

  it("非 Error / 空 message 用 fallback", () => {
    expect(adminActionError({}, "操作失败")).toBe("操作失败");
    expect(adminActionError(new Error(""), "操作失败")).toBe("操作失败");
  });
});
