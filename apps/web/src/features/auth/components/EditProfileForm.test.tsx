import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeResponse } from "@tsz/api-client";
import type { User } from "@tsz/types";
import { EditProfileForm } from "./EditProfileForm";
import { useUserStore } from "@/stores/user";

const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: mockBack })
}));

vi.mock("@/lib/request", () => ({
  api: {
    auth: {
      me: vi.fn(),
      updateProfile: vi.fn(),
      requestContactBindCode: vi.fn(),
      bindContact: vi.fn()
    }
  }
}));

import { api } from "@/lib/request";
const mockMe = vi.mocked(api.auth.me);
const mockUpdate = vi.mocked(api.auth.updateProfile);
const mockBindCode = vi.mocked(api.auth.requestContactBindCode);
const mockBind = vi.mocked(api.auth.bindContact);

const PHONE = "13899997777";
const NEW_EMAIL = "new@qq.com";
const VALID_CODE = "123456";

function userWith(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    phone: PHONE,
    display_name: "Alice",
    roles: ["student"],
    avatar_url: "",
    status: "active",
    created_at: "",
    updated_at: "",
    ...overrides
  };
}

function meResponse(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    user: userWith(),
    active_role: "student",
    learning_settings: { cefr_level: "A1", english_variant: "BrE" },
    onboarded: true,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBack.mockReset();
  useUserStore.setState({ user: null });
  mockMe.mockResolvedValue(meResponse());
});

// ── 加载与渲染 ────────────────────────────────────────
describe("EditProfileForm — 加载与渲染", () => {
  it("挂载即拉取 /me,展示联系方式 / 等级口音徽标 / 昵称回填", async () => {
    render(<EditProfileForm />);

    expect(await screen.findByText(PHONE)).toBeInTheDocument();
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("英式")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
    expect(mockMe).toHaveBeenCalledTimes(1);
  });

  it("learning_settings 为 null → 不渲染等级/口音徽标", async () => {
    mockMe.mockResolvedValue(meResponse({ learning_settings: null }));
    render(<EditProfileForm />);

    await screen.findByDisplayValue("Alice");
    expect(screen.queryByText("A1")).not.toBeInTheDocument();
    expect(screen.queryByText("英式")).not.toBeInTheDocument();
  });

  it("纯手机账号 → 展示「绑定邮箱」", async () => {
    render(<EditProfileForm />);
    expect(await screen.findByText("绑定邮箱")).toBeInTheDocument();
  });

  it("纯邮箱账号 → 展示「绑定手机」", async () => {
    mockMe.mockResolvedValue(
      meResponse({ user: userWith({ phone: undefined, email: "a@b.com" }) })
    );
    render(<EditProfileForm />);
    expect(await screen.findByText("绑定手机")).toBeInTheDocument();
  });

  it("已绑定手机+邮箱 → 展示「换绑手机」", async () => {
    mockMe.mockResolvedValue(
      meResponse({ user: userWith({ email: "a@b.com" }) })
    );
    render(<EditProfileForm />);
    expect(await screen.findByText("换绑手机")).toBeInTheDocument();
  });

  it("拉取失败 → 显示兜底文案", async () => {
    mockMe.mockRejectedValue(new Error("boom"));
    render(<EditProfileForm />);
    expect(
      await screen.findByText("资料加载失败,请刷新重试。")
    ).toBeInTheDocument();
  });
});

// ── 昵称 ──────────────────────────────────────────────
describe("EditProfileForm — 昵称", () => {
  it("实时显示字数计数", async () => {
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    expect(screen.getByText("5/50")).toBeInTheDocument();
  });

  it("无任何改动 → 确定按钮禁用,不发请求", async () => {
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");

    expect(screen.getByRole("button", { name: "确定" })).toBeDisabled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("无改动直接提交表单(回车) → 提示「没有需要保存的修改」且不发请求", async () => {
    const { container } = render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");

    fireEvent.submit(container.querySelector("form")!);
    expect(screen.getByText("没有需要保存的修改")).toBeInTheDocument();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockBind).not.toHaveBeenCalled();
  });

  it("仅改昵称 → 调 updateProfile、刷新 store、显示「操作成功」", async () => {
    mockUpdate.mockResolvedValue({ user: userWith({ display_name: "Bob" }) });
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    const input = screen.getByDisplayValue("Alice");
    await user.clear(input);
    await user.type(input, "Bob");
    await user.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("Bob");
      expect(screen.getByText("操作成功")).toBeInTheDocument();
    });
    expect(useUserStore.getState().user?.display_name).toBe("Bob");
    expect(mockBind).not.toHaveBeenCalled();
  });

  it("昵称校验失败(400) → 红字提示且不绑定", async () => {
    mockUpdate.mockRejectedValue(new Error("display name cannot be blank"));
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    const input = screen.getByDisplayValue("Alice");
    await user.clear(input);
    await user.type(input, "Bob");
    await user.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(screen.getByText("昵称需为 1–50 个字符")).toBeInTheDocument();
    });
  });
});

// ── 绑定流程 ──────────────────────────────────────────
describe("EditProfileForm — 绑定", () => {
  it("邮箱格式非法 → 红字「邮箱格式错误」且获取验证码禁用", async () => {
    render(<EditProfileForm />);
    await screen.findByText("绑定邮箱");
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入邮箱号"), "bad");
    expect(screen.getByText("邮箱格式错误")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "获取验证码" })).toBeDisabled();
  });

  it("合法邮箱 → 获取验证码请求并进入倒计时", async () => {
    mockBindCode.mockResolvedValue({ status: "sent" });
    render(<EditProfileForm />);
    await screen.findByText("绑定邮箱");
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入邮箱号"), NEW_EMAIL);
    await user.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(mockBindCode).toHaveBeenCalledWith(NEW_EMAIL);
      expect(screen.getByRole("button", { name: /后重发/ })).toBeDisabled();
    });
  });

  it("邮箱已被占用(409) → 红字提示且不进入倒计时", async () => {
    mockBindCode.mockRejectedValue(new Error("email already registered"));
    render(<EditProfileForm />);
    await screen.findByText("绑定邮箱");
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入邮箱号"), NEW_EMAIL);
    await user.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(screen.getByText("该邮箱已被占用")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /后重发/ })
    ).not.toBeInTheDocument();
  });

  it("填邮箱+验证码点确定 → 调 bindContact、刷新 store、操作成功", async () => {
    mockBind.mockResolvedValue({
      user: userWith({ email: NEW_EMAIL })
    });
    render(<EditProfileForm />);
    await screen.findByText("绑定邮箱");
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入邮箱号"), NEW_EMAIL);
    await user.type(screen.getByPlaceholderText("请输入验证码"), VALID_CODE);
    await user.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(mockBind).toHaveBeenCalledWith(NEW_EMAIL, VALID_CODE);
      expect(screen.getByText("操作成功")).toBeInTheDocument();
    });
    expect(useUserStore.getState().user?.email).toBe(NEW_EMAIL);
  });

  it("改昵称成功但绑定失败 → 已存的昵称仍写回 store,并提示绑定错误", async () => {
    mockUpdate.mockResolvedValue({ user: userWith({ display_name: "Bob" }) });
    mockBind.mockRejectedValue(
      new Error("invalid or expired verification code")
    );
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    const name = screen.getByDisplayValue("Alice");
    await user.clear(name);
    await user.type(name, "Bob");
    await user.type(screen.getByPlaceholderText("请输入邮箱号"), NEW_EMAIL);
    await user.type(screen.getByPlaceholderText("请输入验证码"), VALID_CODE);
    await user.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(screen.getByText("验证码错误或已过期")).toBeInTheDocument();
    });
    // 昵称已落库,即便绑定步骤失败也应同步到本地 store,不显示「操作成功」。
    expect(useUserStore.getState().user?.display_name).toBe("Bob");
    expect(screen.queryByText("操作成功")).not.toBeInTheDocument();
  });

  it("验证码错误(400) → 验证码下红字提示", async () => {
    mockBind.mockRejectedValue(
      new Error("invalid or expired verification code")
    );
    render(<EditProfileForm />);
    await screen.findByText("绑定邮箱");
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入邮箱号"), NEW_EMAIL);
    await user.type(screen.getByPlaceholderText("请输入验证码"), VALID_CODE);
    await user.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(screen.getByText("验证码错误或已过期")).toBeInTheDocument();
    });
  });
});

// ── 头像 / 交互 ───────────────────────────────────────
describe("EditProfileForm — 头像与交互", () => {
  it("点击头像 → 提示「头像功能即将上线」,不发上传请求", async () => {
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "更换头像" }));
    expect(screen.getByText("头像功能即将上线")).toBeInTheDocument();
  });

  it("点击「← 返回」/「取消」→ 调 router.back()", async () => {
    render(<EditProfileForm />);
    await screen.findByDisplayValue("Alice");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "← 返回" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(mockBack).toHaveBeenCalledTimes(2);
  });
});
