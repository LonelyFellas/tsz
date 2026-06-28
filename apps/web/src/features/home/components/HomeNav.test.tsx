import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@tsz/types";
import { HomeNav } from "./HomeNav";
import { useUserStore } from "@/stores/user";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock("@/lib/request", () => ({
  setAccessToken: vi.fn(),
  api: { auth: { logout: vi.fn() } }
}));

const USER: User = {
  id: "u1",
  phone: "13800138000",
  nickname: "Alice",
  roles: ["student"],
  coins: 0,
  createdAt: ""
};

beforeEach(() => {
  useUserStore.setState({ user: null, onboarded: null, hydrated: false });
});

describe("HomeNav", () => {
  it("会话恢复中 → 不渲染登录链接,也不渲染账户菜单", () => {
    render(<HomeNav />);
    expect(screen.queryByText("登录")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "账户菜单" })
    ).not.toBeInTheDocument();
  });

  it("未登录 → 显示登录链接,指向 /login", () => {
    useUserStore.setState({ hydrated: true, user: null });
    render(<HomeNav />);
    expect(screen.getByText("登录").closest("a")).toHaveAttribute(
      "href",
      "/login"
    );
  });

  it("已登录 → 显示账户菜单头像,不再平铺登录", () => {
    useUserStore.setState({ hydrated: true, user: USER });
    render(<HomeNav />);
    expect(
      screen.getByRole("button", { name: "账户菜单" })
    ).toBeInTheDocument();
    expect(screen.queryByText("登录")).not.toBeInTheDocument();
  });
});
