import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const PHONE = "13800138000";
const PASSWORD = "abc12345678";
const CODE = "123456";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function authResult(): AuthResponse {
  return {
    user: {
      id: "1",
      display_name: "同学1234",
      phone: PHONE,
      roles: ["student"],
      avatar_url: "",
      active_role: "student"
    },
    access_token: "access-token",
    expires_in: 900,
    refresh_token_expires_at: 9_999_999_999
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRegister.mockResolvedValue(authResult());
  mockSendCode.mockResolvedValue(undefined);
  mockMe.mockResolvedValue({
    user: authResult().user,
    active_role: "student",
    learning_settings: null,
    onboarded: true
  });
});

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("请输入手机号"), PHONE);
  await user.type(screen.getByPlaceholderText("请输入验证码"), CODE);
  await user.type(screen.getByPlaceholderText("请输入登录密码"), PASSWORD);
}

describe("RegisterForm — 手机号验证码注册", () => {
  it("手机号注册可用，邮箱入口显示未开放且不可操作", () => {
    renderWithProviders(<RegisterForm />);
    expect(screen.getByPlaceholderText("请输入手机号")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("请输入验证码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "手机" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "邮箱（未开放）" })
    ).toBeDisabled();
    expect(screen.queryByPlaceholderText("请输入邮箱")).toBeNull();
  });

  it("手机号、验证码、密码均合法后才允许提交", async () => {
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();
    const submit = screen.getByRole("button", { name: "立即注册" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByPlaceholderText("请输入手机号"), PHONE);
    await user.type(screen.getByPlaceholderText("请输入登录密码"), PASSWORD);
    expect(submit).toBeDisabled();
    await user.type(screen.getByPlaceholderText("请输入验证码"), CODE);
    expect(submit).toBeEnabled();
  });

  it.each(["1234", "12345", "1234567", "12345678"])(
    "%s 不是 6 位验证码，不能提交",
    async (invalidCode) => {
      renderWithProviders(<RegisterForm />);
      const user = userEvent.setup();
      await user.type(screen.getByPlaceholderText("请输入手机号"), PHONE);
      await user.type(screen.getByPlaceholderText("请输入验证码"), invalidCode);
      await user.type(screen.getByPlaceholderText("请输入登录密码"), PASSWORD);

      expect(screen.getByText("请输入 6 位数字验证码")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "立即注册" })).toBeDisabled();
    }
  );

  it("获取验证码使用 register purpose，并进入倒计时", async () => {
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("请输入手机号"), PHONE);
    await user.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(mockSendCode).toHaveBeenCalledWith(PHONE, "register");
      expect(screen.getByRole("button", { name: "60s 后重发" })).toBeDisabled();
    });
  });

  it("发码后修改手机号会清空旧验证码和倒计时", async () => {
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();
    const phoneInput = screen.getByPlaceholderText("请输入手机号");
    const codeInput = screen.getByPlaceholderText("请输入验证码");

    await user.type(phoneInput, PHONE);
    await user.click(screen.getByRole("button", { name: "获取验证码" }));
    await screen.findByRole("button", { name: "60s 后重发" });
    await user.type(codeInput, CODE);

    await user.clear(phoneInput);
    await user.type(phoneInput, "13900139000");

    expect(codeInput).toHaveValue("");
    expect(screen.getByRole("button", { name: "获取验证码" })).toBeEnabled();
  });

  it("发码和注册请求进行中锁定手机号", async () => {
    const send = deferred<void>();
    mockSendCode.mockReturnValueOnce(send.promise);
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();
    const phoneInput = screen.getByPlaceholderText("请输入手机号");
    await user.type(phoneInput, PHONE);
    await user.click(screen.getByRole("button", { name: "获取验证码" }));
    expect(phoneInput).toBeDisabled();
    send.resolve();
    await screen.findByRole("button", { name: "60s 后重发" });

    await user.type(screen.getByPlaceholderText("请输入验证码"), CODE);
    await user.type(screen.getByPlaceholderText("请输入登录密码"), PASSWORD);
    const registration = deferred<AuthResponse>();
    mockRegister.mockReturnValueOnce(registration.promise);
    await user.click(screen.getByRole("button", { name: "立即注册" }));
    expect(phoneInput).toBeDisabled();
    registration.resolve(authResult());
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });

  it("非法手机号不能发送验证码", async () => {
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("请输入手机号"), "12345");
    expect(screen.getByText("手机号码错误")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "获取验证码" })).toBeDisabled();
  });

  it("注册成功直接使用返回会话并跳首页", async () => {
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "立即注册" }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        phone: PHONE,
        password: PASSWORD.toUpperCase(),
        code: CODE
      });
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("未完成 onboarding 时跳转引导页", async () => {
    mockMe.mockResolvedValueOnce({
      user: authResult().user,
      active_role: "student",
      learning_settings: null,
      onboarded: false
    });
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "立即注册" }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/onboarding"));
  });

  it.each([
    ["invalid code", "验证码错误或已失效，请重新获取"],
    ["user already exists", "该手机号已注册，请直接登录"],
    ["too many requests", "验证码发送过于频繁，请稍后再试"]
  ])("注册错误 %s 映射为中文提示", async (message, expected) => {
    mockRegister.mockRejectedValueOnce(new Error(message));
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "立即注册" }));
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "立即注册" })).toBeEnabled();
  });

  it("发码失败显示提示并恢复发码按钮", async () => {
    mockSendCode.mockRejectedValueOnce(new Error("service unavailable"));
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("请输入手机号"), PHONE);
    await user.click(screen.getByRole("button", { name: "获取验证码" }));
    expect(
      await screen.findByText("验证码服务暂时不可用，请稍后再试")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "获取验证码" })).toBeEnabled();
  });

  it("支持显示密码、回车提交和页面跳转", async () => {
    renderWithProviders(<RegisterForm />);
    const user = userEvent.setup();
    const password = screen.getByPlaceholderText("请输入登录密码");
    await user.click(screen.getByRole("button", { name: "显示密码" }));
    expect(password).toHaveAttribute("type", "text");
    await fillForm(user);
    await user.type(password, "{Enter}");
    await waitFor(() => expect(mockRegister).toHaveBeenCalledOnce());

    await user.click(screen.getByRole("button", { name: "← 返回" }));
    expect(mockBack).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "已有账号,去登录" }));
    expect(mockPush).toHaveBeenCalledWith("/login");
  });
});
