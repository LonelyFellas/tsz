import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Admin } from "@tsz/types";

vi.mock("@/lib/auth", () => ({
  api: {
    admins: {
      list: vi.fn(),
      create: vi.fn(),
      requestCreateCode: vi.fn()
    }
  }
}));

import { api } from "@/lib/auth";
import { AdminManagement } from "./AdminManagement";

// 集成用例含 antd 表格/弹窗 + 异步 mutation + message 门户，覆盖率插桩下于全量并行
// 运行时偏慢，放宽超时抗资源竞争（与 UserManagement.test 同理）。
vi.setConfig({ testTimeout: 15000 });

const mockList = vi.mocked(api.admins.list);
const mockCreate = vi.mocked(api.admins.create);

const plainAdmin: Admin = {
  id: "a1",
  phone: "13800138000",
  display_name: "审核员小王",
  role: "admin",
  status: "active",
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  created_by: null
};
const superAdmin: Admin = {
  id: "a2",
  phone: "15257294120",
  // 昵称刻意区别于「超级管理员」这个 role 文案，避免 getByText 撞车。
  display_name: "总管阿强",
  role: "super_admin",
  status: "active",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  created_by: null
};

function listResponse(items: Admin[]) {
  return {
    items,
    pagination: {
      page: 1,
      page_size: 10,
      total: items.length,
      total_pages: 1
    }
  };
}

function renderPage() {
  // 关掉 query 重试：错误路径测试要能立刻看到失败态，而非等 3 次重试。
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <AdminManagement />
      </AntApp>
    </QueryClientProvider>
  );
}

/** 整表内按可见文案点第 idx 个匹配按钮：避免 getByRole 扫全表算可访问名（CLAUDE.md 超时陷阱）。 */
function clickButton(label: string | RegExp, idx = 0) {
  fireEvent.click(screen.getAllByText(label)[idx]!);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue(listResponse([plainAdmin, superAdmin]));
});

describe("AdminManagement", () => {
  it("渲染管理员列表", async () => {
    renderPage();
    expect(await screen.findByText("审核员小王")).toBeInTheDocument();
    expect(screen.getByText("总管阿强")).toBeInTheDocument();
    // 权限等级 Tag。
    expect(screen.getByText("超级管理员")).toBeInTheDocument();
    expect(screen.getAllByText("普通管理员").length).toBeGreaterThan(0);
  });

  it("点新建管理员打开建号弹窗", async () => {
    renderPage();
    await screen.findByText("审核员小王");
    clickButton(/新建管理员/);
    expect(
      await screen.findByPlaceholderText("登录用手机号")
    ).toBeInTheDocument();
  });

  it("建号成功：弹窗展示后端生成的一次性临时密码", async () => {
    mockCreate.mockResolvedValue({
      admin: {
        id: "a9",
        phone: "13900000000",
        display_name: "新来的",
        role: "admin",
        status: "active",
        created_at: "2026-07-07T00:00:00Z",
        updated_at: "2026-07-07T00:00:00Z",
        created_by: null
      },
      temporary_password: "Zx8pQ2mN7rTk"
    });
    renderPage();
    await screen.findByText("审核员小王");
    clickButton(/新建管理员/);
    fireEvent.change(await screen.findByPlaceholderText("登录用手机号"), {
      target: { value: "13900000000" }
    });
    fireEvent.change(screen.getByPlaceholderText("管理员昵称"), {
      target: { value: "新来的" }
    });
    fireEvent.change(
      screen.getByPlaceholderText("当前超管手机号收到的 6 位验证码"),
      { target: { value: "123456" } }
    );
    fireEvent.click(screen.getByText(/^创\s?建$/));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        phone: "13900000000",
        display_name: "新来的",
        code: "123456"
      })
    );
    // 复用重置密码弹窗一次性展示临时密码。
    expect(await screen.findByText("Zx8pQ2mN7rTk")).toBeInTheDocument();
    expect(screen.getByText("临时密码已生成")).toBeInTheDocument();
  });

  it("按昵称搜索：以 display_name 请求列表", async () => {
    renderPage();
    await screen.findByText("审核员小王");
    fireEvent.change(screen.getByPlaceholderText("昵称包含"), {
      target: { value: "小王" }
    });
    clickButton(/搜\s?索/);
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ display_name: "小王", page: 1 })
      )
    );
  });

  it("列表加载失败展示错误 Alert 与重试", async () => {
    mockList.mockRejectedValueOnce(new Error("加载炸了"));
    renderPage();
    expect(await screen.findByText("管理员列表加载失败")).toBeInTheDocument();
    expect(screen.getByText("加载炸了")).toBeInTheDocument();
  });

  it("加载失败后点「重试」：重新拉取并渲染列表", async () => {
    // 仅首次拒绝，重试时落到默认 resolved 值，列表恢复。
    mockList.mockReset();
    mockList
      .mockRejectedValueOnce(new Error("加载炸了"))
      .mockResolvedValue(listResponse([plainAdmin, superAdmin]));
    renderPage();
    await screen.findByText("管理员列表加载失败");
    clickButton(/重\s?试/);
    expect(await screen.findByText("审核员小王")).toBeInTheDocument();
  });

  it("点筛选「重置」：清空条件并重新请求", async () => {
    renderPage();
    await screen.findByText("审核员小王");
    // 先输入昵称并搜索，制造非空筛选态。
    fireEvent.change(screen.getByPlaceholderText("昵称包含"), {
      target: { value: "小王" }
    });
    clickButton(/搜\s?索/);
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ display_name: "小王" })
      )
    );
    // 点「重置」→ 清空表单 + applyFilters({})，回到无筛选的首页查询。
    clickButton(/^重\s?置$/);
    await waitFor(() => {
      const last = mockList.mock.calls.at(-1)?.[0];
      expect(last?.display_name).toBeUndefined();
      expect(last?.page).toBe(1);
    });
  });

  it("翻页：以新页码请求列表", async () => {
    // total 大于单页，分页器渲染出第 2 页可点。
    mockList.mockResolvedValue({
      items: [plainAdmin, superAdmin],
      pagination: { page: 1, page_size: 10, total: 25, total_pages: 3 }
    });
    const { container } = renderPage();
    await screen.findByText("审核员小王");
    fireEvent.click(container.querySelector(".ant-pagination-item-2")!);
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, page_size: 10 })
      )
    );
  });
});
