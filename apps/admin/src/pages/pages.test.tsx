import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { App as AntApp } from "antd";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { HomePage } from "./Home";
import { ProfileSettingsPage } from "./ProfileSettings";
import { ReviewsPage } from "./Reviews";
import { UsersPage } from "./Users";
import { WordCreatePage } from "./WordCreate";
import { WordsPage } from "./Words";
import { api, usePermission } from "@/lib/auth";

const smokeProfile = vi.hoisted(() => ({
  id: "smoke-admin",
  phone: "13800138000",
  display_name: "测试超管",
  role: "super_admin" as const,
  permission_version: 1,
  catalog_version: "v1",
  permissions: ["words.access"],
  preferences: { dialect: "uk" as const }
}));

const dashboardOverview = vi.hoisted(() => ({
  generated_at: "2026-10-24T00:00:00Z",
  users: { total: 12335, today: 234, last_3_days: 25, last_7_days: 10 },
  tasks: { total: 231, completed: 78, today: 3, week: 25 },
  lexicon: { total: 233, today: 23, week: 55, month: 100 },
  coins: {
    circulation: "2313",
    today_net: "23",
    week_net: "-55",
    month_net: "100"
  },
  user_growth: [{ date: "2026-10-23", value: 10 }],
  coin_flow: [{ date: "2026-10-23", grant: "10", deduct: "2" }],
  learning_progress: { completed: 34, in_progress: 41, not_started: 25 },
  lexicon_creation: [{ week_start: "2026-10-19", value: 12 }]
}));

vi.mock("@/lib/env", () => ({
  env: {
    API_BASE_URL: "/api/v1",
    ADMIN_WORDS_MOCK: false
  }
}));

vi.mock("@/features/dictionary/word-creation/UnifiedCreateEntryStep", () => ({
  UnifiedCreateEntryStep: () => <div>unified-create-entry</div>
}));

// 智能词库页走真实数据层(React Query + api.words),烟雾测试只验渲染,
// 把请求端点 mock 成稳定响应,避免触网。
vi.mock("@/lib/auth", () => ({
  api: {
    aiLedger: {
      costOverview: vi.fn().mockResolvedValue({
        generated_at: "2026-10-28T04:00:00Z",
        timezone: "Asia/Shanghai",
        currency: "CNY",
        pricing_version: "fixture",
        pricing_valid_until: "2027-01-01",
        ...Object.fromEntries(
          ["total", "today", "week", "month"].map((key) => [
            key,
            {
              start: null,
              end: "2026-10-28T04:00:00Z",
              estimated_cost_cny: "0",
              total_calls: 0,
              priced_calls: 0,
              unknown_calls: 0
            }
          ])
        )
      })
    },
    dashboard: {
      overview: vi.fn().mockResolvedValue(dashboardOverview)
    },
    words: {
      list: vi.fn().mockResolvedValue({
        words: [],
        page: { page: 1, page_size: 20, total: 0 }
      }),
      stats: vi.fn().mockResolvedValue({ total: 0, today: 0, month: 0 })
    },
    wordlists: {
      management: vi.fn().mockResolvedValue({
        items: [],
        pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 }
      })
    },
    users: {
      list: vi.fn().mockResolvedValue({
        items: [],
        page: { page: 1, page_size: 20, total: 0 }
      })
    }
  },
  // 既要能当 hook 调（个人设置页取 profile.id），也要保留 getState/subscribe 静态用法。
  useAuthStore: Object.assign(
    (selector: (state: { profile: typeof smokeProfile }) => unknown) =>
      selector({ profile: smokeProfile }),
    {
      getState: () => ({ profile: smokeProfile }),
      subscribe: vi.fn(() => vi.fn())
    }
  ),
  // 用户管理页据 useIsSuperAdmin 决定写操作是否置灰；烟雾测试给个超管即可。
  usePermission: vi.fn(() => true),
  useIsSuperAdmin: () => true
}));

// 平台后台各模块页。烟雾测试保证：页面能正常渲染、关键内容正确，
// 守住「导入错误 / 渲染时抛错」这类回归；待其余模块功能落地后在此补充业务测试。
function renderHome() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("admin 页面烟雾测试", () => {
  it("审核空队列按已提交条件展示空状态，重置后恢复待审核条件并清空输入", async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ReviewsPage />
      </QueryClientProvider>
    );
    expect(await screen.findByText("暂无待审核词表")).toBeInTheDocument();
    const search = screen.getByLabelText("搜索词表");
    fireEvent.change(search, { target: { value: "missing-list" } });
    expect(screen.getByText("暂无待审核词表")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /搜\s*索/ }));
    expect(await screen.findByText("未找到符合条件的数据")).toBeInTheDocument();
    expect(api.wordlists.management).toHaveBeenLastCalledWith(
      expect.objectContaining({
        q: "missing-list",
        review_state: "pending",
        page: 1
      }),
      expect.anything()
    );
    fireEvent.click(screen.getByText("重置筛选"));
    expect(await screen.findByText("暂无待审核词表")).toBeInTheDocument();
    expect(screen.getByLabelText("搜索词表")).toHaveValue("");
    expect(api.wordlists.management).toHaveBeenLastCalledWith(
      expect.objectContaining({ review_state: "pending", page: 1 }),
      expect.anything()
    );
    expect(screen.queryByText("共 0 条")).not.toBeInTheDocument();
  });
  it("首页渲染 KPI 指标行与四张图表卡", async () => {
    renderHome();
    expect(
      screen.getByRole("heading", { name: "首页数据" })
    ).toBeInTheDocument();
    // 顶部 KPI 四格（等真实聚合数据返回后渲染）。
    for (const label of ["累计用户", "任务总量", "词库累计", "天生币流通"]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
    // 下方四张图表卡的标题。
    for (const title of [
      "用户增长趋势",
      "天生币收支",
      "学习进度分布",
      "词库创建趋势"
    ]) {
      expect(
        await screen.findByRole("heading", { name: title })
      ).toBeInTheDocument();
    }
    // 天生币收支卡不再保留无行为的「发放 / 扣除」，改为跳转流水。
    expect(screen.getByRole("link", { name: "查看流水" })).toHaveAttribute(
      "href",
      "/coins"
    );
    expect(
      screen.queryByRole("button", { name: "发放" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "扣除" })
    ).not.toBeInTheDocument();
    expect(api.dashboard.overview).toHaveBeenCalledTimes(1);
  });

  it("没有天生币查询权限时不渲染查看流水入口", async () => {
    vi.mocked(usePermission).mockReturnValueOnce(false);
    renderHome();
    expect(await screen.findByText("累计用户")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "查看流水" })
    ).not.toBeInTheDocument();
  });

  it("学习进度全为零时展示空状态", async () => {
    vi.mocked(api.dashboard.overview).mockResolvedValueOnce({
      ...dashboardOverview,
      learning_progress: { completed: 0, in_progress: 0, not_started: 0 }
    });
    renderHome();
    expect(await screen.findByText("暂无学习数据")).toBeInTheDocument();
  });

  it("首页加载中展示骨架屏，不提前渲染 KPI", () => {
    vi.mocked(api.dashboard.overview).mockReturnValueOnce(
      new Promise<never>(() => {})
    );
    const { container } = renderHome();
    expect(
      screen.getByRole("heading", { name: "首页数据" })
    ).toBeInTheDocument();
    expect(container.querySelector(".ant-skeleton")).not.toBeNull();
    expect(screen.queryByText("累计用户")).not.toBeInTheDocument();
  });

  it("首页加载失败时展示可重试错误，点击重试后恢复", async () => {
    vi.mocked(api.dashboard.overview)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(dashboardOverview);
    renderHome();
    expect(await screen.findByText("首页数据加载失败")).toBeInTheDocument();
    expect(screen.queryByText("累计用户")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
    expect(await screen.findByText("累计用户")).toBeInTheDocument();
    expect(screen.queryByText("首页数据加载失败")).not.toBeInTheDocument();
  });

  it.each([[ReviewsPage, "词表审核"]] as const)(
    "%o 显示面包屑 %s",
    (Page, title) => {
      render(
        <QueryClientProvider client={new QueryClient()}>
          <Page />
        </QueryClientProvider>
      );
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: title })
      ).not.toBeInTheDocument();
    }
  );

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
    expect(screen.getByText("关键词")).toBeInTheDocument();
    for (const tab of ["全部", "老师", "学生"]) {
      expect(screen.getByText(tab)).toBeInTheDocument();
    }
    // 表格关键列；余额在详情中独立授权、按需请求。fixed 列表头在 antd 下会重复渲染，
    // 用 getAllByText 容纳多次出现。
    for (const col of ["用户ID", "学生等级", "更新时间"]) {
      expect(screen.getAllByText(col).length).toBeGreaterThan(0);
    }
  });

  it("智能词库真实模式开放 V2 短语与批量归档，隐藏物理删除", () => {
    // 依赖 antd App context（App.useApp）与路由（列表用 useNavigate 跳创建页）。
    // 用基于文本的查询而非 getByRole：表格有上百个按钮，getByRole 会逐个计算
    // 可访问名（jsdom 下大量 getComputedStyle）导致极慢。
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <AntApp>
            <WordsPage />
            <LocationProbe />
          </AntApp>
        </QueryClientProvider>
      </MemoryRouter>
    );
    expect(screen.getByText("创建词条")).toBeInTheDocument();
    expect(screen.queryByText("创建单词")).toBeNull();
    expect(screen.queryByText("创建短语")).toBeNull();
    expect(screen.getByText("移入垃圾桶")).toBeInTheDocument();
    expect(screen.queryByText(/^删除/)).toBeNull();
    // 面包屑末级为「智能词库」。
    expect(screen.getAllByText("智能词库").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("创建词条"));
    expect(screen.getByTestId("location")).toHaveTextContent("/words/new");
  });

  it("个人设置页渲染方言偏好，默认英式", () => {
    // 依赖 antd App context（切换时用 message 反馈）。
    render(
      <AntApp>
        <ProfileSettingsPage />
      </AntApp>
    );
    expect(
      screen.getByRole("heading", { name: "个人设置" })
    ).toBeInTheDocument();
    expect(screen.getByText("英语方言偏好")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "英式（BrE）" })).toBeChecked();
  });

  it("创建页挂载统一创建入口", () => {
    render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <WordCreatePage />
        </QueryClientProvider>
      </MemoryRouter>
    );
    expect(screen.getByText("unified-create-entry")).toBeInTheDocument();
  });
});

function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}
      {location.search}
    </span>
  );
}
