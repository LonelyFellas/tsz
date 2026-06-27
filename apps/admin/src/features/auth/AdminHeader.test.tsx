import type { AdminProfile } from "@tsz/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush })
}));

vi.mock("@/lib/auth", async () => {
  const { createAdminAuthStore } = await import("@tsz/shared/auth");
  return {
    useAuthStore: createAdminAuthStore(),
    api: { auth: { logout: vi.fn().mockResolvedValue(undefined) } },
    tokens: { setAccessToken: vi.fn() }
  };
});

import { AdminHeader } from "./AdminHeader";
import { api, tokens, useAuthStore } from "@/lib/auth";

const mockLogout = vi.mocked(api.auth.logout);
const mockSetToken = vi.mocked(tokens.setAccessToken);

const PROFILE: AdminProfile = {
  id: "a1",
  phone: "13800138000",
  display_name: "审核员小王",
  level: "admin"
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ profile: null, level: null });
});

describe("AdminHeader", () => {
  it("展示 store 里的 display_name", () => {
    useAuthStore.setState({ profile: PROFILE, level: PROFILE.level });
    render(<AdminHeader />);
    expect(screen.getByText("审核员小王")).toBeInTheDocument();
  });

  it("无 profile 时回退到「管理员」", () => {
    render(<AdminHeader />);
    expect(screen.getByText("管理员")).toBeInTheDocument();
  });

  it("点退出：吊销会话、清 token、清 profile、回登录页", async () => {
    useAuthStore.setState({ profile: PROFILE, level: PROFILE.level });
    render(<AdminHeader />);

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/login"));
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockSetToken).toHaveBeenCalledWith(null);
    expect(useAuthStore.getState().profile).toBeNull();
  });

  it("后端吊销失败也完成本地登出", async () => {
    mockLogout.mockRejectedValueOnce(new Error("network"));
    useAuthStore.setState({ profile: PROFILE, level: PROFILE.level });
    render(<AdminHeader />);

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/login"));
    expect(mockSetToken).toHaveBeenCalledWith(null);
  });
});
