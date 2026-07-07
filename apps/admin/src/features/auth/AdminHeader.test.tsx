import type { AdminProfile } from "@tsz/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate
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
  level: "admin",
  permissions: []
};

// 身份与账户操作收进头像 Popover：先点头像展开，内容才进 DOM。
async function openAccountMenu() {
  fireEvent.click(screen.getByRole("button", { name: "账户菜单" }));
  // 等 Popover 内容挂载。
  await screen.findByRole("button", { name: /退出登录/ });
}

// 登出走整页跳转 window.location.replace("/login")，jsdom 里桩掉以便断言。
let originalLocation: Location;
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ profile: null, level: null });
  originalLocation = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { replace: vi.fn() }
  });
});
afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation
  });
});

describe("AdminHeader", () => {
  it("头像菜单里展示 store 里的 display_name 与角色文案", async () => {
    useAuthStore.setState({ profile: PROFILE, level: PROFILE.level });
    render(<AdminHeader />);
    await openAccountMenu();
    expect(screen.getByText("审核员小王")).toBeInTheDocument();
    expect(screen.getByText("普通管理员")).toBeInTheDocument();
  });

  it("超级管理员展示超管角色文案", async () => {
    const superProfile: AdminProfile = { ...PROFILE, level: "super_admin" };
    useAuthStore.setState({ profile: superProfile, level: superProfile.level });
    render(<AdminHeader />);
    await openAccountMenu();
    expect(screen.getByText("超级管理员")).toBeInTheDocument();
  });

  it("无 profile 时回退到「管理员」", async () => {
    render(<AdminHeader />);
    await openAccountMenu();
    // 名称与角色文案双双回退到「管理员」。
    expect(screen.getAllByText("管理员")).toHaveLength(2);
  });

  it("点「修改密码」跳改密页（自助改密入口）", async () => {
    useAuthStore.setState({ profile: PROFILE, level: PROFILE.level });
    render(<AdminHeader />);
    await openAccountMenu();
    fireEvent.click(screen.getByRole("button", { name: /修改密码/ }));
    expect(mockNavigate).toHaveBeenCalledWith("/change-password");
  });

  it("点退出：吊销会话、清 token、清 profile、整页跳登录页", async () => {
    useAuthStore.setState({ profile: PROFILE, level: PROFILE.level });
    render(<AdminHeader />);
    await openAccountMenu();

    fireEvent.click(screen.getByRole("button", { name: /退出登录/ }));

    // 整页跳裸 /login（不带 redirect）：保证再次登录从首页进，且避开门禁抢注 redirect 的竞态。
    await waitFor(() =>
      expect(window.location.replace).toHaveBeenCalledWith("/login")
    );
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockSetToken).toHaveBeenCalledWith(null);
    expect(useAuthStore.getState().profile).toBeNull();
  });

  it("后端吊销失败也完成本地登出", async () => {
    mockLogout.mockRejectedValueOnce(new Error("network"));
    useAuthStore.setState({ profile: PROFILE, level: PROFILE.level });
    render(<AdminHeader />);
    await openAccountMenu();

    fireEvent.click(screen.getByRole("button", { name: /退出登录/ }));

    await waitFor(() =>
      expect(window.location.replace).toHaveBeenCalledWith("/login")
    );
    expect(mockSetToken).toHaveBeenCalledWith(null);
  });
});
