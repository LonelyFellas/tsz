import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@tsz/types";
import { GuestGuard } from "./GuestGuard";
import { useUserStore } from "@/stores/user";

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace })
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
  mockReplace.mockReset();
  useUserStore.setState({ user: null, onboarded: null, hydrated: false });
});

describe("GuestGuard", () => {
  it("未登录 → 渲染登录/注册内容", () => {
    useUserStore.setState({ hydrated: true, user: null });
    render(
      <GuestGuard>
        <p>登录表单</p>
      </GuestGuard>
    );
    expect(screen.getByText("登录表单")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("恢复中也先渲染表单（避免闪烁）", () => {
    useUserStore.setState({ hydrated: false, user: null });
    render(
      <GuestGuard>
        <p>登录表单</p>
      </GuestGuard>
    );
    expect(screen.getByText("登录表单")).toBeInTheDocument();
  });

  it("已登录且已完成引导 → 跳首页", async () => {
    useUserStore.setState({ hydrated: true, user: USER, onboarded: true });
    render(
      <GuestGuard>
        <p>登录表单</p>
      </GuestGuard>
    );
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
    expect(screen.queryByText("登录表单")).not.toBeInTheDocument();
  });

  it("已登录但未完成引导 → 跳 /onboarding", async () => {
    useUserStore.setState({ hydrated: true, user: USER, onboarded: false });
    render(
      <GuestGuard>
        <p>登录表单</p>
      </GuestGuard>
    );
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/onboarding");
    });
  });
});
