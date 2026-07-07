import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type { Admin } from "@tsz/types";

vi.mock("@/lib/auth", () => ({
  api: {
    admins: {
      list: vi.fn(),
      create: vi.fn(),
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
const mockReset = vi.mocked(api.admins.resetPassword);

const plainAdmin: Admin = {
  id: "a1",
  phone: "13800138000",
  display_name: "审核员小王",
  level: "admin",
  status: "active",
  created_at: "2026-07-01T00:00:00Z"
};
const superAdmin: Admin = {
  id: "a2",
  phone: "15257294120",
  // 昵称刻意区别于「超级管理员」这个 level 文案，避免 getByText 撞车。
  display_name: "总管阿强",
  level: "super_admin",
  status: "active",
  created_at: "2026-06-01T00:00:00Z"
};

function listResponse(items: Admin[]) {
  return { items, page: { page: 1, page_size: 10, total: items.length } };
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

  it("禁用成功给出提示", async () => {
    mockSetStatus.mockResolvedValue({ ...plainAdmin, status: "disabled" });
    renderPage();
    await screen.findByText("审核员小王");
    clickButton(/禁\s?用/, 0);
    await waitFor(() =>
      expect(mockSetStatus).toHaveBeenCalledWith("a1", "disabled")
    );
    expect(await screen.findByText("已禁用")).toBeInTheDocument();
  });

  it("超管行的禁用按钮禁用：超管不可被启禁用", async () => {
    renderPage();
    await screen.findByText("总管阿强");
    // 第二行（超管）的禁用按钮 disabled——超管不可被任何人启禁用，后端 403 只是兜底。
    expect(screen.getAllByText(/禁\s?用/)[1]!.closest("button")).toBeDisabled();
  });

  it("启禁用失败：映射为中文错误提示", async () => {
    // 409 = 不能禁用最后一个 active super_admin，adminActionError 映射为中文。
    mockSetStatus.mockRejectedValue(
      new HttpError(409, "cannot disable the last super admin")
    );
    renderPage();
    await screen.findByText("审核员小王");
    clickButton(/禁\s?用/, 0);
    await waitFor(() =>
      expect(mockSetStatus).toHaveBeenCalledWith("a1", "disabled")
    );
    expect(
      await screen.findByText("不能禁用最后一个超级管理员")
    ).toBeInTheDocument();
  });

  it("启用被禁用的管理员", async () => {
    const disabled: Admin = { ...plainAdmin, status: "disabled" };
    mockList.mockResolvedValue(listResponse([disabled]));
    mockSetStatus.mockResolvedValue({ ...disabled, status: "active" });
    renderPage();
    await screen.findByText("审核员小王");
    clickButton(/启\s?用/);
    await waitFor(() =>
      expect(mockSetStatus).toHaveBeenCalledWith("a1", "active")
    );
    expect(await screen.findByText("已启用")).toBeInTheDocument();
  });

  it("重置普通管理员密码：弹窗展示一次性临时密码", async () => {
    mockReset.mockResolvedValue({ temporary_password: "Kd7mNpQ2rXt9" });
    renderPage();
    await screen.findByText("审核员小王");
    clickButton("重置密码", 0);
    await waitFor(() => expect(mockReset).toHaveBeenCalledWith("a1"));
    expect(await screen.findByText("Kd7mNpQ2rXt9")).toBeInTheDocument();
    expect(screen.getByText("临时密码已生成")).toBeInTheDocument();
  });

  it("重置密码失败给出错误提示", async () => {
    mockReset.mockRejectedValue(new Error("cannot reset a super admin"));
    renderPage();
    await screen.findByText("审核员小王");
    clickButton("重置密码", 0);
    expect(
      await screen.findByText("cannot reset a super admin")
    ).toBeInTheDocument();
  });

  it("超管行的重置密码按钮禁用", async () => {
    renderPage();
    await screen.findByText("总管阿强");
    // 第二行（超管）的重置密码按钮 disabled。用文案定位后取其 button 祖先断言禁用态。
    expect(
      screen.getAllByText("重置密码")[1]!.closest("button")
    ).toBeDisabled();
  });

  it("重置进行中：建号入口禁用，防止交错产出的一次性密码互相覆盖", async () => {
    // 让重置一直挂起（永不 resolve），模拟一次性密码「正在生成」的窗口。
    mockReset.mockReturnValue(new Promise<never>(() => {}));
    renderPage();
    await screen.findByText("审核员小王");
    // 初始：新建管理员可点。
    expect(screen.getByText(/新建管理员/).closest("button")).not.toBeDisabled();
    // 触发普通管理员（a1）重置密码 → 请求在飞、进入 secretBusy。
    fireEvent.click(screen.getAllByText("重置密码")[0]!.closest("button")!);
    // 建号入口被禁用：重置在飞时无法再开建号弹窗产出第二个临时密码（否则会覆盖前一个）。
    await waitFor(() =>
      expect(screen.getByText(/新建管理员/).closest("button")).toBeDisabled()
    );
    // 该行重置按钮自身也保持禁用，不能重复触发。
    expect(
      screen.getAllByText("重置密码")[0]!.closest("button")
    ).toBeDisabled();
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
        level: "admin",
        status: "active",
        created_at: "2026-07-07T00:00:00Z"
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
    fireEvent.click(screen.getByText(/^创\s?建$/));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        phone: "13900000000",
        display_name: "新来的"
      })
    );
    // 复用重置密码弹窗一次性展示临时密码。
    expect(await screen.findByText("Zx8pQ2mN7rTk")).toBeInTheDocument();
    expect(screen.getByText("临时密码已生成")).toBeInTheDocument();
  });

  it("按关键字搜索：以 q 请求列表", async () => {
    renderPage();
    await screen.findByText("审核员小王");
    fireEvent.change(screen.getByPlaceholderText("手机 / 邮箱 / 昵称"), {
      target: { value: "小王" }
    });
    clickButton(/搜\s?索/);
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ q: "小王", page: 1 })
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

  it("关闭临时密码弹窗：secretBusy 释放，建号入口恢复可用", async () => {
    mockReset.mockResolvedValue({ temporary_password: "Kd7mNpQ2rXt9" });
    renderPage();
    await screen.findByText("审核员小王");
    clickButton("重置密码", 0);
    // 展示期间：另一条秘密流程被禁，新建入口置灰。
    expect(await screen.findByText("Kd7mNpQ2rXt9")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/新建管理员/).closest("button")).toBeDisabled()
    );
    // 点「我已复制」关闭 → resetResult 清空 → secretBusy 释放 → 入口恢复可用。
    fireEvent.click(screen.getByText(/我已复制/).closest("button")!);
    await waitFor(() =>
      expect(
        screen.getByText(/新建管理员/).closest("button")
      ).not.toBeDisabled()
    );
  });

  it("点筛选「重置」：清空条件并重新请求", async () => {
    renderPage();
    await screen.findByText("审核员小王");
    // 先输入关键字并搜索，制造非空筛选态。
    fireEvent.change(screen.getByPlaceholderText("手机 / 邮箱 / 昵称"), {
      target: { value: "小王" }
    });
    clickButton(/搜\s?索/);
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ q: "小王" })
      )
    );
    // 点「重置」→ 清空表单 + applyFilters({})，回到无 q 的首页查询。
    // 锚定正则避免撞上行内「重置密码」。
    clickButton(/^重\s?置$/);
    await waitFor(() => {
      const last = mockList.mock.calls.at(-1)?.[0];
      expect(last?.q).toBeUndefined();
      expect(last?.page).toBe(1);
    });
  });

  it("翻页：以新页码请求列表", async () => {
    // total 大于单页，分页器渲染出第 2 页可点。
    mockList.mockResolvedValue({
      items: [plainAdmin, superAdmin],
      page: { page: 1, page_size: 10, total: 25 }
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
