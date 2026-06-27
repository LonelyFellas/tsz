import type { Role } from "@tsz/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => ({ get: () => null })
}));

vi.mock("@/lib/auth", async () => {
  const { createAuthStore } = await import("@tsz/shared/auth");
  return {
    useAuthStore: createAuthStore(),
    api: { auth: { login: vi.fn() } },
    tokens: { setAccessToken: vi.fn() },
    persistSession: vi.fn()
  };
});

import { AdminLoginForm } from "./AdminLoginForm";
import { api, persistSession, tokens, useAuthStore } from "@/lib/auth";

const mockLogin = vi.mocked(api.auth.login);
const mockPersist = vi.mocked(persistSession);
const mockSetToken = vi.mocked(tokens.setAccessToken);

const ADMIN_USER = {
  id: "a1",
  nickname: "Admin",
  roles: ["admin"] as Role[],
  coins: 0,
  createdAt: ""
};

function authResponse(activeRole: string) {
  return {
    user: ADMIN_USER,
    access_token: "at-1",
    active_role: activeRole,
    expires_in: 900,
    refresh_token_expires_at: 0
  };
}

function fillAndSubmit() {
  fireEvent.change(screen.getByPlaceholderText("请输入手机号或邮箱"), {
    target: { value: "13800138000" }
  });
  fireEvent.change(screen.getByPlaceholderText("请输入登录密码"), {
    target: { value: "secret123" }
  });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, activeRole: null });
});

describe("AdminLoginForm", () => {
  it("admin 账号登录成功：持久化会话、写入 store、跳转后台", async () => {
    mockLogin.mockResolvedValue(authResponse("admin"));
    render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
    // 密码统一转大写后提交。
    expect(mockLogin).toHaveBeenCalledWith("13800138000", "SECRET123");
    expect(mockPersist).toHaveBeenCalled();
    expect(useAuthStore.getState().activeRole).toBe("admin");
  });

  it("非 admin 账号：清 token、报无权、不跳转", async () => {
    mockLogin.mockResolvedValue(authResponse("teacher"));
    render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/无平台后台权限/)).toBeInTheDocument()
    );
    expect(mockSetToken).toHaveBeenCalledWith(null);
    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("凭证错误：展示翻译后的中文文案", async () => {
    mockLogin.mockRejectedValue(new Error("invalid credentials"));
    render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText("账号或密码错误，请重新输入")).toBeInTheDocument()
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
