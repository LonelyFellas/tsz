import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type { Admin } from "@tsz/types";

vi.mock("@/lib/auth", () => ({
  api: {
    admins: {
      list: vi.fn(),
      create: vi.fn(),
      requestCreateCode: vi.fn(),
      setStatus: vi.fn(),
      resetPassword: vi.fn()
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
const mockSetStatus = vi.mocked(api.admins.setStatus);
const mockResetPassword = vi.mocked(api.admins.resetPassword);

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

/** 点确认弹窗里的主按钮（.ant-modal-confirm-btns 内，按可见文案定位）。 */
function clickConfirmOk(label: RegExp) {
  const btns = document.querySelector(".ant-modal-confirm-btns")!;
  fireEvent.click(within(btns as HTMLElement).getByText(label));
}

/** 取第 idx 个匹配文案所在的按钮元素（行操作断言置灰用）。 */
function buttonOf(label: RegExp, idx = 0) {
  return screen.getAllByText(label)[idx]!.closest("button");
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

describe("AdminManagement — 行操作", () => {
  it("超级管理员那一行的启禁用与重置密码置灰（含超管改自己）", async () => {
    renderPage();
    await screen.findByText("审核员小王");
    // 行序：[0] 普通管理员（可操作）、[1] 超级管理员（置灰）。
    expect(buttonOf(/^禁\s?用$/, 0)).not.toBeDisabled();
    expect(buttonOf(/^禁\s?用$/, 1)).toBeDisabled();
    expect(buttonOf(/^重置密码$/, 0)).not.toBeDisabled();
    expect(buttonOf(/^重置密码$/, 1)).toBeDisabled();
  });

  it("禁用普通管理员：二次确认后调用接口并刷新列表", async () => {
    mockSetStatus.mockResolvedValue({ ...plainAdmin, status: "disabled" });
    renderPage();
    await screen.findByText("审核员小王");
    clickButton(/^禁\s?用$/, 0);
    // 文案不承诺「立即下线」：禁用有一个 access-token TTL 的延迟。
    expect(
      await screen.findByText(/最长在一个访问令牌有效期内失效/)
    ).toBeInTheDocument();
    clickConfirmOk(/^禁\s?用$/);
    await waitFor(() =>
      expect(mockSetStatus).toHaveBeenCalledWith("a1", "disabled")
    );
    // 成功后失效列表重取（初次 + 一次）。
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it("启用已禁用的管理员：确认文案与按钮走启用分支", async () => {
    mockList.mockResolvedValue(
      listResponse([{ ...plainAdmin, status: "disabled" }, superAdmin])
    );
    mockSetStatus.mockResolvedValue(plainAdmin);
    renderPage();
    await screen.findByText("审核员小王");
    clickButton(/^启\s?用$/, 0);
    expect(
      await screen.findByText("启用后该管理员可以重新登录后台。确认启用？")
    ).toBeInTheDocument();
    clickConfirmOk(/^启\s?用$/);
    await waitFor(() =>
      expect(mockSetStatus).toHaveBeenCalledWith("a1", "active")
    );
    expect(await screen.findByText("已启用")).toBeInTheDocument();
  });

  it("启禁用 403：提示不能启禁用超管（前端置灰不是唯一防线）", async () => {
    mockSetStatus.mockRejectedValue(
      new HttpError(403, "cannot change a super admin")
    );
    renderPage();
    await screen.findByText("审核员小王");
    clickButton(/^禁\s?用$/, 0);
    await screen.findByText(/最长在一个访问令牌有效期内失效/);
    clickConfirmOk(/^禁\s?用$/);
    expect(await screen.findByText("不能启禁用超级管理员")).toBeInTheDocument();
  });

  it("重置密码：确认后复用一次性密码弹窗展示明文，期间建号入口置灰", async () => {
    mockResetPassword.mockResolvedValue({ temporary_password: "Tmp9xKq2wZ4d" });
    renderPage();
    await screen.findByText("审核员小王");
    clickButton(/^重置密码$/, 0);
    expect(
      await screen.findByText(/重置会立即吊销该管理员的全部登录会话/)
    ).toBeInTheDocument();
    clickConfirmOk(/^重\s?置$/);
    await waitFor(() => expect(mockResetPassword).toHaveBeenCalledWith("a1"));
    expect(await screen.findByText("Tmp9xKq2wZ4d")).toBeInTheDocument();
    expect(screen.getByText("临时密码已生成")).toBeInTheDocument();
    // 未处理的临时密码在场时，建号与重置密码入口全部串行化置灰。
    expect(buttonOf(/新建管理员/)).toBeDisabled();
    expect(buttonOf(/^重置密码$/, 0)).toBeDisabled();
  });

  it("重置密码 403：提示不能重置超管密码，不弹临时密码", async () => {
    mockResetPassword.mockRejectedValue(
      new HttpError(403, "cannot reset a super admin")
    );
    renderPage();
    await screen.findByText("审核员小王");
    clickButton(/^重置密码$/, 0);
    await screen.findByText(/重置会立即吊销该管理员的全部登录会话/);
    clickConfirmOk(/^重\s?置$/);
    expect(
      await screen.findByText("不能重置超级管理员的密码")
    ).toBeInTheDocument();
    expect(screen.queryByText("临时密码已生成")).toBeNull();
  });
});
