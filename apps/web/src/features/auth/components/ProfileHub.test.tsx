import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    active_role: "student",
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

  it("没有手机号时联系方式退到邮箱", async () => {
    mockMe.mockResolvedValue(
      meResponse({
        user: userWith({ phone: undefined, email: "along@example.com" })
      })
    );
    render(<ProfileHub />);

    expect(await screen.findByText("along@example.com")).toBeInTheDocument();
  });

  it("手机与邮箱都没有时不渲染联系方式，页面照常可用", async () => {
    mockMe.mockResolvedValue(
      meResponse({ user: userWith({ phone: undefined, email: undefined }) })
    );
    render(<ProfileHub />);

    expect(await screen.findByText("Along")).toBeInTheDocument();
    expect(screen.queryByText("18266668888")).not.toBeInTheDocument();
  });

  // ⚠️ 下面两条锁定的是「卸载后 settle 不炸」：成功路径不抛错，失败路径不会变成
  // 未处理拒绝(vitest 会把它判为失败)。源码里的 `if (alive)` 守卫本身在 React 18 下
  // 从外部不可观测(卸载后 setState 是 no-op 且不再告警)——删掉守卫这两条依旧全绿,
  // 别把它们当成守卫的回归防线。
  it("组件卸载后响应才到达：不抛错", async () => {
    let settle!: (value: MeResponse) => void;
    mockMe.mockReturnValue(
      new Promise<MeResponse>((resolve) => {
        settle = resolve;
      })
    );
    const { unmount } = render(<ProfileHub />);
    unmount();
    settle(meResponse());

    await waitFor(() => expect(mockMe).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Along")).not.toBeInTheDocument();
  });

  it("组件卸载后请求才失败：不留下未处理拒绝", async () => {
    let fail!: (reason: unknown) => void;
    mockMe.mockReturnValue(
      new Promise<MeResponse>((_, reject) => {
        fail = reject;
      })
    );
    const { unmount } = render(<ProfileHub />);
    unmount();
    fail(new Error("boom"));

    await waitFor(() => expect(mockMe).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText("资料加载失败,请刷新重试。")
    ).not.toBeInTheDocument();
  });

  it("有头像 → 渲染图片;加载失败 → 回退昵称首字母", async () => {
    mockMe.mockResolvedValue(
      meResponse({
        user: userWith({ avatar_url: "https://example.com/a.png" })
      })
    );
    render(<ProfileHub />);
    await screen.findByText("Along");

    const img = screen.getByRole("img", { name: "Along" });
    expect(img).toHaveAttribute("src", "https://example.com/a.png");

    fireEvent.error(img);
    expect(
      screen.queryByRole("img", { name: "Along" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
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
