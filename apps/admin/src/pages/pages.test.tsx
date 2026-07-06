import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { App as AntApp } from "antd";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { HomePage } from "./Home";
import { ReviewsPage } from "./Reviews";
import { UsersPage } from "./Users";
import { WordListsPage } from "./WordLists";
import { WordsPage } from "./Words";

// 智能词库页走真实数据层(React Query + api.words),烟雾测试只验渲染,
// 把请求端点 mock 成稳定响应,避免触网。
vi.mock("@/lib/auth", () => ({
  api: {
    words: {
      list: vi.fn().mockResolvedValue({
        words: [],
        page: { page: 1, page_size: 20, total: 0 }
      }),
      stats: vi.fn().mockResolvedValue({ total: 0, today: 0, month: 0 })
    },
    users: {
      list: vi.fn().mockResolvedValue({
        items: [],
        page: { page: 1, page_size: 20, total: 0 }
      })
    }
  },
  // 用户管理页据 level 决定写操作是否置灰；烟雾测试给个超管即可。
  useAuthStore: (
    selector: (s: { profile: { level: string } | null }) => unknown
  ) => selector({ profile: { level: "super_admin" } })
}));

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
    [ReviewsPage, "审核中心"]
  ] as const)("%o 渲染标题 %s", (Page, title) => {
    render(<Page />);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  });

  it("用户管理页渲染搜索行、角色 tab 与表格列", () => {
    // 已接真实数据层（React Query + api.users.list，此处返回空列表），需 antd App context 与路由。
    // 用文本查询而非 getByRole：表格每行含多个操作按钮，getByRole 会极慢。
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <AntApp>
            <UsersPage />
          </AntApp>
        </QueryClientProvider>
      </MemoryRouter>
    );
    // 搜索行与角色 tab。
    expect(screen.getByText("邮箱号码")).toBeInTheDocument();
    for (const tab of ["全部", "老师", "学生"]) {
      expect(screen.getByText(tab)).toBeInTheDocument();
    }
    // 表格关键列（等级/天生币余额后端暂不填充但列头仍在）。fixed 列表头在 antd 下会重复渲染，
    // 用 getAllByText 容纳多次出现。
    for (const col of ["用户ID", "等级", "天生币余额", "更新时间"]) {
      expect(screen.getAllByText(col).length).toBeGreaterThan(0);
    }
  });

  it("智能词库页渲染搜索、工具栏与表格", () => {
    // 依赖 antd App context（App.useApp）与路由（列表用 useNavigate 跳创建页）。
    // 用基于文本的查询而非 getByRole：表格有上百个按钮，getByRole 会逐个计算
    // 可访问名（jsdom 下大量 getComputedStyle）导致极慢。
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <AntApp>
            <WordsPage />
          </AntApp>
        </QueryClientProvider>
      </MemoryRouter>
    );
    expect(screen.getByText("创建单词")).toBeInTheDocument();
    expect(screen.getByText("创建短语")).toBeInTheDocument();
    // 面包屑末级为「智能词库」。
    expect(screen.getAllByText("智能词库").length).toBeGreaterThan(0);
  });
});
