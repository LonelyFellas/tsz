import { useEffect } from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, matchRoutes } from "react-router-dom";
import type { AdminProfile } from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth";
import { ADMIN_PAGE_ROUTES } from "@/lib/adminPageRoutes";
import {
  BusinessPermissionGuard,
  canVisitAdminRoute
} from "./BusinessPermissionGuard";

const profile: AdminProfile = {
  id: "a",
  role: "admin",
  phone: "13800138000",
  display_name: "管理员",
  preferences: { dialect: "uk" },
  permission_version: 1,
  catalog_version: "v1",
  permissions: []
};
beforeEach(() => useAuthStore.getState().setProfile(profile));
describe("菜单之外的直链门禁", () => {
  it.each([
    "/permissions/",
    "/Permissions",
    "/Users",
    "/admins/",
    "/settings/Parts-Of-Speech/",
    "/Words/New/"
  ])(
    "与React Router匹配一致：无权访问 %s 不挂载子树、不发Query",
    (pathname) => {
      const routes = Object.values(ADMIN_PAGE_ROUTES);
      expect(matchRoutes(routes, pathname)).not.toBeNull();
      const query = vi.fn();
      function Content() {
        useEffect(() => {
          query();
        }, []);
        return <div>业务内容</div>;
      }
      render(
        <MemoryRouter initialEntries={[`${pathname}?q=sensitive`]}>
          <Routes>
            {routes.map((route) => (
              <Route
                key={route.path}
                {...route}
                element={
                  <BusinessPermissionGuard>
                    <Content />
                  </BusinessPermissionGuard>
                }
              />
            ))}
          </Routes>
        </MemoryRouter>
      );
      expect(screen.getByText("没有访问权限")).toBeInTheDocument();
      expect(query).not.toHaveBeenCalled();
    }
  );
  it.each([
    "/words",
    "/words/trash",
    "/words/w/v3/wizard/forms",
    "/words/new",
    "/sentences",
    "/users",
    "/teacher-applications",
    "/settings/parts-of-speech",
    "/admins",
    "/permissions"
  ])("零权限不能直接访问 %s，不挂载请求组件", (pathname) => {
    const query = vi.fn();
    function BusinessContent() {
      query();
      return <div>业务内容</div>;
    }
    render(
      <MemoryRouter initialEntries={[pathname]}>
        <BusinessPermissionGuard>
          <BusinessContent />
        </BusinessPermissionGuard>
      </MemoryRouter>
    );
    expect(screen.getByText("没有访问权限")).toBeInTheDocument();
    expect(query).not.toHaveBeenCalled();
  });
  it("有查看权不等于创建或配置页；超管只放行已实现页面，普通授权可访问各页", () => {
    const reader = { ...profile, permissions: ["words.access"] };
    expect(canVisitAdminRoute(reader, "/words/w/v3/wizard/preview")).toBe(true);
    expect(canVisitAdminRoute(reader, "/words/new")).toBe(false);
    expect(canVisitAdminRoute(reader, "/settings/parts-of-speech")).toBe(false);
    expect(
      canVisitAdminRoute(
        { ...reader, permissions: ["words.access", "words.create"] },
        "/words/new"
      )
    ).toBe(true);
    expect(
      canVisitAdminRoute(
        { ...profile, permissions: ["lexicon_settings.access"] },
        "/settings/parts-of-speech"
      )
    ).toBe(true);
    expect(
      canVisitAdminRoute(
        { ...profile, permissions: ["teacherapply.access"] },
        "/teacher-applications"
      )
    ).toBe(true);
    expect(
      canVisitAdminRoute({ ...profile, role: "super_admin" }, "/permissions")
    ).toBe(true);
    expect(
      canVisitAdminRoute({ ...profile, permissions: ["*"] }, "/users")
    ).toBe(false);
    expect(canVisitAdminRoute(profile, "/")).toBe(true);
    expect(canVisitAdminRoute(profile, "/settings/profile")).toBe(true);
  });
  it("撤掉page access立即卸载业务组件，不保留原件或编辑态", () => {
    useAuthStore
      .getState()
      .setProfile({ ...profile, permissions: ["teacherapply.access"] });
    const dispose = vi.fn();
    function Content() {
      useEffect(() => dispose, []);
      return <div>敏感原件</div>;
    }
    render(
      <MemoryRouter initialEntries={["/teacher-applications"]}>
        <BusinessPermissionGuard>
          <Content />
        </BusinessPermissionGuard>
      </MemoryRouter>
    );
    expect(screen.getByText("敏感原件")).toBeInTheDocument();
    act(() =>
      useAuthStore.getState().setProfile({ ...profile, permission_version: 2 })
    );
    expect(screen.queryByText("敏感原件")).toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
    expect(screen.getByText("没有访问权限")).toBeInTheDocument();
  });
});
