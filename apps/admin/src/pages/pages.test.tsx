import { render, screen } from "@testing-library/react";
import { App as AntApp } from "antd";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { HomePage } from "./Home";
import { ReviewsPage } from "./Reviews";
import { UsersPage } from "./Users";
import { WordListsPage } from "./WordLists";
import { WordsPage } from "./Words";

// 平台后台各模块页。烟雾测试保证：页面能正常渲染、关键内容正确，
// 守住「导入错误 / 渲染时抛错」这类回归；待其余模块功能落地后在此补充业务测试。
describe("admin 页面烟雾测试", () => {
  it("首页渲染数据看板与四张统计卡", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: "首页数据" })
    ).toBeInTheDocument();
    for (const title of ["用户数据", "任务数据", "智能词库", "天生币"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    // 天生币卡的操作位。
    expect(screen.getByRole("button", { name: "发放" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "扣除" })).toBeInTheDocument();
  });

  it.each([
    [WordListsPage, "词表管理"],
    [UsersPage, "用户管理"],
    [ReviewsPage, "审核中心"]
  ] as const)("%o 渲染标题 %s", (Page, title) => {
    render(<Page />);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  });

  it("智能词库页渲染搜索、工具栏与表格", () => {
    // 依赖 antd App context（App.useApp）与路由（列表用 useNavigate 跳创建页）。
    // 用基于文本的查询而非 getByRole：表格有上百个按钮，getByRole 会逐个计算
    // 可访问名（jsdom 下大量 getComputedStyle）导致极慢。
    render(
      <MemoryRouter>
        <AntApp>
          <WordsPage />
        </AntApp>
      </MemoryRouter>
    );
    expect(screen.getByText("创建单词")).toBeInTheDocument();
    expect(screen.getByText("创建短语")).toBeInTheDocument();
    // 面包屑末级为「智能词库」。
    expect(screen.getAllByText("智能词库").length).toBeGreaterThan(0);
  });
});
