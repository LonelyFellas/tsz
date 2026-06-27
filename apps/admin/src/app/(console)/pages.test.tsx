import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AdminHome from "./page";
import WordsPage from "./words/page";
import WordListsPage from "./wordlists/page";
import UsersPage from "./users/page";
import ReviewsPage from "./reviews/page";

// 平台后台目前为各模块占位页。烟雾测试保证：页面能正常渲染、标题正确，
// 守住「导入错误 / 渲染时抛错」这类回归；待模块功能落地后在此补充业务测试。
describe("admin 占位页烟雾测试", () => {
  it("首页渲染数据看板与四张统计卡", () => {
    render(<AdminHome />);
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
    [WordsPage, "词库管理"],
    [WordListsPage, "词表管理"],
    [UsersPage, "用户管理"],
    [ReviewsPage, "审核中心"]
  ] as const)("%o 渲染标题 %s", (Page, title) => {
    render(<Page />);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  });
});
