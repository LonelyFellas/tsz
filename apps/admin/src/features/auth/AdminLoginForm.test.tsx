import type { AdminAuthResponse } from "@tsz/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
let mockRedirect: string | null = null;

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [{ get: () => mockRedirect }]
}));

vi.mock("@/lib/auth", async () => {
  const { createAdminAuthStore } = await import("@tsz/shared/auth");
  return {
    useAuthStore: createAdminAuthStore(),
    api: { auth: { login: vi.fn() } },
    persistSession: vi.fn()
  };
});

import { AdminLoginForm } from "./AdminLoginForm";
import { api, persistSession, useAuthStore } from "@/lib/auth";

const mockLogin = vi.mocked(api.auth.login);
const mockPersist = vi.mocked(persistSession);

function authResponse(level: "admin" | "super_admin"): AdminAuthResponse {
  return {
    admin: {
      id: "a1",
      phone: "13800138000",
      display_name: "审核员小王",
      level,
      status: "active",
      created_at: "2026-06-27T00:00:00Z"
    },
    access_token: "at-1",
    level,
    expires_in: 900,
    refresh_token_expires_at: 0
  };
}

// antd 两字按钮会自动插空格（「登 录」），用正则兼容。
const LOGIN_BUTTON = /^登\s?录$/;

function fillAndSubmit() {
  fireEvent.change(screen.getByPlaceholderText("请输入手机号或邮箱"), {
    target: { value: "13800138000" }
  });
  fireEvent.change(screen.getByPlaceholderText("请输入登录密码"), {
    target: { value: "secret123" }
  });
  fireEvent.click(screen.getByRole("button", { name: LOGIN_BUTTON }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRedirect = null;
  useAuthStore.setState({ profile: null, level: null });
});

describe("AdminLoginForm", () => {
  it("登录成功：持久化会话、写入 profile、跳转后台", async () => {
    mockLogin.mockResolvedValue(authResponse("super_admin"));
    render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true })
    );
    // admin 密码按原文提交，不做大小写转换（web 端怪癖不适用后台）。
    expect(mockLogin).toHaveBeenCalledWith("13800138000", "secret123");
    expect(mockPersist).toHaveBeenCalled();
    expect(useAuthStore.getState().profile?.display_name).toBe("审核员小王");
    expect(useAuthStore.getState().level).toBe("super_admin");
  });

  it("凭证错误：展示翻译后的中文文案", async () => {
    mockLogin.mockRejectedValue(new Error("invalid credentials"));
    render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText("账号或密码错误，请重新输入")).toBeInTheDocument()
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("账号被禁用：展示禁用提示", async () => {
    mockLogin.mockRejectedValue(new Error("account disabled"));
    render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(
        screen.getByText("该账号已被禁用，请联系超级管理员")
      ).toBeInTheDocument()
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("登录成功跳转到 redirect 指定页", async () => {
    mockRedirect = "/users";
    mockLogin.mockResolvedValue(authResponse("admin"));
    render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/users", { replace: true })
    );
  });

  it("已登录访问登录页：直接 replace 到目标页", () => {
    mockRedirect = "/reviews";
    useAuthStore.setState({
      profile: {
        id: "a1",
        phone: "1",
        display_name: "X",
        level: "admin"
      },
      level: "admin"
    });
    render(<AdminLoginForm />);
    expect(mockNavigate).toHaveBeenCalledWith("/reviews", { replace: true });
  });

  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "/login"])(
    "已登录时恶意/无意义 redirect %s 归一到首页",
    (hostile) => {
      mockRedirect = hostile;
      useAuthStore.setState({
        profile: { id: "a1", phone: "1", display_name: "X", level: "admin" },
        level: "admin"
      });
      render(<AdminLoginForm />);
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    }
  );

  it("切换密码显隐", () => {
    render(<AdminLoginForm />);
    const pwd = screen.getByPlaceholderText("请输入登录密码");
    expect(pwd).toHaveAttribute("type", "password");
    // Input.Password 的显隐开关是 @ant-design/icons 图标（role=img + aria-label）。
    fireEvent.click(screen.getByRole("img", { name: "eye-invisible" }));
    expect(pwd).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("img", { name: "eye" }));
    expect(pwd).toHaveAttribute("type", "password");
  });

  it("密码框回车提交", async () => {
    mockLogin.mockResolvedValue(authResponse("admin"));
    render(<AdminLoginForm />);
    fireEvent.change(screen.getByPlaceholderText("请输入手机号或邮箱"), {
      target: { value: "13800138000" }
    });
    fireEvent.change(screen.getByPlaceholderText("请输入登录密码"), {
      target: { value: "secret123" }
    });
    fireEvent.keyDown(screen.getByPlaceholderText("请输入登录密码"), {
      key: "Enter"
    });
    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
  });

  it("未填写完整时回车不触发登录（canSubmit 兜底）", () => {
    render(<AdminLoginForm />);
    fireEvent.keyDown(screen.getByPlaceholderText("请输入登录密码"), {
      key: "Enter"
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("密码不足 8 位：按钮禁用且回车不打后端（与后端 8–72 规则一致）", () => {
    render(<AdminLoginForm />);
    fireEvent.change(screen.getByPlaceholderText("请输入手机号或邮箱"), {
      target: { value: "13800138000" }
    });
    fireEvent.change(screen.getByPlaceholderText("请输入登录密码"), {
      target: { value: "short12" } // 7 位
    });
    expect(screen.getByRole("button", { name: LOGIN_BUTTON })).toBeDisabled();
    fireEvent.keyDown(screen.getByPlaceholderText("请输入登录密码"), {
      key: "Enter"
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("账号格式非法：按钮禁用，不打后端", () => {
    render(<AdminLoginForm />);
    fireEvent.change(screen.getByPlaceholderText("请输入手机号或邮箱"), {
      target: { value: "not-an-account" }
    });
    fireEvent.change(screen.getByPlaceholderText("请输入登录密码"), {
      target: { value: "secret123" }
    });
    expect(screen.getByRole("button", { name: LOGIN_BUTTON })).toBeDisabled();
  });

  it("登录请求进行中：按钮置「登录中」并禁用，防止重复提交", async () => {
    let resolveLogin!: (v: ReturnType<typeof authResponse>) => void;
    mockLogin.mockReturnValue(
      new Promise((res) => {
        resolveLogin = res;
      })
    );
    render(<AdminLoginForm />);
    fillAndSubmit();

    // 进行中：文案变更 + 禁用，二次点击不会再发请求。
    // loading 图标（role=img, aria-label="loading"）会并入按钮可访问名，用正则匹配。
    const btn = await screen.findByRole("button", { name: /登录中\.\.\./ });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(mockLogin).toHaveBeenCalledTimes(1);

    resolveLogin(authResponse("admin"));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  });
});
