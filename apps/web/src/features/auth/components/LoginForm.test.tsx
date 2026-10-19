import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithProviders } from "@/test/render";
import { HttpError } from "@tsz/api-client";
import { LoginForm } from "./LoginForm";
import { useUserStore } from "@/stores/user";
import type { User } from "@tsz/types";

const mockPush = vi.fn();
const params: Record<string, string | null> = {};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: (key: string) => params[key] ?? null })
}));
vi.mock("@/lib/request", () => ({
  persistSession: vi.fn(),
  api: {
    auth: {
      login: vi.fn(),
      loginWithCode: vi.fn(),
      sendCode: vi.fn(),
      me: vi.fn()
    }
  }
}));

import { api } from "@/lib/request";
const mockLogin = vi.mocked(api.auth.login);
const mockMe = vi.mocked(api.auth.me);
const ME_USER: User = {
  id: "1",
  display_name: "Alice",
  roles: ["student"],
  avatar_url: "",
  active_role: "student"
};
const AUTH_OK = {
  user: ME_USER,
  access_token: "at",
  expires_in: 900,
  refresh_token_expires_at: 9999999999
};

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  for (const key of Object.keys(params)) delete params[key];
  useUserStore.setState({ user: null, onboarded: null, hydrated: false });
  mockMe.mockResolvedValue({
    user: ME_USER,
    active_role: "student",
    learning_settings: { cefr_level: "B1", english_variant: "BrE" },
    onboarded: true
  } as never);
});

async function fillLogin(account = "13800138000", password = "abc123") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("手机号或邮箱"), account);
  await user.type(screen.getByLabelText("密码"), password);
  return user;
}

describe("LoginForm — 密码与手机验证码登录", () => {
  it("默认密码登录并提供手机验证码切换", () => {
    renderWithProviders(<LoginForm />);
    expect(
      screen.getByRole("tablist", { name: "登录方式" })
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "密码登录" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: "验证码登录" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
    expect(screen.getByLabelText("手机号或邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toHaveAttribute("type", "password");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("密码登录");
    expect(
      screen.queryByRole("button", { name: "邮箱验证" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "手机验证" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "获取验证码" })
    ).not.toBeInTheDocument();
  });

  it("方向键只移动焦点，确认后才切换；重按当前 Tab 不清空输入", async () => {
    renderWithProviders(<LoginForm />);
    const user = userEvent.setup();
    const passwordTab = screen.getByRole("tab", { name: "密码登录" });
    const codeTab = screen.getByRole("tab", { name: "验证码登录" });
    await user.type(screen.getByLabelText("手机号或邮箱"), "13800138000");
    await user.type(screen.getByLabelText("密码"), "abc123");
    await user.click(passwordTab);
    expect(screen.getByLabelText("密码")).toHaveValue("abc123");

    await user.keyboard("{ArrowRight}");
    expect(codeTab).toHaveFocus();
    expect(passwordTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("密码")).toHaveValue("abc123");

    await user.keyboard("{Enter}");
    expect(codeTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("验证码登录");
    expect(screen.getByLabelText("手机号")).toHaveValue("13800138000");

    await user.keyboard("{ArrowLeft}");
    expect(passwordTab).toHaveFocus();
    expect(codeTab).toHaveAttribute("aria-selected", "true");
    await user.keyboard(" ");
    expect(passwordTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("密码")).toHaveValue("");
  });

  it("账号或密码不完整时不可提交，回车也不发送请求", async () => {
    renderWithProviders(<LoginForm />);
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: "立即登录" })).toBeDisabled();
    await user.type(screen.getByLabelText("密码"), "abc123{Enter}");
    expect(mockLogin).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("手机号或邮箱"), "notvalid{Enter}");
    expect(mockLogin).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "立即登录" })).toBeDisabled();
  });

  it("登录及资料加载等待期间不能进入找回密码", async () => {
    let resolveAuth!: (value: typeof AUTH_OK) => void;
    let resolveMe!: (value: Awaited<ReturnType<typeof api.auth.me>>) => void;
    mockLogin.mockReturnValueOnce(new Promise((done) => (resolveAuth = done)));
    mockMe.mockReturnValueOnce(new Promise((done) => (resolveMe = done)));
    renderWithProviders(<LoginForm />);
    const user = await fillLogin();
    await user.click(screen.getByRole("button", { name: "立即登录" }));
    const forgot = screen.getByRole("button", { name: "忘记密码" });
    expect(forgot).toBeDisabled();
    await user.click(forgot);
    expect(mockPush).not.toHaveBeenCalled();
    resolveAuth(AUTH_OK);
    await waitFor(() => expect(mockMe).toHaveBeenCalled());
    expect(forgot).toBeDisabled();
    resolveMe({
      user: ME_USER,
      active_role: "student",
      learning_settings: null,
      onboarded: true
    });
    await waitFor(() => expect(useUserStore.getState().user).toEqual(ME_USER));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("登录页卸载后的迟到响应不能读取资料或覆盖新会话", async () => {
    let resolve!: (value: typeof AUTH_OK) => void;
    mockLogin.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    const { unmount } = renderWithProviders(<LoginForm />);
    const user = await fillLogin();
    await user.click(screen.getByRole("button", { name: "立即登录" }));
    unmount();
    const next = { ...ME_USER, id: "new-user", display_name: "Bob" };
    useUserStore.setState({ user: next, onboarded: true });
    await act(async () => resolve(AUTH_OK));
    expect(mockMe).not.toHaveBeenCalled();
    expect(useUserStore.getState().user).toEqual(next);
  });

  it("手机号和密码回车登录并发布完整用户态，交给守卫导航", async () => {
    mockLogin.mockResolvedValueOnce(AUTH_OK as never);
    renderWithProviders(<LoginForm />);
    const user = await fillLogin();
    await user.type(screen.getByLabelText("密码"), "{Enter}");
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("13800138000", "abc123", {
        signal: expect.any(AbortSignal)
      });
      expect(useUserStore.getState()).toMatchObject({
        user: ME_USER,
        onboarded: true,
        hydrated: true
      });
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it("新用户登录发布未完成引导状态", async () => {
    mockLogin.mockResolvedValueOnce(AUTH_OK as never);
    mockMe.mockResolvedValueOnce({
      user: ME_USER,
      active_role: "student",
      learning_settings: null,
      onboarded: false
    } as never);
    renderWithProviders(<LoginForm />);
    const user = await fillLogin();
    await user.click(screen.getByRole("button", { name: "立即登录" }));
    await waitFor(() =>
      expect(useUserStore.getState()).toMatchObject({
        user: ME_USER,
        onboarded: false,
        hydrated: true
      })
    );
  });

  it("邮箱规范化后登录失败，保留邮箱注册方式及安全回跳", async () => {
    params.redirect = "/student/practice";
    mockLogin.mockRejectedValueOnce(new Error("invalid credentials"));
    renderWithProviders(<LoginForm />);
    const user = await fillLogin("Student@EXAMPLE.com", "OldPass!");
    await user.click(screen.getByRole("button", { name: "立即登录" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "账号或密码错误，请重新输入"
    );
    await user.click(
      screen.getByRole("button", { name: "没有账号，立即注册" })
    );
    expect(mockLogin).toHaveBeenCalledWith("student@example.com", "OldPass!", {
      signal: expect.any(AbortSignal)
    });
    expect(mockPush).toHaveBeenCalledWith(
      "/register?method=email&redirect=%2Fstudent%2Fpractice"
    );
  });

  it.each([
    ["forbidden", "该账号已被禁用，请联系客服"],
    ["session expired", "登录已过期，请重新登录"],
    ["invalid refresh token", "登录已过期，请重新登录"]
  ])("错误 %s 显示 %s", async (backend, message) => {
    mockLogin.mockRejectedValueOnce(new Error(backend));
    renderWithProviders(<LoginForm />);
    const user = await fillLogin();
    await user.click(screen.getByRole("button", { name: "立即登录" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "立即登录" })).toBeEnabled();
  });

  it("非 Error 拒绝显示兜底提示", async () => {
    mockLogin.mockRejectedValueOnce("boom");
    renderWithProviders(<LoginForm />);
    const user = await fillLogin();
    await user.click(screen.getByRole("button", { name: "立即登录" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "登录失败，请稍后重试"
    );
  });

  it("密码显示切换不提交表单", async () => {
    renderWithProviders(<LoginForm />);
    const user = await fillLogin();
    await user.click(screen.getByRole("button", { name: "显示密码" }));
    expect(screen.getByLabelText("密码")).toHaveAttribute("type", "text");
    expect(mockLogin).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "隐藏密码" }));
    expect(screen.getByLabelText("密码")).toHaveAttribute("type", "password");
  });

  it("手机号码注册与找回密码仍可访问", async () => {
    renderWithProviders(<LoginForm />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "没有账号，立即注册" })
    );
    await user.click(screen.getByRole("button", { name: "忘记密码" }));
    expect(mockPush).toHaveBeenCalledWith("/register");
    expect(mockPush).toHaveBeenCalledWith("/forgot-password");
  });

  it.each([
    ["reset", "密码重置成功，请用新密码登录。"],
    ["deleted", "账号已注销成功。"],
    ["registered", "注册成功，请用刚设置的账号密码登录。"],
    ["security", "账号安全信息已更新，请使用当前绑定的手机号或邮箱重新登录。"]
  ])("%s=success 显示结果提示", (key, message) => {
    params[key] = "success";
    renderWithProviders(<LoginForm />);
    expect(screen.getByRole("status")).toHaveTextContent(message);
  });
});

async function openCodeLogin() {
  renderWithProviders(<LoginForm />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "验证码登录" }));
  await user.type(screen.getByLabelText("手机号"), "13800138000");
  return user;
}

it("手机验证码登录严格验证手机号和六位码，发码后冷却并进入同一会话流程", async () => {
  vi.mocked(api.auth.loginWithCode).mockResolvedValue(AUTH_OK);
  const user = await openCodeLogin();
  await user.clear(screen.getByLabelText("手机号"));
  await user.type(screen.getByLabelText("手机号"), "user@example.com");
  expect(screen.getByRole("button", { name: "获取验证码" })).toBeDisabled();
  await user.clear(screen.getByLabelText("手机号"));
  await user.type(screen.getByLabelText("手机号"), "13800138000");
  await user.click(screen.getByRole("button", { name: "获取验证码" }));
  expect(api.auth.sendCode).toHaveBeenCalledWith("13800138000", "login");
  expect(screen.getByRole("button", { name: /后重发/ })).toBeDisabled();
  await user.type(screen.getByLabelText("验证码"), "12345");
  expect(screen.getByRole("button", { name: "立即登录" })).toBeDisabled();
  await user.type(screen.getByLabelText("验证码"), "6{Enter}");
  await waitFor(() => expect(useUserStore.getState().user).toEqual(ME_USER));
  expect(api.auth.loginWithCode).toHaveBeenCalledWith("13800138000", "123456", {
    signal: expect.any(AbortSignal)
  });
  expect(api.auth.login).not.toHaveBeenCalled();
});

it("发码后重新打开页面仍对同一手机号保持冷却", async () => {
  vi.mocked(api.auth.sendCode).mockResolvedValueOnce(undefined);
  const { unmount } = renderWithProviders(<LoginForm />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "验证码登录" }));
  await user.type(screen.getByLabelText("手机号"), "13800138000");
  await user.click(screen.getByRole("button", { name: "获取验证码" }));
  expect(screen.getByRole("button", { name: /后重发/ })).toBeDisabled();

  unmount();
  renderWithProviders(<LoginForm />);
  await user.click(screen.getByRole("tab", { name: "验证码登录" }));
  await user.type(screen.getByLabelText("手机号"), "13800138000");
  expect(screen.getByRole("button", { name: /后重发/ })).toBeDisabled();
  expect(api.auth.sendCode).toHaveBeenCalledTimes(1);

  await user.clear(screen.getByLabelText("手机号"));
  await user.type(screen.getByLabelText("手机号"), "13900139000");
  expect(screen.getByRole("button", { name: "获取验证码" })).toBeEnabled();
});

it("OTP 消费成功但资料失败时，只重试资料，不再次提交验证码", async () => {
  vi.mocked(api.auth.loginWithCode).mockResolvedValue(AUTH_OK);
  mockMe.mockRejectedValueOnce(new Error("network"));
  const user = await openCodeLogin();
  await user.type(screen.getByLabelText("验证码"), "123456{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "登录成功，但加载账号信息失败"
  );
  await user.click(screen.getByRole("button", { name: "重试加载" }));
  await waitFor(() => expect(useUserStore.getState().user).toEqual(ME_USER));
  expect(api.auth.loginWithCode).toHaveBeenCalledTimes(1);
  expect(mockMe).toHaveBeenCalledTimes(2);
});

it("错误验证码清除并保留手机号，允许再次输入", async () => {
  vi.mocked(api.auth.loginWithCode).mockRejectedValueOnce(
    new HttpError(401, "invalid code", [], "invalid_otp_code")
  );
  const user = await openCodeLogin();
  await user.type(screen.getByLabelText("验证码"), "123456{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "验证码错误或已失效"
  );
  expect(screen.getByLabelText("验证码")).toHaveValue("");
  expect(screen.getByLabelText("手机号")).toHaveValue("13800138000");
  expect(mockMe).not.toHaveBeenCalled();
});

it("验证码发码在途禁止切换、提交和重复发码；失败后允许重试", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(api.auth.sendCode).mockReturnValueOnce(
    new Promise((_, fail) => {
      reject = fail;
    })
  );
  const user = await openCodeLogin();
  await user.type(screen.getByLabelText("验证码"), "123456");
  await user.click(screen.getByRole("button", { name: "获取验证码" }));
  expect(screen.getByRole("tab", { name: "密码登录" })).toBeDisabled();
  expect(screen.getByLabelText("手机号")).toHaveAttribute("readonly");
  expect(screen.getByLabelText("手机号")).not.toBeDisabled();
  expect(screen.getByLabelText("验证码")).toHaveAttribute("readonly");
  expect(screen.getByLabelText("验证码")).not.toBeDisabled();
  expect(screen.getByRole("button", { name: "立即登录" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "发送中…" }));
  expect(api.auth.sendCode).toHaveBeenCalledTimes(1);
  await act(async () =>
    reject(new HttpError(503, "unavailable", [], "otp_unavailable"))
  );
  expect(screen.getByRole("alert")).toHaveTextContent("验证码服务暂不可用");
  expect(screen.getByRole("button", { name: "获取验证码" })).toBeEnabled();
});

it("限流后重试时保留提示，成功后才清除", async () => {
  const limited = new HttpError(429, "rate limited", [], "otp_rate_limited");
  vi.mocked(api.auth.sendCode).mockRejectedValueOnce(limited);
  let resolve!: () => void;
  vi.mocked(api.auth.sendCode).mockReturnValueOnce(
    new Promise<void>((done) => {
      resolve = done;
    })
  );
  const user = await openCodeLogin();
  await user.click(screen.getByRole("button", { name: "获取验证码" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "验证码发送过于频繁"
  );

  await user.click(screen.getByRole("button", { name: "获取验证码" }));
  expect(screen.getByRole("button", { name: "发送中…" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("验证码发送过于频繁");
  await act(async () => resolve());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
