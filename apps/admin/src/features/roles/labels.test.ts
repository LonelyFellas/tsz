import { describe, expect, it } from "vitest";
import { HttpError } from "@tsz/api-client";
import {
  errorText,
  isPermissionLanded,
  isUnknownPermissionKeyError,
  LANDED_PERMISSIONS,
  ROLE_DESC_MAX,
  ROLE_NAME_MAX,
  roleMutationError,
  validateRoleName
} from "./labels";

describe("落地状态", () => {
  it("已落地的四个 key 判 true", () => {
    for (const k of [
      "users.access",
      "words.access",
      "wordlists.access",
      "reviews.access"
    ] as const) {
      expect(isPermissionLanded(k)).toBe(true);
    }
    expect(LANDED_PERMISSIONS.size).toBe(4);
  });

  it("未落地的 key 判 false", () => {
    for (const k of [
      "classes.access",
      "customdict.access",
      "sentences.access",
      "customwordlist.access",
      "tasks.access",
      "teacherapply.access",
      "comments.access",
      "coins.access"
    ] as const) {
      expect(isPermissionLanded(k)).toBe(false);
    }
  });
});

describe("validateRoleName", () => {
  it("长度上限常量", () => {
    expect(ROLE_NAME_MAX).toBe(50);
    expect(ROLE_DESC_MAX).toBe(200);
  });

  it("空 / 纯空白 → 提示填写", () => {
    expect(validateRoleName("")).toBe("请输入角色名");
    expect(validateRoleName("   ")).toBe("请输入角色名");
  });

  it("超过 50 字符 → 长度提示", () => {
    expect(validateRoleName("角".repeat(51))).toBe("角色名最长 50 字符");
  });

  it("含 < > 或控制字符 → 禁字符提示", () => {
    expect(validateRoleName("编辑<b>")).toBe("角色名不能包含 < > 或控制字符");
    expect(validateRoleName("零宽​角色")).toBe("角色名不能包含 < > 或控制字符");
  });

  it("合法名称 → null（含首尾空白按去空白判定）", () => {
    expect(validateRoleName("词库管理员")).toBeNull();
    expect(validateRoleName("  编辑  ")).toBeNull();
  });
});

describe("isUnknownPermissionKeyError", () => {
  it("400 且 code=unknown_permission_key → true", () => {
    expect(
      isUnknownPermissionKeyError(
        new HttpError(
          400,
          '"nope.access": unknown permission key',
          [],
          "unknown_permission_key"
        )
      )
    ).toBe(true);
  });

  it("无 code / 非 HttpError → false", () => {
    expect(isUnknownPermissionKeyError(new HttpError(400, "bad"))).toBe(false);
    expect(isUnknownPermissionKeyError(new Error("x"))).toBe(false);
    expect(isUnknownPermissionKeyError({})).toBe(false);
  });
});

describe("errorText", () => {
  it("Error 有 message → 用原文，空 message → fallback", () => {
    expect(errorText(new Error("网络断了"), "失败")).toBe("网络断了");
    expect(errorText(new Error(""), "失败")).toBe("失败");
  });

  it("非 Error → fallback", () => {
    expect(errorText({}, "失败")).toBe("失败");
    expect(errorText(null, "失败")).toBe("失败");
  });
});

describe("roleMutationError", () => {
  it("403 → 无权限中文提示（不透后端英文）", () => {
    expect(
      roleMutationError(
        new HttpError(403, "cannot modify or delete a system role"),
        "失败"
      )
    ).toBe("无权限执行此操作（系统角色或超管不可操作）");
  });

  it("404 → 不存在中文提示", () => {
    expect(
      roleMutationError(new HttpError(404, "role not found"), "失败")
    ).toBe("角色或管理员不存在，可能已被删除");
  });

  it("其它 HttpError → 后端原文；非 Error → fallback", () => {
    expect(roleMutationError(new HttpError(500, "boom"), "失败")).toBe("boom");
    expect(roleMutationError({}, "失败")).toBe("失败");
  });
});
