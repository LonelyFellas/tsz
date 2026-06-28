import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeResponse } from "@tsz/api-client";
import type { User } from "@tsz/types";
import { ProfileHub } from "./ProfileHub";

const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: mockBack })
}));

vi.mock("@/lib/request", () => ({
  api: { auth: { me: vi.fn() } }
}));

import { api } from "@/lib/request";
const mockMe = vi.mocked(api.auth.me);

function userWith(overrides: Partial<User> = {}): User {
  return {
    id: "u-123",
    phone: "18266668888",
    display_name: "Along",
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
  mockMe.mockResolvedValue(meResponse());
});

describe("ProfileHub — 渲染", () => {
  it("展示昵称 / 联系方式 / ID / 等级口音徽标 / 编辑资料入口", async () => {
    render(<ProfileHub />);

    expect(await screen.findByText("Along")).toBeInTheDocument();
    expect(screen.getByText("18266668888")).toBeInTheDocument();
    expect(screen.getByText("ID:u-123")).toBeInTheDocument();
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("英式")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "编辑资料" })).toHaveAttribute(
      "href",
      "/account/profile"
    );
  });

  it("learning_settings 为 null → 不渲染徽标", async () => {
    mockMe.mockResolvedValue(meResponse({ learning_settings: null }));
    render(<ProfileHub />);
    await screen.findByText("Along");
    expect(screen.queryByText("A1")).not.toBeInTheDocument();
    expect(screen.queryByText("英式")).not.toBeInTheDocument();
  });

  it("已就绪入口跳对应路由", async () => {
    render(<ProfileHub />);
    await screen.findByText("Along");
    expect(screen.getByRole("link", { name: /我的天生币/ })).toHaveAttribute(
      "href",
      "/student/coins"
    );
    expect(screen.getByRole("link", { name: /我的词表/ })).toHaveAttribute(
      "href",
      "/wordlists"
    );
  });

  it("不重复暴露导航已有的入口(申请成为老师 / 邀请好友占位)", async () => {
    render(<ProfileHub />);
    await screen.findByText("Along");
    expect(screen.queryByText("申请成为老师")).not.toBeInTheDocument();
    expect(screen.queryByText("邀请好友")).not.toBeInTheDocument();
    expect(screen.queryByText("设置")).not.toBeInTheDocument();
  });

  it("拉取失败 → 兜底文案", async () => {
    mockMe.mockRejectedValue(new Error("boom"));
    render(<ProfileHub />);
    expect(
      await screen.findByText("资料加载失败,请刷新重试。")
    ).toBeInTheDocument();
  });
});

describe("ProfileHub — 交互", () => {
  it("点击复制 ID → 写剪贴板并提示已复制", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    // 在 userEvent.setup() 之后覆盖,避免其内置 clipboard stub 抢占。
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    render(<ProfileHub />);
    await screen.findByText("Along");

    await user.click(screen.getByRole("button", { name: "复制 ID" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("u-123");
      expect(screen.getByText("已复制")).toBeInTheDocument();
    });
  });

  it("复制失败 → 提示手动复制", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    render(<ProfileHub />);
    await screen.findByText("Along");

    await user.click(screen.getByRole("button", { name: "复制 ID" }));
    await waitFor(() => {
      expect(screen.getByText("复制失败")).toBeInTheDocument();
    });
  });

  it("点击返回 → router.back()", async () => {
    render(<ProfileHub />);
    await screen.findByText("Along");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "← 返回" }));
    expect(mockBack).toHaveBeenCalled();
  });
});
