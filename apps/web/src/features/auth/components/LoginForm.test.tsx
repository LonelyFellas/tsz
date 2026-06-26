import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithProviders } from "@/test/render";
import { LoginForm } from "./LoginForm";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: () => null })
}));

vi.mock("@/lib/request", () => ({
  setAccessToken: vi.fn(),
  api: {
    auth: {
      login: vi.fn()
    }
  }
}));

// 引入 mock 后拿到有类型的引用
import { api } from "@/lib/request";
const mockLogin = vi.mocked(api.auth.login);

beforeEach(() => {
  vi.clearAllMocks();
  mockPush.mockReset();
});

// ── 按钮状态 ──────────────────────────────────────────
describe("LoginForm — 按钮状态", () => {
  beforeEach(() => {
    renderWithProviders(<LoginForm />);
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
      active_role: "student"
    });
    renderWithProviders(<LoginForm />);

    await fillAndSubmit();

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("13800138000", "ABC123");
      expect(mockPush).toHaveBeenCalledWith("/");
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
  it("切换到手机验证码 tab → 显示手机号输入框", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "手机验证码" }));

    expect(screen.getByPlaceholderText("请输入手机号")).toBeInTheDocument();
  });

  it("切换到邮箱验证码 tab → 显示邮箱输入框", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "邮箱验证码" }));

    expect(screen.getByPlaceholderText("请输入邮箱")).toBeInTheDocument();
  });

  it("切换 tab 后清除错误提示", async () => {
    mockLogin.mockRejectedValueOnce(new Error("invalid credentials"));
    renderWithProviders(<LoginForm />);

    const user = userEvent.setup();
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

    await user.click(screen.getByRole("button", { name: "手机验证码" }));

    expect(
      screen.queryByText("账号或密码错误，请重新输入")
    ).not.toBeInTheDocument();
  });
});
