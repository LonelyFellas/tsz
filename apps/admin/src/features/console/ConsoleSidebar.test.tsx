import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth";
import { ConsoleSidebar } from "./ConsoleSidebar";

// useNavigate 用 spy 替换以断言「点击已落地模块 → 跳转」；useLocation 等保留真实实现。
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function setLevel(level: "admin" | "super_admin" | null) {
  useAuthStore
    .getState()
    .setProfile(
      level
        ? { id: "a-1", phone: "13800138000", display_name: "管理员", level }
        : null
    );
}

beforeEach(() => mockNavigate.mockClear());
// 侧栏「管理员管理」入口按 level 渲染，且 store 为单例，用例间需复位避免串味。
afterEach(() => setLevel(null));

// 侧栏依赖 react-router 的 useLocation/useNavigate，用 MemoryRouter 提供路由上下文，
// initialEntries 控制当前路径。侧栏已改为 antd Menu，断言其菜单项与禁用态。
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleSidebar />
    </MemoryRouter>
  );
}

describe("ConsoleSidebar", () => {
  it("渲染 logo 与各分组标题", () => {
    renderAt("/");
    expect(screen.getByText("天生会背")).toBeInTheDocument();
    for (const group of [
      "用户管理",
      "班级管理",
      "词库管理",
      "词表管理",
      "任务管理",
      "审核管理",
      "天生币管理"
    ]) {
      // 部分分组标题与同名子项重名，可能出现多次。
      expect(screen.getAllByText(group).length).toBeGreaterThan(0);
    }
  });

  it("展开用户管理分组：点「用户管理」子项跳转 /users", () => {
    renderAt("/");
    // 分组收起时只有分组标题一个「用户管理」。点它展开分组。
    fireEvent.click(screen.getByText("用户管理"));
    // 展开后分组标题 + 子项同名，取最后一个（子项 leaf）点击。
    const items = screen.getAllByText("用户管理");
    fireEvent.click(items[items.length - 1]!);
    expect(mockNavigate).toHaveBeenCalledWith("/users");
  });

  it("普通 admin：用户管理分组下无「管理员管理」入口", () => {
    setLevel("admin");
    renderAt("/");
    fireEvent.click(screen.getByText("用户管理"));
    expect(screen.queryByText("管理员管理")).toBeNull();
  });

  it("super_admin：用户管理分组下显示「管理员管理」并跳转 /admins", () => {
    setLevel("super_admin");
    renderAt("/");
    fireEvent.click(screen.getByText("用户管理"));
    const entry = screen.getByText("管理员管理");
    expect(entry).toBeInTheDocument();
    fireEvent.click(entry);
    expect(mockNavigate).toHaveBeenCalledWith("/admins");
  });

  it("分类分组默认收起，展开后已落地模块可点", () => {
    renderAt("/words");
    // 分类默认收起：子项初始不在可访问树中。
    expect(screen.queryByRole("menuitem", { name: "智能词库" })).toBeNull();

    // 展开「词库管理」分组后，智能词库（已挂真实路由）可点。
    fireEvent.click(screen.getByText("词库管理"));
    expect(
      screen.getByRole("menuitem", { name: "智能词库" })
    ).toBeInTheDocument();
  });

  it("点击已落地模块跳转其路由并回调 onNavigate", () => {
    const onNavigate = vi.fn();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ConsoleSidebar onNavigate={onNavigate} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("词库管理"));
    fireEvent.click(screen.getByRole("menuitem", { name: "智能词库" }));
    expect(mockNavigate).toHaveBeenCalledWith("/words");
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("未传 onNavigate 时点击已落地模块仍安全跳转", () => {
    // onNavigate 缺省：进入跳转分支后 onNavigate?.() 应短路不抛错。
    renderAt("/");
    fireEvent.click(screen.getByText("词表管理"));
    fireEvent.click(screen.getByRole("menuitem", { name: "智能词表" }));
    expect(mockNavigate).toHaveBeenCalledWith("/wordlists");
  });

  it("收起态隐藏站名、仅保留图标", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ConsoleSidebar collapsed />
      </MemoryRouter>
    );
    expect(screen.queryByText("天生会背")).toBeNull();
  });
});
