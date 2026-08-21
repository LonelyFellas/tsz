import type { AdminProfile } from "@tsz/api-client";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate
}));

vi.mock("@/lib/auth", async () => {
  const { createAdminAuthStore } = await import("@tsz/shared/auth");
  return {
    useAuthStore: createAdminAuthStore(),
    api: {
      auth: {
        logout: vi.fn().mockResolvedValue(undefined),
        logoutAll: vi.fn().mockResolvedValue(undefined)
      }
    },
    tokens: { setAccessToken: vi.fn() }
  };
});

import { AdminHeader } from "./AdminHeader";
import { api, tokens, useAuthStore } from "@/lib/auth";

const mockLogout = vi.mocked(api.auth.logout);
const mockLogoutAll = vi.mocked(api.auth.logoutAll);
const mockSetToken = vi.mocked(tokens.setAccessToken);

const PROFILE: AdminProfile = {
  id: "a1",
  phone: "13800138000",
  display_name: "审核员小王",
  role: "admin",
  permissions: [],
  preferences: { dialect: "uk" as const }
};

// 「退出所有设备」用 modal.confirm，须挂在 AntApp 的 context 下才有 modal 实例。
function renderHeader() {
  return render(
    <AntApp>
      <AdminHeader />
    </AntApp>
  );
}

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
  useAuthStore.setState({ profile: null, role: null });
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
    useAuthStore.setState({ profile: PROFILE, role: PROFILE.role });
    renderHeader();
    await openAccountMenu();
    expect(screen.getByText("审核员小王")).toBeInTheDocument();
    expect(screen.getByText("普通管理员")).toBeInTheDocument();
  });

  it("超级管理员展示超管角色文案", async () => {
    const superProfile: AdminProfile = { ...PROFILE, role: "super_admin" };
    useAuthStore.setState({ profile: superProfile, role: superProfile.role });
    renderHeader();
    await openAccountMenu();
    expect(screen.getByText("超级管理员")).toBeInTheDocument();
  });

  it("未映射的 level（后端将来新增等级）角色行回退「管理员」而非空白", async () => {
    const unknownProfile = {
      ...PROFILE,
      role: "moderator" as AdminProfile["role"]
    };
    useAuthStore.setState({
      profile: unknownProfile,
      role: unknownProfile.role
    });
    renderHeader();
    await openAccountMenu();
    // 名称仍来自 display_name，角色行兜底为「管理员」。
    expect(screen.getByText("审核员小王")).toBeInTheDocument();
    expect(screen.getByText("管理员")).toBeInTheDocument();
  });

  it("无 profile 时回退到「管理员」", async () => {
    renderHeader();
    await openAccountMenu();
    // 名称与角色文案双双回退到「管理员」。
    expect(screen.getAllByText("管理员")).toHaveLength(2);
  });

  it("点「个人设置」跳个人设置页（方言偏好等账号级设置的唯一入口）", async () => {
    useAuthStore.setState({ profile: PROFILE, role: PROFILE.role });
    renderHeader();
    await openAccountMenu();
    fireEvent.click(screen.getByRole("button", { name: /个人设置/ }));
    expect(mockNavigate).toHaveBeenCalledWith("/settings/profile");
  });

  it("点「修改密码」跳改密页（自助改密入口）", async () => {
    useAuthStore.setState({ profile: PROFILE, role: PROFILE.role });
    renderHeader();
    await openAccountMenu();
    fireEvent.click(screen.getByRole("button", { name: /修改密码/ }));
    expect(mockNavigate).toHaveBeenCalledWith("/change-password");
  });

  it("点退出：吊销会话、清 token、清 profile、整页跳登录页", async () => {
    useAuthStore.setState({ profile: PROFILE, role: PROFILE.role });
    renderHeader();
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
    useAuthStore.setState({ profile: PROFILE, role: PROFILE.role });
    renderHeader();
    await openAccountMenu();

    fireEvent.click(screen.getByRole("button", { name: /退出登录/ }));

    await waitFor(() =>
      expect(window.location.replace).toHaveBeenCalledWith("/login")
    );
    expect(mockSetToken).toHaveBeenCalledWith(null);
  });
});

describe("AdminHeader — 退出所有设备", () => {
  /** 展开账户菜单并点「退出所有设备」，返回后等确认弹窗上屏。 */
  async function openLogoutAllConfirm() {
    useAuthStore.setState({ profile: PROFILE, role: PROFILE.role });
    renderHeader();
    await openAccountMenu();
    fireEvent.click(screen.getByRole("button", { name: /退出所有设备/ }));
    // 文案要说清当前这台也会被踢下线。
    await screen.findByText(/包括当前这台/);
  }

  function clickConfirmOk() {
    const btns = document.querySelector(".ant-modal-confirm-btns")!;
    fireEvent.click(within(btns as HTMLElement).getByText(/全部退出/));
  }

  it("确认后吊销全部会话、清 token、清 profile、整页跳登录页", async () => {
    await openLogoutAllConfirm();
    clickConfirmOk();

    await waitFor(() =>
      expect(window.location.replace).toHaveBeenCalledWith("/login")
    );
    expect(mockLogoutAll).toHaveBeenCalledTimes(1);
    // 全部退出走独立端点，不应顺带调用单会话 logout。
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockSetToken).toHaveBeenCalledWith(null);
    expect(useAuthStore.getState().profile).toBeNull();
  });

  it("取消确认：不发请求也不登出", async () => {
    await openLogoutAllConfirm();
    const btns = document.querySelector(".ant-modal-confirm-btns")!;
    fireEvent.click(within(btns as HTMLElement).getByText(/取\s?消/));

    // 取消是同步的；给一个 tick 让潜在的异步动作有机会发生后再断言什么都没做。
    // （antd confirm 关闭后节点仍留在 jsdom 里，故不据 DOM 判定关闭。）
    await waitFor(() => expect(mockLogoutAll).not.toHaveBeenCalled());
    expect(window.location.replace).not.toHaveBeenCalled();
    expect(useAuthStore.getState().profile).not.toBeNull();
  });

  it("后端吊销失败也完成本地登出", async () => {
    mockLogoutAll.mockRejectedValueOnce(new Error("network"));
    await openLogoutAllConfirm();
    clickConfirmOk();

    await waitFor(() =>
      expect(window.location.replace).toHaveBeenCalledWith("/login")
    );
    expect(mockSetToken).toHaveBeenCalledWith(null);
  });
});
