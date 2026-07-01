import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConsoleSidebar } from "./ConsoleSidebar";

// 侧栏依赖 react-router 的 Link + useLocation，用 MemoryRouter 提供路由上下文，
// initialEntries 控制当前路径以验证高亮分支。
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
      // 班级管理 / 任务管理 既是分组标题又是同名子项，可能出现多次。
      expect(screen.getAllByText(group).length).toBeGreaterThan(0);
    }
  });

  it("在首页时把「首页」标记为可跳转并高亮当前路由", () => {
    renderAt("/");
    const home = screen.getByRole("link", { name: "首页" });
    expect(home).toHaveAttribute("href", "/");
    expect(home.className).toContain("text-primary");
  });

  it("不在首页时首页链接不高亮", () => {
    renderAt("/somewhere");
    const home = screen.getByRole("link", { name: "首页" });
    expect(home.className).not.toContain("text-primary");
  });

  it("未实现模块渲染为禁用态条目（非链接）", () => {
    renderAt("/");
    // 教师管理无 href，应不是链接。
    expect(
      screen.queryByRole("link", { name: "教师管理" })
    ).not.toBeInTheDocument();
    const teacher = screen.getByText("教师管理");
    expect(teacher.className).toContain("cursor-not-allowed");
  });
});
