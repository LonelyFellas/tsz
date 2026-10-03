import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithProviders } from "@/test/render";
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
  api: { auth: { login: vi.fn(), me: vi.fn() } }
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

describe("LoginForm — 唯一登录方式", () => {
  it("只展示手机号或邮箱 + 密码，不提供验证码登录入口", () => {
    renderWithProviders(<LoginForm />);
    expect(screen.getByLabelText("手机号或邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toHaveAttribute("type", "password");
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
