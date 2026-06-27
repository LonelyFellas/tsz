import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@tsz/types";
import { HomeActions } from "./HomeActions";
import { useUserStore } from "@/stores/user";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush })
}));

vi.mock("@/lib/request", () => ({
  setAccessToken: vi.fn(),
  api: { auth: { logout: vi.fn().mockResolvedValue(undefined) } }
}));

import { api, setAccessToken } from "@/lib/request";

const USER: User = {
  id: "u1",
  phone: "13800138000",
  nickname: "Alice",
  roles: ["student"],
  coins: 0,
  createdAt: ""
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPush.mockReset();
  useUserStore.setState({ user: null, onboarded: null, hydrated: false });
});

describe("HomeActions", () => {
  it("会话恢复中 → 不显示登录/退出按钮", () => {
    render(<HomeActions />);
    expect(screen.queryByText("登录")).not.toBeInTheDocument();
    expect(screen.queryByText("退出登录")).not.toBeInTheDocument();
  });

  it("未登录 → 显示登录 + 浏览词表", () => {
    useUserStore.setState({ hydrated: true, user: null });
    render(<HomeActions />);
    expect(screen.getByText("登录")).toBeInTheDocument();
    expect(screen.getByText("浏览词表")).toBeInTheDocument();
  });

  it("已登录且已引导 → 进入学习指向 /wordlists + 显示退出", () => {
    useUserStore.setState({ hydrated: true, user: USER, onboarded: true });
    render(<HomeActions />);
    expect(screen.getByText("你好，Alice")).toBeInTheDocument();
    expect(screen.getByText("进入学习").closest("a")).toHaveAttribute(
      "href",
      "/wordlists"
    );
    expect(screen.getByText("退出登录")).toBeInTheDocument();
  });

  it("已登录但未引导 → 进入学习指向 /onboarding", () => {
    useUserStore.setState({ hydrated: true, user: USER, onboarded: false });
    render(<HomeActions />);
    expect(screen.getByText("进入学习").closest("a")).toHaveAttribute(
      "href",
      "/onboarding"
    );
  });

  it("点击退出登录 → 调后端登出、清 token、跳登录页", async () => {
    useUserStore.setState({ hydrated: true, user: USER, onboarded: true });
    const user = userEvent.setup();
    render(<HomeActions />);

    await user.click(screen.getByText("退出登录"));

    await waitFor(() => {
      expect(api.auth.logout).toHaveBeenCalled();
      expect(setAccessToken).toHaveBeenCalledWith(null);
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });
});
