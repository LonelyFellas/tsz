import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush })
}));

vi.mock("@/lib/request", () => ({
  api: {
    auth: {
      forgotPassword: vi.fn(),
      resetPassword: vi.fn()
    }
  }
}));

import { api } from "@/lib/request";
const mockForgot = vi.mocked(api.auth.forgotPassword);
const mockReset = vi.mocked(api.auth.resetPassword);

const VALID_PHONE = "13800138000";
const VALID_CODE = "123456";
const VALID_PASSWORD = "abc12345678";

beforeEach(() => {
  vi.clearAllMocks();
  mockPush.mockReset();
});

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  { phone = VALID_PHONE, code = VALID_CODE, password = VALID_PASSWORD } = {}
) {
  await user.type(screen.getByPlaceholderText("请输入手机号"), phone);
  await user.type(screen.getByPlaceholderText("请输入验证码"), code);
  await user.type(screen.getByPlaceholderText("请输入新密码"), password);
}

// ── 按钮状态 ──────────────────────────────────────────
describe("ForgotPasswordForm — 按钮状态", () => {
  beforeEach(() => {
    renderWithProviders(<ForgotPasswordForm />);
  });

  it("初始状态下重置按钮禁用", () => {
    expect(screen.getByRole("button", { name: "重置密码" })).toBeDisabled();
  });

  it("仅填手机号 → 重置按钮仍禁用", async () => {
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("请输入手机号"), VALID_PHONE);
    expect(screen.getByRole("button", { name: "重置密码" })).toBeDisabled();
  });

  it("手机号+验证码+合法新密码 → 按钮可用", async () => {
    const user = userEvent.setup();
    await fillForm(user);
    expect(screen.getByRole("button", { name: "重置密码" })).toBeEnabled();
  });

  it("新密码不满足 11-20 位字母+数字 → 按钮禁用", async () => {
    const user = userEvent.setup();
    await fillForm(user, { password: "short1" });
    expect(screen.getByRole("button", { name: "重置密码" })).toBeDisabled();
  });

  it("非法手机号 → 显示手机号码错误", async () => {
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("请输入手机号"), "123");
    expect(screen.getByText("手机号码错误")).toBeInTheDocument();
  });
});

// ── 获取验证码 ────────────────────────────────────────
describe("ForgotPasswordForm — 获取验证码", () => {
  it("非法手机号时获取验证码按钮禁用", () => {
    renderWithProviders(<ForgotPasswordForm />);
    expect(screen.getByRole("button", { name: "获取验证码" })).toBeDisabled();
  });

  it("合法手机号 → 调用 forgotPassword 并进入倒计时", async () => {
    mockForgot.mockResolvedValueOnce({ status: "sent" });
    renderWithProviders(<ForgotPasswordForm />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入手机号"), VALID_PHONE);
    await user.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(mockForgot).toHaveBeenCalledWith(VALID_PHONE);
      expect(screen.getByRole("button", { name: /后重发/ })).toBeDisabled();
    });
  });

  it("发送过程中按钮显示「发送中...」", async () => {
    // 用一个挂起的 promise 留住中间态，断言后再放行。
    let release!: (v: { status: string }) => void;
    mockForgot.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    renderWithProviders(<ForgotPasswordForm />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入手机号"), VALID_PHONE);
    await user.click(screen.getByRole("button", { name: "获取验证码" }));

    expect(
      await screen.findByRole("button", { name: "发送中..." })
    ).toBeDisabled();
    release({ status: "sent" });
  });

  it("发送过于频繁(429) → 显示中文文案", async () => {
    mockForgot.mockRejectedValueOnce(
      new Error("too many code requests, try again later")
    );
    renderWithProviders(<ForgotPasswordForm />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入手机号"), VALID_PHONE);
    await user.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(
        screen.getByText("验证码发送过于频繁，请稍后再试")
      ).toBeInTheDocument();
    });
  });
});

// ── 重置流程 ──────────────────────────────────────────
describe("ForgotPasswordForm — 重置流程", () => {
  it("重置成功 → 提交转大写密码并跳转 /login?reset=success", async () => {
    mockReset.mockResolvedValueOnce({ status: "reset" });
    renderWithProviders(<ForgotPasswordForm />);
    const user = userEvent.setup();

    await fillForm(user, { password: "abcDEF12345" });
    await user.click(screen.getByRole("button", { name: "重置密码" }));

    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledWith(
        VALID_PHONE,
        VALID_CODE,
        "ABCDEF12345"
      );
      expect(mockPush).toHaveBeenCalledWith("/login?reset=success");
    });
  });

  it("验证码错误/失效 → 显示中文提示且不跳转", async () => {
    mockReset.mockRejectedValueOnce(new Error("invalid or expired reset code"));
    renderWithProviders(<ForgotPasswordForm />);
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "重置密码" }));

    await waitFor(() => {
      expect(
        screen.getByText("验证码错误或已失效，请重新获取")
      ).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("账号被禁用 → 显示中文提示", async () => {
    mockReset.mockRejectedValueOnce(new Error("account disabled"));
    renderWithProviders(<ForgotPasswordForm />);
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "重置密码" }));

    await waitFor(() => {
      expect(
        screen.getByText("该账号已被禁用，无法重置密码")
      ).toBeInTheDocument();
    });
  });

  it("非 Error 类型异常 → 显示兜底文案", async () => {
    mockReset.mockRejectedValueOnce("boom");
    renderWithProviders(<ForgotPasswordForm />);
    const user = userEvent.setup();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "重置密码" }));

    await waitFor(() => {
      expect(screen.getByText("操作失败，请稍后重试")).toBeInTheDocument();
    });
  });
});

// ── 交互细节 ──────────────────────────────────────────
describe("ForgotPasswordForm — 交互细节", () => {
  it("点击「← 返回登录」→ 跳转 /login", async () => {
    renderWithProviders(<ForgotPasswordForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "← 返回登录" }));

    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  it("信息不全时提交表单被拦下，不触发重置请求", () => {
    const { container } = renderWithProviders(<ForgotPasswordForm />);

    // 直接提交未填完整的表单：handleReset 应 preventDefault 并在 canSubmit 为 false 时拦下。
    fireEvent.submit(container.querySelector("form")!);

    expect(mockReset).not.toHaveBeenCalled();
  });

  it("切换显示密码 → 输入框类型在 password / text 间切换", async () => {
    renderWithProviders(<ForgotPasswordForm />);
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText("请输入新密码");

    expect(input).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "显示密码" }));
    expect(input).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "隐藏密码" }));
    expect(input).toHaveAttribute("type", "password");
  });
});
