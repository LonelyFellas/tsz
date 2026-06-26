import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistSession, translateAuthError } from "./shared";
import * as request from "@/lib/request";

describe("translateAuthError", () => {
  const map = { "invalid credentials": "账号或密码错误，请重新输入" };

  it("命中调用方传入的 map", () => {
    expect(translateAuthError("invalid credentials", map, "兜底")).toBe(
      "账号或密码错误，请重新输入"
    );
  });

  it("回退到通用会话错误映射", () => {
    expect(translateAuthError("session expired", map, "兜底")).toBe(
      "登录已过期，请重新登录"
    );
    expect(translateAuthError("invalid refresh token", map, "兜底")).toBe(
      "登录已过期，请重新登录"
    );
    expect(translateAuthError("missing refresh token", map, "兜底")).toBe(
      "登录已过期，请重新登录"
    );
  });

  it("大小写与空白归一化后再匹配", () => {
    expect(translateAuthError("  Invalid Credentials  ", map, "兜底")).toBe(
      "账号或密码错误，请重新输入"
    );
  });

  it("未知错误原样透出", () => {
    expect(translateAuthError("too many requests", map, "兜底")).toBe(
      "too many requests"
    );
  });

  it("空消息使用兜底文案", () => {
    expect(translateAuthError("", map, "登录失败，请稍后重试")).toBe(
      "登录失败，请稍后重试"
    );
  });
});

describe("persistSession", () => {
  beforeEach(() => {
    vi.spyOn(request, "setAccessToken");
  });

  it("将 access token 写入内存，不操作 cookie", () => {
    persistSession({ access_token: "at-123" });
    expect(request.setAccessToken).toHaveBeenCalledWith("at-123");
    expect(document.cookie).not.toContain("at-123");
  });
});
