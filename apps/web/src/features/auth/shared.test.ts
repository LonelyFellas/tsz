import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@tsz/types";
import {
  completeAuthentication,
  postAuthPath,
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
  active_role: "student"
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

describe("completeAuthentication", () => {
  beforeEach(() => {
    useUserStore.setState({ user: null, onboarded: null, hydrated: false });
  });

  it.each([true, false])(
    "一次性发布完整用户和引导状态 %s",
    async (onboarded) => {
      vi.spyOn(request.api.auth, "me").mockResolvedValueOnce({
        user: ME_USER,
        active_role: "student",
        learning_settings: null,
        onboarded
      });
      const listener = vi.fn();
      const unsubscribe = useUserStore.subscribe(listener);
      try {
        await completeAuthentication();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(useUserStore.getState()).toMatchObject({
          user: ME_USER,
          onboarded,
          hydrated: true
        });
      } finally {
        unsubscribe();
      }
    }
  );

  it("资料读取失败不发布用户态", async () => {
    vi.spyOn(request.api.auth, "me").mockRejectedValueOnce(
      new Error("unavailable")
    );
    await expect(completeAuthentication()).rejects.toThrow("unavailable");
    expect(useUserStore.getState()).toMatchObject({
      user: null,
      onboarded: null
    });
  });
});

describe("postAuthPath", () => {
  it("默认首页，合法回跳保留 query 和 hash", () => {
    expect(postAuthPath(true, null)).toBe("/");
    expect(postAuthPath(true, "/student/practice?unit=2#words")).toBe(
      "/student/practice?unit=2#words"
    );
  });

  it("新用户仍优先进入引导页", () => {
    expect(postAuthPath(false, "/wordlists")).toBe("/onboarding");
  });

  it.each([
    "/login",
    "/login/?redirect=/wordlists",
    "/register",
    "/forgot-password#reset",
    "/wordlists/../login",
    "/%6cogin",
    "/register%2f",
    "https://outside.example/",
    "//outside.example/",
    "javascript:void(0)"
  ])("拒绝认证页循环或危险地址 %s", (redirect) => {
    expect(postAuthPath(true, redirect)).toBe("/");
  });
});
