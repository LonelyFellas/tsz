import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// usePathname 用可变值，便于切换路由验证高亮分支。
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname
}));

import { ConsoleSidebar } from "./ConsoleSidebar";

afterEach(() => {
  pathname = "/";
});

describe("ConsoleSidebar", () => {
  it("渲染 logo 与各分组标题", () => {
    render(<ConsoleSidebar />);
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
      // 班级管理 / 任务管理 既是分组标题又是同名子项，可能出现多次。
      expect(screen.getAllByText(group).length).toBeGreaterThan(0);
    }
  });

  it("在首页时把「首页」标记为可跳转并高亮当前路由", () => {
    render(<ConsoleSidebar />);
    const home = screen.getByRole("link", { name: "首页" });
    expect(home).toHaveAttribute("href", "/");
    expect(home.className).toContain("text-blue-600");
  });

  it("不在首页时首页链接不高亮", () => {
    pathname = "/somewhere";
    render(<ConsoleSidebar />);
    const home = screen.getByRole("link", { name: "首页" });
    expect(home.className).not.toContain("text-blue-600");
  });

  it("未实现模块渲染为禁用态条目（非链接）", () => {
    render(<ConsoleSidebar />);
    // 教师管理无 href，应不是链接。
    expect(
      screen.queryByRole("link", { name: "教师管理" })
    ).not.toBeInTheDocument();
    const teacher = screen.getByText("教师管理");
    expect(teacher.className).toContain("cursor-not-allowed");
  });
});
