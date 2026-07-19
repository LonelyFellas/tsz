import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AuthResponse, RegisterResponse } from "@tsz/api-client";
import { renderWithProviders } from "@/test/render";
import { RegisterForm } from "./RegisterForm";

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack })
}));

vi.mock("@/lib/request", () => ({
  setAccessToken: vi.fn(),
  scheduleRefresh: vi.fn(),
  api: {
    auth: {
      register: vi.fn(),
      login: vi.fn(),
      me: vi.fn()
    }
  }
}));

import { api } from "@/lib/request";
const mockRegister = vi.mocked(api.auth.register);
const mockLogin = vi.mocked(api.auth.login);
const mockMe = vi.mocked(api.auth.me);

const VALID_PHONE = "13800138000";
const VALID_PASSWORD = "abc12345678";

function registerResult(): RegisterResponse {
  // 后端 201:昵称由后端生成,不含 token(注册不自动登录)。
  return { user_id: "1", display_name: "同学1234", role: "student" };
}

function authResult(): AuthResponse {
  return {
    user: {
      id: "1",
      display_name: "同学1234",
      roles: ["student"],
      avatar_url: "",
      active_role: "student"
    },
    access_token: "at",
    expires_in: 900,
    refresh_token_expires_at: 9999999999
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPush.mockReset();
  mockBack.mockReset();
  // 默认走通「注册 → 链式登录 → /me」全链;单测可用 *Once 覆盖首个调用。
  mockRegister.mockResolvedValue(registerResult());
  mockLogin.mockResolvedValue(authResult());
  // navigateAfterAuth 调 /me。后端未实现 onboarding,适配器恒 onboarded:true;
  // 这里保留 false 分支的可配置性(见「新用户跳 onboarding」用例)。
  mockMe.mockResolvedValue({
    user: authResult().user,
    active_role: "student",
    learning_settings: null,
    onboarded: true
  } as never);
});

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  { account = VALID_PHONE, password = VALID_PASSWORD } = {}
) {
  await user.type(screen.getByPlaceholderText("请输入手机号"), account);
  await user.type(screen.getByPlaceholderText("请输入登录密码"), password);
}

// ── 按钮状态 ──────────────────────────────────────────
describe("RegisterForm — 按钮状态", () => {
  beforeEach(() => {
    renderWithProviders(<RegisterForm />);
  });

  it("初始状态下立即注册按钮禁用", () => {
    expect(screen.getByRole("button", { name: "立即注册" })).toBeDisabled();
  });

  it("仅填手机号 → 按钮仍禁用", async () => {
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("请输入手机号"), VALID_PHONE);
    expect(screen.getByRole("button", { name: "立即注册" })).toBeDisabled();
  });

  it("手机号+合法密码 → 按钮可用", async () => {
    const user = userEvent.setup();
    await fillForm(user);
    expect(screen.getByRole("button", { name: "立即注册" })).toBeEnabled();
  });

  it("密码不满足 11-20 位字母+数字 → 按钮禁用", async () => {
    const user = userEvent.setup();
    await fillForm(user, { password: "short1" });
    expect(screen.getByRole("button", { name: "立即注册" })).toBeDisabled();
  });

  it("非法手机号 → 显示手机号码错误", async () => {
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("请输入手机号"), "123");
    expect(screen.getByText("手机号码错误")).toBeInTheDocument();
  });

  it("验证码栏暂不渲染(后端注册不校验 OTP,撤下以免误导)", () => {
    expect(screen.queryByPlaceholderText("请输入验证码")).toBeNull();
    expect(screen.queryByRole("button", { name: "获取验证码" })).toBeNull();
  });
});

// ── 注册流程:注册(201 无 token)→ 链式登录 → /me 跳转 ──
describe("RegisterForm — 注册流程", () => {
  it("注册成功 → 用同一凭证链式登录 → 跳转目标页", async () => {
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "立即注册" }));

    await waitFor(() => {
      // 只传 phone/email + password;昵称/角色由后端生成,不再前端拼装。
      expect(mockRegister).toHaveBeenCalledWith({
        phone: VALID_PHONE,
        email: undefined,
        password: VALID_PASSWORD.toUpperCase()
      });
      // 链式登录用与注册相同的归一化密码。
      expect(mockLogin).toHaveBeenCalledWith(
        VALID_PHONE,
        VALID_PASSWORD.toUpperCase()
      );
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("/me 判定未 onboarded → 跳转 /onboarding(后端实现后生效的分支)", async () => {
    mockMe.mockResolvedValueOnce({
      user: authResult().user,
      active_role: "student",
      learning_settings: null,
      onboarded: false
    } as never);
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "立即注册" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/onboarding");
    });
  });

  it("账号已注册(409 user already exists)→ 显示中文错误提示", async () => {
    mockRegister.mockRejectedValueOnce(new Error("user already exists"));
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "立即注册" }));

    await waitFor(() => {
      expect(screen.getByText("该账号已注册，请直接登录")).toBeInTheDocument();
    });
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("注册成功但链式登录失败 → 不按注册失败误报,带成功提示跳登录页", async () => {
    // 注册已成功(账号已建),登录因瞬时故障失败:若按「注册失败」报错,
    // 用户重试会撞 409,自相矛盾。正确行为是跳登录页手动登录。
    mockLogin.mockRejectedValueOnce(new Error("service unavailable"));
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "立即注册" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login?registered=success");
    });
    expect(screen.queryByText(/注册失败/)).toBeNull();
    expect(mockMe).not.toHaveBeenCalled();
  });
});

// ── Tab 切换 / 跳转 ───────────────────────────────────
describe("RegisterForm — tab 切换与跳转", () => {
  it("切换到邮箱 tab → 显示邮箱输入框", async () => {
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "邮箱" }));

    expect(screen.getByPlaceholderText("请输入邮箱")).toBeInTheDocument();
  });

  it("切换 tab 后清空已填账号", async () => {
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入手机号"), VALID_PHONE);
    await user.click(screen.getByRole("button", { name: "邮箱" }));

    expect(screen.getByPlaceholderText("请输入邮箱")).toHaveValue("");
  });

  it("点击「← 返回」→ 调用 router.back", async () => {
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "← 返回" }));

    expect(mockBack).toHaveBeenCalled();
  });

  it("点击「已有账号,去登录」→ 跳转 /login", async () => {
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "已有账号,去登录" }));

    expect(mockPush).toHaveBeenCalledWith("/login");
  });
});

// ── 密码归一化与边界 ──────────────────────────────────
describe("RegisterForm — 密码归一化与边界", () => {
  it("密码提交时转大写,但输入框保持原值", async () => {
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await fillForm(user, { password: "abcDEF12345" });
    expect(screen.getByPlaceholderText("请输入登录密码")).toHaveValue(
      "abcDEF12345"
    );

    await user.click(screen.getByRole("button", { name: "立即注册" }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({ password: "ABCDEF12345" })
      );
    });
  });

  it("表单内回车即可提交注册", async () => {
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await fillForm(user);
    await user.type(screen.getByPlaceholderText("请输入登录密码"), "{Enter}");

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalled();
    });
  });

  it("邮箱 tab 注册 → 提交 email,phone 不传", async () => {
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "邮箱" }));
    await user.type(
      screen.getByPlaceholderText("请输入邮箱"),
      "alice@example.com"
    );
    await user.type(
      screen.getByPlaceholderText("请输入登录密码"),
      VALID_PASSWORD
    );
    await user.click(screen.getByRole("button", { name: "立即注册" }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "alice@example.com",
          phone: undefined
        })
      );
    });
  });
});

// ── 校验与错误映射 ────────────────────────────────────
describe("RegisterForm — 校验与错误映射", () => {
  it("邮箱 tab 输入非法邮箱 → 显示邮箱格式错误", async () => {
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "邮箱" }));
    await user.type(screen.getByPlaceholderText("请输入邮箱"), "bad-email");

    expect(screen.getByText("邮箱格式错误")).toBeInTheDocument();
  });

  it("未知错误 → 显示兜底文案，且按钮恢复可用", async () => {
    // translateAuthError 对未知非空消息会透传原文，空消息才走兜底文案。
    mockRegister.mockRejectedValueOnce(new Error(""));
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "立即注册" }));

    await waitFor(() => {
      expect(screen.getByText("注册失败，请稍后重试")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "立即注册" })).toBeEnabled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("切换显示密码 → 输入框类型在 password / text 间切换", async () => {
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText("请输入登录密码");

    expect(input).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "显示密码" }));
    expect(input).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "隐藏密码" }));
    expect(input).toHaveAttribute("type", "password");
  });
});
