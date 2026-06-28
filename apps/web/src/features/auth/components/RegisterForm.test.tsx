import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AuthResponse } from "@tsz/api-client";
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
      sendCode: vi.fn(),
      me: vi.fn()
    }
  }
}));

import { api } from "@/lib/request";
const mockRegister = vi.mocked(api.auth.register);
const mockSendCode = vi.mocked(api.auth.sendCode);
const mockMe = vi.mocked(api.auth.me);

const VALID_PHONE = "13800138000";
const VALID_CODE = "123456";
const VALID_PASSWORD = "abc12345678";

beforeEach(() => {
  vi.clearAllMocks();
  mockPush.mockReset();
  mockBack.mockReset();
  // 注册成功后 navigateAfterAuth 会调 /me；新注册用户默认未 onboarded。
  mockMe.mockResolvedValue({
    user: authResult().user,
    active_role: "student",
    learning_settings: null,
    onboarded: false
  } as never);
});

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  { account = VALID_PHONE, code = VALID_CODE, password = VALID_PASSWORD } = {}
) {
  await user.type(screen.getByPlaceholderText("请输入手机号"), account);
  await user.type(screen.getByPlaceholderText("请输入验证码"), code);
  await user.type(screen.getByPlaceholderText("请输入登录密码"), password);
}

function authResult(): AuthResponse {
  return {
    user: {
      id: "1",
      nickname: VALID_PHONE,
      roles: ["student"],
      coins: 0,
      createdAt: ""
    },
    access_token: "at",
    active_role: "student",
    expires_in: 900,
    refresh_token_expires_at: 9999999999
  };
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

  it("手机号+验证码+合法密码 → 按钮可用", async () => {
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
});

// ── 获取验证码 ────────────────────────────────────────
describe("RegisterForm — 获取验证码", () => {
  it("非法账号时获取验证码按钮禁用", () => {
    renderWithProviders(<RegisterForm />);
    expect(screen.getByRole("button", { name: "获取验证码" })).toBeDisabled();
  });

  it("合法手机号 → 点击发送验证码并进入倒计时", async () => {
    mockSendCode.mockResolvedValueOnce({ status: "sent" });
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入手机号"), VALID_PHONE);
    await user.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(mockSendCode).toHaveBeenCalledWith(VALID_PHONE);
      expect(screen.getByText(/后重发/)).toBeInTheDocument();
    });
  });
});

// ── 注册流程 ──────────────────────────────────────────
describe("RegisterForm — 注册流程", () => {
  it("注册成功（新用户）→ 跳转到 /onboarding", async () => {
    mockRegister.mockResolvedValueOnce(authResult());
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "立即注册" }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: VALID_PHONE,
          password: VALID_PASSWORD.toUpperCase(),
          code: VALID_CODE,
          role: "student"
        })
      );
      expect(mockPush).toHaveBeenCalledWith("/onboarding");
    });
  });

  it("手机号已注册 → 显示中文错误提示", async () => {
    mockRegister.mockRejectedValueOnce(new Error("phone already registered"));
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "立即注册" }));

    await waitFor(() => {
      expect(
        screen.getByText("该手机号已注册，请直接登录")
      ).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
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
    mockRegister.mockResolvedValueOnce(authResult());
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
    mockRegister.mockResolvedValueOnce(authResult());
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await fillForm(user);
    await user.type(screen.getByPlaceholderText("请输入登录密码"), "{Enter}");

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalled();
    });
  });

  it("邮箱 tab 注册 → 提交 email,phone 不传", async () => {
    mockRegister.mockResolvedValueOnce(authResult());
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "邮箱" }));
    await user.type(
      screen.getByPlaceholderText("请输入邮箱"),
      "alice@example.com"
    );
    await user.type(screen.getByPlaceholderText("请输入验证码"), VALID_CODE);
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

// ── 发送验证码边界 ────────────────────────────────────
describe("RegisterForm — 发送验证码", () => {
  it("发送成功后按钮进入禁用倒计时态", async () => {
    mockSendCode.mockResolvedValueOnce({ status: "sent" });
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入手机号"), VALID_PHONE);
    await user.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /后重发/ })).toBeDisabled();
    });
  });

  it("发送失败 → 显示后端错误文案", async () => {
    mockSendCode.mockRejectedValueOnce(new Error("too many requests"));
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入手机号"), VALID_PHONE);
    await user.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(screen.getByText("too many requests")).toBeInTheDocument();
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

  it("邮箱已注册(409)→ 显示中文错误提示", async () => {
    mockRegister.mockRejectedValueOnce(new Error("email already registered"));
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "邮箱" }));
    await user.type(
      screen.getByPlaceholderText("请输入邮箱"),
      "alice@example.com"
    );
    await user.type(screen.getByPlaceholderText("请输入验证码"), VALID_CODE);
    await user.type(
      screen.getByPlaceholderText("请输入登录密码"),
      VALID_PASSWORD
    );
    await user.click(screen.getByRole("button", { name: "立即注册" }));

    await waitFor(() => {
      expect(screen.getByText("该邮箱已注册，请直接登录")).toBeInTheDocument();
    });
  });

  it("验证码错误(invalid credentials)→ 显示中文提示", async () => {
    mockRegister.mockRejectedValueOnce(new Error("invalid credentials"));
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "立即注册" }));

    await waitFor(() => {
      expect(
        screen.getByText("验证码错误或已失效，请重新获取")
      ).toBeInTheDocument();
    });
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
