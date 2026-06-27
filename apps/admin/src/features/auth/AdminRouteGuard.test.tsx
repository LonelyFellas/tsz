import type { Role } from "@tsz/types";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReplace = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => "/users"
}));

// 提供真实 store（驱动各门禁态）+ 受控 api/tokens。
vi.mock("@/lib/auth", async () => {
  const { createAuthStore } = await import("@tsz/shared/auth");
  return {
    useAuthStore: createAuthStore(),
    api: { auth: { logout: vi.fn().mockResolvedValue(undefined) } },
    tokens: { setAccessToken: vi.fn() }
  };
});

import { AdminRouteGuard } from "./AdminRouteGuard";
import { useAuthStore } from "@/lib/auth";

const ADMIN = {
  id: "a1",
  nickname: "Admin",
  roles: ["admin"] as Role[],
  coins: 0,
  createdAt: ""
};
const NON_ADMIN = { ...ADMIN, roles: ["teacher"] as Role[] };

function setState(s: Partial<ReturnType<typeof useAuthStore.getState>>) {
  useAuthStore.setState(s);
}

beforeEach(() => {
  vi.clearAllMocks();
  setState({ user: null, activeRole: null, hydrated: false });
});

describe("AdminRouteGuard", () => {
  it("会话恢复未完成时显示加载态", () => {
    setState({ hydrated: false });
    render(
      <AdminRouteGuard>
        <div>后台内容</div>
      </AdminRouteGuard>
    );
    expect(screen.getByText("加载中...")).toBeInTheDocument();
    expect(screen.queryByText("后台内容")).not.toBeInTheDocument();
  });

  it("已恢复但未登录：跳登录页并带 redirect", () => {
    setState({ hydrated: true, user: null });
    render(
      <AdminRouteGuard>
        <div>后台内容</div>
      </AdminRouteGuard>
    );
    expect(mockReplace).toHaveBeenCalledWith("/login?redirect=%2Fusers");
    expect(screen.queryByText("后台内容")).not.toBeInTheDocument();
  });

  it("已登录但激活角色非 admin：显示无权页，不跳转", () => {
    setState({ hydrated: true, user: NON_ADMIN, activeRole: "teacher" });
    render(
      <AdminRouteGuard>
        <div>后台内容</div>
      </AdminRouteGuard>
    );
    expect(screen.getByText("无权访问")).toBeInTheDocument();
    expect(screen.queryByText("后台内容")).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("激活角色为 admin：渲染受保护内容", () => {
    setState({ hydrated: true, user: ADMIN, activeRole: "admin" });
    render(
      <AdminRouteGuard>
        <div>后台内容</div>
      </AdminRouteGuard>
    );
    expect(screen.getByText("后台内容")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
