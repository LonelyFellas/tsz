import type { AdminProfile } from "@tsz/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();

// 可变 location：便于验证回跳保留 query/hash。
let mockLocation = { pathname: "/users", search: "", hash: "" };

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation
}));

// 提供真实 admin store（驱动各门禁态）。
vi.mock("@/lib/auth", async () => {
  const { createAdminAuthStore } = await import("@tsz/shared/auth");
  return { useAuthStore: createAdminAuthStore() };
});

import { AdminRouteGuard } from "./AdminRouteGuard";
import { useAuthStore } from "@/lib/auth";

const PROFILE: AdminProfile = {
  id: "a1",
  phone: "13800138000",
  display_name: "Admin",
  level: "super_admin"
};

function setState(s: Partial<ReturnType<typeof useAuthStore.getState>>) {
  useAuthStore.setState(s);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLocation = { pathname: "/users", search: "", hash: "" };
  setState({ profile: null, level: null, hydrated: false });
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
    setState({ hydrated: true, profile: null });
    render(
      <AdminRouteGuard>
        <div>后台内容</div>
      </AdminRouteGuard>
    );
    expect(mockNavigate).toHaveBeenCalledWith("/login?redirect=%2Fusers", {
      replace: true
    });
    expect(screen.queryByText("后台内容")).not.toBeInTheDocument();
  });

  it("回跳保留 query 与 hash", () => {
    mockLocation = {
      pathname: "/users",
      search: "?tab=teachers&page=3",
      hash: "#top"
    };
    setState({ hydrated: true, profile: null });
    render(
      <AdminRouteGuard>
        <div>后台内容</div>
      </AdminRouteGuard>
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      "/login?redirect=%2Fusers%3Ftab%3Dteachers%26page%3D3%23top",
      { replace: true }
    );
  });

  it("已登录的 admin：渲染受保护内容", () => {
    setState({ hydrated: true, profile: PROFILE, level: PROFILE.level });
    render(
      <AdminRouteGuard>
        <div>后台内容</div>
      </AdminRouteGuard>
    );
    expect(screen.getByText("后台内容")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
