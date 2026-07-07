import type { AdminAuthResponse, AdminProfile } from "@tsz/api-client";
import { HttpError } from "@tsz/api-client";
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
    api: {
      auth: { login: vi.fn(), changePassword: vi.fn(), logout: vi.fn() },
      // 登录成功后拉 /profile 补全菜单权限（permissions）——登录响应不含它。
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
const mockProfile = vi.mocked(api.profile);
const mockPersist = vi.mocked(persistSession);
const mockSetAccessToken = vi.mocked(tokens.setAccessToken);

function authResponse(
  level: "admin" | "super_admin",
  mustChange = false
): AdminAuthResponse {
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
    refresh_token_expires_at: 0,
    must_change_password: mustChange
  };
}

// 登录后 enterConsole 拉的 /profile 响应（含菜单权限）。display_name 与 authResponse 对齐，
// 让「写入 profile」断言不受来源切换影响。
function profileResponse(level: "admin" | "super_admin"): AdminProfile {
  return {
    id: "a1",
    phone: "13800138000",
    display_name: "审核员小王",
    level,
    permissions: level === "super_admin" ? [] : ["users.access"]
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
  // enterConsole 默认拿到一个普通管理员 profile；需要超管的用例各自覆盖。
  mockProfile.mockResolvedValue(profileResponse("admin"));
  useAuthStore.setState({ profile: null, level: null });
});

describe("AdminLoginForm", () => {
  it("登录成功：持久化会话、写入 profile、跳转后台", async () => {
    mockLogin.mockResolvedValue(authResponse("super_admin"));
    mockProfile.mockResolvedValue(profileResponse("super_admin"));
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

  it("登录成功但拉 profile 失败：撤销会话、提示重试、不放行进后台", async () => {
    mockLogin.mockResolvedValue(authResponse("admin"));
    // 登录已 200 并 persistSession，但 /profile 失败（弱网/5xx）。
    mockProfile.mockRejectedValue(new Error("profile fetch failed"));
    render(<AdminLoginForm />);
    fillAndSubmit();

    // 文案不与「凭证错误」混淆，明确指向 profile 加载失败。
    await waitFor(() =>
      expect(
        screen.getByText("登录成功但加载账号信息失败，请重试")
      ).toBeInTheDocument()
    );
    // 撤销刚建立的会话：清 access token（连带 clearTimeout 刷新定时器）。
    expect(mockSetAccessToken).toHaveBeenCalledWith(null);
    // 未放行：不写 profile、不跳转后台。
    expect(useAuthStore.getState().profile).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
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
        level: "admin",
        permissions: []
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
        profile: {
          id: "a1",
          phone: "1",
          display_name: "X",
          level: "admin",
          permissions: []
        },
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

  // 浏览器里密码框回车会触发表单原生提交（htmlType=submit）；jsdom 不模拟回车的隐式提交，
  // 直接对 <form> 派发 submit 来等价验证 onFinish 路径。
  const submitForm = (c: HTMLElement) =>
    fireEvent.submit(c.querySelector("form") as HTMLFormElement);

  it("回车/原生提交触发登录", async () => {
    mockLogin.mockResolvedValue(authResponse("admin"));
    const { container } = render(<AdminLoginForm />);
    fireEvent.change(screen.getByPlaceholderText("请输入手机号或邮箱"), {
      target: { value: "13800138000" }
    });
    fireEvent.change(screen.getByPlaceholderText("请输入登录密码"), {
      target: { value: "secret123" }
    });
    submitForm(container);
    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
  });

  it("未填写完整时原生提交不触发登录（canSubmit 兜底）", async () => {
    const { container } = render(<AdminLoginForm />);
    submitForm(container);
    // onFinish 异步（validateFields 微任务）：留出一拍，仍不应打后端。
    await waitFor(() => expect(mockLogin).not.toHaveBeenCalled());
  });

  it("密码不足 8 位：按钮禁用且原生提交不打后端（与后端 8–72 规则一致）", async () => {
    const { container } = render(<AdminLoginForm />);
    fireEvent.change(screen.getByPlaceholderText("请输入手机号或邮箱"), {
      target: { value: "13800138000" }
    });
    fireEvent.change(screen.getByPlaceholderText("请输入登录密码"), {
      target: { value: "short12" } // 7 位
    });
    expect(screen.getByRole("button", { name: LOGIN_BUTTON })).toBeDisabled();
    submitForm(container);
    await waitFor(() => expect(mockLogin).not.toHaveBeenCalled());
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

  it("must_change_password：建立会话后跳独立改密页(带临时密码 state)，不放行进后台", async () => {
    mockLogin.mockResolvedValue(authResponse("admin", true));
    render(<AdminLoginForm />);
    fillAndSubmit();

    // 登录成功但被挂起：已建立 token（供改密），跳改密页并把临时密码经 state 预填，未 setProfile。
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/change-password", {
        state: { currentPassword: "secret123" }
      })
    );
    expect(mockPersist).toHaveBeenCalled();
    expect(useAuthStore.getState().profile).toBeNull();
  });

  // antd 的 loading 图标退场动画在 jsdom 里不触发 animationend，spinner 会滞留 DOM 使
  // 按钮可及名残留 "loading"，无法按 /^登录$/ 精确匹配。直接取主按钮元素判用禁态更稳。
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

    // 改动密码 = 新一次尝试意图：清提示、解除置灰。
    fireEvent.change(screen.getByPlaceholderText("请输入登录密码"), {
      target: { value: "another-secret" }
    });
    expect(
      screen.queryByText("账号已被锁定，请约 15 分钟后再试")
    ).not.toBeInTheDocument();
    expect(primaryButton(container)).toBeEnabled();
  });

  it("账号被锁定(423)：改动账号同样解除置灰", async () => {
    mockLogin.mockRejectedValue(
      new HttpError(423, "account temporarily locked")
    );
    const { container } = render(<AdminLoginForm />);
    fillAndSubmit();

    await waitFor(() => expect(primaryButton(container)).toBeDisabled());
    fireEvent.change(screen.getByPlaceholderText("请输入手机号或邮箱"), {
      target: { value: "13900139000" }
    });
    expect(primaryButton(container)).toBeEnabled();
  });
});
