import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithProviders } from "@/test/render";
import { LoginForm } from "./LoginForm";

const mockPush = vi.fn();
// 可变的查询参数，便于覆盖「找回密码 / 注销账号跳回」的成功提示分支。
let mockResetParam: string | null = null;
let mockDeletedParam: string | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({
    get: (key: string) =>
      key === "reset"
        ? mockResetParam
        : key === "deleted"
          ? mockDeletedParam
          : null
  })
}));

vi.mock("@/lib/request", () => ({
  setAccessToken: vi.fn(),
  scheduleRefresh: vi.fn(),
  api: {
    auth: {
      login: vi.fn(),
      sendCode: vi.fn(),
      loginWithCode: vi.fn(),
      me: vi.fn()
    }
  }
}));

// 引入 mock 后拿到有类型的引用
import { api } from "@/lib/request";
const mockLogin = vi.mocked(api.auth.login);
const mockSendCode = vi.mocked(api.auth.sendCode);
const mockLoginWithCode = vi.mocked(api.auth.loginWithCode);
const mockMe = vi.mocked(api.auth.me);

const ME_USER = {
  id: "1",
  nickname: "Alice",
  roles: ["student"],
  coins: 0,
  createdAt: ""
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPush.mockReset();
  mockResetParam = null;
  mockDeletedParam = null;
  // 默认：老用户（已 onboarded），登录后进目标页。
  mockMe.mockResolvedValue({
    user: ME_USER,
    active_role: "student",
    learning_settings: { cefr_level: "B1", english_variant: "BrE" },
    onboarded: true
  } as never);
});

// ── 按钮状态 ──────────────────────────────────────────
describe("LoginForm — 按钮状态", () => {
  // 默认 tab 为「手机验证」，账号密码相关用例先切到「账号密码」tab。
  beforeEach(async () => {
    renderWithProviders(<LoginForm />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "账号密码" }));
  });

  it("初始状态下立即登录按钮禁用", () => {
    expect(screen.getByRole("button", { name: "立即登录" })).toBeDisabled();
  });

  it("填入合法手机号但无密码 → 按钮仍禁用", async () => {
    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText("请输入手机号/邮箱号码"),
      "13800138000"
    );
    expect(screen.getByRole("button", { name: "立即登录" })).toBeDisabled();
  });

  it("填入合法账号和密码 → 按钮可用", async () => {
    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText("请输入手机号/邮箱号码"),
      "13800138000"
    );
    await user.type(screen.getByPlaceholderText("请输入登录密码"), "abc123");
    expect(screen.getByRole("button", { name: "立即登录" })).toBeEnabled();
  });

  it("填入非法账号 + 密码 → 按钮禁用", async () => {
    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText("请输入手机号/邮箱号码"),
      "notvalid"
    );
    await user.type(screen.getByPlaceholderText("请输入登录密码"), "abc123");
    expect(screen.getByRole("button", { name: "立即登录" })).toBeDisabled();
  });
});

// ── 登录流程 ──────────────────────────────────────────
describe("LoginForm — 登录流程", () => {
  async function fillAndSubmit(account = "13800138000", password = "abc123") {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "账号密码" }));
    await user.type(
      screen.getByPlaceholderText("请输入手机号/邮箱号码"),
      account
    );
    await user.type(screen.getByPlaceholderText("请输入登录密码"), password);
    await user.click(screen.getByRole("button", { name: "立即登录" }));
  }

  it("登录成功 → 跳转到 /", async () => {
    mockLogin.mockResolvedValueOnce({
      user: {
        id: "1",
        nickname: "Alice",
        roles: ["student"],
        coins: 0,
        createdAt: ""
      },
      access_token: "at",
      active_role: "student",
      expires_in: 900,
      refresh_token_expires_at: 9999999999
    });
    renderWithProviders(<LoginForm />);

    await fillAndSubmit();

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("13800138000", "ABC123");
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("新用户登录（未 onboarded）→ 跳转到 /onboarding", async () => {
    mockLogin.mockResolvedValueOnce({
      user: ME_USER,
      access_token: "at",
      active_role: "student",
      expires_in: 900,
      refresh_token_expires_at: 9999999999
    } as never);
    mockMe.mockResolvedValueOnce({
      user: ME_USER,
      active_role: "student",
      learning_settings: null,
      onboarded: false
    } as never);
    renderWithProviders(<LoginForm />);

    await fillAndSubmit();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/onboarding");
    });
  });

  it("登录失败 → 显示中文错误提示", async () => {
    mockLogin.mockRejectedValueOnce(new Error("invalid credentials"));
    renderWithProviders(<LoginForm />);

    await fillAndSubmit();

    await waitFor(() => {
      expect(
        screen.getByText("账号或密码错误，请重新输入")
      ).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("登录失败 → 按钮恢复可用", async () => {
    mockLogin.mockRejectedValueOnce(new Error("invalid credentials"));
    renderWithProviders(<LoginForm />);

    await fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "立即登录" })).toBeEnabled();
    });
  });

  it("未知错误 → 显示兜底提示", async () => {
    mockLogin.mockRejectedValueOnce(new Error(""));
    renderWithProviders(<LoginForm />);

    await fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByText("登录失败，请稍后重试")).toBeInTheDocument();
    });
  });
});

// ── 错误映射 ──────────────────────────────────────────
describe("LoginForm — 错误映射", () => {
  const cases: [string, string][] = [
    ["invalid credentials", "账号或密码错误，请重新输入"],
    ["user not found", "该账号不存在"],
    ["session expired", "登录已过期，请重新登录"],
    ["invalid refresh token", "登录已过期，请重新登录"]
  ];

  it.each(cases)('后端返回 "%s" → 显示 "%s"', async (backendMsg, uiMsg) => {
    mockLogin.mockRejectedValueOnce(new Error(backendMsg));
    renderWithProviders(<LoginForm />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "账号密码" }));
    await user.type(
      screen.getByPlaceholderText("请输入手机号/邮箱号码"),
      "13800138000"
    );
    await user.type(screen.getByPlaceholderText("请输入登录密码"), "abc123");
    await user.click(screen.getByRole("button", { name: "立即登录" }));

    await waitFor(() => {
      expect(screen.getByText(uiMsg)).toBeInTheDocument();
    });
  });
});

// ── Tab 切换 ──────────────────────────────────────────
describe("LoginForm — tab 切换", () => {
  it("默认展示「手机验证」tab → 显示手机号输入框", () => {
    renderWithProviders(<LoginForm />);

    expect(screen.getByPlaceholderText("请输入手机号")).toBeInTheDocument();
  });

  it("切换到账号密码 tab → 显示密码输入框", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "账号密码" }));

    expect(screen.getByPlaceholderText("请输入登录密码")).toBeInTheDocument();
  });

  it("切换到邮箱验证 tab → 显示邮箱输入框", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "邮箱验证" }));

    expect(screen.getByPlaceholderText("请输入邮箱")).toBeInTheDocument();
  });

  it("切换 tab 后清除错误提示", async () => {
    mockLogin.mockRejectedValueOnce(new Error("invalid credentials"));
    renderWithProviders(<LoginForm />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "账号密码" }));
    await user.type(
      screen.getByPlaceholderText("请输入手机号/邮箱号码"),
      "13800138000"
    );
    await user.type(screen.getByPlaceholderText("请输入登录密码"), "abc123");
    await user.click(screen.getByRole("button", { name: "立即登录" }));
    await waitFor(() => {
      expect(
        screen.getByText("账号或密码错误，请重新输入")
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "手机验证" }));

    expect(
      screen.queryByText("账号或密码错误，请重新输入")
    ).not.toBeInTheDocument();
  });
});

// ── 验证码登录 ────────────────────────────────────────
describe("LoginForm — 验证码登录", () => {
  const AUTH_OK = {
    user: ME_USER,
    access_token: "at",
    active_role: "student",
    expires_in: 900,
    refresh_token_expires_at: 9999999999
  };

  it("合法手机号 → 获取验证码按钮可用，点击后调用 sendCode 并进入倒计时", async () => {
    const user = userEvent.setup();
    mockSendCode.mockResolvedValueOnce({ status: "sent" });
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "手机验证" }));
    const sendBtn = screen.getByRole("button", { name: "获取验证码" });
    expect(sendBtn).toBeDisabled();

    await user.type(screen.getByPlaceholderText("请输入手机号"), "13800138000");
    expect(sendBtn).toBeEnabled();

    await user.click(sendBtn);

    await waitFor(() => {
      expect(mockSendCode).toHaveBeenCalledWith("13800138000");
      expect(screen.getByText(/后重发/)).toBeInTheDocument();
    });
  });

  it("非法手机号 → 获取验证码按钮禁用", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "手机验证" }));
    await user.type(screen.getByPlaceholderText("请输入手机号"), "123");

    expect(screen.getByRole("button", { name: "获取验证码" })).toBeDisabled();
  });

  it("手机号 + 验证码登录成功 → 调用 loginWithCode 并跳转", async () => {
    const user = userEvent.setup();
    mockLoginWithCode.mockResolvedValueOnce(AUTH_OK as never);
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "手机验证" }));
    await user.type(screen.getByPlaceholderText("请输入手机号"), "13800138000");
    await user.type(screen.getByPlaceholderText("请输入验证码"), "123456");
    await user.click(screen.getByRole("button", { name: "立即登录" }));

    await waitFor(() => {
      expect(mockLoginWithCode).toHaveBeenCalledWith("13800138000", "123456");
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("验证码错误 → 显示中文错误提示", async () => {
    const user = userEvent.setup();
    mockLoginWithCode.mockRejectedValueOnce(new Error("invalid credentials"));
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "手机验证" }));
    await user.type(screen.getByPlaceholderText("请输入手机号"), "13800138000");
    await user.type(screen.getByPlaceholderText("请输入验证码"), "123456");
    await user.click(screen.getByRole("button", { name: "立即登录" }));

    await waitFor(() => {
      expect(
        screen.getByText("验证码错误或已失效，请重新获取")
      ).toBeInTheDocument();
    });
  });

  it("发送过于频繁 → 显示限流提示", async () => {
    const user = userEvent.setup();
    mockSendCode.mockRejectedValueOnce(
      new Error("too many code requests, try again later")
    );
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "手机验证" }));
    await user.type(screen.getByPlaceholderText("请输入手机号"), "13800138000");
    await user.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(
        screen.getByText("验证码发送过于频繁，请稍后再试")
      ).toBeInTheDocument();
    });
  });

  it("邮箱验证码 tab → 用邮箱作为 identifier 调用 sendCode", async () => {
    const user = userEvent.setup();
    mockSendCode.mockResolvedValueOnce({ status: "sent" });
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "邮箱验证" }));
    await user.type(
      screen.getByPlaceholderText("请输入邮箱"),
      "alice@example.com"
    );
    await user.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(mockSendCode).toHaveBeenCalledWith("alice@example.com");
    });
  });
});

// ── 交互细节 ──────────────────────────────────────────
describe("LoginForm — 交互细节", () => {
  it("点击眼睛图标 → 切换密码明文/密文", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "账号密码" }));
    const pwd = screen.getByPlaceholderText("请输入登录密码");
    expect(pwd).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "显示密码" }));
    expect(pwd).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "隐藏密码" }));
    expect(pwd).toHaveAttribute("type", "password");
  });

  it("点击「没有账号，立即注册」→ 跳 /register", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.click(
      screen.getByRole("button", { name: "没有账号，立即注册" })
    );
    expect(mockPush).toHaveBeenCalledWith("/register");
  });

  it("点击「忘记密码」→ 跳 /forgot-password", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "忘记密码" }));
    expect(mockPush).toHaveBeenCalledWith("/forgot-password");
  });

  it("URL 带 reset=success → 顶部显示重置成功提示", () => {
    mockResetParam = "success";
    renderWithProviders(<LoginForm />);

    expect(
      screen.getByText("密码重置成功，请用新密码登录。")
    ).toBeInTheDocument();
  });

  it("URL 带 deleted=success → 顶部显示注销成功提示", () => {
    mockDeletedParam = "success";
    renderWithProviders(<LoginForm />);

    expect(screen.getByText("账号已注销成功。")).toBeInTheDocument();
  });
});
