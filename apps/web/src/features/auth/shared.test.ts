import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@tsz/types";
import {
  navigateAfterAuth,
  persistSession,
  translateAuthError
} from "./shared";
import * as request from "@/lib/request";
import { useUserStore } from "@/stores/user";

const ME_USER: User = {
  id: "u1",
  phone: "13800138000",
  display_name: "Alice",
  roles: ["student"],
  avatar_url: "",
  status: "active",
  created_at: "",
  updated_at: ""
};

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

  it("将 access token 写入内存并启动刷新定时器，不操作 cookie", () => {
    vi.spyOn(request, "scheduleRefresh");
    persistSession({ access_token: "at-123", expires_in: 900 });
    expect(request.setAccessToken).toHaveBeenCalledWith("at-123");
    expect(request.scheduleRefresh).toHaveBeenCalledWith(900);
    expect(document.cookie).not.toContain("at-123");
  });
});

describe("navigateAfterAuth", () => {
  beforeEach(() => {
    useUserStore.setState({ user: null, onboarded: null });
  });

  it("老用户（已 onboarded）→ 跳目标页并写入用户态", async () => {
    vi.spyOn(request.api.auth, "me").mockResolvedValueOnce({
      user: ME_USER,
      active_role: "student",
      learning_settings: { cefr_level: "B1", english_variant: "BrE" },
      onboarded: true
    });
    const push = vi.fn();

    await navigateAfterAuth(push, "/wordlists");

    expect(push).toHaveBeenCalledWith("/wordlists");
    expect(useUserStore.getState().user).toEqual(ME_USER);
    expect(useUserStore.getState().onboarded).toBe(true);
  });

  it("新用户（未 onboarded）→ 跳 /onboarding", async () => {
    vi.spyOn(request.api.auth, "me").mockResolvedValueOnce({
      user: ME_USER,
      active_role: "student",
      learning_settings: null,
      onboarded: false
    });
    const push = vi.fn();

    await navigateAfterAuth(push);

    expect(push).toHaveBeenCalledWith("/onboarding");
    expect(useUserStore.getState().onboarded).toBe(false);
  });

  it("redirect 默认首页", async () => {
    vi.spyOn(request.api.auth, "me").mockResolvedValueOnce({
      user: ME_USER,
      active_role: "student",
      learning_settings: { cefr_level: "A1", english_variant: "AmE" },
      onboarded: true
    });
    const push = vi.fn();

    await navigateAfterAuth(push);

    expect(push).toHaveBeenCalledWith("/");
  });
});
