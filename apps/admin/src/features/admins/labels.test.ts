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
  it("403 按操作分文案：启禁用说不能启禁用超管", () => {
    expect(
      adminActionError(
        new HttpError(403, "cannot change a super admin"),
        "status",
        "操作失败"
      )
    ).toBe("不能启禁用超级管理员");
  });

  it("403 按操作分文案：重置密码说不能重置超管密码", () => {
    expect(
      adminActionError(
        new HttpError(403, "cannot reset a super admin"),
        "reset",
        "重置失败"
      )
    ).toBe("不能重置超级管理员的密码");
  });

  it("404 → 目标管理员不存在", () => {
    expect(
      adminActionError(
        new HttpError(404, "admin not found"),
        "status",
        "操作失败"
      )
    ).toBe("该管理员不存在，可能已被删除");
  });

  it("422 → 参数不合法", () => {
    expect(
      adminActionError(
        new HttpError(422, "invalid_request_body"),
        "status",
        "操作失败"
      )
    ).toBe("请求参数不合法");
  });

  it("其它 HttpError 回退到后端原文", () => {
    expect(
      adminActionError(new HttpError(500, "boom"), "reset", "操作失败")
    ).toBe("boom");
  });

  it("普通 Error 用 message", () => {
    expect(adminActionError(new Error("网络断了"), "status", "操作失败")).toBe(
      "网络断了"
    );
  });

  it("非 Error / 空 message 用 fallback", () => {
    expect(adminActionError({}, "status", "操作失败")).toBe("操作失败");
    expect(adminActionError(new Error(""), "reset", "操作失败")).toBe(
      "操作失败"
    );
  });
});
