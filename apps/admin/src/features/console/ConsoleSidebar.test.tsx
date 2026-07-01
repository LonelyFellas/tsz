import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConsoleSidebar } from "./ConsoleSidebar";

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
      // 班级管理 / 任务管理 既是分组标题又是同名子项，可能出现多次。
      expect(screen.getAllByText(group).length).toBeGreaterThan(0);
    }
  });

  it("分类分组默认收起，展开后已落地模块可点、未落地模块禁用", () => {
    renderAt("/words");
    // 分类默认收起：子项初始不在可访问树中。
    expect(screen.queryByRole("menuitem", { name: "智能词库" })).toBeNull();

    // 展开「词库管理」分组后，智能词库（已挂真实路由）可点。
    fireEvent.click(screen.getByText("词库管理"));
    expect(
      screen.getByRole("menuitem", { name: "智能词库" })
    ).toBeInTheDocument();

    // 展开「用户管理」分组后，教师管理（尚未落地）为禁用态。
    fireEvent.click(screen.getByText("用户管理"));
    expect(screen.getByRole("menuitem", { name: "教师管理" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });
});
