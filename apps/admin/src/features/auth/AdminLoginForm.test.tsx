import type { AdminAuthResponse, AdminProfile } from "@tsz/api-client";
import { HttpError } from "@tsz/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ⚠️ 2FA 规格（红灯）：admin 登录 = 手机号 + 密码 + 验证码三要素（后端 AdminLoginRequest
// 三字段全 required，先调 /admin/auth/login-code 发码）。本文件定死 form 的 DOM 约定与行为，
// 驱动 AdminLoginForm 改造。转绿前需要：
//   1) api.auth.login(phone, password, code) —— 三参数（见 @tsz/api-client admin.ts 改造）
//   2) api.auth.requestLoginCode(phone) —— 发码端点
//   3) form 加验证码输入(placeholder「请输入验证码」)+「获取验证码」按钮(倒计时「Ns 后重发」)
//   4) 手机号字段仅手机号(placeholder「请输入手机号」)，凭证错文案含验证码
//   5) types AdminAuthResponse 改后端形状(admin_profile/role，无顶层 level)

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
    api: {
      auth: {
        login: vi.fn(),
        requestLoginCode: vi.fn(),
        changePassword: vi.fn(),
        logout: vi.fn()
      },
      // 登录成功后拉 /profile 补全菜单权限（permissions）——登录响应不含它。
      // 后端 GET /admin/profile 已上线（2026-07-26）；单测仍 mock，隔离网络。
      profile: vi.fn()
    },
    persistSession: vi.fn(),
    // enterConsole 失败时撤销会话会调 tokens.setAccessToken(null)。
    tokens: { setAccessToken: vi.fn() }
  };
});

import { AdminLoginForm } from "./AdminLoginForm";
import { api, persistSession, tokens, useAuthStore } from "@/lib/auth";

const mockLogin = vi.mocked(api.auth.login);
const mockRequestCode = vi.mocked(api.auth.requestLoginCode);
const mockProfile = vi.mocked(api.profile);
const mockPersist = vi.mocked(persistSession);
const mockSetAccessToken = vi.mocked(tokens.setAccessToken);

// admin login 响应对齐后端 AdminLoginResponse：admin_profile(含 role) + 平铺 token + 死线。
// 顶层无 level、无 must_change_password（后端 must_change 守卫未落地，恒 undefined）。
function authResponse(mustChange = false): AdminAuthResponse {
  return {
    admin_profile: {
      id: "a1",
      display_name: "审核员小王",
      phone: "13800138000",
      role: "admin"
    },
    access_token: "at-1",
    expires_in: 900,
    refresh_token_expires_at: 0,
    must_change_password: mustChange
  };
}

// 登录后 enterConsole 拉的 /profile 响应（含菜单权限）。字段名已随 Q11 统一为 role
// （2026-07-26 随 profile 端点落地改齐）。
function profileResponse(role: "admin" | "super_admin"): AdminProfile {
  return {
    id: "a1",
    phone: "13800138000",
    display_name: "审核员小王",
    role,
    permissions: role === "super_admin" ? [] : ["users.access"],
    preferences: { dialect: "uk" }
  };
}

// antd 两字按钮会自动插空格（「登 录」），用正则兼容。
const LOGIN_BUTTON = /^登\s?录$/;

const PHONE = "13800138000";
const PASSWORD = "secret123";
const CODE = "123456";

// 三要素齐填（缺省全合法）。要隔离测某字段无效时，覆盖对应项、其余保持合法。
function fill(opts?: { phone?: string; password?: string; code?: string }) {
  fireEvent.change(screen.getByPlaceholderText("请输入手机号"), {
    target: { value: opts?.phone ?? PHONE }
  });
  fireEvent.change(screen.getByPlaceholderText("请输入登录密码"), {
    target: { value: opts?.password ?? PASSWORD }
  });
  fireEvent.change(screen.getByPlaceholderText("请输入验证码"), {
    target: { value: opts?.code ?? CODE }
  });
}

function fillAndSubmit() {
  fill();
  fireEvent.click(screen.getByRole("button", { name: LOGIN_BUTTON }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRedirect = null;
  // enterConsole 默认拿到一个普通管理员 profile；需要超管的用例各自覆盖。
  mockProfile.mockResolvedValue(profileResponse("admin"));
  useAuthStore.setState({ profile: null, role: null });
});

describe("AdminLoginForm — 2FA", () => {
  // ============================== 发码（2FA 第一步）==============================

  it("合法手机号 → 获取验证码可用，点击调 requestLoginCode 并进入倒计时", async () => {
    mockRequestCode.mockResolvedValueOnce(undefined); // login-code 202 无 body
    render(<AdminLoginForm />);

    const sendBtn = screen.getByRole("button", { name: "获取验证码" });
    expect(sendBtn).toBeDisabled(); // 手机号空 → 不可发

    fireEvent.change(screen.getByPlaceholderText("请输入手机号"), {
      target: { value: PHONE }
    });
    expect(sendBtn).toBeEnabled();

    fireEvent.click(sendBtn);
    await waitFor(() => {
      expect(mockRequestCode).toHaveBeenCalledWith(PHONE);
      // 发码成功即进入倒计时（按钮文案变「Ns 后重发」）。
      expect(screen.getByText(/后重发/)).toBeInTheDocument();
    });
  });

  it("非法手机号 → 获取验证码按钮禁用", () => {
    render(<AdminLoginForm />);
    fireEvent.change(screen.getByPlaceholderText("请输入手机号"), {
      target: { value: "123" }
    });
    expect(screen.getByRole("button", { name: "获取验证码" })).toBeDisabled();
  });

  it("发码失败 → 展示错误提示，不进入倒计时", async () => {
    mockRequestCode.mockRejectedValueOnce(
      new HttpError(503, "service unavailable")
    );
    render(<AdminLoginForm />);
    fireEvent.change(screen.getByPlaceholderText("请输入手机号"), {
      target: { value: PHONE }
    });
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() =>
      expect(screen.queryByText(/后重发/)).not.toBeInTheDocument()
    );
    // 仍可再次点击（按钮未被倒计时锁住）。
    expect(screen.getByRole("button", { name: "获取验证码" })).toBeEnabled();
  });

  // ============================== 三要素登录 ==============================

  it("三要素齐全登录成功：login(phone,password,code)、持久化会话、写 profile、跳后台", async () => {
    mockLogin.mockResolvedValue(authResponse());
    mockProfile.mockResolvedValue(profileResponse("super_admin"));
    render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true })
    );
    // 请求体 = {phone, password, code}；密码按原文提交（web 端大写怪癖不适用后台）。
    expect(mockLogin).toHaveBeenCalledWith(PHONE, PASSWORD, CODE);
    expect(mockPersist).toHaveBeenCalled();
    expect(useAuthStore.getState().profile?.display_name).toBe("审核员小王");
    expect(useAuthStore.getState().role).toBe("super_admin");
  });

  it("缺验证码 → 登录按钮禁用（三要素缺一不可）", () => {
    render(<AdminLoginForm />);
    fireEvent.change(screen.getByPlaceholderText("请输入手机号"), {
      target: { value: PHONE }
    });
    fireEvent.change(screen.getByPlaceholderText("请输入登录密码"), {
      target: { value: PASSWORD }
    });
    // 未填验证码
    expect(screen.getByRole("button", { name: LOGIN_BUTTON })).toBeDisabled();
  });

  it("凭证错误(401)：展示含验证码的统一文案（码错≡密码错≡查无此号，不可区分）", async () => {
    mockLogin.mockRejectedValue(new Error("invalid credentials"));
    render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(
        screen.getByText("账号、密码或验证码错误，请重新输入")
      ).toBeInTheDocument()
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("账号被禁用(403)：展示禁用提示", async () => {
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

  it("登录成功但拉 profile 失败：撤销会话、提示重试、不放行进后台", async () => {
    mockLogin.mockResolvedValue(authResponse());
    mockProfile.mockRejectedValue(new Error("profile fetch failed"));
    render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(
        screen.getByText("登录成功但加载账号信息失败，请重试")
      ).toBeInTheDocument()
    );
    expect(mockSetAccessToken).toHaveBeenCalledWith(null);
    expect(useAuthStore.getState().profile).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("登录成功跳转到 redirect 指定页", async () => {
    mockRedirect = "/users";
    mockLogin.mockResolvedValue(authResponse());
    render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/users", { replace: true })
    );
  });

  // ============================== 表单校验 / 防重 ==============================

  it("密码不足 8 位：按钮禁用且原生提交不打后端（与后端 8–72 规则一致）", async () => {
    const { container } = render(<AdminLoginForm />);
    fill({ password: "short12" }); // 7 位，手机/验证码合法
    expect(screen.getByRole("button", { name: LOGIN_BUTTON })).toBeDisabled();
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    await waitFor(() => expect(mockLogin).not.toHaveBeenCalled());
  });

  it("手机号非法：按钮禁用，不打后端", () => {
    render(<AdminLoginForm />);
    fill({ phone: "not-a-phone" });
    expect(screen.getByRole("button", { name: LOGIN_BUTTON })).toBeDisabled();
  });

  it("回车/原生提交触发登录", async () => {
    mockLogin.mockResolvedValue(authResponse());
    const { container } = render(<AdminLoginForm />);
    fill();
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
  });

  it("未填写完整时原生提交不触发登录（canSubmit 兜底）", async () => {
    const { container } = render(<AdminLoginForm />);
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    await waitFor(() => expect(mockLogin).not.toHaveBeenCalled());
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

    const btn = await screen.findByRole("button", { name: /登录中\.\.\./ });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(mockLogin).toHaveBeenCalledTimes(1);

    resolveLogin(authResponse());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  });

  it("同一帧内两次原生提交只发一次登录请求（同步在途锁）", async () => {
    let resolveLogin!: (v: ReturnType<typeof authResponse>) => void;
    mockLogin.mockReturnValue(
      new Promise((res) => {
        resolveLogin = res;
      })
    );
    const { container } = render(<AdminLoginForm />);
    fill();
    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockLogin).toHaveBeenCalledTimes(1);

    resolveLogin(authResponse());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  });

  // ============================== 特殊态：改密 / 锁定 ==============================

  it("must_change_password：建立会话后跳改密页(带临时密码 state)，不放行进后台", async () => {
    // 后端 must_change 守卫未落地时该字段恒 undefined、本分支不触发；此处 mock 注入 true
    // 验证前端逻辑就绪（守卫落地即生效）。
    mockLogin.mockResolvedValue(authResponse(true));
    render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/change-password", {
        state: { currentPassword: PASSWORD }
      })
    );
    expect(mockPersist).toHaveBeenCalled();
    expect(useAuthStore.getState().profile).toBeNull();
  });

  const primaryButton = (c: HTMLElement) =>
    c.querySelector("button.ant-btn-primary") as HTMLButtonElement;

  it("账号被锁定(423)：提示锁定并置灰登录按钮，改动密码后恢复可点", async () => {
    mockLogin.mockRejectedValue(
      new HttpError(
        423,
        "account temporarily locked due to too many failed login attempts"
      )
    );
    const { container } = render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(
        screen.getByText("账号已被锁定，请约 15 分钟后再试")
      ).toBeInTheDocument()
    );
    expect(primaryButton(container)).toBeDisabled();
    expect(mockNavigate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("请输入登录密码"), {
      target: { value: "another-secret" }
    });
    expect(
      screen.queryByText("账号已被锁定，请约 15 分钟后再试")
    ).not.toBeInTheDocument();
    expect(primaryButton(container)).toBeEnabled();
  });

  it("锁定后改手机号同样解除置灰并清掉锁定提示", async () => {
    mockLogin.mockRejectedValue(new HttpError(423, "account locked"));
    const { container } = render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(
        screen.getByText("账号已被锁定，请约 15 分钟后再试")
      ).toBeInTheDocument()
    );

    fireEvent.change(screen.getByPlaceholderText("请输入手机号"), {
      target: { value: "13900139000" }
    });

    expect(
      screen.queryByText("账号已被锁定，请约 15 分钟后再试")
    ).not.toBeInTheDocument();
    expect(primaryButton(container)).toBeEnabled();
  });

  it("锁定后重填验证码同样解除置灰并清掉锁定提示", async () => {
    mockLogin.mockRejectedValue(new HttpError(423, "account locked"));
    const { container } = render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(
        screen.getByText("账号已被锁定，请约 15 分钟后再试")
      ).toBeInTheDocument()
    );

    fireEvent.change(screen.getByPlaceholderText("请输入验证码"), {
      target: { value: "654321" }
    });

    expect(
      screen.queryByText("账号已被锁定，请约 15 分钟后再试")
    ).not.toBeInTheDocument();
    expect(primaryButton(container)).toBeEnabled();
  });

  it("登录被非 Error 拒绝：回落到通用失败文案", async () => {
    mockLogin.mockRejectedValue("boom");
    render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText("登录失败，请稍后重试")).toBeInTheDocument()
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ============================== 已登录重定向守卫 ==============================

  it("已登录访问登录页：直接 replace 到目标页", () => {
    mockRedirect = "/reviews";
    useAuthStore.setState({
      profile: {
        id: "a1",
        phone: "1",
        display_name: "X",
        role: "admin",
        permissions: [],
        preferences: { dialect: "uk" }
      },
      role: "admin"
    });
    render(<AdminLoginForm />);
    expect(mockNavigate).toHaveBeenCalledWith("/reviews", { replace: true });
  });

  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "/login"])(
    "已登录时恶意/无意义 redirect %s 归一到首页",
    (hostile) => {
      mockRedirect = hostile;
      useAuthStore.setState({
        profile: {
          id: "a1",
          phone: "1",
          display_name: "X",
          role: "admin",
          permissions: [],
          preferences: { dialect: "uk" }
        },
        role: "admin"
      });
      render(<AdminLoginForm />);
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    }
  );

  it("切换密码显隐", () => {
    render(<AdminLoginForm />);
    const pwd = screen.getByPlaceholderText("请输入登录密码");
    expect(pwd).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("img", { name: "eye-invisible" }));
    expect(pwd).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("img", { name: "eye" }));
    expect(pwd).toHaveAttribute("type", "password");
  });
});
